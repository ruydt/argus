---
phase: 11-frontend-polish-ux
status: ready_for_planning
created: 2026-06-01
requirements: [FRONT-01, FRONT-02, UX-01, UX-02, TRIAGE-01]
---

# Phase 11: Frontend Polish & UX — Discussion Context

## Phase Goal

Deliver the five remaining v1.3 requirements: diagnostics caching, chart scale fix, session ID copy, file-change line numbers, and triage bug fixes surfaced during implementation.

---

## Decisions

### D-01: Diagnostics Backend Performance (FRONT-01 / PERF-01)

**Decision:** Server-side in-memory cache with TTL in `EventService`.

**Rationale:** `/api/diagnostics` takes 6m 30s TTFB on a real DB (28,510 events, 168MB). Root cause is two full table scans:
- `DiagnosticsAgentStats` Q3: `LIKE '%/.claude/%'` leading wildcard on `hook_events` (28,510 rows) — no index can be used
- `DiagnosticsStorageStats`: `ORDER BY datetime(created_at) DESC` — function call prevents index use

Phase 10 fixed correlated subqueries on `sessions` (79 rows) — not the bottleneck. Phase 11 must fix the real bottleneck.

**Approach:**
- Add `diagnosticsCache struct { result *DiagnosticsResult; cachedAt time.Time }` to `EventService`
- TTL: 30 seconds
- Cache invalidation: time-based only (no write invalidation needed — diagnostics is an infrequent admin view)
- `DiagnosticsWithOptions()` checks cache first; on miss, runs queries and stores result
- Thread-safe: protect with `sync.RWMutex`
- No schema changes. No index changes.

**Files:** `backend/internal/service/event_service.go`

---

### D-02: Chart Scale Fix (FRONT-02)

**Decision:** Log scale on `YAxis` in `TokenUsageChart`.

**Rationale:** Linear scale makes small values (e.g., 818k) nearly invisible next to large values (e.g., 140M tokens). Log scale compresses the range so all models are visually comparable.

**Approach:**
- Add `scale="log"` and `domain={[1, 'auto']}` to the `<YAxis>` in `TokenUsageChart`
- `domain` starts at 1 (not 0) to avoid `log(0) = -Infinity` breaking Recharts
- Existing `tickFormatter` (k/M formatting) continues unchanged
- Tooltip still shows exact values

**Files:** `frontend/src/features/dashboard/TokenUsageChart.tsx`

**Note:** `domain={[1, 'auto']}` means models with 0 tokens on a category will render at the baseline (1), not as a broken bar. Acceptable edge case.

---

### D-03: Session ID Copy (UX-01)

**Decision:** Hover-reveal clipboard icon in `AgentSession` header; icon swaps to checkmark for 1.5s on copy.

**Approach:**
- In `AgentSession.tsx`, add a clipboard icon (`lucide-react: Clipboard` or `Copy`) that appears on hover of the session header row
- Clicking the icon copies `sessionId` to clipboard via `navigator.clipboard.writeText(sessionId)`
- On success: swap icon to `Check` (lucide) for 1500ms, then revert to `Clipboard`
- Use `useState<boolean>` for `copied` state, `setTimeout` to revert
- Stop propagation on the icon click (prevent triggering the collapsible toggle)

**Files:** `frontend/src/features/events/AgentSession.tsx`

---

### D-04: File-Change Line Numbers (UX-02)

**Decision:** Click `ChangeRow` to toggle expanded code block with line numbers.

**Approach:**
- `ChangeRow` gains `useState<boolean>` for `expanded` state
- When expanded, show a `<pre>` code block below the metadata row
- Display `new_string` if present; else `old_string`; else nothing (don't expand if neither exists)
- Line numbers: start from `start_line` if present, else from 1
- Format: `{lineNum} │ {codeLine}` in monospace, small font, dim line-number color
- The toggle chevron replaces the static "N lines" count display (or shows alongside)
- Limit display: if content > 200 lines, truncate with "… N more lines" note

**Files:** `frontend/src/features/sessions/FileChangesDrawer.tsx`

---

### D-05: Triage Bugs (TRIAGE-01)

**Decision:** Surface during implementation — no pre-specified bugs. Fix any UI bugs discovered during Phase 11 development and testing.

---

## Scouted Assets

### Backend

| Symbol | Location | Notes |
|--------|----------|-------|
| `DiagnosticsWithOptions` | `service/event_service.go` | Entry point to cache |
| `DiagnosticsAgentStats` | `repository/sqlite/sqlite.go:~521` | Q3 is the bottleneck (`LIKE '%/.claude/%'` on hook_events) |
| `DiagnosticsStorageStats` | `repository/sqlite/sqlite.go:~497` | Full scan with `ORDER BY datetime(created_at)` |
| `EventService` struct | `service/event_service.go` | Add cache fields here |

### Frontend

| Symbol | Location | Notes |
|--------|----------|-------|
| `useDiagnostics` | `features/diagnostics/hooks/useDiagnostics.ts` | Fetches on every mount — no cross-navigation cache. FRONT-01 adds local cache or on-demand fetch |
| `TokenUsageChart` | `features/dashboard/TokenUsageChart.tsx` | YAxis at line 60 — add `scale="log" domain={[1,'auto']}` |
| `AgentSession` | `features/events/AgentSession.tsx` | Session header at lines 90-99 — add copy icon |
| `FileChangesDrawer` | `features/sessions/FileChangesDrawer.tsx` | `ChangeRow` at line 109 — expand to show code |
| `FileChangeEvent` | `types/sessions.ts:23` | Has `old_string?`, `new_string?`, `start_line?` |

---

## Out of Scope (deferred)

- Index additions on `hook_events` — not needed given server-side cache decision
- Diff view (old → new) in FileChangesDrawer — decided against; new_string only
- Toast notifications for copy — decided against; icon swap only
- Any changes to diagnostics query logic beyond caching

---

## What the Planner Should Produce

Plan sequence suggestion (can be one or two plans):

**Plan 11-01:** Backend + cache layer
- D-01: Add `diagnosticsCache` with TTL to `EventService`
- Also: FRONT-01 frontend side — `useDiagnostics` caches result in module-level ref or React ref; re-fetches only on explicit refresh button press

**Plan 11-02:** Frontend polish
- D-02: Log scale in TokenUsageChart
- D-03: Copy icon in AgentSession
- D-04: Expandable code in FileChangesDrawer
- D-05: Fix any bugs surfaced during 11-01/11-02 implementation

*Or combine into a single plan if scope is small enough.*
