# Architecture Research: hooker Reliability & Feature Milestone

**Researched:** 2026-05-24
**Scope:** Five architectural questions for Milestone 2 (reliability) and beyond.
**Confidence:** HIGH — grounded in actual codebase files, not hypothetical patterns.

---

## 1. Test Architecture

### What the codebase already has

Three distinct layers already exist, used inconsistently:

| Layer | Location | What it covers today |
|---|---|---|
| Unit (normalizers) | `backend/tests/internal/agents/*/` | Pure function: raw bytes in, `NormalizedEvent` out. No I/O. |
| Integration (repository) | `backend/tests/internal/repository/sqlite/` | Real `:memory:` SQLite — schema, queries, locking. |
| Integration (handlers) | `backend/tests/internal/handler/` | Real `:memory:` SQLite + real service + `httptest`. |
| Unit (service) | `backend/tests/internal/service/` | `mockRepo` struct — isolates service logic from DB. |
| Unit/integration (frontend hooks) | `frontend/tests/features/events/useEvents.test.tsx` | `renderHook` + stubbed `EventSource`/`fetch`. |
| Integration (frontend pages) | `frontend/tests/features/sessions/project-session-traces.test.tsx` | Full component tree + `MemoryRouter` + stubbed `fetch`. |

**What is missing and needed:**
- End-to-end HTTP workflow tests (POST `/api/hook` → verify via GET `/api/events`) using a real HTTP server with a temp DB — not `httptest.NewRecorder` but `httptest.NewServer`.
- Route smoke test (router returns non-500 for every registered route).
- Playwright E2E smoke (load app, verify data visible) — specified in Milestone 2.
- Coverage gates (none configured anywhere).

### Recommended layer definitions

**Layer 1 — Pure unit tests** (no I/O, no DB, no HTTP)

- Go: normalizer `Normalize()` and `ComputeUsage()` functions. Already well-covered.
- Frontend: utility functions (`date-range.test.ts`, `utils.test.ts`), filter logic. Already well-covered.
- Rule: if it takes a string and returns a struct, it lives here.

**Layer 2 — Component/hook tests** (mocked I/O boundaries)

- Go: service tests with `mockRepo`. Extend to cover SSE broadcast and `backfillSessionUsage` edge cases.
- Frontend: hooks with stubbed `fetch`/`EventSource`, components with `MemoryRouter`. Extend to cover all major hooks (`useSessions`, `useDashboardStats`, `useTraces`).
- Rule: mock at the I/O boundary (network, file system), test logic above it.

**Layer 3 — Integration tests** (real SQLite, real HTTP stack)

- Go repository tests: already present. Extend to cover migration correctness (all 7 migrations run in sequence on a temp file DB and produce correct schema).
- Go handler integration: already present via `httptest.NewRecorder`. Promote critical paths (full ingest workflow) to `httptest.NewServer` + `http.Get` to test the full stack including middleware.
- Rule: exactly one in-memory DB per test, created fresh with `sqlite.New(":memory:")`.

**Layer 4 — E2E** (real binary, real browser)

- Playwright smoke: start the Go server against a temp DB, seed via POST `/api/hook`, open browser, assert key elements visible on `/sessions` and `/dashboard`.
- Trigger: CI only, not local default. Gate releases on green.
- Scope: smoke only. Test that pages load and core data is visible, not every interaction.

### Vitest + RTL patterns for hooks and components

The codebase establishes the correct patterns. Formalize and apply them consistently:

**Hook tests (data fetching):**
```typescript
// Stub at the browser API boundary, not at the module boundary
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sessions: [] }) }))
const { result } = renderHook(() => useSessions())
await waitFor(() => expect(result.current.sessions).toEqual([]))
```

**SSE hooks:**
```typescript
// Already established in useEvents.test.tsx — use this pattern everywhere
vi.stubGlobal('EventSource', MockES)
// Trigger onmessage manually to test state updates
latestES.onmessage?.({ data: JSON.stringify(event) } as MessageEvent)
await waitFor(() => expect(result.current.events).toHaveLength(1))
```

**Component tests:**
```typescript
// Always wrap with MemoryRouter + initialEntries for route-aware components
render(
  <MemoryRouter initialEntries={['/sessions?cwd=/Users/duytran/GitHub/hooker']}>
    <Routes><Route path="/sessions" element={<SessionListPage />} /></Routes>
  </MemoryRouter>
)
// Assert via accessible queries, not implementation details
expect(await screen.findByRole('heading', { name: /hooker/i })).toBeInTheDocument()
```

**What to test at which layer — decision rule:**

- "Does my normalization produce the right fields?" → Layer 1 (agent unit test).
- "Does my hook open the right SSE URL when session param changes?" → Layer 2 (hook test with MockES).
- "Does the page render session names from the API?" → Layer 2 (component + stubbed fetch).
- "Does SQLite actually persist and retrieve events with the right dedup key?" → Layer 3 (repo test).
- "Does POST /api/hook + GET /api/events round-trip correctly?" → Layer 3 (handler integration with httptest.NewServer).
- "Does the app load in a real browser after installing from source?" → Layer 4 (Playwright smoke).

---

## 2. Go Service Hardening

### Current state

`cmd/server/main.go` already has the core graceful shutdown skeleton:
```go
ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()
srv := &http.Server{Addr: cfg.Addr, Handler: h}
go func() {
    <-ctx.Done()
    _ = srv.Shutdown(context.Background())
}()
```

Three gaps remain:

**Gap 1 — HTTP timeout configuration**

The `http.Server` is created with only `Addr` and `Handler`. No read, write, or idle timeouts. For a local tool this is low severity, but an SSE client that disconnects uncleanly can hold a goroutine open indefinitely.

Recommended values for a local monitoring server:
```go
srv := &http.Server{
    Addr:         cfg.Addr,
    Handler:      h,
    ReadTimeout:  5 * time.Second,   // time to read full request headers + body
    WriteTimeout: 0,                  // must be 0 for SSE — writer is long-lived
    IdleTimeout:  120 * time.Second, // keep-alive connection idle limit
}
```

`WriteTimeout: 0` is mandatory for SSE. Setting it to a non-zero value will kill streaming connections after the timeout, regardless of activity. Apply `ReadTimeout` only; leave `WriteTimeout` at 0 globally because the SSE handler is registered on the same mux. If a stricter write timeout is needed for non-SSE routes in future, split into a separate mux.

**Gap 2 — Shutdown drain timeout**

The current `srv.Shutdown(context.Background())` has no deadline — it will block forever if a connection never closes. SSE subscribers can be long-lived (browser tabs left open). Pattern:

```go
go func() {
    <-ctx.Done()
    shutCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    if err := srv.Shutdown(shutCtx); err != nil {
        log.Printf("[server] shutdown: %v", err)
    }
}()
```

**Gap 3 — Panic recovery middleware**

No recovery middleware exists in `backend/internal/server/middleware.go`. A panic in any handler crashes the entire process, losing all in-flight SSE connections and the DB write queue.

```go
func recovery(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if rec := recover(); rec != nil {
                log.Printf("[recovery] panic: %v\n%s", rec, debug.Stack())
                http.Error(w, "internal server error", http.StatusInternalServerError)
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

Wire it as the outermost middleware in `server.NewRouter`: `return recovery(cors(logging(mux)))`.

**Gap 4 — Graceful SSE subscriber drain**

On shutdown, SSE connections will be cut at the TCP level when `Shutdown` completes. This is acceptable for a local tool, but the `EventService.subscribers` sync.Map is never cleaned up. Subscribers whose goroutines are running `EventsStream` handler will leak until GC. Adding a `Close()` method to `EventService` that ranges over `subscribers` and calls `Unsubscribe` on each is the clean pattern — call it before `srv.Shutdown`.

### Recommended change order for service hardening

1. Add panic recovery middleware (zero risk, immediate stability win).
2. Add HTTP read timeout + idle timeout (do not add write timeout).
3. Add 10-second drain timeout to `Shutdown` call.
4. Add `EventService.Close()` and call it on shutdown signal.

---

## 3. Event/Data Model Evolution — Raw Payload Archive

### Current state

`domain.NormalizedEvent` already has `RawPayload []byte` with `json:"-"`. The field is populated in the handler (`io.ReadAll` saves `raw` but only the unmarshalled struct is passed to `AddEvent`). The `hook_events` table already has a `raw_payload TEXT NOT NULL DEFAULT ''` column in migration 001. However, the repository's `Add` method likely does not write it — this needs verification, but the schema slot exists.

The normalized struct is the archive. Raw bytes are not durably stored even though the column exists.

### Migration pattern for adding raw payload archive properly

The schema column exists. The work is at the repository layer: ensure `raw_payload` is written on every `Add` call.

**Step 1 — Wire `RawPayload` through the call chain**

In `handler/hook.go`, `raw` (the `io.ReadAll` result) is available but never assigned to `e.RawPayload`. The fix is one line before calling `svc.AddEvent(e)`:

```go
e.RawPayload = raw
```

**Step 2 — Confirm `repository.Add` writes `raw_payload`**

The SQLite `Add` implementation needs to include `raw_payload` in its INSERT. Since the column already exists with a default, this is a non-breaking addition to the INSERT statement — existing rows keep their empty default, new rows get the raw bytes stored as text (JSON string).

**Step 3 — No new migration needed**

The column exists in migration 001. No ALTER TABLE required. This is specifically why the column was included in the initial schema with `DEFAULT ''` — it was reserved for this exact use.

**For the `normalizer_version` and `agent_version` fields (Milestone 2 requirement):**

These require a new migration. Pattern is established and clean:

```sql
-- migrations/008_normalizer_version.sql
ALTER TABLE hook_events ADD COLUMN normalizer_version TEXT NOT NULL DEFAULT '';
ALTER TABLE hook_events ADD COLUMN agent_version      TEXT NOT NULL DEFAULT '';
```

The migration system in `sqlite.go` uses `schema_migrations` version tracking and runs idempotently. Adding migration 008 follows the exact same embed + struct pattern as migrations 001–007.

**Partial-ingest mode for unknown payloads:**

The hook handler currently returns 400 for normalize errors. Partial ingest means: if normalization fails on an unknown field or drifted schema, store a minimal event with the raw bytes and a warning flag rather than rejecting.

Architecture: add an `IngestWarning string` field to `NormalizedEvent` (populated during normalization on soft failures), add a corresponding column via migration, and change the handler to call a lenient normalize path that returns `(NormalizedEvent, warning, error)` — hard errors still return 400, soft mismatches return a partial event.

### Schema evolution rules (existing pattern to formalize)

- Never edit an existing migration file. The `schema_migrations` table prevents re-execution but editing an already-applied file is invisible to existing installs.
- New columns always use `NOT NULL DEFAULT ''` or `NOT NULL DEFAULT 0` so existing rows get a valid default without a full-table rewrite.
- New tables are always `CREATE TABLE IF NOT EXISTS`.
- Test migrations with `sqlite.New(filepath.Join(t.TempDir(), "test.db"))` (not `:memory:`) to exercise the migration path on a real file with sequence enforcement.

---

## 4. CI Architecture

### Current state

No `.github/workflows/` directory exists at the repo root. CI is a Milestone 1 requirement.

### Recommended structure

A monorepo with Go in `backend/` and React in `frontend/` uses path filtering so the backend job does not run on frontend-only changes and vice versa. For a solo project, keep it simple: one workflow file, two jobs, parallel execution.

**File:** `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  backend:
    name: Backend
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: backend/go.mod
          cache-dependency-path: backend/go.sum
      - name: Build
        run: go build ./...
      - name: Test
        run: go test ./...
      - name: Vet
        run: go vet ./...
      - name: Lint
        uses: golangci/golangci-lint-action@v6
        with:
          working-directory: backend

  frontend:
    name: Frontend
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.23.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml
      - name: Install
        run: pnpm install --frozen-lockfile
      - name: Typecheck
        run: pnpm typecheck
      - name: Test
        run: pnpm test -- --run
      - name: Build
        run: pnpm build
```

**Key decisions in this structure:**

- `defaults.run.working-directory` avoids prepending `cd backend &&` to every step.
- `go-version-file: backend/go.mod` reads the Go version from the module file (currently `go 1.25.0`) — no hardcoded version in the workflow.
- `pnpm/action-setup` pins to the same version as `packageManager` in `package.json` (`pnpm@10.23.0`).
- `cache: pnpm` on `setup-node` and `cache-dependency-path: frontend/pnpm-lock.yaml` gives correct pnpm store caching.
- `vitest --run` runs tests once (non-watch mode) — Vitest's default in a TTY is watch.
- Both jobs run in parallel because they have no dependency between them.
- No path filtering at the job level — for a solo project, running both jobs on every push is fine. Path filtering adds complexity with negligible benefit when CI is fast (Go compile + test under 30s, frontend typecheck + test under 20s).

**Optional: release job**

Add a `release` job that depends on both `backend` and `frontend` and runs only on version tags. It builds the static frontend, embeds it, and produces a versioned tarball. Defer this to Milestone 3 (semantic versioning).

**Playwright E2E job:**

Add as a third job that depends on both `backend` and `frontend` once Playwright is set up. It needs the Go binary built and the frontend embedded. Defer to Milestone 2 when E2E is implemented. The pattern:

```yaml
e2e:
  needs: [backend, frontend]
  steps:
    - name: Build backend with embedded frontend
      run: cd backend && go build -o hooker ./cmd/server
    - name: Start server
      run: ./backend/hooker &
    - name: Run Playwright
      run: cd frontend && pnpm exec playwright test
```

---

## 5. Export Architecture

### JSON export

The simplest and most maintainable approach: add a `GET /api/export/events` endpoint that streams all events as newline-delimited JSON (NDJSON), with optional `since`/`until` query params.

**Why NDJSON over a JSON array:**

A JSON array requires buffering all rows before writing the opening `[` can be closed. NDJSON writes each row immediately, keeping memory usage proportional to one row rather than the full history. For a local tool with "years of history," this matters.

**Handler pattern:**

```go
func ExportEvents(svc *service.EventService) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        since := r.URL.Query().Get("since")
        until := r.URL.Query().Get("until")

        w.Header().Set("Content-Type", "application/x-ndjson")
        w.Header().Set("Content-Disposition", `attachment; filename="hooker-events.ndjson"`)

        enc := json.NewEncoder(w)
        if err := svc.StreamEvents(since, until, func(e domain.NormalizedEvent) error {
            return enc.Encode(e)
        }); err != nil {
            // Can't change status after first write; log only
            log.Printf("[export] stream: %v", err)
        }
    })
}
```

This requires adding `StreamEvents(since, until string, fn func(NormalizedEvent) error) error` to `EventRepository` — a cursor-based query that calls `fn` for each row rather than building a slice. This is the correct pattern for potentially large exports.

**Service method:** delegate directly to the repository cursor. No business logic needed for export.

### SQLite snapshot export

A SQLite snapshot is a file-level copy, not a query result. The correct Go API is `VACUUM INTO`:

```go
func ExportSnapshot(dbPath string) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        tmp, err := os.CreateTemp("", "hooker-snapshot-*.db")
        if err != nil {
            http.Error(w, "create temp", http.StatusInternalServerError)
            return
        }
        defer os.Remove(tmp.Name())
        defer tmp.Close()

        // VACUUM INTO produces a clean, compacted copy without locking the source DB
        if _, err := db.ExecContext(r.Context(),
            "VACUUM INTO ?", tmp.Name()); err != nil {
            http.Error(w, "snapshot", http.StatusInternalServerError)
            return
        }

        w.Header().Set("Content-Type", "application/octet-stream")
        w.Header().Set("Content-Disposition",
            fmt.Sprintf(`attachment; filename="hooker-%s.db"`,
                time.Now().Format("20060102-150405")))

        http.ServeContent(w, r, tmp.Name(), time.Now(), tmp)
    })
}
```

**Why `VACUUM INTO` over `io.Copy(dst, src)` on the DB file:**

- `VACUUM INTO` is atomic with respect to WAL mode — it sees a consistent snapshot and compacts free pages.
- Direct file copy can produce a corrupt snapshot if the WAL file has unflushed pages.
- `VACUUM INTO` requires SQLite 3.27.0+ (2019) — `modernc.org/sqlite` bundles SQLite 3.50.x as of 2026, so this is safe.

**Handler wiring:** expose both as `/api/export/events` (NDJSON) and `/api/export/snapshot` (SQLite file). Both are GET with optional query params. Both are authenticated-origin-only — they return the full data store, so they should not be served when the server is bound to a non-loopback address (Milestone 3 concern).

**Access to `dbPath` in handler:** the snapshot handler needs the DB file path, not just the `*sql.DB` handle (for `VACUUM INTO` the destination path). Thread `cfg.DBPath` through to the handler or expose it via `sqlite.DB`. The cleanest approach: add a `SnapshotTo(destPath string) error` method to `sqlite.DB` that runs `VACUUM INTO`, and wire `cfg.DBPath` through the service or directly in the router.

---

## Component Boundaries Summary

```
cmd/server/main.go
  ├── config.Load()          (reads env, no side effects)
  ├── sqlite.New(dbPath)     (opens DB, runs migrations)
  ├── service.New(repo)      (wraps repo, owns subscribers)
  ├── server.NewRouter(svc)  (maps routes, applies middleware)
  └── http.Server{...}       (owns HTTP lifecycle)

handler layer (per-route, depends on *service.EventService)
  hook.go         POST /api/hook      — normalize + enrich + AddEvent
  events.go       GET  /api/events    — ListEvents
                  GET  /api/events/stream — SSE fanout
  sessions.go     GET  /api/sessions  — list + usage backfill
  sessions_tree.go GET  /api/sessions/tree
  traces.go       GET  /api/traces
  dashboard.go    GET  /api/dashboard/stats
  version.go      GET  /api/version
  (+ export.go when added)

service layer (EventService — known over-concentration)
  AddEvent        persist + usage + broadcast
  ListSessions    list + backfillSessionUsage (reads transcript files)
  GetDashboardStats  list + backfill + SQL aggregate + enrichDashboardStats
  Subscribe/Unsubscribe/broadcast  SSE fan-out registry

repository layer (EventRepository interface → sqlite.DB)
  Add, List, ListBySession
  UpsertSession, ListSessions, GetSessionTree
  GetDashboardStats (SQL aggregate)
  GetFileChanges, GetSessionFileChangeCounts
  (+ StreamEvents for export when added)
```

**Dependency direction is clean.** No circular imports detected. Handler → Service → Repository → Domain. Keep it this way.

**Known over-concentration (from ARCHITECTURE.md, confirmed):** `EventService` owns ingestion, usage backfill (which reads transcript files from disk on every `ListSessions` call), SSE fanout, and dashboard enrichment. The backfill path is the most dangerous: it touches the filesystem on every sessions list and dashboard stats request. This is not a blocking concern for Milestone 2 but is the top candidate for isolation in Milestone 3.

---

## Suggested Build Order

Based on dependencies and risk, the architectural changes should be sequenced:

**Phase 1 — Foundation (do first, unblock everything else)**
1. CI workflow (`.github/workflows/ci.yml`) — enables all subsequent changes to be gated
2. HTTP server hardening (panic recovery, timeouts, shutdown drain) — pure additions, zero breaking changes, touches only `main.go` and `middleware.go`

**Phase 2 — Test infrastructure (do second, validate Phase 1 changes)**
3. Formalize test layer contract: add `httptest.NewServer` end-to-end handler test covering the full POST → GET round-trip
4. Add migration correctness test: all 7 migrations run on a temp file DB
5. Frontend hook test coverage: ensure all major hooks (`useSessions`, `useDashboardStats`, `useTraces`) have stub-boundary tests

**Phase 3 — Data model evolution (do third, requires test coverage from Phase 2)**
6. Wire `RawPayload` through to the repository `Add` call (column exists, zero migration cost)
7. Add migration 008 for `normalizer_version` + `agent_version` columns
8. Implement partial-ingest mode (soft normalization failure → stored with warning)

**Phase 4 — Export (do last, depends on repository interface being stable)**
9. Add `StreamEvents` cursor method to `EventRepository`
10. Implement NDJSON export handler
11. Implement SQLite snapshot handler via `VACUUM INTO`

This ordering respects the dependency graph: CI enables safe iteration, hardening reduces crash risk before adding complexity, test infrastructure validates the data model changes, export is additive with no impact on the critical ingestion path.

---

## Open Questions / Gaps

- **`RawPayload` write gap confirmation:** The `repository.Add` SQL INSERT needs to be read to confirm whether `raw_payload` column is actually being written. The domain struct has the field, the schema has the column, but the handler does not assign `e.RawPayload = raw` before calling `AddEvent`. This is almost certainly a gap — confirm by reading `sqlite.go`'s `Add` implementation before implementing the raw payload work.
- **Playwright setup:** No Playwright dependency exists in `package.json`. Installing it adds ~100 MB of browser binaries. For solo use, a decision is needed on whether to commit those binaries or use `--browser chromium` with CI-only installation. Standard pattern: add `@playwright/test` as a dev dependency, use `pnpm exec playwright install --with-deps chromium` in CI only.
- **`VACUUM INTO` destination management:** The temp file approach works but requires the Go process to have write access to the OS temp directory and enough disk space for a second copy of the DB. For a large DB, streaming the VACUUM output directly to the response is preferable but requires SQLite's backup API, not `VACUUM INTO`. At local scale (years of monitoring = tens of MB), temp file is fine.
- **Export access control:** NDJSON and snapshot exports expose all stored data including prompts, diffs, and file paths. They should emit a `Sec-Fetch-Site` check or be blocked by the CORS middleware when origin is non-loopback. This is a Milestone 3 security concern but should be noted when implementing the export endpoints.
