---
phase: 08-session-file-changes-view
plan: 05
subsystem: backend/file-changes
tags: [codex, apply_patch, sqlite, file-changes, uat-gap]
requires:
  - phase: 08-UAT
    provides: "Codex legacy DB file-change visibility gap"
provides:
  - codex-legacy-apply-patch-file-changes
  - file-change-read-path-patch-snippet-backfill
affects:
  - session-file-changes-view
  - sqlite-file-change-query
tech-stack:
  added: []
  patterns:
    - "Read-path compatibility fallback for historical normalized events"
key-files:
  created:
    - backend/tests/internal/repository/sqlite/file_changes_legacy_test.go
  modified:
    - backend/internal/agents/codex/codex.go
    - backend/internal/repository/sqlite/sqlite.go
key-decisions:
  - "Historical Codex apply_patch rows are handled on the read path instead of mutating backend/hooker.db."
  - "The existing frontend old_string/new_string contract remains unchanged; raw patch commands stay server-side."
requirements-completed:
  - SESS-02
  - SESS-03
duration: "~15 min"
completed: 2026-06-01
---

# Phase 8 Plan 05: Legacy Codex Apply Patch File Changes Summary

Existing Codex sessions can now show file changes even when their stored `apply_patch` rows only have path and command text.

## Accomplishments

- Added a repository regression for a legacy Codex `apply_patch` row with empty `old_string` and `new_string`.
- Included `apply_patch` in the SQLite file-change condition so Codex patch rows contribute to session file-change counts.
- Updated `GetFileChanges` to parse stored patch command text and derive old/new snippets when historical rows lack normalized snippets.
- Exported the Codex patch snippet helper so normalization and repository compatibility code use the same extraction behavior.

## Verification Results

- RED: `cd backend && GOCACHE=/private/tmp/hooker-gocache go test ./tests/internal/repository/sqlite -run TestGetFileChangesBackfillsLegacyCodexApplyPatchCommand -count=1` failed with `groups len = 0`.
- GREEN: same focused repository test passed after the read-path fallback.
- GREEN: `cd backend && GOCACHE=/private/tmp/hooker-gocache go test ./tests/internal/agents/codex ./tests/internal/handler ./tests/internal/repository/sqlite` passed. The first sandboxed run hit an unrelated `httptest` local-port permission error; rerunning with local listener permission passed.
- GREEN: `pnpm --dir frontend test --run tests/features/sessions/project-session-traces.test.tsx tests/features/sessions/useFileChanges.test.ts` passed: 2 files, 17 tests.

## User Setup Required

Restart the running backend process before checking the browser. The code now supports historical rows, but the currently running `go run` temp binary must be replaced to serve the new read path.
