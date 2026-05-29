# Phase 7: Backend Code Quality - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 7-Backend Code Quality
**Areas discussed:** JSON error approach, parsePageSize scope, Handler test depth

---

## JSON Error Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Inline log per site | Each site becomes `if err := ...; err != nil { log.Printf(...) }`. No new abstraction. 14 changes across 10 files. | ✓ |
| Extract writeJSON helper | Add `writeJSON(w, v)` in helpers.go. All 14 sites call it. One new file, cleaner call sites. | |
| You decide | Claude picks based on project conventions. | |

**User's choice:** Inline log per site

| Option | Description | Selected |
|--------|-------------|----------|
| [handler] encode %T: %v | Includes response type for debugging. Matches existing `[handler]` prefix convention. | ✓ |
| [handler] json encode: %v | Simpler, no type info. | |
| You decide | Claude picks format matching existing patterns. | |

**User's choice:** `[handler] encode %T: %v`
**Notes:** No additional clarifications.

---

## parsePageSize Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Keep silent / default-to-0 | Move existing pattern as-is. Invalid values silently default to 0 → clamped to page=1. No behavior change. | ✓ |
| Log invalid values too | Add log.Printf when Atoi fails. Improved observability for bad clients. | |

**User's choice:** Keep silent / default-to-0

| Option | Description | Selected |
|--------|-------------|----------|
| backend/internal/handler/helpers.go | New file in handler package. Co-located with users. Go convention. | ✓ |
| Inline in sessions.go | Define once in sessions.go, use from traces.go via package-level access. | |

**User's choice:** `backend/internal/handler/helpers.go`
**Notes:** No additional clarifications.

---

## Handler Test Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Happy-path smoke tests | 1-2 tests per handler: HTTP 200, valid JSON, no panics. Fills coverage gap. | ✓ |
| Substantive coverage | Happy path + error cases. Closer to hook_test.go depth. | |
| You decide | Claude picks depth per handler based on complexity. | |

**User's choice:** Happy-path smoke tests

| Option | Description | Selected |
|--------|-------------|----------|
| backend/tests/internal/handler/ | Same directory as all existing handler tests. Consistent. | ✓ |
| New file per handler | More discoverable but more files. | |

**User's choice:** `backend/tests/internal/handler/`

| Option | Description | Selected |
|--------|-------------|----------|
| One file: dashboard_health_usage_version_test.go | All 5 new smoke tests in one file. Consistent with projects_sessions_traces_test.go grouping. | ✓ |
| Separate file per handler | dashboard_test.go, health_test.go, etc. More files. | |

**User's choice:** One file: `dashboard_health_usage_version_test.go`
**Notes:** No additional clarifications.

---

## Claude's Discretion

None — all areas decided explicitly by user.

## Deferred Ideas

- **UI bugs and feature fixes** — mentioned during area selection. Out of Phase 7 scope (backend-only). Belongs in Phase 8 or a new dedicated phase.
