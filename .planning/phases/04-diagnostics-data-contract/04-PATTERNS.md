# Phase 4: Diagnostics Data Contract - Pattern Map

**Mapped:** 2026-05-27
**Status:** Ready for planning

## Purpose

Map each expected Phase 4 file change to existing analogs so executors copy local patterns instead of inventing new structure.

## New or Modified Files

| Target | Role | Closest Existing Analogs | Pattern to Reuse |
|--------|------|--------------------------|------------------|
| `backend/internal/domain/diagnostics.go` | Diagnostics response and aggregate structs | `backend/internal/domain/event.go` | Plain structs with JSON tags; keep wire tags explicit. Use camelCase only for this new diagnostics contract. |
| `backend/internal/repository/repository.go` | Storage interface expansion | Existing `EventRepository` methods | Add one diagnostics aggregate method near other read methods; update all test doubles immediately. |
| `backend/internal/repository/sqlite/sqlite.go` | SQLite aggregate implementation | `ListSessionsByCWDPage`, `GetTracesPage`, `GetDashboardStats` | Use targeted `QueryRow` aggregate queries. Avoid dashboard enrichment and list-loading flows. |
| `backend/internal/service/event_service.go` | Diagnostics composition | Existing `GetDashboardStats`, `ListSessions`, `ListEvents` wrappers | Service method delegates storage aggregates to repo and composes version/health/storage fields. Do not backfill or mutate sessions. |
| `backend/internal/handler/diagnostics.go` | HTTP handler | `backend/internal/handler/version.go`, `backend/internal/handler/dashboard.go` | `http.HandlerFunc`, set `Content-Type`, encode typed response, return 500 only on storage aggregate errors. |
| `backend/internal/server/router.go` | Route wiring and options | Existing `/api/version`, `/readyz`, `Options` struct | Add `GET /api/diagnostics`; prefer extending `Options` with DB path over widening `NewRouter` signature. |
| `backend/cmd/server/main.go` | Runtime wiring | Existing `server.NewRouter` call and `config.Load()` | Pass `cfg.DBPath` through `server.Options`. Keep readiness function as `repo.Ready`. |
| `backend/tests/internal/repository/sqlite/sqlite_test.go` | Aggregate query tests | Existing `newTestDB`, `addEvent`, `UpsertSession` tests | Test empty DB, counts, degraded stored events, and `MAX(created_at)` semantics. |
| `backend/tests/internal/service/event_service_test.go` | Service behavior tests and mock update | Existing `mockRepo` | Add diagnostics aggregate fields/method to mock. Assert no list-based diagnostics behavior. |
| `backend/tests/internal/handler/diagnostics_test.go` | Handler response tests | `backend/tests/internal/handler/hook_test.go`, `export_test.go` | Use `httptest`, in-memory DB or service mock, decode JSON into typed/anonymous structs. |
| `backend/tests/internal/server/router_test.go` | Router smoke test and noop mock update | Existing version route test | Add `noopRepo` diagnostics method and assert `/api/diagnostics` is mounted. |

## Concrete Code Patterns

### Handler JSON Shape

Follow `backend/internal/handler/version.go`:

- return `http.Handler`
- set `Content-Type` to `application/json`
- encode a typed struct with `json.NewEncoder`

### Readiness

Follow `backend/internal/handler/health.go`:

- readiness comes from `ready func() bool`
- `/readyz` remains strict
- diagnostics reports `ready: false` in JSON and still returns HTTP 200

### SQLite Aggregates

Follow the query style in `ListSessionsByCWDPage` and `GetTracesPage`:

- `QueryRow("SELECT COUNT(*) FROM ...").Scan(&total)`
- `sql.NullString` for `MAX(created_at)`
- return errors rather than logging and continuing for the core diagnostics aggregate method

### Tests

Update these test doubles when extending `EventRepository`:

- `backend/tests/internal/service/event_service_test.go` `mockRepo`
- `backend/tests/internal/server/router_test.go` `noopRepo`

Use `:memory:` tests for null DB size behavior and temp file DB tests for measurable `dbSizeBytes`.

## Constraints for Plans

- Do not expose captured-content fields or samples.
- Do not call `List`, `ListSessions`, or `GetDashboardStats` to compute diagnostics totals.
- Do not add Phase 5 placeholders (`agents`, `privacy`) in Phase 4.
- Do not change `/healthz`, `/readyz`, `/api/version`, or export behavior except as needed for shared type reuse.

## PATTERN MAPPING COMPLETE
