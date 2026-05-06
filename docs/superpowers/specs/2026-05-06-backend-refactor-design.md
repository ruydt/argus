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
      event.go             ← HookEvent, CtxLine, NormalizedEvent
      hook.go              ← RawPayload (shared hook fields)
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
      claudecode/          ← adapter: normalize CC payload → NormalizedEvent
      codex/               ← adapter: normalize Codex payload → NormalizedEvent
  go.mod
  go.sum
```

**SQLite driver:** `modernc.org/sqlite` (pure Go, no CGO). Contributors don't need gcc to build — critical for open source DX.

**Agent adapter pattern:** Each agent package implements a `Normalize(raw []byte) (domain.NormalizedEvent, error)` function. Adding a new agent (Gemini CLI, Qwen Coder, etc.) = one new package, zero schema changes.

---

## Layer Responsibilities

| Layer | Responsibility |
|-------|---------------|
| `cmd/server` | Parse config, construct deps, start HTTP server. No business logic. |
| `config` | Load `Config` from env vars and CLI flags. Single source of truth for runtime config. |
| `domain` | Pure types only (`HookEvent`, `CtxLine`, `NormalizedEvent`). No dependencies. |
| `repository` | SQLite reads and writes. Interface + concrete impl. Methods: `Add`, `List`, `SessionModel`, `SetSessionModel`. |
| `service` | Business logic: dedup, session model cache, SSE broadcast, future moderation. Calls repository. |
| `handler` | HTTP layer only. Decode request → call service → encode response. No business logic. |
| `server` | Assemble mux, apply middleware. |
| `agents` | One package per agent. Each exports `Normalize(raw []byte) (NormalizedEvent, error)`. No state. |

---

## Data Flow

### Hook ingestion

```
POST /api/hook
    ↓ handler/hook.go    — decode raw payload bytes, detect agent (claudecode vs codex)
    ↓ agents/*/          — Normalize(raw) → NormalizedEvent + raw_payload preserved
    ↓ service            — dedup via hash, upsert session model, persist + broadcast
    ↓ repository/sqlite  — INSERT INTO hook_events + UPSERT sessions
    ↓ broadcaster        — send NormalizedEvent to all active SSE subscribers
```

### SSE stream

```
GET /api/events/stream
    ↓ handler/events.go  — call service.Subscribe(), set SSE headers
    ↓                    — flush all existing events (initial hydration, no separate REST call needed)
    ↓                    — stream new events from channel until client disconnects
    ↓                    — on r.Context().Done(): call service.Unsubscribe(), return
```

### REST events

```
GET /api/events
    ↓ handler/events.go  — call service.ListEvents()
    ↓ repository/sqlite  — SELECT * FROM hook_events ORDER BY id DESC LIMIT 1000
    ↓                    — return JSON array
```

---

## SSE Design

- `EventService` holds a `sync.Map` of subscriber channels (`chan domain.NormalizedEvent`)
- `Subscribe() <-chan domain.NormalizedEvent` — registers channel, returns it
- `Unsubscribe(ch)` — removes and closes channel
- On SSE connect: fetch all existing events from repo, send as individual `data:` lines (initial hydration), then stream new ones
- Frontend replaces `setInterval` polling with `EventSource('http://localhost:8765/api/events/stream')`
- No extra dependencies — stdlib only

---

## SQLite Schema

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- One row per hook event from any agent
CREATE TABLE IF NOT EXISTS hook_events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at       TEXT    NOT NULL,              -- RFC3339, set by server on receipt

    -- Identity (shared across all agents)
    agent            TEXT    NOT NULL,              -- 'claudecode' | 'codex' | 'gemini' | ...
    session_id       TEXT    NOT NULL,
    hook_event_name  TEXT    NOT NULL,              -- PreToolUse | PostToolUse | SessionStart | ...
    turn_id          TEXT,
    tool_use_id      TEXT,
    tool_name        TEXT,
    model            TEXT,
    source           TEXT,
    cwd              TEXT,
    transcript_path  TEXT,

    -- Normalized file/tool fields (NULL for non-file events like SessionStart)
    action           TEXT,                          -- EDIT | BASH | null
    path             TEXT,
    command          TEXT,
    old_string       TEXT,                          -- normalized: old_string (CC) or old_str (Codex)
    new_string       TEXT,                          -- normalized: new_string (CC) or new_str (Codex)
    start_line       INTEGER,
    ctx_before       TEXT    NOT NULL DEFAULT '[]', -- JSON []CtxLine
    ctx_after        TEXT    NOT NULL DEFAULT '[]', -- JSON []CtxLine

    -- Full original payload — agent-specific fields live here, zero migration for new agents
    raw_payload      TEXT    NOT NULL,

    dedup_key        TEXT    NOT NULL UNIQUE        -- sha256(session_id+turn_id+tool_use_id+hook_event_name)
);

CREATE INDEX IF NOT EXISTS idx_hook_events_session   ON hook_events(session_id);
CREATE INDEX IF NOT EXISTS idx_hook_events_agent     ON hook_events(agent);
CREATE INDEX IF NOT EXISTS idx_hook_events_action    ON hook_events(action);
CREATE INDEX IF NOT EXISTS idx_hook_events_created   ON hook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hook_events_hook_name ON hook_events(hook_event_name);

-- Session-level metadata (model cache + session tracking)
CREATE TABLE IF NOT EXISTS sessions (
    session_id      TEXT PRIMARY KEY,
    agent           TEXT NOT NULL,
    model           TEXT,
    source          TEXT,
    cwd             TEXT,
    transcript_path TEXT,
    started_at      TEXT NOT NULL,
    last_seen_at    TEXT NOT NULL
);
```

**Design decisions:**
- `ctx_before`/`ctx_after` stored as JSON blobs — never queried, only displayed. No normalization needed.
- `raw_payload` stores original agent JSON verbatim — access agent-specific fields via `json_extract(raw_payload, '$.permission_mode')` without schema changes.
- `dedup_key` is a hash — more robust than time-based string concatenation, works across agents with different time precision.
- `sessions` table replaces in-memory `sessionModel` map — survives restarts.
- WAL mode for concurrent read performance (many SSE subscribers reading while hook writes).

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
| `main.go` — `hookPayload` | `internal/domain/hook.go` → becomes `RawPayload` (shared fields) |
| `main.go` — HTTP handlers | `internal/handler/*.go` |
| `main.go` — `main()` | `cmd/server/main.go` |
| `main.go` — `firstNonEmpty()` | `internal/agents/` (used during normalization) |
| `internal/events/events.go` — `FileEvent`, `CtxLine` | `internal/domain/event.go` → becomes `NormalizedEvent`, `CtxLine` |
| `internal/events/events.go` — `Store` | `internal/service/event_service.go` + `internal/repository/sqlite/` |
| `internal/events/events.go` — `max()` | Deleted — use Go 1.21 builtin `max()` |
| `internal/events/events.go` — path utilities | `internal/service/` or agent adapters as appropriate |
| `internal/agents/claudecode/` | Add `Normalize()` function; existing parsing functions unchanged |
| `internal/agents/codex/` | Add `Normalize()` function; existing parsing functions unchanged |

## Adding Future Agents

1. Create `internal/agents/<name>/<name>.go`
2. Implement `Normalize(raw []byte) (domain.NormalizedEvent, error)`
3. Register in `handler/hook.go` agent-detection switch
4. No DB migration required
