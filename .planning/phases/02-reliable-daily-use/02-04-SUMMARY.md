---
phase: 02-reliable-daily-use
plan: "04"
subsystem: backend/export+middleware
tags: [panic-recovery, sec-fetch-site, ndjson-export, vacuum-snapshot, csrf-protection, middleware]
dependency_graph:
  requires:
    - migration-008-normalization-fields  # from 02-01 — ExportEvents scans all 44 columns
  provides:
    - panic-recovery-middleware
    - sec-fetch-site-csrf-middleware
    - ndjson-export-endpoint
    - sqlite-snapshot-endpoint
  affects:
    - backend/internal/server/middleware.go
    - backend/internal/server/router.go
    - backend/cmd/server/main.go
    - backend/internal/handler/export.go
    - backend/internal/repository/repository.go
    - backend/internal/repository/sqlite/sqlite.go
    - backend/tests/internal/handler/export_test.go
    - backend/tests/internal/server/router_test.go
    - backend/tests/internal/service/event_service_test.go
tech_stack:
  added: []
  patterns:
    - panicRecovery middleware — outermost wrap, defer/recover with slog.Error + debug.Stack(), returns 500
    - secFetchSite middleware — per-route; rejects Sec-Fetch-Site:cross-site with 403, absent header = allow
    - ExportEvents cursor streaming — QueryContext + json.NewEncoder(w).Encode() row-by-row, never buffers
    - ExportSnapshot VACUUM INTO — ExecContext("VACUUM INTO ?", tmpPath), os.CreateTemp + http.ServeFile
    - defer func() { _ = os.Remove(tmpPath) }() — errcheck-safe temp file cleanup pattern
key_files:
  created:
    - backend/internal/handler/export.go
    - backend/tests/internal/handler/export_test.go
  modified:
    - backend/internal/server/middleware.go
    - backend/internal/server/router.go
    - backend/cmd/server/main.go
    - backend/internal/repository/repository.go
    - backend/internal/repository/sqlite/sqlite.go
    - backend/tests/internal/server/router_test.go
    - backend/tests/internal/service/event_service_test.go
decisions:
  - "NewRouter gains repo repository.EventRepository as 2nd param — export handlers need direct repo access for cursor queries and VACUUM INTO; service layer must not own storage I/O concerns"
  - "secFetchSite is per-route (not global) — only export endpoints carry sensitive data; applying globally would break legitimate browser use of other API routes"
  - "panicRecovery is outermost middleware — must wrap hostHeader+cors+logging to catch panics from those layers too"
  - "defer func() { _ = os.Remove(tmpPath) }() — explicit discard satisfies errcheck linter; temp file cleanup on all code paths including early returns"
  - "TDD RED gate bypassed: sqlite implementation was required to make Task 1 compile (Rule 3 blocking issue); tests written after implementation but before Task 2 commit"
metrics:
  duration: "10 minutes"
  completed: "2026-05-26"
  tasks_completed: 2
  files_changed: 9
---

# Phase 2 Plan 04: Panic Recovery, Sec-Fetch-Site CSRF, Export Endpoints Summary

**One-liner:** panicRecovery middleware wraps the entire router (HARD-03), per-route secFetchSite blocks browser cross-origin exfiltration (SEC-05), and two export endpoints deliver full NDJSON event dumps (DATA-04) and VACUUM INTO SQLite snapshots (DATA-05).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | panicRecovery + secFetchSite middleware, updated router | 73243cf | middleware.go, router.go, main.go, router_test.go |
| 2 | Export repository methods + ExportEvents/ExportSnapshot handlers | d9835cb | export.go, repository.go, sqlite.go, export_test.go, event_service_test.go |

## What Was Built

### Task 1 — Middleware + Router

**panicRecovery** (`middleware.go`): Outermost middleware using `defer/recover`. Logs the recovered panic value and full stack trace via `slog.Error("panic recovered", "panic", rec, "stack", debug.Stack())`. Returns `500 Internal Server Error`. Wraps the entire middleware chain so panics from hostHeader, cors, and logging are also caught.

**secFetchSite** (`middleware.go`): Per-route middleware applied only to export endpoints. Checks `r.Header.Get("Sec-Fetch-Site")` — if value is `"cross-site"`, returns 403. If header is absent (curl, wget, scripts) or has any other value, passes through. Implements D-07 and SEC-05.

**NewRouter signature** (`router.go`): Added `repo repository.EventRepository` as the second parameter. Routes `GET /api/export/events` and `GET /api/export/snapshot` are registered with `secFetchSite(...)` wrapper. Middleware chain updated to `panicRecovery(hostHeader(cors(logging(mux))))`.

**main.go**: Updated call site to `server.NewRouter(svc, repo, repo.Ready)`.

### Task 2 — Repository + Handler Implementation

**EventRepository interface** (`repository.go`): Added two methods:
- `ExportEvents(ctx context.Context, w io.Writer) error`
- `ExportSnapshot(ctx context.Context, destPath string) error`

**sqlite.DB.ExportEvents** (`sqlite.go`): Cursor-based NDJSON streaming. `QueryContext` with 44-column SELECT in `id ASC` order. Each row scanned into `domain.NormalizedEvent` and written via `json.NewEncoder(w).Encode(e)`. Never buffers all rows in memory. Returns `rows.Err()` for post-iteration error checking.

**sqlite.DB.ExportSnapshot** (`sqlite.go`): Single `ExecContext("VACUUM INTO ?", destPath)` call. Produces a clean, defragmented SQLite copy. dest path is always an OS temp file generated by `os.CreateTemp` — never user-supplied.

**handler/export.go**: Two handlers:
- `ExportEvents`: Sets `Content-Type: application/x-ndjson`, `Content-Disposition: attachment; filename="hooker-events.ndjson"`, streams via `repo.ExportEvents`. Headers-already-sent pattern: logs error only if streaming fails mid-response.
- `ExportSnapshot`: Creates temp file with `os.CreateTemp("", "hooker-snapshot-*.db")`, calls `repo.ExportSnapshot`, stats file for Content-Length, sets timestamped Content-Disposition, serves with `http.ServeFile`. Temp file cleaned up via `defer func() { _ = os.Remove(tmpPath) }()`.

**8 new tests** (`export_test.go`):
- Empty DB returns 200 with empty body
- 3 events return 3 valid NDJSON lines
- Content-Type is `application/x-ndjson`
- Snapshot returns 200 with Content-Disposition containing `hooker-snapshot-` and `.db`
- Snapshot Content-Length is a positive non-zero value
- secFetchSite returns 403 on export/events with `cross-site` header
- secFetchSite returns 403 on export/snapshot with `cross-site` header
- secFetchSite returns 200 on export/events with absent header (curl simulation)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ExportEvents/ExportSnapshot implementations required to make Task 1 compile**
- **Found during:** Task 1 verification — `go build ./...` failed because sqlite.DB does not implement EventRepository after interface extension
- **Issue:** The plan staged Task 2 implementation after Task 1 commit, but the new repository interface methods added in Task 1 (required for router.go to compile) immediately made sqlite.DB non-compliant
- **Fix:** Added sqlite implementations (`ExportEvents`, `ExportSnapshot`) and the `"io"` import to sqlite.go as part of Task 1's compile fix, then formally tested them under the Task 2 TDD gate
- **Files modified:** `backend/internal/repository/sqlite/sqlite.go`
- **Commit:** d9835cb

**2. [Rule 1 - Bug] TDD RED gate bypassed due to blocking implementation**
- **Found during:** Task 2 — implementation already existed when tests were written
- **Issue:** Export tests could not fail first (RED gate) because the implementation was already in place from the Rule 3 fix above
- **Fix:** Tests were written to verify correct behavior and all 8 pass against the implementation. TDD gate compliance documented here.
- **Commit:** d9835cb (tests + implementation in same commit)

**3. [Rule 1 - Bug] errcheck lint failure in export.go**
- **Found during:** `golangci-lint run ./...` after Task 2
- **Issue:** `defer os.Remove(tmpPath)` ignores the error return value, triggering errcheck
- **Fix:** Changed to `defer func() { _ = os.Remove(tmpPath) }()` — explicit discard satisfies errcheck while preserving the cleanup intent
- **Files modified:** `backend/internal/handler/export.go`
- **Commit:** d9835cb

## TDD Gate Compliance

**RED gate:** Not achieved independently — implementation was required before tests due to Rule 3 blocking issue (sqlite.DB must implement EventRepository or `go build ./...` fails). Tests were written after implementation.

**GREEN gate:** All 8 tests pass against the implementation (d9835cb).

**Note:** The underlying behavior specified in `<behavior>` is fully tested and verified. The deviation is procedural (ordering), not functional.

## Known Stubs

None. Both export endpoints are fully wired to the SQLite implementation. VACUUM INTO produces a real file on every call.

## Threat Surface Scan

New network endpoints introduced:

| Flag | File | Description |
|------|------|-------------|
| threat_flag: data-exfiltration-endpoint | backend/internal/handler/export.go | GET /api/export/events — streams all events as NDJSON; protected by secFetchSite |
| threat_flag: data-exfiltration-endpoint | backend/internal/handler/export.go | GET /api/export/snapshot — downloads full SQLite DB; protected by secFetchSite |

Both threats are mitigated per the plan's threat model (T-02-04-01, T-02-04-02). secFetchSite blocks cross-site browser requests. Temp file cleanup (T-02-04-03) is ensured by `defer os.Remove`. panicRecovery (T-02-04-04) is in place. VACUUM INTO dest path is always OS-generated (T-02-04-05).

## Self-Check: PASSED

- backend/internal/handler/export.go — FOUND
- backend/internal/server/middleware.go has panicRecovery — FOUND
- backend/internal/server/middleware.go has secFetchSite — FOUND
- backend/internal/repository/repository.go has ExportEvents + ExportSnapshot — FOUND
- backend/internal/repository/sqlite/sqlite.go implements ExportEvents + ExportSnapshot — FOUND
- backend/internal/server/router.go has /api/export/events and /api/export/snapshot — FOUND
- router.go middleware chain: panicRecovery(hostHeader(cors(logging(mux)))) — FOUND
- export.go has defer func() { _ = os.Remove(tmpPath) }() — FOUND
- `go build ./...` — PASSED
- `go test ./...` — PASSED (96 tests)
- `golangci-lint run ./...` — PASSED (0 issues)
- Commit 73243cf (Task 1) — FOUND
- Commit d9835cb (Task 2) — FOUND
