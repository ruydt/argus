# hooker

`hooker` is a premium, real-time agent monitoring dashboard designed for local development with **Claude Code**, **Codex**, and **Gemini CLI**. It captures hook events (lifecycle, tool usage, prompts) and visualizes them in a streamlined interface, complete with diff rendering and token usage analytics.

## Features

- **Unified Monitoring**: Track Claude Code, Codex, and Gemini CLI sessions side-by-side.
- **Diff Visualization**: Render code changes directly in the event stream.
- **Token Analytics**: Real-time token usage tooltips (input, output, and cache efficiency).
- **Usage Dashboard**: Administrative view for tracking aggregated OpenAI usage, costs, and model breakdowns.
- **State Persistence**: Remembers sidebar state, API keys, and time-range filters.

## Prerequisites

- **Go**: 1.25.0+
- **Node.js**: 18.x+
- **golangci-lint**: v2.x (for development)
- **curl**: for forwarding hook payloads to backend

## Agent Configuration

Configure agent hooks to POST payloads into backend endpoint:
`http://127.0.0.1:8765/api/hook`

### 1. Start backend first
Hook delivery fails if backend not running.

```bash
cd backend
go run ./cmd/server/main.go
```

Use `DB_PATH` if you want to pin a specific database file:

```bash
# Use your own DB file
cd backend
DB_PATH=/absolute/path/to/my.db go run ./cmd/server/main.go
```

Without `DB_PATH`, backend always uses `hooker.db` in the current working directory.

### 2. Codex setup (recommended)

`~/.codex/config.toml`:
```toml
[features]
codex_hooks = true
```

`~/.codex/hooks.json`:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
            "timeout": 5
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
            "timeout": 5
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
            "timeout": 5
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
            "timeout": 5
          }
        ]
      }
    ],
    "PostCompact": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

After editing `hooks.json`, run `codex` then `/hooks` once and trust updated hook hashes.

### 3. Claude Code setup (optional)

Minimal `~/.claude/settings.json` hook forwarding example:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ]
  }
}
```

### 4. Gemini CLI setup

**Step 1 — Create the hook script:**

```bash
mkdir -p ~/.gemini/hooks
cat > ~/.gemini/hooks/hooker-gemini.sh << 'EOF'
#!/bin/bash
cat - > /tmp/hooker-current.json
curl -s -X POST http://127.0.0.1:8765/api/hook \
  -H "Content-Type: application/json" \
  -d @/tmp/hooker-current.json
EOF
chmod +x ~/.gemini/hooks/hooker-gemini.sh
```

**Step 2 — Configure `~/.gemini/settings.json`:**

```json
{
  "hooks": {
    "SessionStart": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ],
    "SessionEnd": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ],
    "BeforeAgent": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ],
    "AfterAgent": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ],
    "BeforeModel": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ],
    "AfterModel": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ],
    "BeforeTool": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
        ]
      }
    ],
    "AfterTool": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
        ]
      }
    ],
    "Notification": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ]
  }
}
```

*Note: If `$HOME` is not expanded by Gemini CLI, replace `$HOME` with your absolute home path.*

### 5. Quick verification

1. Start backend.
2. Start frontend.
3. Start Codex or Gemini CLI in any repo and run one command.
4. Confirm event appears in dashboard.
5. Trigger `/compact` in Codex and confirm `PreCompact` / `PostCompact` rows appear.

## Getting Started & Development

**1. Backend (Go)**
```bash
cd backend
go run ./cmd/server/main.go

# Development commands:
# go test ./...
# go vet ./...
# golangci-lint run ./...
```

Backend tests are organized under `backend/tests/...` (mirrored by package path).

If your shell or sandbox blocks writes to `~/.cache`, run backend checks with workspace-local caches instead:
```bash
cd backend
mkdir -p .cache/go-build .cache/golangci-lint
GOCACHE="$PWD/.cache/go-build" go test ./...
GOCACHE="$PWD/.cache/go-build" go vet ./...
GOCACHE="$PWD/.cache/go-build" GOLANGCI_LINT_CACHE="$PWD/.cache/golangci-lint" golangci-lint run ./...
```

**2. Frontend (React/Vite)**
```bash
cd frontend
pnpm install
pnpm run dev
```

Frontend tests are organized under `frontend/tests/...`.

**3. Dashboard**
Open [http://localhost:5173](http://localhost:5173) in your browser.

## License

MIT — free like mass mammoth on open plain.
