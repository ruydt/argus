# emruy

`emruy` is a premium, real-time agent monitoring dashboard designed for local development with **Claude Code** and **Codex**. It captures hook events (lifecycle, tool usage, prompts) and visualizes them in a streamlined interface, complete with diff rendering and token usage analytics.

## Features

- **Unified Monitoring**: Track both Claude Code and Codex sessions side-by-side.
- **Diff Visualization**: Render code changes directly in the event stream (supporting both Claude and Codex diff formats).
- **Token Analytics**: Real-time token usage tooltips for Claude Code sessions (input, output, and cache efficiency).
- **Advanced Usage Dashboard**: Dedicated administrative view for tracking aggregated OpenAI organization usage, costs, and model breakdowns.
- **State Persistence**: Remembers your sidebar state, API keys, and time-range filters.

## Prerequisites

Before running the monitor, ensure your agent configurations are set to forward hook events. You can configure these **globally** in your home directory (for all projects) or **locally** within a specific project's `.codex/` or `.claude/` folder.

### 1. Codex Configuration (`~/.codex/config.toml`)
Enable hooks in your global or local config:
```toml
[features]
codex_hooks = true
```

### 2. Hook Endpoints
Configure your agents to POST to `http://127.0.0.1:8765/api/hook`.

**Codex (`~/.codex/hooks.json`)**:
```json
{
  "hooks": {
    "SessionStart": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-" }] }],
    "PreToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-" }] }],
    "PostToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-" }] }]
  }
}
```

**Claude Code (`~/.claude/settings.json`)**:
```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-" }] }],
    "PreToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-" }] }],
    "PostToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-" }] }]
  }
}
```

## Getting Started

1. **Start the Backend** (Go):
   ```bash
   cd backend
   go run main.go
   ```

2. **Start the Frontend** (React/Vite):
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **View the Dashboard**:
   Open [http://localhost:5173](http://localhost:5173) in your browser.
