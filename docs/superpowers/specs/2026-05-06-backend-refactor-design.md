# Backend Refactor — golang-standards/project-layout

**Date:** 2026-05-06  
**Status:** Approved

## Goal

Restructure the backend from a flat layout (fat `main.go` + `internal/`) to a clean layered architecture following `golang-standards/project-layout`. Supports future growth: SQLite persistence, SSE real-time streaming, moderation, open-source contributions.

---

## Directory Structure

```
backend/
  cmd/
    server/
      main.go              ← wire config + deps, start server
  internal/
    config/
      config.go            ← Config{Addr, DBPath}, LoadConfig() from env/flags
    domain/
      event.go             ← FileEvent, CtxLine
      hook.go              ← HookPayload
    repository/
      repository.go        ← EventRepository interface
      sqlite/
        sqlite.go          ← concrete SQLite implementation
        migrations/
          001_init.sql     ← initial schema
    service/
      event_service.go     ← AddEvent, ListEvents, Subscribe, Unsubscribe, session model cache
    handler/
      hook.go              ← POST /api/hook
      events.go            ← GET /api/events (REST) + GET /api/events/stream (SSE)
      usage.go             ← GET /api/session-usage
      proxy.go             ← GET /api/openai/
    server/
      router.go            ← wire handlers → http.Handler
      middleware.go        ← request logging, CORS
    agents/
      claudecode/          ← unchanged
      codex/               ← unchanged
  go.mod
  go.sum
```

**SQLite driver:** `modernc.org/sqlite` (pure Go, no CGO). Contributors don't need gcc to build — critical for open source DX.

---

## Layer Responsibilities

| Layer | Responsibility |
|-------|---------------|
| `cmd/server` | Parse config, construct deps, start HTTP server. No business logic. |
| `config` | Load `Config` from env vars and CLI flags. Single source of truth for runtime config. |
| `domain` | Pure types only (`FileEvent`, `CtxLine`, `HookPayload`). No dependencies. |
| `repository` | SQLite reads and writes. Interface + concrete impl. Methods: `Add`, `List`, `SessionModel`, `SetSessionModel`. |
| `service` | Business logic: dedup, session model cache, 1000-event cap, SSE broadcast, future moderation. Calls repository. |
| `handler` | HTTP layer only. Decode request → call service → encode response. No business logic. |
| `server` | Assemble mux, apply middleware. |
| `agents` | Pure parsing functions. No state. Unchanged. |

---

## Data Flow

### Hook ingestion

```
POST /api/hook
    ↓ handler/hook.go    — decode HookPayload, call service
    ↓ service            — dedup, resolve model, build FileEvent, persist + broadcast
    ↓ repository/sqlite  — INSERT into events table
    ↓ broadcaster        — send FileEvent to all active SSE subscribers
```

### SSE stream

```
GET /api/events/stream
    ↓ handler/events.go  — call service.Subscribe(), set SSE headers
    ↓                    — flush all existing events (initial hydration)
    ↓                    — stream new events from channel until client disconnects
    ↓                    — on r.Context().Done(): call service.Unsubscribe(), return
```

### REST events

```
GET /api/events
    ↓ handler/events.go  — call service.ListEvents()
    ↓ repository/sqlite  — SELECT * FROM events ORDER BY id DESC LIMIT 1000
    ↓                    — return JSON array
```

---

## SSE Design

- `EventService` holds a `sync.Map` of subscriber channels (`chan domain.FileEvent`)
- `Subscribe() <-chan domain.FileEvent` — registers channel, returns it
- `Unsubscribe(ch)` — removes and closes channel
- On SSE connect: send all existing events as individual `data:` lines, then stream new ones
- Frontend replaces `setInterval` polling with `EventSource('http://localhost:8765/api/events/stream')`
- No extra dependencies — stdlib only

---

## SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    time        TEXT NOT NULL,
    action      TEXT NOT NULL,
    path        TEXT NOT NULL,
    command     TEXT,
    session     TEXT,
    transcript_path TEXT,
    tool        TEXT,
    hook_event_name TEXT,
    turn_id     TEXT,
    tool_use_id TEXT,
    source      TEXT,
    model       TEXT,
    cwd         TEXT,
    prompt      TEXT,
    description TEXT,
    old_string  TEXT,
    new_string  TEXT,
    start_line  INTEGER,
    ctx_before  TEXT,  -- JSON
    ctx_after   TEXT,  -- JSON
    dedup_key   TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS session_models (
    session_id TEXT PRIMARY KEY,
    model      TEXT NOT NULL
);
```

WAL mode enabled at startup for concurrent read performance.

---

## Error Handling

- **HTTP errors:** `writeError(w, status, msg)` helper in `server/`. No inline error writes in handlers.
- **SQLite errors:** Repository returns `error`. Service propagates. Handler returns 500. All DB errors logged with operation context.
- **SSE disconnect:** Detected via `r.Context().Done()`. Handler unsubscribes and returns. No goroutine leaks.
- **Startup failures:** `log.Fatal` on config load, DB open, or migration failure. No partial-init server.
- **OpenAI proxy:** Preserve upstream status code and body verbatim. Frontend expects raw OpenAI error format.

---

## Testing Strategy

| Target | Approach |
|--------|----------|
| `repository/sqlite` | Integration tests with `:memory:` SQLite DB. No mocks. |
| `service` | Unit tests with hand-written mock `EventRepository`. |
| `handler` | `httptest.NewRecorder` + real service wired to in-memory repo. |
| `agents/claudecode`, `agents/codex` | Pure functions — table-driven unit tests, no changes needed. |

---

## Config

`Config` loaded from env vars with CLI flag fallback:

| Key | Env | Default |
|-----|-----|---------|
| Listen address | `ADDR` | `127.0.0.1:8765` |
| SQLite DB path | `DB_PATH` | `agent-monitor.db` |

---

## Migration from Current Code

| Current | Destination |
|---------|-------------|
| `main.go` — `hookPayload` | `internal/domain/hook.go` |
| `main.go` — HTTP handlers | `internal/handler/*.go` |
| `main.go` — `main()` | `cmd/server/main.go` |
| `internal/events/events.go` — `FileEvent`, `CtxLine` | `internal/domain/event.go` |
| `internal/events/events.go` — `Store` | `internal/service/event_service.go` + `internal/repository/sqlite/` |
| `internal/events/events.go` — utilities | `internal/service/` or `internal/handler/` as appropriate |
| `internal/agents/**` | Unchanged, paths stay the same |
