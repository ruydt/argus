---
phase: 04-diagnostics-data-contract
plan: 02
subsystem: backend-api
tags: [go, http, diagnostics, routing]

requires:
  - phase: 04-diagnostics-data-contract
    provides: diagnostics domain structs and repository aggregate method from 04-01
provides:
  - EventService diagnostics response composition
  - Read-only diagnostics HTTP handler
  - GET /api/diagnostics router mount
  - Configured DB path propagation into diagnostics
affects: [phase-04, phase-05, phase-06, diagnostics-api]

tech-stack:
  added: []
  patterns: [service composition, typed json handler, server options wiring]

key-files:
  created:
    - backend/internal/handler/diagnostics.go
  modified:
    - backend/internal/service/event_service.go
    - backend/internal/server/router.go
    - backend/cmd/server/main.go

key-decisions:
  - "Diagnostics remains inspectable on readiness failure by returning HTTP 200 with health.ready false."
  - "The configured DB path flows through server.Options rather than widening NewRouter positional parameters."

patterns-established:
  - "Diagnostics handler calls EventService.Diagnostics(dbPath, ready())."
  - "Router options carry endpoint-specific runtime facts such as DBPath."

requirements-completed: [DIAG-01, DIAG-02, DIAG-03, DIAG-04, TEST-01]

duration: 2 min
completed: 2026-05-27
---

# Phase 4 Plan 02: Diagnostics Endpoint Wiring Summary

**Read-only `/api/diagnostics` endpoint wired through service composition, handler, router, and server DB path configuration**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-27T16:50:37Z
- **Completed:** 2026-05-27T16:52:37Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added `EventService.Diagnostics` to compose version, health, DB path/size, and storage aggregate data.
- Added `handler.Diagnostics` as a read-only JSON endpoint handler.
- Mounted `GET /api/diagnostics` in the existing router so existing middleware protects it.
- Passed `cfg.DBPath` into `server.Options` for diagnostics storage reporting.

## Task Commits

1. **Tasks 1-3: Service composition, handler, router, and startup wiring** - `c980e5b` (feat)

**Plan metadata:** pending

## Files Created/Modified

- `backend/internal/service/event_service.go` - Composes diagnostics response from repo stats, readiness, version metadata, and DB file size.
- `backend/internal/handler/diagnostics.go` - Encodes diagnostics JSON and returns `diagnostics` on aggregate errors.
- `backend/internal/server/router.go` - Adds `DBPath` option and mounts `GET /api/diagnostics`.
- `backend/cmd/server/main.go` - Passes configured DB path into router options.

## Decisions Made

- Used `server.Options.DBPath` to avoid widening `NewRouter` positional parameters.
- Used a generic `database not ready` reason when readiness is false.

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope changes.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 03 can now add repository, service, handler, and router regression tests against the completed endpoint contract.

---
*Phase: 04-diagnostics-data-contract*
*Completed: 2026-05-27*
