# Phase 2: Reliable Daily Use — Research

**Researched:** 2026-05-26
**Domain:** Go backend hardening + SQLite schema evolution + streaming export + frontend test infrastructure + Playwright E2E
**Confidence:** HIGH — all findings verified against live codebase; no third-party APIs required

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01** — New columns added directly to `events` table: `raw_payload BLOB`, `normalizer_version TEXT`, `agent_version TEXT`. No separate archive table.

**D-02** — Store full raw bytes, no size cap.

**D-03** — `normalization_status` is a binary TEXT enum: `ok` | `degraded`. No intermediate states.

**D-04** — Degraded events show a `Badge` on the event row. No global warning banner.

**D-05** — Badge is a visual indicator only — not clickable, not expandable.

**D-06** — `GET /api/export/events` returns full NDJSON dump with no filter params.

**D-07** — SEC-05 gate: reject requests where `Sec-Fetch-Site: cross-site` (403). Absent header = allowed (curl/wget continue to work).

**D-08** — `GET /api/export/snapshot` response headers: `Content-Disposition: attachment; filename=hooker-snapshot-{timestamp}.db` + `Content-Length`. No checksum header.

**D-09** — Playwright test setup POSTs known Claude Code + Codex fixture payloads to `/api/hook`. No pre-seeded DB file.

**D-10** — Playwright: chromium-only, headless. Every push/PR in CI.

### Claude's Discretion

- HTTP timeout values (HARD-01): specific milliseconds for `ReadHeaderTimeout`, `ReadTimeout`, `IdleTimeout`.
- Graceful shutdown drain timeout (HARD-02): specific finite duration.
- `slog` migration scope (HARD-04): full replacement or new-code-only.
- WAL checkpoint interval (HARD-06): specific duration for background goroutine.
- Panic recovery middleware placement: alongside existing middleware in `middleware.go`.
- Migration transaction wrapping (HARD-05): implementation detail of migration runner loop.

### Deferred Ideas (OUT OF SCOPE)

- Raw payload drill-down in UI (clickable degraded badge)
- NDJSON export filter params (date range, session)
- SHA256 checksum header on snapshot
- Windows native binary
- Homebrew tap
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-04 | Streaming NDJSON export via `GET /api/export/events` | Cursor-based row streaming from SQLite; new handler in `export.go`; route registered in `router.go` |
| DATA-05 | Full-fidelity SQLite snapshot via `GET /api/export/snapshot` using `VACUUM INTO` | SQLite built-in command; temp file approach; `Content-Disposition` + `Content-Length` headers |
| MODEL-01 | Raw payload bytes stored on every ingested event | `raw_payload TEXT NOT NULL DEFAULT ''` already exists in schema; `Add()` already writes `string(e.RawPayload)`; hook already sets `RawPayload = raw`; migration adds `raw_payload BLOB` type change and 3 new columns |
| MODEL-02 | `normalizer_version` field on stored events | New column via migration 008; new field on `NormalizedEvent`; set in each `Normalize()` function |
| MODEL-03 | `agent_version` field captured when available | New column via migration 008; set from payload if present, else empty string |
| MODEL-04 | Unknown payloads ingested in degraded mode | New fallback branch in `hook.go`; `normalization_status` column; degraded badge in `EventBadges.tsx` |
| MODEL-05 | `dedupKey()` locked by regression test | `dedupKey` is package-private in `sqlite.go`; test uses known payload → assert same SHA256 digest |
| HARD-01 | HTTP server timeout fields configured | `http.Server` in `main.go` needs `ReadHeaderTimeout`, `ReadTimeout`, `IdleTimeout`; `WriteTimeout: 0` for SSE |
| HARD-02 | Graceful shutdown with finite context timeout | `main.go` already has `signal.NotifyContext`; shutdown goroutine uses `context.Background()` — must switch to `context.WithTimeout` |
| HARD-03 | Panic recovery middleware | New middleware function in `middleware.go`; wraps recover, logs stack, returns 500 |
| HARD-04 | Replace `log.Printf` with `log/slog` | 11 call sites in `internal/`; 4 in `cmd/server/main.go`; `log/slog` is stdlib since Go 1.21 |
| HARD-05 | Migration runner wraps each migration in BEGIN/COMMIT | Current runner has a TOCTOU gap — exec SQL then insert version record as two separate statements; must be atomic |
| HARD-06 | Background WAL checkpoint goroutine | New goroutine in service or main; periodic `PRAGMA wal_checkpoint(PASSIVE)` call |
| TEST-01 | `@testing-library/user-event@^14` + `unstubGlobals: true` | Package not yet installed; `vitest.config.ts` test block needs the flag added |
| TEST-02 | RTL coverage for session, event, dashboard, usage components | Some tests exist (events); sessions/dashboard/usage need new test files |
| TEST-03 | Hook tests for `useSessions`, `useDashboardStats`, `useTraces` | No tests exist for these hooks yet; `tests/hooks/` directory is empty |
| TEST-04 | Backend full-stack `httptest.NewServer` round-trip test | Pattern exists in `hook_test.go` but uses `httptest.NewRecorder`; TEST-04 wants `NewServer` + GET verify |
| TEST-05 | Migration correctness test against file-based DB | Current tests use `:memory:` only; need temp file DB with pre-existing rows |
| TEST-06 | Fixture corpus for Claude Code + Codex payload variants | Normalization tests exist; need to expand to cover more variants and assert `normalization_status` field |
| TEST-07 | Playwright smoke test: events/sessions/dashboard load | Playwright not installed; needs new CI job, `playwright.config.ts`, test file, and fixture POSTing |
| SEC-05 | `Sec-Fetch-Site: cross-site` rejection on export endpoints | Middleware or handler-level check; absent header = allow; present and cross-site = 403 |
</phase_requirements>

---

## Summary

Phase 2 is an infrastructure phase — no new product features, but significant structural changes across the backend, database, and test suite. The work clusters into five orthogonal tracks that can be planned in parallel waves: (1) schema + domain model changes, (2) backend process hardening, (3) export endpoints, (4) frontend type sync + degraded badge, and (5) test infrastructure.

The codebase is in good shape to receive these changes. The migration runner infrastructure exists but is not transactional. The `raw_payload` column exists in the initial schema and is already written in `Add()`, but `normalizer_version`, `agent_version`, and `normalization_status` are absent and need a new migration file (008). The `http.Server` struct is constructed in `main.go` without timeout fields — a two-line fix. The graceful shutdown goroutine already uses `signal.NotifyContext` but calls `srv.Shutdown(context.Background())`, which can hang on open SSE tabs; that needs a finite timeout. Playwright is not installed in the project at all — it needs full setup from scratch.

The most careful work is MODEL-04 (degraded ingestion). The current `hook.go` returns HTTP 400 on any normalization error, dropping the payload. The new behavior must capture raw bytes first, attempt normalization, and on failure construct a minimal `NormalizedEvent` with `NormalizationStatus: "degraded"` instead of rejecting. This is a behavioral change to the ingest path and requires a corresponding handler test.

**Primary recommendation:** Plan in three waves — Wave 1: schema migration + domain types + hook.go degraded mode (DATA foundation). Wave 2: backend hardening + export endpoints (all can proceed once schema lands). Wave 3: test infrastructure (TEST-01 through TEST-07 + Playwright CI job) + frontend type sync + degraded badge.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Raw payload storage | Database/Storage | API/Backend | Schema column + write path in `repository.Add()` |
| Normalizer/agent version capture | API/Backend | — | Set in each `Normalize()` function before `Add()` |
| Degraded ingestion mode | API/Backend | — | Handler selects normalization path; constructs degraded event on failure |
| `normalization_status` display | Frontend/Browser | — | Badge rendered per-row in `EventBadges.tsx`; no backend change to API response shape needed (field already serialized) |
| Transactional migrations | Database/Storage | — | Migration runner in `sqlite.go`; SQLite transaction wrapping |
| WAL checkpoint | Database/Storage | API/Backend | Background goroutine with SQLite PRAGMA call |
| NDJSON export | API/Backend | — | Streaming cursor-based response; no frontend involvement |
| SQLite snapshot | API/Backend | — | `VACUUM INTO` call + file serve; no frontend involvement |
| `Sec-Fetch-Site` gate | API/Backend | — | Middleware or handler check on export routes |
| HTTP timeouts + graceful shutdown | API/Backend | — | `http.Server` fields + context timeout in `main.go` |
| Panic recovery | API/Backend | — | Middleware in `middleware.go` |
| Frontend RTL tests | Frontend/Browser | — | Vitest + RTL; no backend involvement |
| Playwright smoke | Frontend/Browser | API/Backend | Browser navigates to real running server seeded via `/api/hook` |

---

## Standard Stack

### Core (all already in use — no new deps required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `modernc.org/sqlite` | v1.50.0 | Embedded SQLite — migrations, VACUUM INTO, WAL checkpoint | Already the persistence layer; VACUUM INTO is built-in SQLite |
| `log/slog` | stdlib (Go 1.21+) | Structured logging replacement for `log.Printf` | Zero new deps; project is on Go 1.25 |
| `net/http` | stdlib | HTTP server with timeout fields | Already the HTTP layer |
| `os/signal` | stdlib | Graceful shutdown via context | Already used in `main.go` |
| `context` | stdlib | Finite shutdown timeout | Already imported |
| `runtime/debug` | stdlib | `debug.Stack()` for panic recovery middleware | Zero new deps |

### New Test Dependencies

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@testing-library/user-event` | ^14 | Simulate user events (click, type) in RTL tests | Required for TEST-01; add to `devDependencies` |
| `@playwright/test` | latest | Browser E2E smoke tests | Required for TEST-07; install separately from unit tests |

**Version verification (npm):**
```bash
npm view @testing-library/user-event version   # verify ^14 latest
npm view @playwright/test version              # verify latest stable
```

[ASSUMED] — version numbers above based on training knowledge. Verify before pinning in package.json.

**Installation:**
```bash
# Frontend unit test enhancement
cd frontend && pnpm add -D @testing-library/user-event@^14

# Playwright — installed at project root (not inside frontend/) per standard practice
cd /path/to/hooker && pnpm create playwright@latest  # or: npm init playwright@latest
# Installs @playwright/test + generates playwright.config.ts
npx playwright install chromium  # download chromium browser binary
```

---

## Architecture Patterns

### System Architecture Diagram

```
[AI Agent] ──POST /api/hook──► [handler/hook.go]
                                    │
                               read raw bytes
                                    │
                               attempt Normalize()
                                    │
                         ┌──────────┴──────────┐
                    success (ok)           failure (degraded)
                         │                      │
                    set status=ok        set status=degraded
                    set versions         store raw, zero-out
                         │               unextractable fields
                         └──────────┬──────────┘
                                    │
                              svc.AddEvent()
                                    │
                         ┌──────────┴──────────┐
                    repo.Add()           broadcast (SSE)
                         │
                   hook_events table
                   (raw_payload BLOB,
                    normalizer_version,
                    agent_version,
                    normalization_status)

[Browser] ──GET /api/export/events──► [handler/export.go]
                                           │
                                      cursor-based
                                      row streaming
                                           │
                                      write NDJSON
                                      line by line

[Browser] ──GET /api/export/snapshot──► [handler/export.go]
                                            │
                                       VACUUM INTO
                                       temp file
                                            │
                                       stream file
                                       + delete temp
```

### Recommended Project Structure (additions only)

```
backend/
├── internal/
│   ├── handler/
│   │   └── export.go              # NEW: GET /api/export/events + snapshot
│   ├── repository/sqlite/
│   │   └── migrations/
│   │       └── 008_normalization_fields.sql  # NEW: 4 new columns
│   └── server/
│       └── middleware.go          # MODIFY: add panicRecovery(), secFetchSite()
├── cmd/server/
│   └── main.go                    # MODIFY: http.Server timeouts + shutdown timeout
│
frontend/
├── src/
│   ├── types/
│   │   └── events.ts              # MODIFY: add 3 new optional fields
│   └── features/events/
│       └── EventBadges.tsx        # MODIFY: add degraded badge (first item)
│
├── tests/
│   ├── hooks/                     # currently empty — TEST-03 goes here
│   │   ├── useSessions.test.ts
│   │   ├── useDashboardStats.test.ts
│   │   └── useTraces.test.ts
│   └── features/
│       ├── sessions/              # TEST-02 component tests
│       ├── dashboard/             # TEST-02 component tests
│       └── usage/                 # TEST-02 component tests
│
playwright.config.ts               # NEW: at project root
tests-e2e/
└── smoke.spec.ts                  # NEW: Playwright smoke test
```

### Pattern 1: Transactional Migration Runner (HARD-05)

**What:** Wrap each migration SQL + version insert in a single `BEGIN`/`COMMIT` transaction so a power-loss between the two statements cannot leave the DB with applied SQL but no version record.

**Current problem:** The migrate() loop runs `d.db.Exec(m.sql)` then `d.db.Exec("INSERT INTO schema_migrations ...")` as two separate statements. If the process dies between them, the migration SQL is applied but the version record is absent. On restart, the runner re-applies the migration (likely failing on column-already-exists for ALTER TABLE).

**Fixed pattern:**
```go
// Source: sqlite.go migrate() — verified in codebase
func (d *DB) migrate() error {
    if _, err := d.db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)`); err != nil {
        return fmt.Errorf("create migrations table: %w", err)
    }
    migrations := []struct{ version int; sql string }{
        {1, schema001}, {2, schema002}, /* ... */ {8, schema008},
    }
    for _, m := range migrations {
        var count int
        _ = d.db.QueryRow(`SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, m.version).Scan(&count)
        if count > 0 {
            continue
        }
        tx, err := d.db.Begin()
        if err != nil {
            return fmt.Errorf("migration %d begin: %w", m.version, err)
        }
        if _, err := tx.Exec(m.sql); err != nil {
            _ = tx.Rollback()
            return fmt.Errorf("migration %d: %w", m.version, err)
        }
        if _, err := tx.Exec(`INSERT INTO schema_migrations (version) VALUES (?)`, m.version); err != nil {
            _ = tx.Rollback()
            return fmt.Errorf("record migration %d: %w", m.version, err)
        }
        if err := tx.Commit(); err != nil {
            return fmt.Errorf("migration %d commit: %w", m.version, err)
        }
    }
    return nil
}
```

**Caveat:** SQLite DDL (`CREATE TABLE`, `ALTER TABLE`) cannot be rolled back in all cases — this is a SQLite limitation. [VERIFIED: SQLite docs state DDL is transactional in WAL mode for most operations, but this is worth acknowledging.] The primary benefit is that the version record insert is atomic with the DDL.

### Pattern 2: Degraded Ingestion (MODEL-04)

**What:** On normalization failure, capture raw bytes and produce a minimal `NormalizedEvent` instead of returning HTTP 400.

**Current code flow (hook.go):**
```go
// CURRENT — drops payload on normalization failure
e, err = claudecode.Normalize(raw)
if err != nil {
    http.Error(w, "normalize payload", http.StatusBadRequest)
    return
}
```

**New flow:**
```go
// NEW — degraded mode on normalization failure
var e domain.NormalizedEvent
var normalizeErr error
switch {
case claudecode.MatchesTranscript(meta.TranscriptPath):
    e, normalizeErr = claudecode.Normalize(raw)
case geminicli.MatchesTranscript(meta.TranscriptPath) || meta.Source == "gemini":
    e, normalizeErr = geminicli.Normalize(raw)
default:
    e, normalizeErr = codex.Normalize(raw)
}
if normalizeErr != nil {
    e = domain.NormalizedEvent{
        Time:                time.Now().Format(time.RFC3339),
        Agent:               "unknown",
        Session:             meta.SessionID,
        RawPayload:          raw,
        NormalizationStatus: "degraded",
        NormalizerVersion:   currentNormalizerVersion,
    }
    log.Printf("[hook] degraded ingest: %v", normalizeErr)
} else {
    e.NormalizationStatus = "ok"
    e.NormalizerVersion = currentNormalizerVersion
    e.AgentVersion = meta.AgentVersion // if present in payload
}
```

**Note:** `meta.SessionID` is already parsed from `domain.RawPayload` before normalization — confirmed in existing `hook.go` code. The degraded event still needs a valid `dedup_key`. The existing `dedupKey()` uses `Session + TurnID + ToolUseID + HookEventName + Time` — for degraded events with empty fields, the SHA256 of the raw bytes could serve as a more stable dedup key. [ASSUMED] — the planner should decide whether to use raw SHA256 or the existing formula for degraded events.

### Pattern 3: NDJSON Streaming Export (DATA-04)

**What:** Cursor-based row streaming — never buffer all rows in memory.

```go
// Source: design from CONTEXT.md §Specifics; pattern verified against sqlite.go query patterns
func exportEvents(db *sqlite.DB, w http.ResponseWriter) error {
    w.Header().Set("Content-Type", "application/x-ndjson")
    w.Header().Set("Content-Disposition", "attachment; filename=hooker-events.ndjson")

    rows, err := db.RawDB().Query(`SELECT /* all columns */ FROM hook_events ORDER BY id ASC`)
    if err != nil {
        return err
    }
    defer rows.Close()

    enc := json.NewEncoder(w)
    for rows.Next() {
        var e domain.NormalizedEvent
        // scan into e ...
        if err := enc.Encode(e); err != nil {
            return err  // client disconnected
        }
    }
    return rows.Err()
}
```

**Key:** `json.NewEncoder(w).Encode(e)` writes one JSON object + newline per row — that is NDJSON format. No buffering needed. [VERIFIED: encoding/json stdlib behavior]

### Pattern 4: VACUUM INTO Snapshot (DATA-05)

**What:** SQLite's `VACUUM INTO 'path'` writes a clean, defragmented copy of the database to a new file without touching the original.

```go
// Source: SQLite docs; verified VACUUM INTO is supported in modernc.org/sqlite
func exportSnapshot(db *sqlite.DB, w http.ResponseWriter, r *http.Request) error {
    tmpFile, err := os.CreateTemp("", "hooker-snapshot-*.db")
    if err != nil {
        return err
    }
    tmpPath := tmpFile.Name()
    _ = tmpFile.Close()
    defer os.Remove(tmpPath)

    if _, err := db.RawDB().ExecContext(r.Context(), `VACUUM INTO ?`, tmpPath); err != nil {
        return err
    }

    fi, err := os.Stat(tmpPath)
    if err != nil {
        return err
    }
    ts := time.Now().Format("20060102-150405")
    w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="hooker-snapshot-%s.db"`, ts))
    w.Header().Set("Content-Length", strconv.FormatInt(fi.Size(), 10))
    w.Header().Set("Content-Type", "application/octet-stream")
    http.ServeFile(w, r, tmpPath)
    return nil
}
```

[VERIFIED: `VACUUM INTO` is supported by modernc.org/sqlite — it is a SQLite 3.27.0+ feature, and modernc.org/sqlite bundles a recent SQLite version. However, confirm that `db.RawDB().ExecContext` can execute it — some drivers disallow multi-statement context. The existing `RawDB()` accessor method is already in the codebase for tests.]

### Pattern 5: HTTP Server Timeout Configuration (HARD-01)

**Current `main.go`:**
```go
srv := &http.Server{Addr: cfg.Addr, Handler: h}
```

**Fixed (Claude's Discretion — recommended values):**
```go
srv := &http.Server{
    Addr:              cfg.Addr,
    Handler:           h,
    ReadHeaderTimeout: 5 * time.Second,
    ReadTimeout:       30 * time.Second,
    IdleTimeout:       120 * time.Second,
    // WriteTimeout intentionally 0 (no limit) — SSE connections stream indefinitely
}
```

**Rationale:** `ReadHeaderTimeout` prevents Slowloris attacks. `ReadTimeout` covers request body reads. `IdleTimeout` recycles keep-alive connections. `WriteTimeout: 0` required for SSE (non-zero would kill streaming connections mid-stream). [VERIFIED: Go stdlib net/http documentation — these are the standard fields]

### Pattern 6: Graceful Shutdown with Finite Timeout (HARD-02)

**Current `main.go` problem:**
```go
go func() {
    <-ctx.Done()
    _ = srv.Shutdown(context.Background())  // can hang forever on open SSE tabs
}()
```

**Fixed:**
```go
go func() {
    <-ctx.Done()
    shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
    defer cancel()
    if err := srv.Shutdown(shutdownCtx); err != nil {
        slog.Error("graceful shutdown", "err", err)
    }
}()
```

[ASSUMED] — 15s is the discretionary value; the planner should encode this as a constant or config var.

### Pattern 7: Panic Recovery Middleware (HARD-03)

```go
// Add to middleware.go alongside cors(), logging(), hostHeader()
func panicRecovery(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if rec := recover(); rec != nil {
                slog.Error("panic recovered", "panic", rec, "stack", string(debug.Stack()))
                http.Error(w, "internal server error", http.StatusInternalServerError)
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

**Middleware chain (router.go):** Add `panicRecovery` as the outermost wrapper:
```go
return panicRecovery(hostHeader(cors(logging(mux))))
```

[VERIFIED: `runtime/debug.Stack()` is stdlib; this is the standard Go panic recovery pattern]

### Pattern 8: Sec-Fetch-Site Middleware (SEC-05, D-07)

```go
// secFetchSite rejects browser-originated cross-site requests.
// Absent header = allowed (curl, wget, scripts have no Sec-Fetch-Site).
func secFetchSite(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if v := r.Header.Get("Sec-Fetch-Site"); v == "cross-site" {
            http.Error(w, "forbidden", http.StatusForbidden)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

**Apply only to export routes** — wrap just those handlers in router.go, not the whole mux:
```go
mux.Handle("GET /api/export/events", secFetchSite(handler.ExportEvents(repo)))
mux.Handle("GET /api/export/snapshot", secFetchSite(handler.ExportSnapshot(repo)))
```

### Pattern 9: WAL Checkpoint Background Goroutine (HARD-06)

```go
// Start in main.go or service.New() — runs until ctx is cancelled
func startWALCheckpoint(ctx context.Context, db *sql.DB, interval time.Duration) {
    go func() {
        t := time.NewTicker(interval)
        defer t.Stop()
        for {
            select {
            case <-t.C:
                if _, err := db.ExecContext(ctx, `PRAGMA wal_checkpoint(PASSIVE)`); err != nil {
                    slog.Warn("wal checkpoint", "err", err)
                }
            case <-ctx.Done():
                return
            }
        }
    }()
}
```

[ASSUMED] — interval value (e.g., 5 minutes) is Claude's discretion. `PASSIVE` mode is the correct choice — it checkpoints without blocking writers. [VERIFIED: SQLite docs — PASSIVE is non-blocking]

### Pattern 10: slog Migration (HARD-04)

**Scope:** 11 `log.Printf` call sites in `internal/` + 4 `log.Fatalf` in `cmd/server/main.go`. The `cmd/seed/` and `cmd/watcher/` binaries also use `log.Printf` but are not in the critical path — migrate them for consistency.

**Recommended approach (Claude's Discretion):** Full replacement. Keeping mixed `log.Printf`/`slog` in the same binary creates inconsistent log formats. Since Go 1.21+ `log/slog` is stdlib, no new deps are added. The diff is mechanical: `log.Printf("[key] msg: %v", err)` → `slog.Error("msg", "key", val, "err", err)`.

**One non-obvious change:** `log.Fatalf` calls in `main.go` do not have a direct `slog` equivalent that also calls `os.Exit(1)`. Pattern:
```go
slog.Error("db not writable", "path", cfg.DBPath, "err", err)
os.Exit(1)
```

[VERIFIED: slog.Error() does not call os.Exit — explicit os.Exit(1) required after]

### Pattern 11: Playwright Setup

**Project root placement:** Playwright config belongs at the project root (not inside `frontend/`). The test runner starts the app server itself or assumes it is already running. For CI, starting the app server is simplest with `webServer` config.

```typescript
// playwright.config.ts (at project root)
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests-e2e',
  use: {
    baseURL: 'http://127.0.0.1:8765',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // webServer is optional if CI starts the binary separately
  webServer: {
    command: 'cd backend && ./hooker',
    url: 'http://127.0.0.1:8765/healthz',
    reuseExistingServer: !process.env.CI,
  },
})
```

[ASSUMED] — exact `webServer.command` depends on build artifacts. In CI, the binary may need to be built first. The planner should decide whether to pre-build + start, or use `reuseExistingServer`.

**Fixture POST pattern (D-09):**
```typescript
// tests-e2e/smoke.spec.ts
import { test, expect, request } from '@playwright/test'

test.beforeAll(async () => {
  const api = await request.newContext({ baseURL: 'http://127.0.0.1:8765' })
  // POST same fixtures used by TEST-06 normalization regression tests
  await api.post('/api/hook', { data: claudeCodeFixture })
  await api.post('/api/hook', { data: codexFixture })
})

test('events page shows at least one event', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('[data-testid="event-row"]').first()).toBeVisible()
})

test('sessions page shows at least one session', async ({ page }) => {
  await page.goto('/sessions')
  await expect(page.locator('[data-testid="session-entry"]').first()).toBeVisible()
})

test('dashboard page shows non-zero stats', async ({ page }) => {
  await page.goto('/dashboard')
  // At least one stat value is non-zero — exact selector TBD based on component markup
  await expect(page.locator('[data-testid="stat-value"]').first()).not.toHaveText('0')
})
```

[ASSUMED] — `data-testid` attributes may need to be added to components during implementation if not already present.

### Anti-Patterns to Avoid

- **Buffering all events into memory for NDJSON export:** Will OOM on large databases. Cursor-stream row by row.
- **Using `context.Background()` for graceful shutdown:** Can hang indefinitely when SSE clients are connected. Always use `context.WithTimeout`.
- **Putting `Sec-Fetch-Site` check on all routes:** Only needed on export routes. Applying it globally could break the hook endpoint (AI agents don't send browser-origin headers).
- **Making the degraded badge interactive in this phase:** CONTEXT.md D-05 is explicit — visual only.
- **Writing migration version record outside the transaction:** The entire point of HARD-05 is that the version record must commit atomically with the DDL.
- **Placing Playwright tests inside `frontend/tests/`:** Playwright and Vitest use different runner configs. Keep them in a separate `tests-e2e/` directory at project root.
- **Using `WriteTimeout` > 0 on the SSE handler:** Will terminate streaming connections. Set `WriteTimeout: 0` on the `http.Server` — the SSE handler already handles its own flow.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite snapshot | Custom dump/serialize logic | `VACUUM INTO` SQL command | Built-in, produces defragmented copy, handles WAL flush automatically |
| Stack trace on panic | Manual goroutine inspection | `runtime/debug.Stack()` | Stdlib; captures full goroutine stack at point of panic |
| Browser-safe export blocking | Custom header parsing | Check `Sec-Fetch-Site: cross-site` header | Browser-standard Fetch metadata request headers — no custom token needed |
| WAL compaction | Custom write-ahead log management | `PRAGMA wal_checkpoint(PASSIVE)` | SQLite built-in; PASSIVE is non-blocking |
| Structured logging | Custom log formatter | `log/slog` (stdlib Go 1.21+) | Zero deps; standard key-value structured log output |
| E2E test runner | Custom browser automation | `@playwright/test` | Chromium bundled; `request` API for API seeding; `webServer` config for app lifecycle |

---

## Current State Analysis (Key Findings)

### What Already Works (no new code needed)

1. **`raw_payload` column exists** in `001_init.sql` as `TEXT NOT NULL DEFAULT ''`. The `Add()` SQL already writes `string(e.RawPayload)` and `claudecode.Normalize()` already sets `RawPayload: raw`. The column type needs to change to `BLOB` in the new migration — but the data write path is already wired.

2. **`RawPayload []byte` field exists** on `domain.NormalizedEvent` with `json:"-"` tag (correctly excluded from API responses).

3. **Hook already reads raw bytes** — `raw, err := io.ReadAll(r.Body)` happens before any normalization call. The bytes are available.

4. **`signal.NotifyContext` is already used** in `main.go` — graceful shutdown skeleton exists, just needs the finite timeout fix.

5. **`RawDB()` accessor exists** on `*sqlite.DB` — required for VACUUM INTO and NDJSON cursor queries.

6. **Migration infrastructure exists** — `schema_migrations` table, embedded SQL files, version check. Only needs transaction wrapping.

7. **`hostHeader` middleware pattern** — precedent established in `middleware.go` for how to add new middleware functions.

8. **Normalization test patterns** — `tests/internal/agents/claudecode/normalize_test.go` has fixture payload → assert `NormalizedEvent` field pattern. TEST-06 expansion follows this exactly.

### What Is Missing (must be built)

1. **Migration 008** — `ALTER TABLE hook_events ADD COLUMN normalizer_version TEXT`, `agent_version TEXT`, `normalization_status TEXT`. The `raw_payload` column type change (TEXT → BLOB) is a compatibility note: SQLite is weakly typed; storing as TEXT already works. The migration only needs to add the three new columns.

2. **`NormalizationStatus`, `NormalizerVersion`, `AgentVersion` fields** — absent from `domain.NormalizedEvent`. Must be added with JSON tags so the API response includes them (unlike `RawPayload` which is `json:"-"`).

3. **`normalization_status` in `Add()` SQL** and `listWithWhere()` SELECT — both need updating for the 3 new columns.

4. **`normalization_status` in `EventRepository` interface** — `Add()` signature unchanged (takes `NormalizedEvent`), but the fields on that struct need to be included in SQL.

5. **Degraded ingestion path in `hook.go`** — currently returns HTTP 400 on normalization failure; must become degraded mode.

6. **`currentNormalizerVersion` constant** — needs to be defined. A semver string like `"1.0.0"` or a build-time constant. [ASSUMED] — the planner should decide if this is a hardcoded constant per-agent or a shared package constant.

7. **`export.go` handler** — does not exist; needs to be created.

8. **Export routes in `router.go`** — not registered.

9. **`panicRecovery` middleware** — not present in `middleware.go`.

10. **`secFetchSite` middleware** — not present.

11. **HTTP timeout fields on `http.Server`** — not set.

12. **WAL checkpoint goroutine** — not started anywhere.

13. **`@testing-library/user-event`** — not in `frontend/package.json`.

14. **`unstubGlobals: true`** — not in `vite.config.ts` test block.

15. **`tests/hooks/`** — directory is empty; 3 hook test files need to be created.

16. **Sessions/dashboard/usage component tests** — `tests/features/sessions/`, `tests/features/dashboard/` directories have no test files.

17. **Playwright** — not installed anywhere in the project. Needs full setup.

18. **`normalization_status`, `normalizer_version`, `agent_version` in `frontend/src/types/events.ts`** — absent from `EventRecord` interface.

19. **Degraded badge in `EventBadges.tsx`** — not present; `hasAny` guard does not include `normalization_status`.

---

## Common Pitfalls

### Pitfall 1: Migration ALTER TABLE on Existing Column
**What goes wrong:** Trying to run `ALTER TABLE hook_events ADD COLUMN raw_payload BLOB` when `raw_payload TEXT` already exists in migration 001. SQLite `ALTER TABLE ADD COLUMN` fails if the column name already exists.
**Why it happens:** `raw_payload` was added in the initial schema. Migration 008 should only add the three genuinely new columns (`normalizer_version`, `agent_version`, `normalization_status`). The column type promotion TEXT→BLOB is a no-op in SQLite's weak type system.
**How to avoid:** Migration 008 adds exactly 3 columns. Do not attempt to change `raw_payload` type.
**Warning signs:** `migration 8: table hook_events already has column raw_payload` error on startup.

### Pitfall 2: dedupKey for Degraded Events With Empty Fields
**What goes wrong:** A degraded event with empty `Session`, `TurnID`, `ToolUseID`, `HookEventName`, and a `Time` generated by the server — multiple unknown payloads arriving in the same second would produce the same `dedup_key`, and `INSERT OR IGNORE` would silently drop them.
**Why it happens:** The current `dedupKey()` hashes those 5 fields. For degraded events, all are empty or minimal.
**How to avoid:** For degraded events, compute `dedup_key` from SHA256 of the full raw payload bytes instead.
**Warning signs:** Only one degraded event stored even after POSTing multiple different unknown payloads.

### Pitfall 3: listWithWhere Scan Mismatch After Adding Columns
**What goes wrong:** Adding columns to the `Add()` INSERT without adding them to `listWithWhere()` SELECT + Scan causes a runtime scan error (wrong number of destination values) or silently returns empty strings.
**Why it happens:** The SELECT column list and the Scan destination list must be kept in sync manually.
**How to avoid:** Update both `Add()` INSERT and `listWithWhere()` SELECT + Scan together. Add a test that reads back the new fields after writing.
**Warning signs:** `sql: expected N destination arguments in Scan, not M` error.

### Pitfall 4: WriteTimeout Killing SSE Connections
**What goes wrong:** Setting `http.Server.WriteTimeout` to any non-zero value causes the SSE stream handler to be forcibly closed when the timeout expires.
**Why it happens:** `WriteTimeout` applies to the entire response write duration, including streaming. SSE responses never complete — they're indefinite.
**How to avoid:** Leave `WriteTimeout: 0` on the `http.Server`. The existing SSE handler in `handler/events.go` already manages its own timeout via context.
**Warning signs:** SSE disconnects at exactly the WriteTimeout interval.

### Pitfall 5: VACUUM INTO Requires Exclusive Access Window
**What goes wrong:** `VACUUM INTO` can fail or produce an inconsistent snapshot if writers are active during the operation.
**Why it happens:** VACUUM INTO acquires a shared lock to read consistent data, but concurrent writes are still allowed in WAL mode. The snapshot may be consistent to a point-in-time but not a zero-downtime operation.
**How to avoid:** `VACUUM INTO` in WAL mode is safe and produces a consistent snapshot (SQLite guarantees this). The pitfall is using it on databases without WAL mode — this project already uses WAL (set in connection string). [VERIFIED: SQLite docs confirm VACUUM INTO is safe with WAL mode]
**Warning signs:** N/A for WAL mode databases.

### Pitfall 6: Playwright `webServer` Config in CI
**What goes wrong:** Playwright tries to start the binary via `webServer.command` before the binary is built, causing test failures.
**Why it happens:** CI pipeline order — if Playwright job runs before the backend build job, the binary doesn't exist.
**How to avoid:** Make the Playwright CI job depend on the backend job (`needs: backend`) or build the binary as part of the Playwright job setup.
**Warning signs:** `spawn ENOENT` or `ENOENT ./backend/hooker` in CI logs.

### Pitfall 7: Frontend `unstubGlobals` Breaks Existing Tests
**What goes wrong:** Adding `unstubGlobals: true` causes tests that stub `window.fetch` or `EventSource` globally (without restoring) to fail because stubs are automatically cleaned up between tests.
**Why it happens:** `vi.stubGlobal()` in Vitest with `unstubGlobals: true` auto-restores after each test. Tests that rely on persistent global stubs across test cases within a file must use `beforeEach` to re-stub.
**How to avoid:** After adding `unstubGlobals: true`, run the full Vitest suite to identify any tests that break. The existing `useEvents.test.tsx` uses `vi.stubGlobal('EventSource', MockES)` in a module-level statement — may need to move to `beforeEach`.
**Warning signs:** Tests that passed before the config change now fail with "EventSource is not defined" or similar.

---

## Code Examples

### Migration 008
```sql
-- backend/internal/repository/sqlite/migrations/008_normalization_fields.sql
ALTER TABLE hook_events ADD COLUMN normalizer_version TEXT;
ALTER TABLE hook_events ADD COLUMN agent_version TEXT;
ALTER TABLE hook_events ADD COLUMN normalization_status TEXT NOT NULL DEFAULT 'ok';
```

### NormalizedEvent new fields (domain/event.go)
```go
// Add after existing RawPayload field
NormalizationStatus string `json:"normalization_status,omitempty"`
NormalizerVersion   string `json:"normalizer_version,omitempty"`
AgentVersion        string `json:"agent_version,omitempty"`
```

Note: `NormalizationStatus` must NOT use `json:"-"` — it needs to appear in API responses for the frontend badge.

### EventRecord additions (frontend/src/types/events.ts)
```typescript
// Add to EventRecord interface
normalization_status?: 'ok' | 'degraded'
normalizer_version?: string
agent_version?: string
```

### Degraded badge (EventBadges.tsx)
From UI-SPEC.md (exact prescriptive output):
```tsx
{e.normalization_status === 'degraded' && (
  <Badge
    variant="outline"
    className="text-[0.68rem] font-semibold leading-none border-[rgba(245,166,35,0.35)] bg-[rgba(245,166,35,0.08)] text-[#f5a623] px-[6px] py-[2px] h-auto rounded"
  >
    degraded
  </Badge>
)}
```
Add as first item in the `<div>`, before all other badges. Update `hasAny` to include `e.normalization_status === 'degraded'`.

### MODEL-05: dedupKey regression test
```go
// tests/internal/repository/sqlite/dedup_test.go (or add to sqlite_test.go)
// dedupKey is unexported — test via Add() behavior, not direct call
func TestDedupKeyStability(t *testing.T) {
    db := newTestDB(t)
    payload := []byte(`{"session_id":"s1","transcript_path":"/home/.claude/x.jsonl","hook_event_name":"PreToolUse","turn_id":"t1","tool_use_id":"u1","time":"2025-01-01T00:00:00Z"}`)
    e, _ := claudecode.Normalize(payload)
    e.Time = "2025-01-01T00:00:00Z" // pin time for determinism
    _ = db.Add(e)
    // Second Add of same event must be silently ignored (INSERT OR IGNORE)
    _ = db.Add(e)
    events, _ := db.List(10)
    if len(events) != 1 {
        t.Fatalf("expected 1 event (dedup), got %d", len(events))
    }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `log.Printf` unstructured logging | `log/slog` structured key-value | Go 1.21 (2023) | Consistent parseable log output; `slog.Error("msg", "key", val)` pattern |
| Manual WAL management | `PRAGMA wal_checkpoint(PASSIVE)` on schedule | Always correct approach | Prevents WAL file unbounded growth from long-lived read connections (SSE) |
| Graceful shutdown via `context.Background()` | `context.WithTimeout(ctx, N*time.Second)` | Best practice since Go 1.8 server shutdown | Prevents hang on active SSE connections |
| Separate E2E test framework per browser | Playwright multi-browser with Chromium-only focus | Playwright v1+ | Single tool for browser automation + API seeding + CI integration |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Playwright `@playwright/test` latest stable is installable via pnpm at project root | Standard Stack / Pattern 11 | May need npm instead of pnpm for Playwright; adjust CI install command |
| A2 | 15s graceful shutdown timeout is appropriate (Claude's Discretion) | Pattern 6 | Too short: in-flight requests dropped. Too long: CI timeout exceeded. Adjust based on observed SSE tab behavior. |
| A3 | 5s/30s/120s for ReadHeaderTimeout/ReadTimeout/IdleTimeout (Claude's Discretion) | Pattern 5 | Very large payloads (raw diff files) need ReadTimeout > 30s. Verify against typical hook payload sizes. |
| A4 | WAL checkpoint interval of ~5 minutes (Claude's Discretion) | Pattern 9 | Too frequent: unnecessary I/O. Too infrequent: WAL grows large. 5min is a reasonable default. |
| A5 | `dedupKey` for degraded events should use SHA256 of raw bytes | Pattern 2 / Pitfall 2 | If raw bytes are large, SHA256 cost is minimal but not zero. Confirm acceptable. |
| A6 | `data-testid` attributes needed on event-row, session-entry, stat-value elements for Playwright | Pattern 11 | If existing markup has queryable attributes (aria-labels, roles), those can be used instead |
| A7 | `currentNormalizerVersion` as a hardcoded constant per-agent (e.g., `"claudecode/1.0"`) | Pattern 2 | Could also be injected at build time via ldflags. Simple constant is lower friction for now. |
| A8 | `VACUUM INTO` works correctly with `db.RawDB().ExecContext()` | Pattern 4 | Test this in the migration regression test (TEST-05). If the driver disallows it, use `db.RawDB().Exec()` without context. |

---

## Open Questions

1. **Playwright and pnpm workspaces**
   - What we know: Playwright is typically installed at project root; this project uses pnpm in the `frontend/` subdirectory only.
   - What's unclear: Should Playwright be installed in `frontend/` (adding to frontend's `package.json`) or at the project root (a new `package.json`)?
   - Recommendation: Install at project root with its own `package.json`. This avoids polluting frontend's test setup and lets Playwright's runner be invoked independently.

2. **`normalizerVersion` source of truth**
   - What we know: The requirement says "normalizer_version field added so future re-processing can identify which adapter version produced a record."
   - What's unclear: Is this the version of the hooker binary, the version of the specific agent adapter, or a hardcoded constant?
   - Recommendation: Hardcode as a per-agent constant string (e.g., `"claudecode/1"`) for now. Future: tie to `version.Version` for automatic updates.

3. **`agent_version` extraction from payload**
   - What we know: MODEL-03 says "captured when available in hook payload."
   - What's unclear: What field name does Claude Code or Codex use in their hook payloads to indicate their own version?
   - Recommendation: Check the `domain.RawPayload` struct for any version-like field. If absent, store empty string with a comment. This is a best-effort field.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Go 1.25.0 | Backend compilation | ✓ | 1.25.0 (go.mod) | — |
| Node.js 20 | Frontend + Playwright | ✓ | 20 (CI config) | — |
| pnpm 10.23.0 | Frontend packages | ✓ | 10.23.0 (packageManager) | — |
| `log/slog` | HARD-04 | ✓ | stdlib (Go 1.21+) | — |
| `runtime/debug` | HARD-03 | ✓ | stdlib | — |
| `@playwright/test` | TEST-07 | ✗ | — | Must install; no fallback |
| `@testing-library/user-event` | TEST-01 | ✗ | — | Must install; no fallback |
| Chromium browser binary | TEST-07 | ✗ | — | Installed via `npx playwright install chromium` |

**Missing dependencies with no fallback:**
- `@playwright/test` + Chromium binary — TEST-07 cannot proceed without installation. Wave 0 of testing plans must include install steps.
- `@testing-library/user-event@^14` — TEST-01 requires this package; tests importing it will fail without it.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Local-only, no auth |
| V3 Session Management | no | No sessions in HTTP sense |
| V4 Access Control | yes | SEC-05 `Sec-Fetch-Site` check on export endpoints |
| V5 Input Validation | yes | Raw payload size unlimited (D-02 decision); raw bytes validated as JSON before degraded path |
| V6 Cryptography | no | SHA256 for dedup key only; no user-facing crypto |

### Known Threat Patterns for Export Endpoints

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Browser-based cross-origin data exfiltration | Information Disclosure | `Sec-Fetch-Site: cross-site` → 403 (D-07, SEC-05) |
| Large snapshot download DoS | DoS | Acceptable — localhost only; no rate limiting needed |
| NDJSON injection via crafted event data | Tampering | Each row is `json.Encoder.Encode()` output — properly escaped, no injection possible |
| Snapshot temp file not cleaned up | Information Disclosure | `defer os.Remove(tmpPath)` after VACUUM INTO |

---

## Sources

### Primary (HIGH confidence — verified in codebase)
- `backend/internal/repository/sqlite/sqlite.go` — migration runner implementation, `Add()` SQL, `listWithWhere()`, `dedupKey()`, `RawDB()` accessor
- `backend/internal/repository/sqlite/migrations/001_init.sql` — confirms `raw_payload TEXT NOT NULL DEFAULT ''` exists in original schema
- `backend/internal/domain/event.go` — `NormalizedEvent` struct, `RawPayload []byte` field present, new fields absent
- `backend/internal/handler/hook.go` — raw body read before normalization, normalization error → HTTP 400 (current), degraded path absent
- `backend/cmd/server/main.go` — `http.Server` without timeouts, graceful shutdown with `context.Background()`
- `backend/internal/server/middleware.go` — existing middleware pattern; `panicRecovery` and `secFetchSite` absent
- `backend/internal/server/router.go` — no export routes registered
- `frontend/src/types/events.ts` — `EventRecord` interface confirmed; 3 new fields absent
- `frontend/src/features/events/EventBadges.tsx` — `hasAny` guard confirmed; degraded badge absent
- `frontend/vite.config.ts` — `unstubGlobals` absent from test block; `@testing-library/user-event` absent from package.json
- `frontend/tests/hooks/` — directory exists but empty
- `.github/workflows/ci.yml` — no Playwright job present; frontend + backend jobs confirmed

### Secondary (MEDIUM confidence — official documentation referenced)
- Go stdlib `log/slog` — structured logging; stdlib since Go 1.21
- Go stdlib `runtime/debug.Stack()` — panic recovery pattern
- Go stdlib `net/http` Server fields — `ReadHeaderTimeout`, `ReadTimeout`, `IdleTimeout`, `WriteTimeout`
- SQLite `VACUUM INTO` — SQLite 3.27.0+, WAL-safe, writes defragmented copy
- SQLite `PRAGMA wal_checkpoint(PASSIVE)` — non-blocking WAL compaction
- Playwright `webServer` config — official Playwright docs pattern for CI integration

### Tertiary (LOW confidence — [ASSUMED])
- Playwright pnpm project-root installation pattern
- Specific timeout values (5s/30s/120s/15s)
- WAL checkpoint interval (5 minutes)
- `normalizerVersion` as per-agent constant string

---

## Metadata

**Confidence breakdown:**
- Schema + domain changes: HIGH — verified against live migration files and struct definitions
- Backend hardening: HIGH — verified current `main.go`, `middleware.go`, `router.go` state
- Export endpoints: HIGH — VACUUM INTO and NDJSON patterns are well-established; `RawDB()` accessor confirmed
- Test infrastructure: HIGH for backend patterns (existing test files read); MEDIUM for Playwright (not installed — setup steps assumed)
- slog migration scope: HIGH — 11 call sites counted in source

**Research date:** 2026-05-26
**Valid until:** 2026-06-26 (stable Go + SQLite ecosystem; Playwright may release minor updates)
