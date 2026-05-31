# Phase 8: Session File Changes View - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 replaces the existing `/sessions/:cwd/:sessionId` trace/timeline experience with a file-change browser for files created or modified during a session. The page should show a compact session header, paginate changed files, and let the user expand a file to inspect each change with timestamp, tool/action, available line number, and compact old/new snippets.

The trace tree, event timeline, and trace inspection panel are not part of the target experience for this phase. Existing file-change API/data should be used first; backend changes are allowed only if research proves the current API cannot provide the required old/new snippets or pagination support.

</domain>

<decisions>
## Implementation Decisions

### Page Direction
- **D-01:** Replace the trace/timeline page entirely. Do not keep trace/timeline as a tab, secondary panel, or alternate route in Phase 8.
- **D-02:** `/sessions/:cwd/:sessionId` becomes the file-change browser page. It should not render `TraceTreeNode`, `EventTimeline`, or the current trace inspection timeline as the primary experience.
- **D-03:** Keep a compact header at the top with breadcrumbs, session ID, started time, duration, and file-change count.

### Data Contract
- **D-04:** Use the existing file-change data first. Current frontend types already include `FileChangeGroup` and `FileChangeEvent` with `time`, `tool`, `action`, `old_string`, `new_string`, and `start_line`.
- **D-05:** Add or extend backend support only if the existing `/api/file-changes?session_id=...` response cannot satisfy old/new snippets or practical file pagination.
- **D-06:** Backend work, if needed, must stay narrow: file-change page support only, no new search/filter capability.

### Pagination
- **D-07:** Paginate files, not individual change events. Each page contains a subset of changed files.
- **D-08:** Each file row expands to show the change events for that file. Internal per-file pagination is deferred unless planning discovers a concrete size problem.

### Diff Detail
- **D-09:** Expanded file rows show old/new snippets per change, not a full GitHub-style file diff.
- **D-10:** Each change entry should show timestamp, tool/action, available line number, and compact old/new code blocks.
- **D-11:** Empty old or new strings should be handled explicitly: create/write events may have only new lines, delete/replace-like events may have old lines, and metadata-only changes should still show timestamp/tool context.

### the agent's Discretion
- Planner may choose exact component names and file split, but should preserve the Phase 8 direction above.
- Planner may choose the page size default, provided files are paginated and the UI remains compact.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning and Requirements
- `.planning/ROADMAP.md` — Phase 8 title, goal, success criteria, and SESS requirement mapping.
- `.planning/REQUIREMENTS.md` — SESS-01, SESS-02, SESS-03 requirement text.
- `.planning/PROJECT.md` — local-first product constraints, stack constraints, and current milestone context.
- `.planning/STATE.md` — current phase position and session continuity.

### Existing Sessions UI
- `frontend/src/features/sessions/TraceViewPage.tsx` — current route-level session detail page to replace.
- `frontend/src/features/sessions/FileChangesDrawer.tsx` — existing grouped file-change rendering, path shortening, relative timestamp, tool labels, and current file row interaction.
- `frontend/src/features/sessions/hooks/useFileChanges.ts` — current frontend fetch hook for `/api/file-changes?session_id=...`.
- `frontend/src/types/sessions.ts` — `Session`, `FileChangeGroup`, and `FileChangeEvent` frontend types.
- `frontend/src/features/sessions/utils.ts` — existing session duration helper used by the current page header.

### Existing Backend File-Change Contract
- `backend/internal/handler/file_changes.go` — `GET /api/file-changes` handler.
- `backend/internal/service/event_service.go` — `GetFileChanges(sessionID)` service method.
- `backend/internal/repository/repository.go` — repository contract for `GetFileChanges`.
- `backend/internal/repository/sqlite/sqlite.go` — current file-change query, grouping, and old/new/start_line mapping.
- `backend/internal/domain/event.go` — backend `FileChangeEvent` and `FileChangeGroup` response types.
- `backend/internal/server/router.go` — route registration for `/api/file-changes`.

### Codebase Maps
- `.planning/codebase/CONVENTIONS.md` — frontend naming, formatting, imports, and test conventions.
- `.planning/codebase/STRUCTURE.md` — where frontend feature code and tests belong.
- `.planning/codebase/STACK.md` — React/Vite/shadcn/lucide and test tooling.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/features/sessions/hooks/useFileChanges.ts` fetches grouped file changes by session ID and returns `groups`, `loading`, and `error`.
- `frontend/src/types/sessions.ts` already models `old_string`, `new_string`, and `start_line` on each `FileChangeEvent`.
- `frontend/src/features/sessions/FileChangesDrawer.tsx` already has useful helpers for file icons, tool labels, shortened paths, and relative session timestamps.
- `frontend/src/components/shared/PaginationBar.tsx` exists and should be considered for file pagination before adding new pagination controls.

### Established Patterns
- Frontend feature code belongs under `frontend/src/features/sessions/`.
- Frontend fetch hooks use stateful `loading`/`error` and cleanup cancellation patterns.
- Session metadata already comes from `/api/sessions?cwd=...` in `TraceViewPage`.
- Existing UI is dark, compact, and operator-focused; do not introduce a marketing-style page.

### Integration Points
- Replace the body of `TraceViewPage` with the file-change browser while keeping route params and session metadata fetch.
- Reuse or refactor `FileChangesDrawer` logic into route-level components instead of keeping it as a side drawer.
- Verify whether backend `GetFileChanges` currently returns all groups at once; add file-level pagination only if frontend-side pagination is insufficient or response size is a concrete issue.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly wants to "get rid of" the trace tree and timeline.
- The user wants the session page to show all files created or modified in the session.
- The user wants timestamps and pagination.
- The user wants old and new lines of change for each specific file.

</specifics>

<deferred>
## Deferred Ideas

- Trace/timeline UI retention as a secondary tab or separate page was considered and rejected for Phase 8.
- Full GitHub-style file diffs are deferred; Phase 8 should use compact old/new snippets per change.
- Search/filtering over file changes is not in scope for this phase.
- The old component-quality cleanup work for raw buttons, FileChangesDrawer inline styles, and trace-tree prop drilling is deferred unless it is naturally required by the replacement page.

</deferred>

---

*Phase: 8-Session File Changes View*
*Context gathered: 2026-05-31*
