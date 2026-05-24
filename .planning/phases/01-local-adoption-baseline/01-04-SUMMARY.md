---
phase: 01-local-adoption-baseline
plan: 04
subsystem: infra
tags: [scripts, setup, doctor, hooks, bash]
requires:
  - phase: 01-local-adoption-baseline
    provides: health/version/ci baseline from plans 01-01 through 01-03
provides:
  - idempotent `./scripts/hooker setup` with backend build and hook config patching
  - report-only `./scripts/hooker doctor` required vs optional checks split
  - backup-before-write hook config patching for Claude Code and Codex
affects: [install, diagnostics, local-security]
tech-stack:
  added: []
  patterns: [idempotent config patching, report-only diagnostics command]
key-files:
  created: []
  modified: [scripts/hooker]
key-decisions:
  - "Setup patches only Claude Code and Codex hook configs with pre-write backups and idempotent grep guards."
  - "Doctor is report-only and does not run tests or mutate local state."
patterns-established:
  - "Hook config patch functions own JSON manipulation through python3 heredoc instead of sed/awk."
  - "Doctor required checks fail the command; optional checks only warn."
requirements-completed: [INSTALL-01, INSTALL-02, DIAG-06]
duration: 25min
completed: 2026-05-24
---

# Phase 01 Plan 04: Scripts Setup + Doctor Summary

**`scripts/hooker` now builds the server binary, patches Claude/Codex hooks idempotently with backups, and runs a report-only doctor with required failures and optional warnings.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-24T11:31:00Z
- **Completed:** 2026-05-24T11:56:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `patch_claudecode_hooks` and `patch_codex_hooks` with `8765/api/hook` idempotency checks and `.bak.pre-hooker` backups.
- Extended `setup` to run dependency install, build `hooker` binary via `go build -o "$ROOT/hooker" ./cmd/server`, and patch hook configs.
- Replaced `doctor` implementation with required/optional checks including Go/Node/pnpm checks, DB writable check, port check, hook presence warnings, and loopback ADDR warning.

## Task Commits

1. **Task 1: Rewrite setup() with binary build and idempotent hook patching** - `03b84bc` (feat)
2. **Task 2: Rewrite doctor() with required/optional split and remove test invocation** - `95e76f2` (fix)

## Files Created/Modified
- `scripts/hooker` - Added hook patch helpers, setup binary build + patch flow, and full report-only doctor checks.

## Decisions Made
- Followed plan decisions D-01 through D-04 exactly (idempotent grep guard, report-only doctor, Claude/Codex-only patching, setup binary build).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed syntax regression introduced during function replacement**
- **Found during:** Task 1
- **Issue:** An extra `setup() {` token caused `bash -n scripts/hooker` to fail with `unexpected end of file`.
- **Fix:** Removed the stray function opener and re-ran syntax verification.
- **Files modified:** `scripts/hooker`
- **Verification:** `bash -n scripts/hooker` returned success.
- **Committed in:** `03b84bc`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** No scope change; fix was required to meet Task 1 acceptance criteria.

## Issues Encountered
- Initial `setup` run failed in sandbox due blocked npm registry DNS; reran with escalated network permission and completed successfully.

## Known Stubs
None.

## Threat Flags
None.

## Next Phase Readiness
- Plan 01-04 deliverables are complete and verified.
- Ready for remaining Phase 1 docs/UI plans (01-05 and 01-06).

## Self-Check: PASSED
- FOUND: `.planning/phases/01-local-adoption-baseline/01-04-SUMMARY.md`
- FOUND: `03b84bc`
- FOUND: `95e76f2`
