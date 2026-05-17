# Quickstart

Target: first successful local run in 5 to 10 minutes.

## 1. Install source dependencies

```bash
git clone <repo-url> hooker
cd hooker
./scripts/hooker setup
```

The setup command checks `go`, `node`, and `pnpm`, downloads Go modules, and
installs frontend dependencies from `pnpm-lock.yaml`.

## 2. Start backend

```bash
cd backend
go run ./cmd/server/main.go
```

Expected startup output includes:

```text
hooker version -> 0.0.0-dev
hook endpoint -> POST http://127.0.0.1:8765/api/hook
events SSE -> GET http://127.0.0.1:8765/api/events/stream
db -> .../backend/hooker.db
```

Keep this process running.

## 3. Start frontend

Open a second terminal:

```bash
cd frontend
pnpm run dev
```

Open <http://localhost:5173>.

## 4. Configure agent hooks

Use the hook guide for your agent:

- [Codex](hooks.md#codex)
- [Claude Code](hooks.md#claude-code)

Gemini CLI support exists but is experimental.

## 5. Verify one event

1. Start Codex or Claude Code in any repo.
2. Send one prompt or run one tool command.
3. Confirm the event appears in the dashboard.

If no event appears, run:

```bash
curl -fsS http://127.0.0.1:8765/api/version
./scripts/hooker doctor
```
