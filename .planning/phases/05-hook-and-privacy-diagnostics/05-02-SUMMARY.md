---
phase: 05-hook-and-privacy-diagnostics
plan: 02
subsystem: api
tags: [go, diagnostics, hooks, config]

requires:
  - phase: 05-hook-and-privacy-diagnostics
    provides: "Plan 01 agent diagnostics rows"
provides:
  - "Go hook config detector for Claude Code and Codex"
  - "Hook config status and reason fields on diagnostics agent rows"
  - "Server/router wiring for diagnostics hook config input"
affects: [diagnostics, hook-config, phase-06]

tech-stack:
  added: []
  patterns: ["Hook config detection is read-only and emits non-sensitive reason codes"]

key-files:
  created:
    - backend/internal/hookconfig/detector.go
    - backend/tests/internal/hookconfig/detector_test.go
  modified:
    - backend/cmd/server/main.go
    - backend/internal/domain/diagnostics.go
    - backend/internal/handler/diagnostics.go
    - backend/internal/server/router.go
    - backend/internal/service/event_service.go
    - backend/tests/internal/handler/diagnostics_test.go
    - backend/tests/internal/server/router_test.go
    - backend/tests/internal/service/event_service_test.go

key-decisions:
  - "Hook config detection checks Claude Code and Codex only."
  - "Config files without the hooker endpoint report missing."
  - "Read and JSON parse failures report unknown with non-sensitive reason codes."

patterns-established:
  - "server.Options carries diagnostics inputs instead of widening NewRouter positional parameters."
  - "Diagnostics service accepts optional hook config status input while preserving existing callers."

requirements-completed: [HOOK-01, HOOK-04, HOOK-05]

duration: 3 min
completed: 2026-05-28
---

# Phase 5 Plan 02: Hook Config Diagnostics Summary

**Read-only Claude Code and Codex hook config detection wired into diagnostics agent rows**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-28T03:52:06Z
- **Completed:** 2026-05-28T03:55:03Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added `backend/internal/hookconfig` with doctor-equivalent endpoint matching for Claude Code and Codex config files.
- Added `hookConfigStatus` and optional `hookConfigReason` to diagnostics agent rows.
- Wired detector output through `main.go` and `server.Options` into the diagnostics handler/service path.
- Covered configured, missing, invalid JSON, and read-error states without exposing raw file content or OS error text.

## Task Commits

Each task was committed atomically:

1. **Task 1-3: Hook config diagnostics** - `a545d2c` (feat)

**Plan metadata:** pending (this summary commit)

## Files Created/Modified

- `backend/internal/hookconfig/detector.go` - Detects Claude Code and Codex hook config status.
- `backend/tests/internal/hookconfig/detector_test.go` - Covers configured, missing, unknown, and no-Gemini behavior.
- `backend/internal/domain/diagnostics.go` - Adds hook config reason fields.
- `backend/internal/service/event_service.go` - Merges hook config status into supported agent rows.
- `backend/internal/handler/diagnostics.go` - Accepts optional hook config diagnostics input.
- `backend/internal/server/router.go` - Adds `HookConfig` to router options.
- `backend/cmd/server/main.go` - Runs hook config detection and passes results to router options.
- `backend/tests/internal/service/event_service_test.go` - Covers status merge behavior.
- `backend/tests/internal/handler/diagnostics_test.go` - Covers serialized hook config status.
- `backend/tests/internal/server/router_test.go` - Covers router-level diagnostics hook config output.

## Decisions Made

- Used a new Go package rather than shelling out to `scripts/hooker`, keeping detection reusable and testable.
- Kept Gemini CLI out of detector results per Phase 5 context.

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

Plan 03 can now add privacy/security posture diagnostics alongside the existing storage, agent, and hook config sections.

## Self-Check: PASSED

- `go test ./tests/internal/hookconfig ./tests/internal/service ./tests/internal/handler ./tests/internal/server ./cmd/server` passed.
- Summary exists and references production commit `a545d2c`.

---
*Phase: 05-hook-and-privacy-diagnostics*
*Completed: 2026-05-28*
