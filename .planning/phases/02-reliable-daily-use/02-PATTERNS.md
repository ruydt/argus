# Phase 2: Reliable Daily Use - Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 19 new/modified files
**Analogs found:** 17 / 19

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/internal/repository/sqlite/migrations/008_normalization_fields.sql` | migration | batch | `migrations/007_session_ended_at.sql` | exact |
| `backend/internal/domain/event.go` | model | — | self (modify) | self |
| `backend/internal/repository/sqlite/sqlite.go` (migrate, Add, listWithWhere) | repository | CRUD | self (modify) | self |
| `backend/internal/repository/repository.go` | model | — | self (modify) | self |
| `backend/internal/handler/hook.go` (degraded mode) | handler | request-response | self (modify) | self |
| `backend/internal/handler/export.go` | handler | streaming + file-I/O | `backend/internal/handler/events.go` | role-match |
| `backend/internal/server/middleware.go` (panicRecovery, secFetchSite) | middleware | request-response | self (modify — existing cors/hostHeader pattern) | self |
| `backend/internal/server/router.go` (export routes) | config | — | self (modify) | self |
| `backend/cmd/server/main.go` (timeouts, graceful shutdown, slog, WAL) | config | — | self (modify) | self |
| `frontend/src/types/events.ts` (3 new fields) | model | — | self (modify) | self |
| `frontend/src/features/events/EventBadges.tsx` (degraded badge) | component | — | self (modify — existing Badge pattern) | self |
| `backend/tests/internal/repository/sqlite/migration_test.go` | test | CRUD | `sqlite_test.go` | exact |
| `backend/tests/internal/repository/sqlite/dedup_test.go` | test | CRUD | `sqlite_test.go` | exact |
| `backend/tests/internal/handler/export_test.go` | test | request-response | `hook_test.go` | exact |
| `backend/tests/internal/agents/claudecode/normalize_test.go` (expand) | test | transform | self (modify) | self |
| `frontend/tests/hooks/useSessions.test.ts` | test | request-response | `tests/features/events/useEvents.test.tsx` | role-match |
| `frontend/tests/hooks/useDashboardStats.test.ts` | test | request-response | `tests/features/events/useEvents.test.tsx` | role-match |
| `playwright.config.ts` | config | — | — | no analog |
| `tests-e2e/smoke.spec.ts` | test | request-response | — | no analog |

---

## Pattern Assignments

### `backend/internal/repository/sqlite/migrations/008_normalization_fields.sql` (migration, batch)

**Analog:** `backend/internal/repository/sqlite/migrations/007_session_ended_at.sql`

**Core migration pattern** (full file):
```sql
ALTER TABLE sessions ADD COLUMN ended_at TEXT;
```

**Apply as** (3 new columns only — do NOT add `raw_payload` which already exists from 001):
```sql
ALTER TABLE hook_events ADD COLUMN normalizer_version TEXT;
ALTER TABLE hook_events ADD COLUMN agent_version TEXT;
ALTER TABLE hook_events ADD COLUMN normalization_status TEXT NOT NULL DEFAULT 'ok';
```

**Key constraint:** `normalization_status` gets `NOT NULL DEFAULT 'ok'` so existing rows get a valid status without a data migration. `normalizer_version` and `agent_version` are nullable TEXT (no DEFAULT needed — they will be empty for historic rows).

---

### `backend/internal/repository/sqlite/sqlite.go` — migrate() (HARD-05)

**Analog:** existing `migrate()` at lines 82–112 — current non-transactional pattern to replace.

**Current non-transactional pattern** (lines 98–111):
```go
if _, err := d.db.Exec(m.sql); err != nil {
    return fmt.Errorf("migration %d: %w", m.version, err)
}
if _, err := d.db.Exec(`INSERT INTO schema_migrations (version) VALUES (?)`, m.version); err != nil {
    return fmt.Errorf("record migration %d: %w", m.version, err)
}
```

**Replacement — transactional pattern:**
```go
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
```

Also add `{8, schema008}` entry to the migrations slice (lines 89–97) and add the `//go:embed` directive following the pattern at lines 23–40.

---

### `backend/internal/repository/sqlite/sqlite.go` — Add() + listWithWhere() (MODEL-01–04)

**Analog:** existing `Add()` at lines 114–147, `listWithWhere()` at lines 157–226. Both must be updated together (Pitfall 3: scan mismatch if only one is changed).

**Add() column list extension** — append to INSERT column list (after `trigger`):
```go
// Add to INSERT column list (after trigger):
normalizer_version, agent_version, normalization_status
// Add to VALUES placeholders: three more ?
// Add to args: e.NormalizerVersion, e.AgentVersion, e.NormalizationStatus
```

**listWithWhere() SELECT extension** — append to SELECT list (after `trigger`):
```go
COALESCE(normalizer_version,''), COALESCE(agent_version,''), COALESCE(normalization_status,'ok')
```

**listWithWhere() Scan extension** — append to rows.Scan call (after `&e.Trigger`):
```go
&e.NormalizerVersion, &e.AgentVersion, &e.NormalizationStatus,
```

**Existing nullStr helper pattern** (used throughout Add()):
```go
// nullStr already defined in this file — follow same pattern
nullStr(e.NormalizerVersion), nullStr(e.AgentVersion), nullStr(e.NormalizationStatus)
```

---

### `backend/internal/domain/event.go` (MODEL-01–04)

**Analog:** existing `NormalizedEvent` struct at lines 5–50. Follow same JSON tag style.

**Existing field pattern** (lines 26–27 — note `RawPayload` uses `json:"-"` to suppress API output):
```go
Agent      string `json:"agent,omitempty"`
RawPayload []byte `json:"-"`
```

**New fields to add** after `RawPayload` line 27:
```go
NormalizationStatus string `json:"normalization_status,omitempty"`
NormalizerVersion   string `json:"normalizer_version,omitempty"`
AgentVersion        string `json:"agent_version,omitempty"`
```

**Critical:** These three fields must NOT use `json:"-"` — they must appear in API responses for the frontend badge. Only `RawPayload` is suppressed.

---

### `backend/internal/handler/hook.go` — degraded mode (MODEL-04)

**Analog:** self — existing normalization switch at lines 37–49 is the pattern to replace.

**Current drop-on-error pattern** (lines 37–49):
```go
var e domain.NormalizedEvent
switch {
case claudecode.MatchesTranscript(meta.TranscriptPath):
    e, err = claudecode.Normalize(raw)
case geminicli.MatchesTranscript(meta.TranscriptPath) || meta.Source == "gemini":
    e, err = geminicli.Normalize(raw)
default:
    e, err = codex.Normalize(raw)
}
if err != nil {
    http.Error(w, "normalize payload", http.StatusBadRequest)
    return
}
```

**Replacement — degraded ingestion pattern:**
```go
const currentNormalizerVersion = "1.0"  // define as package-level const

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
    // Dedup degraded events by SHA256 of raw bytes — empty fields would
    // produce collisions with the standard dedupKey formula.
    h := sha256.Sum256(raw)
    e = domain.NormalizedEvent{
        Time:                time.Now().UTC().Format(time.RFC3339),
        Agent:               "unknown",
        Session:             meta.SessionID,
        RawPayload:          raw,
        NormalizationStatus: "degraded",
        NormalizerVersion:   currentNormalizerVersion,
        // TurnID set to hex of SHA256 so dedupKey produces a unique stable key
        TurnID: fmt.Sprintf("%x", h[:8]),
    }
    log.Printf("[hook] degraded ingest session=%s err=%v", meta.SessionID, normalizeErr)
} else {
    e.NormalizationStatus = "ok"
    e.NormalizerVersion = currentNormalizerVersion
}
```

**Imports to add:** `"crypto/sha256"`, `"fmt"`, `"time"` (verify which are already present).

**Error logging pattern** — follows existing line 66:
```go
log.Printf("[hook] agent=%s session=%s tool=%s action=%s path=%s", e.Agent, e.Session, e.Tool, e.Action, e.Path)
```

---

### `backend/internal/handler/export.go` (handler, streaming + file-I/O)

**Analog:** `backend/internal/handler/events.go` — handler constructor pattern, JSON encoding, error handling.

**Handler constructor pattern** (events.go lines 17–29):
```go
func Events(svc *service.EventService) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // ... query param extraction ...
        events, err := listEvents(svc, sessionID)
        if err != nil {
            http.Error(w, "list events", http.StatusInternalServerError)
            return
        }
        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(map[string]any{"events": events})
    })
}
```

**Export handler uses repository directly** — the service does not own export logic. Pass `repo repository.EventRepository` (which exposes `RawDB()`). The handler signature follows the same constructor-returns-http.Handler pattern:

```go
package handler

import (
    "encoding/json"
    "fmt"
    "net/http"
    "os"
    "strconv"
    "time"

    "hooker/internal/domain"
    "hooker/internal/repository/sqlite"
)

func ExportEvents(db *sqlite.DB) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/x-ndjson")
        w.Header().Set("Content-Disposition", `attachment; filename="hooker-events.ndjson"`)

        rows, err := db.RawDB().QueryContext(r.Context(), `SELECT /* all columns */ FROM hook_events ORDER BY id ASC`)
        if err != nil {
            http.Error(w, "query events", http.StatusInternalServerError)
            return
        }
        defer rows.Close()

        enc := json.NewEncoder(w)
        for rows.Next() {
            var e domain.NormalizedEvent
            // scan all columns into e ...
            if err := enc.Encode(e); err != nil {
                return // client disconnected
            }
        }
    })
}

func ExportSnapshot(db *sqlite.DB) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        tmp, err := os.CreateTemp("", "hooker-snapshot-*.db")
        if err != nil {
            http.Error(w, "create temp file", http.StatusInternalServerError)
            return
        }
        tmpPath := tmp.Name()
        _ = tmp.Close()
        defer os.Remove(tmpPath)

        if _, err := db.RawDB().ExecContext(r.Context(), `VACUUM INTO ?`, tmpPath); err != nil {
            http.Error(w, "vacuum", http.StatusInternalServerError)
            return
        }

        fi, err := os.Stat(tmpPath)
        if err != nil {
            http.Error(w, "stat snapshot", http.StatusInternalServerError)
            return
        }
        ts := time.Now().Format("20060102-150405")
        w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="hooker-snapshot-%s.db"`, ts))
        w.Header().Set("Content-Length", strconv.FormatInt(fi.Size(), 10))
        w.Header().Set("Content-Type", "application/octet-stream")
        http.ServeFile(w, r, tmpPath)
    })
}
```

**Error handling pattern** — copy from events.go: `http.Error(w, "message", statusCode); return`.

---

### `backend/internal/server/middleware.go` — panicRecovery + secFetchSite (HARD-03, SEC-05)

**Analog:** existing `hostHeader()` at lines 32–51 — same middleware function shape, same header inspection pattern.

**Existing middleware shape** (lines 34–51):
```go
func hostHeader(next http.Handler) http.Handler {
    allowed := map[string]bool{ ... }
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        host := r.Host
        if h, _, err := net.SplitHostPort(host); err == nil {
            host = h
        }
        if !allowed[host] {
            http.Error(w, "forbidden", http.StatusForbidden)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

**New panicRecovery** — follows same `func name(next http.Handler) http.Handler` signature:
```go
func panicRecovery(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if rec := recover(); rec != nil {
                log.Printf("[panic] recovered: %v\n%s", rec, debug.Stack())
                http.Error(w, "internal server error", http.StatusInternalServerError)
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

**New secFetchSite** — follows same shape as cors() (lines 18–29):
```go
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

**Imports to add:** `"runtime/debug"` for `debug.Stack()`.

**Note on slog (HARD-04):** These new middleware functions use `log.Printf` to match the current codebase. The slog migration (HARD-04) is a separate sweep across all files — do not mix slog into only some new functions while others still use log.Printf. Do the full sweep as one atomic change.

---

### `backend/internal/server/router.go` — export routes (DATA-04, DATA-05)

**Analog:** existing route registrations at lines 14–29.

**Existing route pattern** (lines 14–29):
```go
mux.Handle("GET /healthz", handler.Healthz())
mux.Handle("POST /api/hook", handler.Hook(svc))
// ...
return hostHeader(cors(logging(mux)))
```

**New export routes** — `secFetchSite` wraps only these two handlers, not the whole mux:
```go
mux.Handle("GET /api/export/events",   secFetchSite(handler.ExportEvents(repo)))
mux.Handle("GET /api/export/snapshot", secFetchSite(handler.ExportSnapshot(repo)))
```

**Middleware chain update** — add `panicRecovery` as outermost:
```go
return panicRecovery(hostHeader(cors(logging(mux))))
```

**Router signature change:** `NewRouter` currently takes `svc *service.EventService`. It needs `repo *sqlite.DB` added (or the `sqlite.DB` accessible via service) so export handlers can call `RawDB()`. Pass both: `NewRouter(svc *service.EventService, repo *sqlite.DB, ready func() bool)`.

---

### `backend/cmd/server/main.go` — timeouts + shutdown + WAL (HARD-01, HARD-02, HARD-06)

**Analog:** self — existing `http.Server` construction at line 54 and shutdown goroutine at lines 55–58.

**Current pattern** (lines 52–58):
```go
ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)

srv := &http.Server{Addr: cfg.Addr, Handler: h}
go func() {
    <-ctx.Done()
    _ = srv.Shutdown(context.Background())
}()
```

**Replacement — with timeouts + finite shutdown:**
```go
const (
    httpReadHeaderTimeout = 5 * time.Second
    httpReadTimeout       = 30 * time.Second
    httpIdleTimeout       = 120 * time.Second
    shutdownTimeout       = 15 * time.Second
    walCheckpointInterval = 5 * time.Minute
)

ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()

srv := &http.Server{
    Addr:              cfg.Addr,
    Handler:           h,
    ReadHeaderTimeout: httpReadHeaderTimeout,
    ReadTimeout:       httpReadTimeout,
    IdleTimeout:       httpIdleTimeout,
    // WriteTimeout: 0 — intentionally unset; SSE streams are indefinite
}

go func() {
    <-ctx.Done()
    shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
    defer cancel()
    if err := srv.Shutdown(shutdownCtx); err != nil {
        log.Printf("[server] shutdown: %v", err)
    }
}()

// WAL checkpoint background goroutine — prevents unbounded WAL growth from
// long-lived SSE read connections.
go func() {
    t := time.NewTicker(walCheckpointInterval)
    defer t.Stop()
    for {
        select {
        case <-t.C:
            if _, err := repo.RawDB().ExecContext(ctx, `PRAGMA wal_checkpoint(PASSIVE)`); err != nil {
                log.Printf("[wal] checkpoint: %v", err)
            }
        case <-ctx.Done():
            return
        }
    }
}()
```

**slog migration pattern** (HARD-04) — replace all `log.Printf`/`log.Fatalf` in this file:
```go
// Before:
log.Fatalf("db not writable at %s: check path exists and permissions — %v", cfg.DBPath, err)

// After:
slog.Error("db not writable", "path", cfg.DBPath, "err", err)
os.Exit(1)
```

Note: `slog.Error` does not call `os.Exit` — explicit `os.Exit(1)` required after each fatal log. `log.Printf` info lines become `slog.Info(...)`.

---

### `frontend/src/types/events.ts` (MODEL-01–04 frontend sync)

**Analog:** self — existing `EventRecord` interface at lines 8–51. Follow same optional field pattern.

**Existing field pattern** (lines 28–50 — optional fields with `?`):
```go
permission_mode?: string
response?: string
```

**New fields to add** after existing `agent?` field (line 50), before closing `}`:
```typescript
normalization_status?: 'ok' | 'degraded'
normalizer_version?: string
agent_version?: string
```

**Constraint:** Use a string union type (`'ok' | 'degraded'`) not plain `string` for `normalization_status` — enables TypeScript exhaustiveness checking in the badge render.

---

### `frontend/src/features/events/EventBadges.tsx` — degraded badge (D-04)

**Analog:** self — existing badge pattern at lines 27–33. Copy exact className pattern.

**Existing badge shape** (lines 27–33):
```tsx
{e.tool && (
  <Badge
    variant="outline"
    className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
  >
    <strong className="text-[#aaa] font-semibold mr-1">Tool:</strong> {e.tool}
  </Badge>
)}
```

**hasAny guard update** (lines 10–20) — add `normalization_status` check:
```tsx
const hasAny =
  e.normalization_status === 'degraded' ||   // ADD as first condition
  e.tool ||
  e.source ||
  // ... rest unchanged
```

**Degraded badge** — insert as first child in the `<div>` (before `{e.tool && ...}`), using amber/warning color per UI-SPEC:
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

Note: no `<strong>` label prefix inside the degraded badge — the word "degraded" is the full content.

---

### `backend/tests/internal/repository/sqlite/migration_test.go` (TEST-05)

**Analog:** `backend/tests/internal/repository/sqlite/sqlite_test.go` — `newTestDB` helper + file-based DB pattern at lines 13–20 and 60–80.

**newTestDB helper** (lines 13–20):
```go
func newTestDB(t *testing.T) *sqlite.DB {
    t.Helper()
    db, err := sqlite.New(":memory:")
    if err != nil {
        t.Fatalf("sqlite.New: %v", err)
    }
    return db
}
```

**File-based DB pattern** (lines 60–65):
```go
dbPath := filepath.Join(t.TempDir(), "hooker-test.db")
db, err := sqlite.New(dbPath)
if err != nil {
    t.Fatalf("sqlite.New: %v", err)
}
```

**Migration test structure:**
```go
package sqlite_test

func TestMigration008AddsColumns(t *testing.T) {
    // Use file-based DB (not :memory:) to test migration from prior state
    dbPath := filepath.Join(t.TempDir(), "hooker-migration-test.db")
    db, err := sqlite.New(dbPath)
    if err != nil {
        t.Fatalf("sqlite.New: %v", err)
    }
    // Add an event and verify new fields round-trip correctly
    e := domain.NormalizedEvent{
        Time:                time.Now().Format(time.RFC3339),
        Agent:               "claudecode",
        Session:             "sess1",
        HookEventName:       "PreToolUse",
        RawPayload:          []byte(`{}`),
        NormalizationStatus: "ok",
        NormalizerVersion:   "1.0",
        AgentVersion:        "",
    }
    if err := db.Add(e); err != nil {
        t.Fatalf("Add: %v", err)
    }
    events, err := db.List(1)
    if err != nil {
        t.Fatalf("List: %v", err)
    }
    if events[0].NormalizationStatus != "ok" {
        t.Errorf("NormalizationStatus = %q, want ok", events[0].NormalizationStatus)
    }
    if events[0].NormalizerVersion != "1.0" {
        t.Errorf("NormalizerVersion = %q, want 1.0", events[0].NormalizerVersion)
    }
}
```

---

### `backend/tests/internal/repository/sqlite/dedup_test.go` (MODEL-05)

**Analog:** `sqlite_test.go` `TestAdd_and_List` at lines 22–58.

**Dedup test structure** — test via Add() behavior, not direct dedupKey call (it's unexported):
```go
package sqlite_test

func TestDedupKeyStability(t *testing.T) {
    db := newTestDB(t)
    payload := []byte(`{"session_id":"s1","transcript_path":"/home/.claude/x.jsonl","hook_event_name":"PreToolUse","turn_id":"t1","tool_use_id":"u1"}`)
    e, err := claudecode.Normalize(payload)
    if err != nil {
        t.Fatalf("Normalize: %v", err)
    }
    e.Time = "2025-01-01T00:00:00Z" // pin time for determinism

    _ = db.Add(e)
    _ = db.Add(e) // second add must be ignored (INSERT OR IGNORE)

    events, _ := db.List(10)
    if len(events) != 1 {
        t.Fatalf("expected 1 event (dedup), got %d", len(events))
    }
}

func TestDegradedEventDedupByRawBytes(t *testing.T) {
    db := newTestDB(t)
    // Two different unknown payloads must both be stored
    e1 := domain.NormalizedEvent{ /* ... degraded event with TurnID = sha256[:8] of payload1 */ }
    e2 := domain.NormalizedEvent{ /* ... degraded event with TurnID = sha256[:8] of payload2 */ }
    _ = db.Add(e1)
    _ = db.Add(e2)
    events, _ := db.List(10)
    if len(events) != 2 {
        t.Fatalf("expected 2 degraded events, got %d", len(events))
    }
}
```

---

### `backend/tests/internal/handler/export_test.go` (TEST-04 style)

**Analog:** `backend/tests/internal/handler/hook_test.go` — `newTestService` helper + `httptest.NewRecorder` pattern at lines 17–36.

**handler test pattern** (lines 17–36):
```go
package handler_test

func newTestService(t *testing.T) *service.EventService {
    t.Helper()
    db, err := sqlite.New(":memory:")
    if err != nil {
        t.Fatalf("sqlite.New: %v", err)
    }
    return service.New(db)
}

func TestHookHandlerRejectsGET(t *testing.T) {
    h := handler.Hook(newTestService(t))
    req := httptest.NewRequest(http.MethodGet, "/api/hook", nil)
    rec := httptest.NewRecorder()
    h.ServeHTTP(rec, req)
    if rec.Code != http.StatusMethodNotAllowed {
        t.Fatalf("status = %d, want 405", rec.Code)
    }
}
```

**Export test structure:**
```go
package handler_test

func newTestDB(t *testing.T) *sqlite.DB {
    t.Helper()
    db, err := sqlite.New(":memory:")
    if err != nil {
        t.Fatalf("sqlite.New: %v", err)
    }
    return db
}

func TestExportEventsReturnsNDJSON(t *testing.T) {
    db := newTestDB(t)
    // seed one event ...
    h := handler.ExportEvents(db)
    req := httptest.NewRequest(http.MethodGet, "/api/export/events", nil)
    rec := httptest.NewRecorder()
    h.ServeHTTP(rec, req)
    if rec.Code != http.StatusOK {
        t.Fatalf("status = %d, want 200", rec.Code)
    }
    // assert Content-Type and at least one JSON line
}

func TestExportEventsRejectsCrossSiteRequest(t *testing.T) {
    // wrap in secFetchSite and verify 403
}

func TestExportSnapshotReturnsOctetStream(t *testing.T) {
    // VACUUM INTO on :memory: may not work — use t.TempDir() DB for this test
}
```

---

### `frontend/tests/hooks/useSessions.test.ts` + `useDashboardStats.test.ts` (TEST-03)

**Analog:** `frontend/tests/features/events/useEvents.test.tsx` — fetch mock pattern + `renderHook` + `waitFor`.

**Fetch mock pattern** (useEvents.test.tsx lines 30–45):
```tsx
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [] }),
    })
  )
})

afterEach(() => {
  vi.clearAllMocks()
})
```

**renderHook pattern** (useEvents.test.tsx lines 52–57):
```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

it('returns data on success', async () => {
  const { result } = renderHook(() => useYourHook())
  await waitFor(() => expect(result.current.data).toBeDefined())
})
```

**Hook test file structure:**
```typescript
// frontend/tests/hooks/useSessions.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessions } from '@/hooks/useSessions'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ sessions: [] }),
  }))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useSessions', () => {
  it('fetches sessions on mount', async () => {
    const { result } = renderHook(() => useSessions())
    await waitFor(() => expect(result.current.sessions).toBeDefined())
  })
})
```

**Warning (Pitfall 7):** After adding `unstubGlobals: true` to `vite.config.ts`, module-level `vi.stubGlobal('EventSource', MockES)` in `useEvents.test.tsx` (line 21) must move into `beforeEach` — it will not persist across tests with `unstubGlobals: true`.

---

### `frontend/vite.config.ts` — unstubGlobals (TEST-01)

**Analog:** self — existing `test` block at lines 22–27.

**Current test block** (lines 22–27):
```typescript
test: {
  environment: 'jsdom',
  setupFiles: './src/test/setup.ts',
  css: true,
  include: ['tests/**/*.{test,spec}.{ts,tsx}'],
},
```

**Add `unstubGlobals: true`:**
```typescript
test: {
  environment: 'jsdom',
  setupFiles: './src/test/setup.ts',
  css: true,
  include: ['tests/**/*.{test,spec}.{ts,tsx}'],
  unstubGlobals: true,
},
```

---

### `backend/tests/internal/agents/claudecode/normalize_test.go` — expand for MODEL-04/05 (TEST-06)

**Analog:** self — existing `TestNormalizeEditPayload` at lines 9–45.

**Existing normalization test pattern** (lines 9–29):
```go
func TestNormalizeEditPayload(t *testing.T) {
    raw := []byte(`{ /* JSON fixture */ }`)
    got, err := claudecode.Normalize(raw)
    if err != nil {
        t.Fatalf("Normalize: %v", err)
    }
    if got.Agent != "claudecode" {
        t.Fatalf("Agent = %q, want claudecode", got.Agent)
    }
}
```

**New tests to add** — same file, follow identical pattern:
```go
func TestNormalizeSetNormalizationStatusOk(t *testing.T) {
    raw := []byte(`{ /* valid claudecode payload */ }`)
    got, _ := claudecode.Normalize(raw)
    // After hook.go sets NormalizationStatus, but Normalize itself may or may not —
    // decide during planning whether Normalize() sets the status or hook.go does.
    // If hook.go sets it: test via hook handler test, not normalize test.
}

func TestNormalizeVersionField(t *testing.T) {
    // Verify NormalizerVersion is set to the expected constant value
}
```

---

## Shared Patterns

### HTTP Handler Constructor

**Source:** `backend/internal/handler/events.go` lines 17–29, `hook.go` lines 18–19
**Apply to:** `export.go` (all new handlers)

```go
func HandlerName(dep Dependency) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // ... handler body
    })
}
```

### Middleware Function Shape

**Source:** `backend/internal/server/middleware.go` lines 10–51
**Apply to:** `panicRecovery()`, `secFetchSite()` (both new functions in middleware.go)

```go
func middlewareName(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // pre-processing
        next.ServeHTTP(w, r)
        // post-processing (or defer for panic recovery)
    })
}
```

### Error Response

**Source:** `backend/internal/handler/events.go` line 22, `hook.go` lines 27, 34
**Apply to:** All new handler functions

```go
http.Error(w, "human-readable message", http.StatusXxx)
return
```

### Backend Test Helper

**Source:** `backend/tests/internal/handler/hook_test.go` lines 17–24
**Apply to:** `export_test.go`, migration tests, dedup tests

```go
func newTestDB(t *testing.T) *sqlite.DB {
    t.Helper()
    db, err := sqlite.New(":memory:")
    if err != nil {
        t.Fatalf("sqlite.New: %v", err)
    }
    return db
}
```

### File-Based DB for Migration Tests

**Source:** `backend/tests/internal/repository/sqlite/sqlite_test.go` lines 60–65
**Apply to:** `migration_test.go` (TEST-05 — `:memory:` does not test migration from a real prior state)

```go
dbPath := filepath.Join(t.TempDir(), "hooker-test.db")
db, err := sqlite.New(dbPath)
```

### Frontend Hook Test Fetch Mock

**Source:** `frontend/tests/features/events/useEvents.test.tsx` lines 30–49
**Apply to:** `tests/hooks/useSessions.test.ts`, `tests/hooks/useDashboardStats.test.ts`

```tsx
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ /* response shape */ }),
  }))
})
afterEach(() => { vi.clearAllMocks() })
```

### Frontend Component Test Builder

**Source:** `frontend/tests/features/events/EventRow.test.tsx` lines 6–13
**Apply to:** `EventBadges` tests for degraded badge

```tsx
function buildEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return { time: '...', action: 'BASH', path: '', ...overrides }
}
```

---

## No Analog Found

Files with no close match in the codebase (use RESEARCH.md Pattern 11 instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `playwright.config.ts` | config | — | No E2E test infrastructure exists; Playwright not installed |
| `tests-e2e/smoke.spec.ts` | test | request-response | No browser automation tests exist; Playwright API patterns from RESEARCH.md §Pattern 11 |

---

## Metadata

**Analog search scope:** `backend/internal/handler/`, `backend/internal/server/`, `backend/internal/repository/sqlite/`, `backend/internal/domain/`, `backend/cmd/server/`, `backend/tests/`, `frontend/src/features/events/`, `frontend/src/types/`, `frontend/tests/`
**Files scanned:** 17
**Pattern extraction date:** 2026-05-26
