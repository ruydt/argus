# hooker

`hooker` is a premium, real-time agent monitoring dashboard designed for local development with **Claude Code**, **Codex**, and **Gemini CLI**. It captures hook events (lifecycle, tool usage, prompts) and visualizes them in a streamlined interface, complete with diff rendering and token usage analytics.

## Features

- **Unified Monitoring**: Track Claude Code, Codex, and Gemini CLI sessions side-by-side.
- **Diff Visualization**: Render code changes directly in the event stream.
- **Token Analytics**: Real-time token usage tooltips (input, output, and cache efficiency).
- **Usage Dashboard**: Administrative view for tracking aggregated OpenAI usage, costs, and model breakdowns.
- **State Persistence**: Remembers sidebar state, API keys, and time-range filters.

## Quick Install (autostart with Claude Code)

Clone the repo and run the install script once:

```bash
git clone https://github.com/your-org/hooker.git
cd hooker
./install.sh
```

This builds the binary, installs a startup script to `~/.local/bin/`, and registers a `SessionStart` hook in `~/.claude/settings.json`. After that, hooker starts automatically every time you run `claude` — no manual step needed.

UI available at **[http://127.0.0.1:8765](http://127.0.0.1:8765)** once running.

---

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

Without `DB_PATH`, backend auto-detects project layout and defaults to `backend/hooker.db`.
Set `DB_PATH` explicitly if you run from unusual directories or want a custom location.

### 2. Configure Your Agent

Each coding assistant requires its own hook configuration to forward events to the Hooker backend.

Choose your agent to view the setup instructions:
- **[Codex Setup Guide](docs/setup/codex.md)** (Recommended)
- **[Claude Code Setup Guide](docs/setup/claudecode.md)**
- **[Gemini CLI Setup Guide](docs/setup/geminicli.md)**

### 3. Quick verification

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
