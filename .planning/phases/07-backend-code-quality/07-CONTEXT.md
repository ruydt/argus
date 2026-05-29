# Phase 7: Backend Code Quality - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 improves backend code quality across three axes: (1) make JSON encode failures observable by logging them instead of silently discarding, (2) eliminate duplicated pagination parsing in sessions and traces handlers by extracting a shared helper, and (3) fill the handler test gap by adding smoke tests for 5 currently untested handlers. No new endpoints, no behavior changes visible to API consumers, no frontend changes.

</domain>

<decisions>
## Implementation Decisions

### JSON Encode Error Handling (BACK-01)
- **D-01:** Handle JSON encode failures inline at each of the 14 call sites — no shared helper. Each `_ = json.NewEncoder(w).Encode(v)` becomes: `if err := json.NewEncoder(w).Encode(v); err != nil { log.Printf("[handler] encode %T: %v", v, err) }`
- **D-02:** Log format is `[handler] encode %T: %v` — includes the response type for debugging, matches the existing `[handler] key=val` convention in CLAUDE.md.
- **D-03:** 14 sites across 10 handler files must be updated: dashboard.go, diagnostics.go, events.go, file_changes.go, projects.go, sessions.go (×2), sessions_tree.go, traces.go (×2), usage.go (×3), version.go.

### Pagination Helper Extraction (BACK-02)
- **D-04:** Extract `parsePageSize()` into a new file `backend/internal/handler/helpers.go`. Package-level function in the handler package, co-located with the handlers that use it.
- **D-05:** Keep the existing silent error behavior — `strconv.Atoi` failures silently default to 0, then clamped to page=1. No behavior change, no new logging for bad pagination params. Scope is DRY extraction only.
- **D-06:** Both `sessions.go:18-25` and `traces.go:17-25` replace their identical blocks with a call to the new helper.

### Handler Test Coverage (BACK-03)
- **D-07:** Write happy-path smoke tests only — verify HTTP 200, valid JSON response, no panics. Match the BACK-03 requirement intent without over-engineering.
- **D-08:** All 5 new handler tests live in `backend/tests/internal/handler/` in a single new file named `dashboard_health_usage_version_test.go`.
- **D-09:** Untested handlers to cover: dashboard, file_changes, health, usage, version. Reuse the existing `newTestService(t)` helper pattern from `hook_test.go`.

### Claude's Discretion
No areas delegated. All decisions made explicitly.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning and Requirements
- `.planning/ROADMAP.md` — Phase 7 goal, success criteria, and requirement mapping.
- `.planning/REQUIREMENTS.md` — BACK-01, BACK-02, BACK-03 requirement text.
- `.planning/PROJECT.md` — project constraints, Go error handling and logging conventions.
- `.planning/STATE.md` — current phase position and wave structure.

### Source Files to Modify (BACK-01 — all 14 JSON encoder sites)
- `backend/internal/handler/dashboard.go` — 1 encode site (line ~50)
- `backend/internal/handler/diagnostics.go` — 1 encode site (line ~19)
- `backend/internal/handler/events.go` — 1 encode site (line ~27)
- `backend/internal/handler/file_changes.go` — 1 encode site (line ~27)
- `backend/internal/handler/projects.go` — 1 encode site (line ~23)
- `backend/internal/handler/sessions.go` — 2 encode sites (lines ~40, ~67)
- `backend/internal/handler/sessions_tree.go` — 1 encode site (line ~25)
- `backend/internal/handler/traces.go` — 2 encode sites (lines ~41, ~56)
- `backend/internal/handler/usage.go` — 3 encode sites (lines ~22, ~25, ~28)
- `backend/internal/handler/version.go` — 1 encode site (line ~13)

### Source Files to Modify (BACK-02 — pagination extraction)
- `backend/internal/handler/sessions.go:18-25` — pagination block to replace with helper call
- `backend/internal/handler/traces.go:17-25` — pagination block to replace with helper call
- `backend/internal/handler/helpers.go` — NEW file to create with `parsePageSize()` function

### Existing Test Patterns to Follow
- `backend/tests/internal/handler/hook_test.go` — `newTestService(t)` helper definition, package `handler_test`, httptest pattern
- `backend/tests/internal/handler/projects_sessions_traces_test.go` — grouped multi-handler test file pattern
- `backend/tests/internal/handler/events_test.go` — handler test structure example

### CLAUDE.md Conventions
- Log format: `log.Printf("[handler] key=val ...")` — use `[handler]` prefix
- Error handling: `http.Error(w, msg, status); return` — handlers already follow this
- Backend quality gates: `go build ./...`, `go test ./...`, `golangci-lint run ./...` before done

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `newTestService(t)` in `backend/tests/internal/handler/hook_test.go`: creates in-memory SQLite + EventService — reuse directly for all 5 new handler tests
- `backend/internal/handler/` package: all handlers are package-level functions taking `*service.EventService` — consistent constructor pattern

### Established Patterns
- JSON response: `w.Header().Set("Content-Type", "application/json")` then `json.NewEncoder(w).Encode(v)` — inline, no wrapper
- Handler tests: black-box `package handler_test`, use `httptest.NewRequest` + `httptest.NewRecorder`, assert `rec.Code` and optionally decode body
- Logging: `log.Printf("[handler] ...")` — stdlib log, bracket-prefixed category tag

### Integration Points
- `helpers.go` connects to `sessions.go` and `traces.go` via the handler package — no import changes needed (same package)
- New test file connects via `package handler_test` and `"hooker/internal/handler"` import — same as all other test files in the directory

</code_context>

<specifics>
## Specific Ideas

No specific examples or references beyond requirements.

</specifics>

<deferred>
## Deferred Ideas

- **UI bugs and feature fixes** — mentioned during discussion but out of Phase 7 scope (backend-only phase). Belongs in Phase 8 (Frontend Component Quality) or a new phase depending on specifics.

</deferred>

---

*Phase: 7-Backend Code Quality*
*Context gathered: 2026-05-29*
