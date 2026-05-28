---
phase: 05-hook-and-privacy-diagnostics
plan: 03
subsystem: api
tags: [go, diagnostics, privacy, security, cors]

requires:
  - phase: 05-hook-and-privacy-diagnostics
    provides: "Plan 01 and Plan 02 diagnostics contract"
provides:
  - "Privacy diagnostics with ignore file path, status, and active pattern count"
  - "Security diagnostics with remote-bind posture and CORS local/extra counts"
  - "Static export sensitivity warning covering captured and exported data"
affects: [diagnostics, privacy, security, phase-06]

tech-stack:
  added: []
  patterns: ["Diagnostics options carry safe config posture into the read-only diagnostics endpoint"]

key-files:
  created: []
  modified:
    - backend/cmd/server/main.go
    - backend/internal/domain/diagnostics.go
    - backend/internal/handler/diagnostics.go
    - backend/internal/privacy/ignore/ignore.go
    - backend/internal/privacy/ignore/ignore_test.go
    - backend/internal/server/router.go
    - backend/internal/service/event_service.go
    - backend/tests/internal/handler/diagnostics_test.go
    - backend/tests/internal/server/router_test.go
    - backend/tests/internal/service/event_service_test.go

key-decisions:
  - "Ignore diagnostics expose path, load status, and count only; raw ignore patterns are not serialized."
  - "CORS diagnostics expose total, local, and extra origin counts only; full origin strings are not serialized."
  - "Remote bind diagnostics report display posture without duplicating startup bind validation."

patterns-established:
  - "Use service.DiagnosticsOptions for diagnostics-only config posture."
  - "Keep EventService.Diagnostics as a compatibility wrapper around DiagnosticsWithOptions."

requirements-completed: [PRIV-01, PRIV-02, PRIV-03, PRIV-04, HOOK-05]

duration: 6 min
completed: 2026-05-28
---

# Phase 5 Plan 03: Privacy and Security Diagnostics Summary

**Privacy ignore status/count diagnostics and security posture counts exposed without raw sensitive data**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-28T03:55:03Z
- **Completed:** 2026-05-28T04:01:41Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added `privacy.ignoreFile` with path, status, and active pattern count.
- Added `privacy.exportWarning` with the canonical sensitivity warning for prompts, diffs, file paths, tool outputs, raw payloads, and exports.
- Added `security.remoteBind` and `security.cors` diagnostics with bind posture and count-only origin reporting.
- Added ignore matcher `LoadWithStatus` and `RuleCount` while preserving existing `Load` behavior.
- Covered privacy/security diagnostics at ignore package, service, handler, and router levels.

## Task Commits

Each task was committed atomically:

1. **Task 1-3: Privacy and security diagnostics** - `e1a0ebd` (feat)

**Plan metadata:** pending (this summary commit)

## Files Created/Modified

- `backend/internal/privacy/ignore/ignore.go` - Adds safe load status and rule-count support.
- `backend/internal/domain/diagnostics.go` - Adds privacy and security diagnostics response structs.
- `backend/internal/service/event_service.go` - Composes privacy/security diagnostics from options.
- `backend/internal/handler/diagnostics.go` - Uses diagnostics options for route output.
- `backend/internal/server/router.go` - Passes diagnostics posture options into the handler.
- `backend/cmd/server/main.go` - Loads ignore status/count and passes bind/CORS posture into router options.
- `backend/internal/privacy/ignore/ignore_test.go` - Covers missing and active-pattern count behavior.
- `backend/tests/internal/service/event_service_test.go` - Covers privacy/security service composition.
- `backend/tests/internal/handler/diagnostics_test.go` - Covers JSON shape and leak prevention.
- `backend/tests/internal/server/router_test.go` - Covers router-level diagnostics posture output.

## Decisions Made

- Counted local CORS origins by loopback markers (`localhost`, `127.0.0.1`, `[::1]`) and counted all others as extra.
- Kept stale-threshold and overall connectivity rollup logic out of the backend per D-10 and D-12.
- Left Gemini CLI out of the diagnostics scope, consistent with Phase 5 context.

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope changes.

## Issues Encountered

- Initial `go test` without explicit `GOCACHE` could not write to the default user cache under sandboxing. Re-ran verification with `GOCACHE=/private/tmp/hooker-gocache`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 6 can build the Diagnostics UI against the backend contract containing version, health, storage, two agent rows, privacy posture, and security posture.

## Self-Check: PASSED

- `go test ./internal/privacy/ignore` passed.
- `go test ./internal/service ./internal/handler ./internal/server ./cmd/server` passed.
- `go test ./...` passed.
- Frontend files were not touched by this plan.

---
*Phase: 05-hook-and-privacy-diagnostics*
*Completed: 2026-05-28*
