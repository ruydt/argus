# Delete Project — Design

**Date:** 2026-06-11
**Status:** Approved
**Scope:** Delete button on Projects page; deleting a project removes all its sessions and all their events.

## Background

A "project" in argus is derived data: the distinct `cwd` across sessions/events. There is no projects table. Deleting a project therefore means deleting all rows tied to that `cwd` in `sessions` and `hook_events`. No DELETE endpoints exist in the API today.

## Decisions

- Endpoint approach (single atomic request), not per-session deletes, not soft delete.
- Confirmation: shadcn alert-dialog with session count + irreversibility warning. No type-to-confirm.
- Hard delete. Accepted caveat: an agent session still running in that cwd re-creates the project on its next hook event — delete means "clear history", not "block project".

## Backend

- `repository`: new `DeleteProjectByCWD(cwd string) (sessionsDeleted, eventsDeleted int64, err error)` on the `EventRepository` interface and SQLite impl. Single transaction: `DELETE FROM hook_events WHERE cwd = ?` then `DELETE FROM sessions WHERE cwd = ?`. Returns affected row counts.
- `service`: `DeleteProject(cwd)` passthrough to repo.
- `handler` (`projects.go`): extend the projects handler (or add a sibling) so `DELETE /api/projects?cwd=<url-encoded-cwd>` works:
  - non-DELETE on that flow → existing GET list behavior unchanged
  - missing `cwd` → 400
  - success → 200 `{"sessions_deleted": N, "events_deleted": M}`
- Router: route already maps `/api/projects`; handler dispatches on method.
- Tests: repository cascade test (seed 2 cwds, delete one, other untouched); handler tests (GET unchanged, DELETE without cwd → 400, DELETE happy path → counts + rows gone).

## Frontend

- `ProjectsPage.tsx`: trash icon button (lucide `Trash2`) top-right of each project card, visible on card hover. Click: `preventDefault`/`stopPropagation` (card is a `Link`).
- New shadcn primitive: `npx shadcn add alert-dialog` (not currently in `src/components/ui/`).
- Dialog copy: title "Delete {project.name}?", body "This permanently deletes {session_count} session(s) and all their events. This cannot be undone." Buttons: Cancel / Delete (destructive styling).
- On confirm: `fetch('/api/projects?cwd=' + encodeURIComponent(cwd), { method: 'DELETE' })` → on ok, re-fetch project list.
- Test (`__tests__/`): card renders delete button; cancel closes without fetch; confirm issues DELETE and removes card after refresh.

## Out of scope

- Deleting individual sessions.
- Soft delete / undo.
- Blocking re-creation by running agents.
