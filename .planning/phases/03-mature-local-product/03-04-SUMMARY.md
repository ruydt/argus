---
phase: 03-mature-local-product
plan: 04
subsystem: docs
tags: [privacy, security, doctor, local-first, exports]

requires:
  - phase: 02-reliable-daily-use
    provides: raw payload archive and export endpoints requiring privacy guidance
provides:
  - Doctor privacy warning listing captured and exported sensitive data categories
  - Privacy controls document covering ignore scope and export implications
  - Security threat model document covering local single-user use and unsupported remote sharing
affects: [privacy-controls, security-posture, install-docs, contributor-docs]

tech-stack:
  added: []
  patterns:
    - "README stays concise and links to canonical docs"
    - "Doctor privacy warning remains report-only"

key-files:
  created:
    - docs/privacy.md
    - docs/security.md
  modified:
    - scripts/hooker
    - docs/install.md
    - docs/quickstart.md
    - README.md

key-decisions:
  - "Canonical privacy and security guidance lives in docs/privacy.md and docs/security.md; README only links to those documents."
  - "Doctor warns about sensitive data capture without making privacy warnings a required-check failure."

patterns-established:
  - "Captured-data category wording uses prompts, diffs, file paths, tool outputs, raw payloads, and exports consistently across doctor and setup docs."
  - "Threat model docs explicitly scope hooker to localhost-use, single-user operation, and unsupported remote/ngrok sharing."

requirements-completed: [SEC-04, PRIV-02, PRIV-03]

duration: 2min
completed: 2026-05-27
---

# Phase 03 Plan 04: Doctor Privacy Warning and Security Docs Summary

**Doctor and setup docs now clearly name captured sensitive data, with canonical privacy controls and local threat model guidance.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-27T04:19:42Z
- **Completed:** 2026-05-27T04:21:52Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added a report-only `./scripts/hooker doctor` privacy warning naming prompts, diffs, file paths, tool outputs, raw payloads, and exports.
- Added `docs/privacy.md` covering ignore path defaults, `$HOOKER_IGNORE`, matching scope, no raw-text scanning, no DB/SSE side effects for ignored events, and NDJSON/SQLite snapshot implications.
- Added `docs/security.md` covering localhost-use, single-user trust model, no auth for loopback use, local guards, `HOOKER_ALLOW_REMOTE=1`, and unsupported ngrok/remote sharing.
- Updated install, quickstart, and README docs to point users at the canonical privacy/security guidance before capture starts.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add doctor and setup privacy warnings** - `21ba8bd` (docs)
2. **Task 2: Create privacy and security posture docs** - `7093a82` (docs)

**Plan metadata:** committed after this summary.

## Files Created/Modified

- `scripts/hooker` - Adds report-only privacy warning and expands non-loopback warning categories.
- `docs/install.md` - Adds setup-time capture warning and links to privacy/security docs.
- `docs/quickstart.md` - Warns before first hook event and links to privacy/security docs.
- `README.md` - Adds concise links to canonical privacy and security docs.
- `docs/privacy.md` - Documents captured data, ignore controls, matching scope, and export implications.
- `docs/security.md` - Documents local threat model, loopback posture, remote opt-in, and unsupported sharing.

## Decisions Made

- Canonical privacy/security content lives in `docs/privacy.md` and `docs/security.md`; README remains a short entry point.
- Doctor privacy warnings are informational and do not change required-check pass/fail behavior.

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope changes.

## Issues Encountered

- `./scripts/hooker doctor` reported port `8765` already in use during verification. The plan-level verification explicitly runs this command with `|| true`, and the required category assertion passed. No code change was needed.

## User Setup Required

None - no external service configuration required.

## Verification

- `rtk bash -n scripts/hooker` - passed.
- `rtk bash -c 'out=$(./scripts/hooker doctor 2>&1 || true); printf "%s\n" "$out"; for s in prompts diffs "file paths" "tool outputs" "raw payloads" exports; do grep -F "$s" <<<"$out" >/dev/null || exit 1; done'` - passed.
- `rtk bash -c 'test -f docs/privacy.md && test -f docs/security.md'` - passed.
- `rtk rg -n 'localhost-use|single-user|no auth|unsupported|~/.config/hooker/ignore|HOOKER_IGNORE|NDJSON|snapshot' docs/privacy.md docs/security.md docs/install.md` - passed.
- `rtk rg -n 'prompts|diffs|file paths|tool outputs|raw payloads|exports|unsupported|HOOKER_ALLOW_REMOTE=1' scripts/hooker docs README.md` - passed.

## Known Stubs

None.

## Next Phase Readiness

Ready for the remaining Phase 03 plans. Privacy and security documentation now provide the user-facing baseline needed by the later ignore matcher and remote-bind enforcement work.

## Self-Check: PASSED

- Created files exist: `docs/privacy.md`, `docs/security.md`.
- Task commits exist: `21ba8bd`, `7093a82`.
- Summary file exists: `.planning/phases/03-mature-local-product/03-04-SUMMARY.md`.

---
*Phase: 03-mature-local-product*
*Completed: 2026-05-27*
