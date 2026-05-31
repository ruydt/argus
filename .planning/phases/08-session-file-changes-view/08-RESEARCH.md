---
phase: 08
slug: session-file-changes-view
status: complete
created: 2026-05-31
research_mode: local_codebase
---

# Phase 08 Research - Session File Changes View

## Question

Can `/sessions/:cwd/:sessionId` be changed into a paginated file-change browser using the current data contract, or does Phase 8 need backend/API work first?

## Findings

### Current Route Shape

- `frontend/src/features/sessions/TraceViewPage.tsx` is the route-level page for `/sessions/:cwd/:sessionId`.
- The page currently imports and renders trace-specific modules including `EventTimeline`, `TraceTreeNode`, `TraceInspectionPanel`, `useTraces`, split panels, zoom controls, and a file-changes side drawer.
- Phase 8 should replace this route body instead of adding another tab or preserving the trace page as the primary experience.

### Existing File-Change Frontend

- `frontend/src/features/sessions/hooks/useFileChanges.ts` already fetches `/api/file-changes?session_id=...` and exposes `{ groups, loading, error }`.
- `frontend/src/types/sessions.ts` already defines:
  - `FileChangeGroup.path`
  - `FileChangeGroup.count`
  - `FileChangeGroup.changes`
  - `FileChangeEvent.time`
  - `FileChangeEvent.tool`
  - `FileChangeEvent.action`
  - `FileChangeEvent.old_string`
  - `FileChangeEvent.new_string`
  - `FileChangeEvent.start_line`
- `frontend/src/features/sessions/FileChangesDrawer.tsx` contains reusable logic for tool labels, tool colors, file icons, path shortening, relative timestamps, file rows, and change rows.
- The existing drawer shows file counts and timestamps but does not yet render compact old/new snippet blocks.

### Existing Backend Contract

- `backend/internal/handler/file_changes.go` registers the `/api/file-changes` behavior and requires `session_id`.
- `backend/internal/service/event_service.go` delegates `GetFileChanges(sessionID)` to the repository.
- `backend/internal/repository/sqlite/sqlite.go` queries `hook_events` for file-change-like events, selects `path`, `tool_name`, `created_at`, `action`, `old_string`, `new_string`, and `start_line`, then groups records by path.
- `backend/internal/domain/event.go` exposes matching `FileChangeEvent` and `FileChangeGroup` JSON fields.
- The backend already returns the old/new line data required by SESS-02.

### Pagination Feasibility

- The current API returns all file-change groups for a session.
- SESS-01 requires paginated display, not necessarily server-side pagination.
- Phase context D-05 says backend support should be added only if the existing API cannot satisfy snippets or practical pagination.
- Research found no hard API gap for Phase 8. Frontend-side file pagination is sufficient for the planned page unless implementation discovers a real response-size problem.

### UI System

- The project uses React, Vite, TypeScript, Tailwind v4, shadcn/ui primitives, and lucide icons.
- Existing local UI primitives include `Button`, `Badge`, `Separator`, `Skeleton`, `Empty`, and `Card`.
- `frontend/src/components/shared/PaginationBar.tsx` exists, but the UI contract requires shadcn `Button` pagination controls. Implementation can either update that shared component or add a local file-pagination control.

### Tests

- Existing session tests live under `frontend/tests/features/sessions/`.
- `frontend/tests/features/sessions/project-session-traces.test.tsx` currently covers the trace route behavior and will need replacement or new cases for the file-change page.
- There is no dedicated `useFileChanges` frontend test in the current session test list.
- Backend handler tests already include file-change coverage from earlier phases, but Phase 8 should verify the existing API contract if implementation touches or relies on it.

## Conclusion

Phase 8 should be planned as a frontend-first replacement:

1. Replace `TraceViewPage` route content with a file-change page.
2. Reuse the existing session metadata fetch and `useFileChanges` hook.
3. Refactor or replace `FileChangesDrawer` logic into route-level file-change components.
4. Implement frontend-side pagination over `FileChangeGroup[]`.
5. Render old/new snippets from the existing `FileChangeEvent.old_string` and `FileChangeEvent.new_string` fields.
6. Add backend work only if implementation proves the current `/api/file-changes` payload is insufficient.

## Sources

- `.planning/phases/08-session-file-changes-view/08-CONTEXT.md`
- `.planning/phases/08-session-file-changes-view/08-UI-SPEC.md`
- `.planning/REQUIREMENTS.md`
- `frontend/src/features/sessions/TraceViewPage.tsx`
- `frontend/src/features/sessions/FileChangesDrawer.tsx`
- `frontend/src/features/sessions/hooks/useFileChanges.ts`
- `frontend/src/types/sessions.ts`
- `backend/internal/handler/file_changes.go`
- `backend/internal/service/event_service.go`
- `backend/internal/repository/sqlite/sqlite.go`
- `backend/internal/domain/event.go`
