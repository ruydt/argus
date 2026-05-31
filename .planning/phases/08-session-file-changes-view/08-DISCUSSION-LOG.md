# Phase 8: Session File Changes View - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-31
**Phase:** 08-Session File Changes View
**Areas discussed:** Phase re-scope, page replacement, data contract, pagination, diff detail, page header

---

## Phase Re-Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Finish Phase 8 as scoped | Keep component cleanup and defer file-change page | |
| Stop and re-scope roadmap | Create/edit a phase for Session file changes diff view and plan it properly | ✓ |
| Replace Phase 8 directly | Abandon cleanup scope and rewrite Phase 8 immediately | |

**User's choice:** Stop Phase 8 discussion and re-scope the roadmap.
**Notes:** The user does not want the trace tree/timeline page; they want a file-change page instead.

---

## Page Replacement

| Option | Description | Selected |
|--------|-------------|----------|
| Replace entirely | Remove trace/timeline from the `/sessions/...` page scope and make files/diffs the page | ✓ |
| Default to files, keep trace optional | Make files/diffs primary while keeping trace as a secondary tab or panel | |
| New separate page | Keep current trace page and add a dedicated file-change detail page | |

**User's choice:** Replace entirely.
**Notes:** Matches the user's wording: "get rid of this trace tree node along with timeline and everything."

---

## Data Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Use existing data first | Plan against current file-change events and add backend work only if the API cannot provide old/new lines | ✓ |
| Design a new backend contract | Create a cleaner long-term API for paginated file diffs | |
| You decide | Research determines whether existing data is enough | |

**User's choice:** Use existing data first.
**Notes:** Planner should verify current `/api/file-changes` response before adding backend scope.

---

## Pagination

| Option | Description | Selected |
|--------|-------------|----------|
| Files | Paginate changed files, with each file expandable to show its change events/diffs | ✓ |
| Change events | Paginate every write/edit event individually | |
| Both if needed | File list pagination first, with large-file internal pagination later | |

**User's choice:** Files.
**Notes:** Internal per-file pagination is not required unless planning finds a concrete size problem.

---

## Diff Detail

| Option | Description | Selected |
|--------|-------------|----------|
| Old/new snippets per change | Show timestamp, tool/action, line number when available, then old lines and new lines in compact code blocks | ✓ |
| Full file-style diff | Closer to GitHub diff, but requires more parsing and stronger data assumptions | |
| Metadata first, snippets on demand | Cleaner list, but adds another interaction before seeing the change | |

**User's choice:** Old/new snippets per change.
**Notes:** Compact snippets are sufficient; full file diffs are deferred.

---

## Page Header

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, compact header | Keep project/session ID, started time, duration, and file-change count | ✓ |
| Minimal header | Only breadcrumbs and file-change count | |
| No header | Make the file list the whole page | |

**User's choice:** Yes, compact header.
**Notes:** Preserve useful session orientation without keeping trace/timeline controls.

---

## the agent's Discretion

- Exact component split and pagination page size.
- Whether backend pagination is needed after current data is verified.

## Deferred Ideas

- Trace/timeline retention as secondary UI.
- Full GitHub-style diff rendering.
- Search/filtering over file changes.
- Original raw-button/inline-style/prop-drilling cleanup unless still relevant after replacement.
