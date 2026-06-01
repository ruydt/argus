---
phase: 11-frontend-polish-ux
status: complete
created: 2026-06-01
---

# Phase 11: Discussion Log

## Session 1 — 2026-06-01

### Context

User showed Postman screenshot: `/api/diagnostics` takes 6m 30s TTFB on real DB (28,510 events, 79 sessions, 168MB). Phase 10 fixed correlated subqueries on `sessions` table (79 rows) — not the actual bottleneck. Real bottleneck: full scans of `hook_events` (28,510 rows) in Q3 and `DiagnosticsStorageStats`.

### Q1: Diagnostics Backend Performance

**Question:** How to fix 6m 30s TTFB on `/api/diagnostics`?
- Option A: Server-side cache (in-memory TTL ~30s in EventService) ← **chosen**
- Option B: Index on `hook_events.transcript_path`
- Option C: Rewrite queries with materialized CTE

**Decision:** Server-side cache. Zero schema changes, trivial to implement, appropriate for an infrequent admin view.

### Q2: Chart Scale Fix (FRONT-02)

**Question:** How to fix linear Y-axis making small token values invisible?
- Option A: Log scale (`scale="log"`, `domain={[1,'auto']}`) ← **chosen**
- Option B: 100% stacked (normalized)
- Option C: Separate Y-axis per model

**Decision:** Log scale. 2-line change, bars stay stacked, tooltip shows exact values.

### Q3: Session ID Copy (UX-01)

**Question:** Where does the copy button live?
- Option A: Hover-reveal icon next to session header text ← **chosen**
- Option B: Always-visible icon
- Option C: Click session ID text itself

**Confirmation UX:** Icon swap clipboard → checkmark for 1.5s ← **chosen** (vs toast, vs silent)

### Q4: File-Change Line Numbers (UX-02)

**Question:** How to show code content in FileChangesDrawer?
- Option A: Click ChangeRow to expand code ← **chosen**
- Option B: Diff view (old → new)
- Option C: Always expanded

**Decision:** Click to expand. Show `new_string` (or `old_string`) with line numbers starting from `start_line`. No diff view.

### Q5: TRIAGE-01

**Decision:** Surface bugs during Phase 11 implementation rather than pre-specifying.
