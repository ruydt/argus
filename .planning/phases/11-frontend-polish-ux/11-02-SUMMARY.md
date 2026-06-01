---
phase: 11-frontend-polish-ux
plan: "02"
subsystem: frontend-ux
tags: [frontend, ux, chart, clipboard, ui-interaction, tdd]
dependency_graph:
  requires: [11-01]
  provides: [token-chart-log-scale, session-copy-button, file-changes-expandable-rows]
  affects:
    - frontend/src/features/dashboard/TokenUsageChart.tsx
    - frontend/src/features/events/AgentSession.tsx
    - frontend/src/features/sessions/FileChangesDrawer.tsx
tech_stack:
  added: []
  patterns: [hover-reveal copy button with useEffect cleanup, log-scale recharts YAxis, expandable row with line-numbered pre block]
key_files:
  created:
    - frontend/tests/features/events/AgentSession.test.tsx
    - frontend/tests/features/sessions/FileChangesDrawer.test.tsx
  modified:
    - frontend/src/features/dashboard/TokenUsageChart.tsx
    - frontend/src/features/events/AgentSession.tsx
    - frontend/src/features/sessions/FileChangesDrawer.tsx
decisions:
  - "ChangeRow uses canExpand pattern — chevron replaces diffLines count when content is expandable"
  - "Copy button uses 1500ms revert timeout (per D-03), not 1200ms from CopyIconButton pattern"
  - "Log scale domain starts at 1 (not 0) — log(0) is undefined; Recharts requires positive domain start"
metrics:
  duration: "~2min"
  completed: "2026-06-01T16:04:28Z"
  tasks_completed: 2
  files_modified: 5
---

# Phase 11 Plan 02: Frontend Polish UX Summary

**One-liner:** Log-scale token chart YAxis, hover-reveal clipboard copy in session headers, and expandable line-numbered code blocks in FileChangesDrawer.

## What Was Built

### Task 1: Log scale on YAxis + test stubs (RED phase)

Modified `TokenUsageChart.tsx` YAxis to add `scale="log"` and `domain={[1, 'auto']}`. This makes small-token models (e.g. 818k total) visually distinct from large-token models (e.g. 140M total) instead of being squashed to the baseline on a linear scale.

Created failing test stubs for the two components about to be implemented:
- `AgentSession.test.tsx` — clipboard copy tests (3 test cases)
- `FileChangesDrawer.test.tsx` — expand/collapse ChangeRow tests (5 test cases)

Dashboard test suite (11 tests) passed immediately. Stub tests failed as expected (RED state confirmed).

### Task 2: Copy icon + expandable ChangeRow (GREEN phase)

**AgentSession copy button (UX-01):**
- Added `Check, Copy` to lucide-react imports
- Added `copied` state with `useEffect` cleanup at 1500ms
- Added `onCopySessionId` handler: `e.stopPropagation()` prevents collapsible toggle, `navigator.clipboard.writeText(sessionId)` writes session ID
- Session ID div gets `group` class; copy button is `opacity-0 group-hover:opacity-100` for hover reveal
- Button `aria-label` toggles between "Copy session ID" and "Copied session ID"

**FileChangesDrawer expandable ChangeRow (UX-02):**
- Added `cn` import from `@/lib/utils`
- `ChangeRow` now determines `canExpand = (ev.new_string ?? ev.old_string) !== null`
- Expandable rows show a chevron (ChevronRight when collapsed, ChevronDown when expanded)
- Expanded state shows a `<pre>` block with line numbers formatted as `N │ content` using `padStart` for alignment
- Line numbers start from `ev.start_line ?? 1`
- Content capped at 200 lines with `… N more lines` note (T-11-06 mitigation)
- Non-expandable rows retain the original `diffLines` line count display

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 (log scale + stubs) | 040a1cb | feat(11-02): log scale on YAxis + failing test stubs |
| Task 2 (copy icon + ChangeRow) | ef80cc1 | feat(11-02): copy icon in AgentSession + expandable ChangeRow |

## Verification Results

- `npx vitest run tests/features/dashboard/` — 11 tests PASS
- `npx vitest run tests/features/events/AgentSession.test.tsx` — 3 tests PASS
- `npx vitest run tests/features/sessions/FileChangesDrawer.test.tsx` — 5 tests PASS
- `npx vitest run` — 96 tests PASS (no regressions; +8 new tests)
- `npx tsc --noEmit` — no type errors
- `go test ./...` — 178 tests PASS (backend unaffected)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes.

- T-11-04 (XSS via new_string): React renders `<pre>` content as text nodes via the array of template literal strings — no `dangerouslySetInnerHTML`. Auto-escaped.
- T-11-05 (clipboard info disclosure): Copy is explicit user action; session IDs are not sensitive secrets.
- T-11-06 (DoS via long new_string): 200-line hard cap with truncation note applied as required.

## Self-Check: PASSED

- `frontend/src/features/dashboard/TokenUsageChart.tsx` — FOUND
- `frontend/src/features/events/AgentSession.tsx` — FOUND
- `frontend/src/features/sessions/FileChangesDrawer.tsx` — FOUND
- `frontend/tests/features/events/AgentSession.test.tsx` — FOUND
- `frontend/tests/features/sessions/FileChangesDrawer.test.tsx` — FOUND
- Commit 040a1cb — FOUND
- Commit ef80cc1 — FOUND
