# Phase 4: Diagnostics Data Contract - Research

**Researched:** 2026-05-27
**Status:** Ready for planning

## Research Question

What needs to be known to plan Phase 4 well: a read-only `GET /api/diagnostics` backend data contract that reports version metadata, health/readiness, SQLite storage facts, and aggregate event/session stats without full-table scans or captured-content leakage.

## Phase Scope

Phase 4 covers only the backend diagnostics data contract:

- `GET /api/diagnostics`
- grouped `version`, `health`, and `storage` response sections
- version metadata from existing build variables
- health/readiness booleans from existing liveness/readiness behavior
- DB path, DB size, total events, total sessions, latest event timestamp
- targeted SQLite aggregate queries
- backend tests for response shape, empty DB, DB stats, readiness, and aggregate behavior

Phase 4 does not cover hook connectivity rows, privacy/security posture diagnostics, export sensitivity text, or Diagnostics UI. Those are Phase 5 and Phase 6 scope.

## Existing Patterns

### Routing and Handlers

- Routes are mounted in `backend/internal/server/router.go` using Go 1.22 method-aware patterns such as `mux.Handle("GET /api/version", handler.Version())`.
- JSON handlers set `Content-Type: application/json` and encode response structs directly.
- `backend/internal/handler/version.go` already exposes `version`, `commit`, and `buildDate`; `buildDate` establishes camelCase precedent for new diagnostics fields.
- `backend/internal/handler/health.go` has `/healthz` and `/readyz`; `/readyz` delegates readiness to a `ready func() bool`.

### Service and Repository Boundaries

- `EventService` in `backend/internal/service/event_service.go` is the application facade used by handlers.
- `EventRepository` in `backend/internal/repository/repository.go` is the storage boundary.
- SQLite implementation lives in `backend/internal/repository/sqlite/sqlite.go`.
- Adding a diagnostics aggregate method to `EventRepository` will require updating test doubles in:
  - `backend/tests/internal/service/event_service_test.go`
  - `backend/tests/internal/server/router_test.go`

### SQLite Aggregate Patterns

- Existing count queries appear in `ListSessionsByCWDPage` and `GetDashboardStats`.
- `GetDashboardStats` already uses `COUNT(*)` against `sessions` and `hook_events`, but also runs dashboard-specific enrichment queries. Do not reuse this service flow for diagnostics because Phase 4 explicitly needs a compact, dedicated aggregate contract.
- Relevant indexes already exist:
  - `idx_hook_events_created ON hook_events(created_at DESC)`
  - `idx_hook_events_session ON hook_events(session_id)`
- `sessions.session_id` is the primary key.

## Recommended Data Model

Add diagnostics-specific domain structs in `backend/internal/domain`, either in a new file such as `diagnostics.go` or near existing domain models:

- `Diagnostics`
  - `Version DiagnosticsVersion`
  - `Health DiagnosticsHealth`
  - `Storage DiagnosticsStorage`
- `DiagnosticsVersion`
  - `Version string`
  - `Commit string`
  - `BuildDate string`
- `DiagnosticsHealth`
  - `Live bool`
  - `Ready bool`
  - `Reason string,omitempty`
- `DiagnosticsStorage`
  - `DBPath string`
  - `DBSizeBytes *int64`
  - `DBSizeReason string,omitempty`
  - `TotalEvents int`
  - `TotalSessions int`
  - `LatestEventAt *string`

Use JSON tags with camelCase:

- `dbPath`
- `dbSizeBytes`
- `dbSizeReason`
- `totalEvents`
- `totalSessions`
- `latestEventAt`
- `buildDate`

Use pointers for nullable JSON fields. `latestEventAt` should encode as `null` for empty DB, not an empty string.

## Recommended Repository Contract

Add a dedicated aggregate type and method:

- `domain.DiagnosticsStorageStats`
  - `TotalEvents int`
  - `TotalSessions int`
  - `LatestEventAt *string`
- `EventRepository.DiagnosticsStorageStats() (domain.DiagnosticsStorageStats, error)`

The SQLite implementation should use targeted aggregate queries:

- `SELECT COUNT(*) FROM hook_events`
- `SELECT COUNT(*) FROM sessions`
- `SELECT MAX(created_at) FROM hook_events`

Use `sql.NullString` for `MAX(created_at)` so empty DB maps to `nil`.

Do not call `List`, `ListSessions`, `GetDashboardStats`, or dashboard enrichment from diagnostics aggregation.

## DB Path and Size

The configured DB path lives in `config.Config.DBPath`, but `server.NewRouter` currently receives only service, repository, readiness function, and router options. Prefer extending `server.Options` with a diagnostics DB path field rather than widening the router signature.

Recommended shape:

- Add `DBPath string` to `server.Options`.
- Pass `cfg.DBPath` from `backend/cmd/server/main.go`.
- In tests, set a stable path such as `:memory:` or a temp DB path through `server.Options`.

DB size should be computed outside SQLite aggregate queries using `os.Stat(dbPath)`:

- For normal file DB paths, return file size in bytes.
- For `:memory:` or stat failures, return `dbSizeBytes: null` and `dbSizeReason: "unavailable"`.
- Do not treat unavailable size as `0`.

## Health Semantics

Diagnostics should be inspectable even when readiness is false:

- `GET /api/diagnostics` returns HTTP 200.
- `health.live` is always `true` if the endpoint responds.
- `health.ready` comes from the same readiness function used by `/readyz`.
- When `ready` is false, include a generic reason such as `database not ready`.
- Do not embed `/healthz` or `/readyz` HTTP status codes.

Because the handler needs readiness, either:

- pass the ready function to a diagnostics handler constructor, or
- have service compose health when given a readiness function.

Keep `/readyz` unchanged as the strict readiness endpoint.

## Privacy and Security Findings

The endpoint is read-only but still returns local operational metadata. The contract must not expose captured content:

- no raw payload body
- no prompt, diff, tool output, command, old/new string, path sample, transcript sample, latest action, or latest source sample
- no list of event rows or session rows

The only path intentionally exposed in Phase 4 is the full resolved SQLite DB path, per context decision D-10 and requirement DIAG-03.

Security threat model for plans:

- Threat: diagnostics endpoint could accidentally become a content exfiltration surface.
- Mitigation: restrict response to version/health/storage aggregate fields and add tests that assert sensitive keys/content fields are absent.
- Threat: diagnostic aggregate queries could degrade local app responsiveness on large DBs.
- Mitigation: use SQL aggregate queries and existing indexed `hook_events.created_at` for `MAX(created_at)`.

## Testing Strategy

Backend tests should cover four layers.

### Repository Tests

Add tests under `backend/tests/internal/repository/sqlite/sqlite_test.go`:

- empty DB returns zero totals and `LatestEventAt == nil`
- after adding events/sessions, totals reflect stored rows
- degraded events count as events because they are stored rows
- `latestEventAt` returns maximum `created_at`, not insertion order

Use existing `newTestDB`, `addEvent`, and `UpsertSession` helpers where available.

### Service Tests

Add tests under `backend/tests/internal/service/event_service_test.go`:

- service composes diagnostics stats through repository method
- readiness false produces `health.ready == false` and generic reason
- no raw event/session list calls are needed for diagnostics

The existing `mockRepo` must implement the new repository diagnostics method.

### Handler Tests

Add tests under `backend/tests/internal/handler`, likely `diagnostics_test.go`:

- response shape has grouped `version`, `health`, `storage`
- empty DB / `:memory:` returns `dbSizeBytes: null`, `dbSizeReason`, and `latestEventAt: null`
- not-ready response still returns HTTP 200 with `health.ready: false`
- response does not include sensitive captured-content keys

### Router Tests

Add a route smoke test in `backend/tests/internal/server/router_test.go`:

- `GET /api/diagnostics` returns HTTP 200 and JSON when requested through the full router.

The existing `noopRepo` must implement the new repository diagnostics method.

## Plan Split Recommendation

Keep the roadmap’s three-plan split:

1. `04-01-PLAN.md` — domain response shape plus repository aggregate method and SQLite implementation.
2. `04-02-PLAN.md` — service composition, handler, router option/wiring, and route smoke behavior.
3. `04-03-PLAN.md` — backend regression tests across repository, service, handler, and router.

This order keeps interface/domain changes first, endpoint wiring second, and focused coverage third. Plan 2 depends on Plan 1; Plan 3 depends on Plans 1 and 2.

## Risks and Constraints

- Extending `EventRepository` breaks all mocks until updated.
- `:memory:` DB size must not be reported as zero.
- Existing `GetDashboardStats` looks tempting but is the wrong abstraction for Phase 4 because it performs dashboard-specific queries and service enrichment.
- Response field style intentionally differs from many existing domain JSON tags; this is locked by context decision D-03.
- `latestEventAt` must use `MAX(created_at)` and nullable scan semantics.

## Research Complete

## RESEARCH COMPLETE
