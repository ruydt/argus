---
phase: 08-session-file-changes-view
plan: 04
subsystem: backend/normalization
tags: [codex, apply_patch, file-changes, uat-gap]
requires:
  - phase: 08-UAT
    provides: "Codex file-change visibility gap"
provides:
  - codex-apply-patch-file-changes
  - apply-patch-old-new-snippet-contract
affects:
  - session-file-changes-view
  - codex-normalizer
tech-stack:
  added: []
  patterns:
    - "TDD red-green gap closure for Codex apply_patch file-change visibility"
key-files:
  created: []
  modified:
    - backend/internal/agents/codex/codex.go
    - backend/tests/internal/agents/codex/normalize_test.go
    - backend/tests/internal/handler/file_changes_contract_test.go
key-decisions:
  - "Codex apply_patch normalization now preserves old/new snippet fields for file-change consumers while keeping command data available for existing event rendering."
  - "No frontend rewrite was needed; the existing FileChangesList old_string/new_string contract now receives Codex patch snippets through /api/file-changes."
patterns-established:
  - "Codex patch events must be covered both at normalizer level and through the hook-to-file-changes handler path."
requirements-completed:
  - SESS-02
  - SESS-03
duration: "~10 min"
completed: 2026-06-01
---

# Phase 8 Plan 04: Codex Patch File Changes Summary

Codex `apply_patch` edits now appear in the session file-change browser with old/new snippets through the existing `/api/file-changes` contract.

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-01T04:21:29Z
- **Completed:** 2026-06-01T04:25:43Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added a normalizer regression proving Codex `apply_patch` extracts file path, old snippet, new snippet, and start line.
- Added a handler contract regression that posts a realistic Codex `apply_patch` hook payload, then verifies `/api/file-changes?session_id=...` returns the changed file and snippets.
- Updated `codex.Normalize` to preserve parsed patch old/new hunk lines in `NormalizedEvent.OldString` and `NormalizedEvent.NewString`, allowing the existing file-change SQL and UI to include Codex edits.

## Task Commits

1. **Task 1 + Task 2: Codex apply_patch file-change regression and fix** - `8d5cb9b` (fix)
2. **Task 3: Focused regression suite** - verified in working tree; no code changes

## Files Created/Modified

- `backend/internal/agents/codex/codex.go` - Added `patchSnippetStrings()` and preserves parsed apply_patch old/new lines for file-change consumers.
- `backend/tests/internal/agents/codex/normalize_test.go` - Updated apply_patch normalizer regression to assert old/new snippets are extracted.
- `backend/tests/internal/handler/file_changes_contract_test.go` - Added hook-to-file-changes regression for Codex apply_patch events.

## Decisions Made

- Preserve snippets in the backend contract rather than teaching `FileChangesList` to parse raw patch commands. This keeps Phase 8's UI contract unchanged and fixes the agent-normalization gap at the source.
- Did not expand `fileChangeCondition` to include `apply_patch`; once old/new snippets are stored, the existing non-empty old/new condition includes these events.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- RED verification failed as expected:
  - `TestNormalizeApplyPatchExtractsFileChangeSnippets` reported empty `OldString`.
  - `TestFileChangesIncludesCodexApplyPatchEdits` reported zero file-change groups.
- GREEN verification passed after preserving parsed patch old/new lines.

## Verification Results

- `cd backend && GOCACHE=/private/tmp/hooker-gocache go test ./tests/internal/agents/codex ./tests/internal/handler ./tests/internal/repository/sqlite` — passed
- `pnpm --dir frontend test --run tests/features/sessions/project-session-traces.test.tsx tests/features/sessions/useFileChanges.test.ts` — 2 files, 17 tests passed

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The Codex file-change visibility gap is fixed in code and covered by focused regressions. Phase 8 UAT should be rerun for the Codex file-change scenario so Test 3 can be marked passed, then milestone audit can be rerun.

---
*Phase: 08-session-file-changes-view*
*Completed: 2026-06-01*
