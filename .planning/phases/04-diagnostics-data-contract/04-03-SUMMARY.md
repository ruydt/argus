---
phase: 04-diagnostics-data-contract
plan: 03
subsystem: backend-tests
tags: [go, diagnostics, tests, privacy]

requires:
  - phase: 04-diagnostics-data-contract
    provides: diagnostics domain structs, repository aggregate method, and GET /api/diagnostics endpoint from 04-01 and 04-02
provides:
  - SQLite diagnostics aggregate regression coverage
  - EventService diagnostics composition regression coverage
  - Diagnostics handler response shape and privacy boundary coverage
  - Router smoke coverage for GET /api/diagnostics
affects: [phase-04, diagnostics-api, backend-regression]

tech-stack:
  added: []
  patterns: [httptest response assertions, repository aggregate tests, service mock stats propagation tests]

key-files:
  created:
    - backend/tests/internal/handler/diagnostics_test.go
  modified:
    - backend/tests/internal/repository/sqlite/sqlite_test.go
    - backend/tests/internal/service/event_service_test.go
    - backend/tests/internal/server/router_test.go

key-decisions:
  - "Diagnostics privacy coverage uses both forbidden key-name assertions and seeded sensitive captured-content values."
  - "Repository aggregate tests include a degraded event to prove diagnostics counts stored rows independent of normalization status."

patterns-established:
  - "Diagnostics endpoint tests decode the grouped contract and separately assert absent captured-content fields."
  - "Service diagnostics tests use mock repository diagnostics stats to prove aggregate propagation without list-loading paths."

requirements-completed: [DIAG-01, DIAG-02, DIAG-03, DIAG-04, TEST-01]

duration: 9 min
completed: 2026-05-27
---

# Phase 4 Plan 03: Diagnostics Contract Test Summary

**Backend regression coverage for the diagnostics data contract**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-27T16:52:37Z
- **Completed:** 2026-05-27T17:01:49Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- Added SQLite tests for empty diagnostics stats, total event/session counts, degraded event counting, and latest timestamp aggregation.
- Added service tests for readiness false, `:memory:` DB size nullability, real DB file size, aggregate propagation, and repository error propagation.
- Added diagnostics handler tests for grouped JSON shape, not-ready HTTP 200 behavior, aggregate error HTTP 500 behavior, and captured-content non-leakage.
- Added router smoke coverage proving `GET /api/diagnostics` is mounted and returns the expected JSON contract.
- Ran the full backend Go regression suite successfully.

## Task Commits

1. **Tasks 1-4: Repository, service, handler, router tests and backend regression** - `b288a7e` (test)

**Plan metadata:** pending

## Files Created/Modified

- `backend/tests/internal/handler/diagnostics_test.go` - New handler tests for grouped shape, readiness, aggregate failure, and privacy boundary.
- `backend/tests/internal/repository/sqlite/sqlite_test.go` - Added aggregate tests for empty DB, row counts, degraded rows, and max latest timestamp.
- `backend/tests/internal/service/event_service_test.go` - Extended mock repo and added diagnostics composition tests.
- `backend/tests/internal/server/router_test.go` - Added DB path option in test router and `/api/diagnostics` route smoke test.

## Decisions Made

- Seeded sensitive captured fields in a real stored event, then asserted the diagnostics body excludes those keys and values.
- Used a temp DB file in service tests to verify `DBSizeBytes` behavior without depending on a persistent local database.

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope changes.

## Issues Encountered

- Two initial focused `go test -run` commands used an unquoted regex and zsh expanded it as a glob. Re-ran with quoted patterns; tests passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 4 now has backend regression coverage for the diagnostics contract. Later UI and diagnostics privacy phases can consume `/api/diagnostics` with covered shape, readiness, storage, and non-leakage guarantees.

---
*Phase: 04-diagnostics-data-contract*
*Completed: 2026-05-27*
