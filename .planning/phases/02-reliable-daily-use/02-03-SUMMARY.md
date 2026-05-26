---
phase: 02-reliable-daily-use
plan: "03"
subsystem: backend/hardening
tags: [http-timeouts, graceful-shutdown, slog, wal-checkpoint, slowloris, security]
dependency_graph:
  requires: []
  provides:
    - http-server-timeouts
    - finite-graceful-shutdown
    - slog-structured-logging
    - wal-checkpoint-goroutine
  affects:
    - backend/cmd/server/main.go
    - backend/internal/server/middleware.go
    - backend/internal/repository/sqlite/sqlite.go
    - backend/internal/service/event_service.go
tech_stack:
  added: []
  patterns:
    - log/slog structured key-value logging throughout backend
    - startWALCheckpoint goroutine — ticker-based PASSIVE checkpoint every 5 minutes
    - context.WithTimeout for finite graceful shutdown (15s)
key_files:
  created: []
  modified:
    - backend/cmd/server/main.go
    - backend/internal/server/middleware.go
    - backend/internal/repository/sqlite/sqlite.go
    - backend/internal/service/event_service.go
decisions:
  - HTTP timeout values: ReadHeaderTimeout=5s (Slowloris protection), ReadTimeout=30s, IdleTimeout=120s, WriteTimeout=0 (SSE streams)
  - Graceful shutdown drain timeout: 15s finite context.WithTimeout
  - slog migration scope: full replacement of all log.Printf/log.Fatalf in the four modified files
  - WAL checkpoint interval: 5 minutes PASSIVE mode (non-blocking, safe for concurrent SSE reads)
  - startWALCheckpoint uses context.Background() because New() does not receive a context — goroutine exits with process
metrics:
  duration: 3min
  completed_date: 2026-05-26
  tasks_completed: 3
  files_modified: 4
---

# Phase 2 Plan 3: HTTP Timeouts, Graceful Shutdown, slog Migration, WAL Checkpoint Summary

**One-liner:** HTTP server hardened with Slowloris-blocking timeouts, finite 15s graceful shutdown, full log/slog migration across four backend files, and a 5-minute WAL checkpoint goroutine.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | HTTP timeouts + graceful shutdown + slog in main.go | 4b4d773 | backend/cmd/server/main.go |
| 2 | slog in middleware.go + WAL checkpoint in sqlite.go | 66cd304 | backend/internal/server/middleware.go, backend/internal/repository/sqlite/sqlite.go |
| 3 | slog sweep of service/event_service.go | 03141a2 | backend/internal/service/event_service.go |

## What Was Done

### Task 1 — main.go

- Replaced `http.Server{Addr: ..., Handler: ...}` with explicit timeout fields: `ReadHeaderTimeout: 5s`, `ReadTimeout: 30s`, `IdleTimeout: 120s`. `WriteTimeout` intentionally omitted — SSE connections stream without a write deadline.
- Replaced `_ = srv.Shutdown(context.Background())` with a `context.WithTimeout(context.Background(), 15*time.Second)` shutdown context — process now terminates within 15s even with active SSE clients.
- Replaced all `log.Fatalf` / `log.Printf` calls with `slog.Error` / `slog.Info` equivalents. Each `slog.Error` that replaced a `log.Fatalf` is followed by explicit `os.Exit(1)` (slog does not exit).
- Removed `"log"` import; added `"log/slog"` and `"time"`.

### Task 2 — middleware.go + sqlite.go

- `middleware.go`: replaced `"log"` import with `"log/slog"`; replaced `log.Printf("%s %s %s", ...)` with `slog.Info("request", "method", ..., "path", ..., "duration", ...)`.
- `sqlite.go`: replaced `"log"` import with `"log/slog"`; replaced 6 `log.Printf("dashboard: ... query: %v", err)` calls in `GetDashboardStats` with `slog.Warn("dashboard: ...", "err", err)`.
- Added `startWALCheckpoint(ctx context.Context, db *sql.DB, interval time.Duration)` function — runs `PRAGMA wal_checkpoint(PASSIVE)` on a ticker. PASSIVE mode never blocks writers.
- Called `startWALCheckpoint(context.Background(), db, 5*time.Minute)` in `New()` after `d.ready.Store(true)`.

### Task 3 — event_service.go

- Replaced `"log"` import with `"log/slog"`.
- Replaced `log.Printf("[service] GetSessionFileChangeCounts: %v", countErr)` with `slog.Warn("GetSessionFileChangeCounts", "err", countErr)`.

## Verification

```
go build ./...         — OK (0 errors)
go test ./...          — OK (82 passed, 25 packages)
golangci-lint run ./.. — OK (0 issues)
grep '"log"' ...       — 0 matches in all 4 modified files
grep ReadHeaderTimeout  — found in cmd/server/main.go
grep WithTimeout        — found in cmd/server/main.go (shutdown goroutine)
grep wal_checkpoint     — found in sqlite.go (function + call site)
grep slog               — found in event_service.go (import + warn call)
```

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All changes are internal behavioral improvements (timeouts, logging, background goroutine).

The three threats from the plan's threat model are now mitigated:
- T-02-03-01 (Slowloris): `ReadHeaderTimeout: 5s` is set.
- T-02-03-02 (infinite shutdown): `context.WithTimeout(15s)` replaces `context.Background()`.
- T-02-03-03 (WAL growth): `startWALCheckpoint` runs every 5 minutes.

## Self-Check: PASSED

- backend/cmd/server/main.go — FOUND
- backend/internal/server/middleware.go — FOUND
- backend/internal/repository/sqlite/sqlite.go — FOUND
- backend/internal/service/event_service.go — FOUND
- Commit 4b4d773 — FOUND
- Commit 66cd304 — FOUND
- Commit 03141a2 — FOUND
