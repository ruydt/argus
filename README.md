# hooker

Local-first monitoring dashboard for Codex and Claude Code agent activity.

`hooker` runs a Go backend on `127.0.0.1:8765` and a Vite frontend on
`localhost:5173`. Agent hooks POST events to the backend, then the browser UI
shows sessions, tool calls, prompts, diffs, and usage data.

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

## Dev Quickstart

Start backend:

```bash
cd backend
go run ./cmd/server/main.go
```

Start frontend in a second terminal:

```bash
cd frontend
pnpm run dev
```

Open <http://localhost:5173>, then configure your agent hooks:

- [Codex hooks](docs/hooks.md#codex)
- [Claude Code hooks](docs/hooks.md#claude-code)

Run a local verification any time:

```bash
./scripts/hooker doctor
```

## Requirements

- macOS, Linux, or WSL
- Go 1.25.0 or newer
- Node.js 18 or newer
- pnpm 10.x
- curl for hook forwarding

Native Windows is not first-class yet. Docker is supported as a secondary
backend-only path; source install is the primary path.

## Docs

- [Quickstart](docs/quickstart.md)
- [Install and troubleshooting](docs/install.md)
- [Hook setup](docs/hooks.md)
- [Release checksums](docs/releases.md)

## License

MIT
