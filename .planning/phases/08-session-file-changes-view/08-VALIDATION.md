---
phase: 08
slug: session-file-changes-view
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-01
updated: 2026-06-01
source:
  - 08-01-PLAN.md
  - 08-01-SUMMARY.md
  - 08-02-PLAN.md
  - 08-02-SUMMARY.md
  - 08-03-PLAN.md
  - 08-03-SUMMARY.md
  - 08-04-PLAN.md
  - 08-04-SUMMARY.md
  - 08-05-PLAN.md
  - 08-05-SUMMARY.md
  - 08-UAT.md
---

# Phase 8 - Validation Strategy

> Reconstructed Nyquist validation contract for the completed session file changes view phase.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest / Testing Library, Go test |
| **Config file** | `frontend/vite.config.ts`, `frontend/package.json`, `backend/go.mod` |
| **Quick run command** | `pnpm --dir frontend test --run tests/features/sessions/project-session-traces.test.tsx tests/features/sessions/useFileChanges.test.ts` |
| **Backend run command** | `cd backend && GOCACHE=/private/tmp/hooker-gocache go test ./tests/internal/agents/codex ./tests/internal/handler ./tests/internal/repository/sqlite` |
| **Full suite command** | `pnpm --dir frontend run typecheck && pnpm --dir frontend test --run tests/features/sessions/project-session-traces.test.tsx tests/features/sessions/useFileChanges.test.ts && cd backend && GOCACHE=/private/tmp/hooker-gocache go test ./tests/internal/agents/codex ./tests/internal/handler ./tests/internal/repository/sqlite` |
| **Estimated runtime** | ~4 seconds focused, excluding lint |

---

## Sampling Rate

- **After every task commit:** Run the plan-specific `<automated>` command from the task.
- **After every plan wave:** Run the focused frontend sessions tests and the relevant backend Go package tests.
- **Before `$gsd-verify-work`:** Focused frontend route/hook tests, backend agent/handler/repository tests, and frontend typecheck must be green.
- **Max feedback latency:** ~5 seconds for the focused validation loop.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | SESS-01, SESS-03 | Route replacement / stale trace UI | Session detail route renders file-change browser and omits trace/timeline controls | component/integration | `pnpm --dir frontend test --run tests/features/sessions/project-session-traces.test.tsx` | yes | green |
| 08-01-02 | 01 | 1 | SESS-01 | Header metadata regression | Compact header preserves breadcrumbs, session ID, started time, duration, ended time, and file count | component/integration | `pnpm --dir frontend test --run tests/features/sessions/project-session-traces.test.tsx` | yes | green |
| 08-02-01 | 02 | 2 | SESS-01, SESS-02 | Unsafe captured path/snippet rendering | File rows use accessible disclosure and render captured text as React text | component/integration | `pnpm --dir frontend test --run tests/features/sessions/project-session-traces.test.tsx` | yes | green |
| 08-02-02 | 02 | 2 | SESS-01 | Pagination state leak | Pagination slices file groups and swaps visible file rows by page | component/integration | `pnpm --dir frontend test --run tests/features/sessions/project-session-traces.test.tsx` | yes | green |
| 08-02-03 | 02 | 2 | SESS-02 | Missing snippet metadata / unsafe HTML | Expanded rows show timestamp, tool/action, line number, `Before`, `After`, and text snippets | component/integration | `pnpm --dir frontend test --run tests/features/sessions/project-session-traces.test.tsx` | yes | green |
| 08-03-01 | 03 | 3 | SESS-01, SESS-02 | Route behavior untested | Route tests cover loading, error, empty, populated, expanded snippet, and pagination states | component/integration | `pnpm --dir frontend test --run tests/features/sessions/project-session-traces.test.tsx` | yes | green |
| 08-03-02 | 03 | 3 | SESS-03 | API URL / hook state regression | Hook encodes session IDs, parses old/new/start_line, clears stale groups, and handles errors | hook unit | `pnpm --dir frontend test --run tests/features/sessions/useFileChanges.test.ts` | yes | green |
| 08-03-03 | 03 | 3 | SESS-03 | Backend contract drift | `/api/file-changes` preserves old_string, new_string, and start_line | handler contract | `cd backend && GOCACHE=/private/tmp/hooker-gocache go test ./tests/internal/handler` | yes | green |
| 08-04-01 | 04 | gap | SESS-02, SESS-03 | Codex apply_patch omitted from file changes | Codex normalizer extracts path, old snippet, new snippet, and start line from apply_patch | unit | `cd backend && GOCACHE=/private/tmp/hooker-gocache go test ./tests/internal/agents/codex` | yes | green |
| 08-04-02 | 04 | gap | SESS-02, SESS-03 | Future Codex patch events invisible in UI | Hook-to-handler path returns Codex apply_patch edits from `/api/file-changes` | handler contract | `cd backend && GOCACHE=/private/tmp/hooker-gocache go test ./tests/internal/handler` | yes | green |
| 08-04-03 | 04 | gap | SESS-01, SESS-02, SESS-03 | Regression after backend contract fix | Focused frontend and backend Phase 8 regressions remain green | integration/regression | `pnpm --dir frontend test --run tests/features/sessions/project-session-traces.test.tsx tests/features/sessions/useFileChanges.test.ts && cd backend && GOCACHE=/private/tmp/hooker-gocache go test ./tests/internal/agents/codex ./tests/internal/handler ./tests/internal/repository/sqlite` | yes | green |
| 08-05-01 | 05 | gap | SESS-02, SESS-03 | Historical Codex rows remain invisible | Legacy command-only apply_patch rows are counted and backfilled on read | repository regression | `cd backend && GOCACHE=/private/tmp/hooker-gocache go test ./tests/internal/repository/sqlite -run TestGetFileChangesBackfillsLegacyCodexApplyPatchCommand -count=1` | yes | green |
| 08-05-02 | 05 | gap | SESS-02, SESS-03 | Read-path fallback exposes raw command or misses snippets | Backend derives old/new snippets server-side without mutating `backend/hooker.db` | repository/handler regression | `cd backend && GOCACHE=/private/tmp/hooker-gocache go test ./tests/internal/agents/codex ./tests/internal/handler ./tests/internal/repository/sqlite` | yes | green |
| 08-05-03 | 05 | gap | SESS-01, SESS-02, SESS-03 | Frontend contract drift after backend fallback | Existing route and hook tests remain compatible with the API response | component/hook regression | `pnpm --dir frontend test --run tests/features/sessions/project-session-traces.test.tsx tests/features/sessions/useFileChanges.test.ts` | yes | green |

*Status: green = verified by focused command during this validation audit.*

---

## Requirement Coverage

| Requirement | Coverage | Test Files | Status |
|-------------|----------|------------|--------|
| SESS-01 | Session detail route is a paginated file-change browser, not the old trace/timeline workspace | `frontend/tests/features/sessions/project-session-traces.test.tsx` | covered |
| SESS-02 | Expanded file rows show timestamp, tool/action, line metadata, and compact old/new snippets | `frontend/tests/features/sessions/project-session-traces.test.tsx`, `backend/tests/internal/agents/codex/normalize_test.go`, `backend/tests/internal/handler/file_changes_contract_test.go`, `backend/tests/internal/repository/sqlite/file_changes_legacy_test.go` | covered |
| SESS-03 | Existing file-change API/data contract is used first; backend support is limited to Codex apply_patch normalization/read-path compatibility where data was insufficient | `frontend/tests/features/sessions/useFileChanges.test.ts`, `backend/tests/internal/handler/file_changes_contract_test.go`, `backend/tests/internal/repository/sqlite/file_changes_legacy_test.go` | covered |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

The browser UAT in `08-UAT.md` is still useful as a human acceptance check after restarting the backend, but it is not required to close a Nyquist automation gap because the reported Codex visibility gap now has backend regression coverage.

---

## Validation Audit 2026-06-01

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

### Commands Run

| Command | Result |
|---------|--------|
| `pnpm --dir frontend test --run tests/features/sessions/project-session-traces.test.tsx tests/features/sessions/useFileChanges.test.ts` | passed: 2 files, 17 tests |
| `cd backend && GOCACHE=/private/tmp/hooker-gocache go test ./tests/internal/agents/codex ./tests/internal/handler ./tests/internal/repository/sqlite` | passed |
| `pnpm --dir frontend run typecheck` | passed |
| `pnpm --dir frontend run lint` | failed on pre-existing `frontend/src/features/diagnostics/hooks/useDiagnostics.ts:30` (`react-hooks/set-state-in-effect`), outside Phase 8 |

### Residual Risk

The focused Phase 8 validation loop is green. Full frontend lint is not green because of a diagnostics hook issue outside this phase; it is not a Nyquist gap for SESS-01 through SESS-03.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or existing test infrastructure
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency < 5s for focused validation
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-01
