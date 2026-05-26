---
phase: 02-reliable-daily-use
plan: "07"
subsystem: backend-tests
tags:
  - testing
  - migration
  - dedup
  - normalization
  - export

dependency_graph:
  requires:
    - 02-02  # degraded ingest — NormalizationStatus field on NormalizedEvent
    - 02-04  # export endpoints — ExportEvents, ExportSnapshot, secFetchSite middleware
  provides:
    - TEST-04  # export round-trip test: POST hook → GET /api/export/events
    - TEST-05  # migration file-DB test: TestMigrationNewColumns
    - TEST-06  # normalization fixture corpus: NormalizationStatus + NormalizerVersion assertions
    - MODEL-05 # dedup key stability: TestDedupKeyStability, TestDegradedEventDedup
  affects:
    - backend/internal/agents/claudecode/claudecode.go
    - backend/internal/agents/codex/codex.go
    - backend/internal/agents/geminicli/geminicli.go

tech_stack:
  added: []
  patterns:
    - httptest.NewServer with real NewRouter for full-stack export round-trip
    - t.TempDir() file-based DB for migration idempotency testing
    - Sub-test t.Run for scoped dedup scenarios

key_files:
  created:
    - backend/tests/internal/repository/sqlite/migration_test.go
    - backend/tests/internal/repository/sqlite/dedup_test.go
  modified:
    - backend/tests/internal/agents/claudecode/normalize_test.go
    - backend/tests/internal/agents/codex/normalize_test.go
    - backend/tests/internal/handler/export_test.go
    - backend/internal/agents/claudecode/claudecode.go
    - backend/internal/agents/codex/codex.go
    - backend/internal/agents/geminicli/geminicli.go

decisions:
  - "Agent Normalize() functions now set NormalizationStatus='ok' directly — not only via hook.go — so the field is correct when calling Normalize() in isolation (tests, future adapters)"
  - "migration_test.go uses file-based DB (not :memory:) to test idempotency of New() on the same path"
  - "dedup_test.go uses sub-tests (t.Run) to scope the two degraded dedup scenarios without cross-contamination"

metrics:
  duration: 2min
  completed_date: "2026-05-26"
  tasks_completed: 2
  files_changed: 8
---

# Phase 02 Plan 07: Backend Test Coverage for Migration, Dedup, Normalization, and Export Summary

Wrote backend tests locking down four invariants established in Plans 02-01/02/04:
file-based DB migration idempotency, dedup key stability for both normal and degraded events,
NormalizationStatus="ok" set by agent Normalize() directly, and full-stack export round-trip
via httptest.NewServer with the real router.

## What Was Built

### Task 1: Migration file-DB test + dedup stability test

**migration_test.go** (`backend/tests/internal/repository/sqlite/migration_test.go`):
- `TestMigrationNewColumns` — opens a fresh file-based DB via `sqlite.New(t.TempDir()+"/test.db")`,
  runs `PRAGMA table_info(hook_events)` and asserts `normalizer_version`, `agent_version`,
  `normalization_status` columns exist; inserts a row, reads it back, then calls `sqlite.New()`
  again on the same path to verify idempotency (no error on second call).

**dedup_test.go** (`backend/tests/internal/repository/sqlite/dedup_test.go`):
- `TestDedupKeyStability` — adds identical `NormalizedEvent` twice, asserts only 1 row stored.
- `TestDegradedEventDedup/DifferentSessionsProduceTwoRows` — two degraded events with distinct
  `Session` values (simulating sha256-based prefix from hook.go) → 2 rows.
- `TestDegradedEventDedup/IdenticalFieldsProduceOneRow` — exact duplicate degraded event → 1 row.

**Bug fix (Rule 1):** All three agent `Normalize()` functions (`claudecode`, `codex`, `geminicli`)
were not setting `NormalizationStatus: "ok"`. The field was only set in `hook.go` after calling
`Normalize()`. Tests calling `Normalize()` directly (as fixture tests do) received an empty
`NormalizationStatus`. Fixed by adding `NormalizationStatus: "ok"` to the return value of each
agent's `Normalize()` function.

### Task 2: Expanded normalization fixtures + export round-trip test

**claudecode/normalize_test.go** (expanded):
- `TestNormalizeSetsMeta` — valid `PreToolUse` payload → `NormalizationStatus="ok"`,
  `NormalizerVersion="claudecode/1"`.
- `TestNormalizePostToolUseSetsMeta` — valid `PostToolUse` payload → same meta assertions.

**codex/normalize_test.go** (expanded):
- `TestNormalizeCodexSetsMeta` — valid `read_file` payload → `NormalizationStatus="ok"`,
  `NormalizerVersion="codex/1"`.

**export_test.go** (expanded):
- `TestExportEventsRoundTrip` — starts `httptest.NewServer` with the real `NewRouter(svc, repo, ready)`,
  POSTs a Claude Code hook payload, GETs `/api/export/events`, asserts 200, Content-Type contains
  "ndjson", and body contains the session_id "export-test-sess". Locks the full ingest-to-export path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] NormalizationStatus not set by agent Normalize() functions**
- **Found during:** Task 1 RED phase — `TestNormalizeSetsMeta` failed with `NormalizationStatus: want 'ok', got ""`
- **Issue:** `claudecode.Normalize()`, `codex.Normalize()`, and `geminicli.Normalize()` all set
  `NormalizerVersion` but not `NormalizationStatus`. The "ok" status was only applied by `hook.go`
  (line 74) after calling Normalize(), meaning tests and future callers invoking Normalize() directly
  would receive an empty NormalizationStatus.
- **Fix:** Added `NormalizationStatus: "ok"` to the return struct of all three agent `Normalize()` functions.
  The existing `hook.go` override (`e.NormalizationStatus = "ok"`) remains (harmless double-set,
  consistent with the comment acknowledging NormalizerVersion is set by the agent).
- **Files modified:** `backend/internal/agents/claudecode/claudecode.go`,
  `backend/internal/agents/codex/codex.go`, `backend/internal/agents/geminicli/geminicli.go`
- **Commits:** b011ead (claudecode, codex, geminicli all in same task commit)

**Note on pre-existing test coverage:** The plan specified creating `migration_test.go` as a new file.
However, `sqlite_test.go` already contained `TestMigration008_Columns`, `TestMigration008_DefaultStatus`,
`TestMigration008_NormalizationFieldsRoundtrip`, and `TestMigrationRunner_Idempotent` from Plan 02-02.
Similarly, `export_test.go` already had `TestExportEventsRoundTrip`-equivalent tests and Sec-Fetch-Site
blocking tests from Plan 02-04. The new files are additive — they lock the file-based-DB-specific
idempotency invariant and add a true httptest.NewServer round-trip that wasn't present before.

## Threat Model Coverage

| Threat ID | Mitigation | Test |
|-----------|------------|------|
| T-02-07-01 | Dedup key collision for degraded events | TestDegradedEventDedup — two different degraded Session values → 2 rows |
| T-02-07-02 | Migration idempotency | TestMigrationNewColumns — sqlite.New() called twice on same path |
| T-02-07-03 | Sec-Fetch-Site gate regression | TestExportEventsRoundTrip via real router + existing TestSecFetchSiteBlocksCrossSiteOnExportEvents |

## Verification Results

```
go build ./...    → Success
go test ./...     → 105 passed in 25 packages (was 96 before this plan)
go vet ./...      → No issues
```

Targeted runs:
```
go test ./tests/internal/repository/sqlite/... -v → 35 passed
go test ./tests/internal/agents/claudecode/... -v → 6 passed
go test ./tests/internal/agents/codex/... -v      → 6 passed
go test ./tests/internal/handler/... -v -run "TestExport|TestSecFetch" → 9 passed
```

## Self-Check: PASSED

Files created/exist:
- FOUND: /Users/duytran/GitHub/hooker/backend/tests/internal/repository/sqlite/migration_test.go
- FOUND: /Users/duytran/GitHub/hooker/backend/tests/internal/repository/sqlite/dedup_test.go

Commits exist:
- b011ead — test(02-07): migration file-DB test, dedup stability test, normalize meta test
- 5d653e4 — test(02-07): codex NormalizationStatus fixture + export round-trip via real router
