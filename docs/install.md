# Install

Source install from this repo is the primary install story. Docker is an
official secondary path for the backend. Prebuilt binaries are planned later.

## Support matrix

| Area                     | Status                                   |
| ------------------------ | ---------------------------------------- |
| macOS                    | First-class                              |
| Linux                    | First-class                              |
| WSL                      | First-class                              |
| Native Windows           | Not first-class yet                      |
| Go                       | 1.25.0 or newer                          |
| Node.js                  | 18 or newer                              |
| Frontend package manager | pnpm 10.x                                |
| Backend database         | SQLite at `backend/hooker.db` by default |
| Supported agents         | Codex, Claude Code                       |
| Experimental agents      | Gemini CLI                               |

## Source install

```bash
git clone <repo-url> hooker
cd hooker
./scripts/hooker setup
```

Manual equivalent:

```bash
cd backend
go mod download

cd ../frontend
pnpm install --frozen-lockfile
```

## Run from source

Backend:

```bash
cd backend
go run ./cmd/server/main.go
```

Frontend:

```bash
cd frontend
pnpm run dev
```

Dashboard: <http://localhost:5173>

Hook endpoint: `http://127.0.0.1:8765/api/hook`

## Configuration

Backend environment variables:

| Variable  | Default             | Purpose                |
| --------- | ------------------- | ---------------------- |
| `ADDR`    | `127.0.0.1:8765`    | Backend listen address |
| `DB_PATH` | `backend/hooker.db` | SQLite database path   |

Use `DB_PATH` when you want data stored outside the repo:

```bash
cd backend
DB_PATH="$HOME/.local/share/hooker/hooker.db" go run ./cmd/server/main.go
```

Keep `ADDR` on loopback unless you understand the privacy and security impact.
Hooker stores local development context, including prompts, file paths, tool
outputs, diffs, and transcript references.

## Doctor

```bash
./scripts/hooker doctor
```

Doctor checks toolchain availability, confirms pnpm is the only frontend
lockfile, runs Go tests, runs frontend typecheck/lint/format checks, and probes
the live backend if it is running.

## Docker backend

Docker runs the backend only. Use source frontend commands for local UI work.

```bash
docker compose up --build
```

The compose file publishes the backend on `127.0.0.1:8765`.

## Common failures

### `pnpm: command not found`

Install pnpm or enable it through Corepack:

```bash
corepack enable
corepack prepare pnpm@10.23.0 --activate
```

### Hook events do not appear

1. Confirm backend is running:

   ```bash
   curl -fsS http://127.0.0.1:8765/api/version
   ```

2. Confirm frontend is proxying to backend by opening <http://localhost:5173>.
3. Re-check [hook setup](hooks.md).

### Go cache permission errors

Use a workspace-local cache:

```bash
cd backend
mkdir -p .cache/go-build
GOCACHE="$PWD/.cache/go-build" go test ./...
```
