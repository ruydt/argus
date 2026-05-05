# STRUCTURE.md — Directory Layout

**Last mapped:** 2026-05-05

---

## Root Layout

```
codex-test/
├── backend/               # Go HTTP server
├── frontend/              # React/TypeScript SPA
├── .claude/               # Claude Code settings
├── .planning/             # GSD planning artifacts
├── README.md
└── .gitignore
```

---

## Backend (`backend/`)

```
backend/
├── main.go                # Entry point: HTTP server, all route handlers, hookPayload struct
├── go.mod                 # Module: agent-monitor, go 1.23 (zero external deps)
├── go.sum                 # Checksums (empty — no external deps)
├── agent-monitor          # Compiled binary (gitignored)
└── internal/
    ├── events/
    │   └── events.go      # FileEvent struct, Store (RWMutex ring buffer), helpers
    └── agents/
        ├── claudecode/
        │   └── claudecode.go  # Transcript match, diff, model extraction, usage parsing
        └── codex/
            └── codex.go       # Diff, apply_patch parsing, usage parsing
```

### Key Locations

| What | Where |
|------|-------|
| HTTP routes | `backend/main.go` — `mux.HandleFunc(...)` |
| Event struct + storage | `backend/internal/events/events.go` |
| Claude Code logic | `backend/internal/agents/claudecode/claudecode.go` |
| Codex logic | `backend/internal/agents/codex/codex.go` |

---

## Frontend (`frontend/`)

```
frontend/
├── src/
│   ├── main.tsx           # React root mount
│   ├── App.tsx            # BrowserRouter + route definitions
│   ├── agents/
│   │   ├── types.ts       # AgentConfig, SessionUsage, EventRecord types
│   │   ├── index.ts       # AGENTS registry array
│   │   ├── logos.tsx      # Agent logo/badge components
│   │   ├── claudecode/
│   │   │   └── index.ts   # ClaudeCode AgentConfig (matchesEvent, buildUsageItems)
│   │   └── codex/
│   │       └── index.ts   # Codex AgentConfig (catch-all matcher)
│   ├── components/
│   │   ├── Layout.tsx     # Sidebar nav, shared state, Outlet wrapper
│   │   └── events/
│   │       ├── ClaudeSession.tsx   # Session card for Claude Code events
│   │       └── CodexSession.tsx    # Session card for Codex events (near-identical)
│   └── pages/
│       ├── Events.tsx     # Main events page — polling, grouping, rendering
│       └── Usage.tsx      # OpenAI usage charts page
├── public/
├── dist/                  # Build output (gitignored via frontend/.gitignore)
├── package.json
├── vite.config.ts         # Dev server config, ngrok allowedHosts
├── tsconfig.json          # Project references root
├── tsconfig.app.json      # App strict config
├── tsconfig.node.json     # Node/Vite config
└── eslint.config.js       # Flat ESLint config
```

### Key Locations

| What | Where |
|------|-------|
| Route definitions | `frontend/src/App.tsx` |
| Shared state + nav | `frontend/src/components/Layout.tsx` |
| Agent registry | `frontend/src/agents/index.ts` |
| Agent type contracts | `frontend/src/agents/types.ts` |
| Events polling logic | `frontend/src/pages/Events.tsx` |
| Usage charts | `frontend/src/pages/Usage.tsx` |
| Session UI components | `frontend/src/components/events/` |

---

## Naming Conventions

| Context | Convention |
|---------|-----------|
| Go exported | `PascalCase` |
| Go unexported | `camelCase` |
| Go JSON fields | `json:"snake_case"` |
| TS/React components | `PascalCase` (named exports) |
| TS types | `PascalCase` |
| TS variables/functions | `camelCase` |
| TS agent IDs | `lowercase` string literals (`'claudecode'`, `'codex'`) |
