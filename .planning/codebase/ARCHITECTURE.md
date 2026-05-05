# ARCHITECTURE.md — System Architecture

**Last mapped:** 2026-05-05

---

## Pattern

**Localhost developer tool** — two independent processes communicating over HTTP on loopback.

```
AI Agents (Claude Code, Codex)
    │
    │  POST /api/hook (hook payloads)
    ▼
Backend (Go, :8765)
    │  in-memory event store
    │  GET /api/events (polling)
    ▼
Frontend (React, :5173 dev / dist/ prod)
    │
    │  GET /api/openai/* (proxied)
    ▼
OpenAI Admin API
```

---

## Backend Architecture

**Entry point:** `backend/main.go`

Single-process HTTP server. No frameworks, no external dependencies.

### Components

| Component | Location | Responsibility |
|-----------|----------|---------------|
| HTTP server | `main.go` | Route registration, request handling, loopback binding |
| Event store | `internal/events/events.go` | In-memory ring buffer (max 1000 events), RWMutex concurrency |
| Claude Code agent | `internal/agents/claudecode/` | Transcript matching, diff generation, model extraction, usage parsing |
| Codex agent | `internal/agents/codex/` | Diff generation, patch parsing, usage parsing |

### Data Flow (hook event)

```
POST /api/hook
    → decode hookPayload JSON
    → cache session model (from payload or transcript scan)
    → resolve file path (CWD + tool_input.file_path)
    → determine action (ToolToAction)
    → generate diff (claudecode.Diff or codex.Diff)
    → find start line + context lines
    → Store.AddEvent(FileEvent)
    → return {}
```

### API Endpoints

| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/events` | Returns all stored events as JSON |
| POST | `/api/hook` | Receives agent hook payloads |
| GET | `/api/session-usage` | Reads JSONL transcript, returns token usage |
| GET | `/api/openai/*` | Proxies to OpenAI admin API |

---

## Frontend Architecture

**Entry point:** `frontend/src/main.tsx` → `App.tsx`

React SPA with client-side routing. State is lifted to `Layout.tsx` and passed via outlet context.

### Component Tree

```
App.tsx
└── BrowserRouter
    └── Layout.tsx  (sidebar nav, shared state)
        ├── Events.tsx  (/ route) — 1s polling, session grouping
        └── Usage.tsx   (/usage route) — OpenAI usage charts
```

### Agent Plugin System

Agents are registered in `frontend/src/agents/index.ts` as `AgentConfig` objects:

```ts
// frontend/src/agents/types.ts
type AgentConfig = {
  id: AgentId;
  label: string;
  matchesEvent: (event: EventRecord) => boolean;
  buildUsageItems?: (...) => UsageTooltipItem[];
}
```

| Agent | Match condition |
|-------|----------------|
| `claudecode` | `transcript_path` contains `/.claude/` |
| `codex` | catch-all `() => true` |

### State Flow

```
Layout.tsx
  collapsedSessions, sessionUsage  ─────────────────────────────────────┐
                                                                         │
Events.tsx (polling /api/events every 1s)                               │
  → groupEvents() by session                                             │
  → ClaudeSession.tsx / CodexSession.tsx  ← useOutletContext<any>()  ◄──┘
```

---

## Key Design Decisions

- **No persistence** — all events are in-memory; restart loses history
- **No auth** — protected by loopback binding (`127.0.0.1`) only
- **Polling** — frontend polls `/api/events` every 1 second (no WebSocket/SSE)
- **Agent detection** — path-based substring matching, not protocol-level
