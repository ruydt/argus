# Install

## Binary install (recommended)

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/ruydt/argus/main/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/ruydt/argus/main/install.ps1 | iex
```

Requires: Node.js 18+ (plus curl/tar on macOS/Linux). No Go or pnpm needed.

The installer places the binary at `~/.argus/bin/argus` (`argus.exe` on Windows) and wires
a `SessionStart` hook in `~/.claude/settings.json` so argus starts automatically with each
Claude Code session.

## Support matrix

| Area                     | Status                                   |
| ------------------------ | ---------------------------------------- |
| macOS                    | First-class                              |
| Linux                    | First-class                              |
| WSL                      | First-class                              |
| Native Windows           | Supported (install.ps1; Node.js required) |
| Go                       | 1.25.0 or newer                          |
| Node.js                  | 18 or newer                              |
| Frontend package manager | pnpm 10.x                                |
| Backend database         | SQLite at `backend/argus.db` by default |
| Supported agents         | Codex, Claude Code                       |

## Source install

> **Note:** Source install is for contributors and development only. For end users, use the binary install above.

Before enabling hooks, treat captured data as sensitive. Argus can store prompts,
diffs, file paths, tool outputs, raw payloads, and exports on this machine.
Read [docs/privacy.md](privacy.md) and [docs/security.md](security.md) before
changing defaults.

```bash
git clone https://github.com/ruydt/argus
cd argus
./scripts/argus setup
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
go build -o argus ./cmd/server
./argus
```

Frontend:

```bash
cd frontend
pnpm run dev
```

Dashboard: <http://localhost:5173>

Hook endpoint: `http://127.0.0.1:10804/api/hook`

## Configuration

Backend environment variables:

| Variable               | Default                          | Purpose                                                                       |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| `ADDR`                 | `127.0.0.1:10804`                 | Backend listen address                                                        |
| `DB_PATH`              | `backend/argus.db`              | SQLite database path                                                          |
| `ARGUS_IGNORE`        | `~/.config/argus/ignore`        | Path to gitignore-style privacy exclusion file                                |
| `ARGUS_CORS_ORIGINS`  | _(derived from ADDR)_            | Extra comma-separated CORS origins allowed beyond the loopback defaults       |
| `ARGUS_ALLOW_REMOTE`  | _(unset)_                        | Set to `1` to allow binding to non-loopback addresses (see security.md)      |
| `ARGUS_RETENTION_DAYS`| `0` (disabled)                   | Prune hook events older than N days (sweep runs every 6h). `0` keeps everything. |
| `ARGUS_MAX_EVENTS`    | `0` (disabled)                   | Cap the hook-events table to the N newest rows. `0` keeps everything.          |

See [docs/privacy.md](privacy.md) for ignore rules and export handling. See
[docs/security.md](security.md) for loopback defaults, remote opt-in, and
unsupported remote sharing guidance.

## Database size

The database grows with hook activity. Two controls bound it:

- **Compaction (lossless):** the **Compact database** button on the Diagnostics
  page gzip-compresses stored payloads and `VACUUM`s to reclaim free pages. No
  events are deleted. Run it whenever the DB feels large.
- **Retention (deletes data):** set `ARGUS_RETENTION_DAYS` and/or
  `ARGUS_MAX_EVENTS` to automatically prune old events on a 6-hour sweep. Both
  default to off, so nothing is ever deleted unless you opt in.

Use `DB_PATH` when you want data stored outside the repo:

```bash
cd backend
go build -o argus ./cmd/server
DB_PATH="$HOME/.local/share/argus/argus.db" ./argus
```

Keep `ADDR` on loopback unless you understand the privacy and security impact.
Argus stores local development context, including prompts, diffs, file paths,
tool outputs, raw payloads, and exports.

## Doctor

```bash
./scripts/argus doctor
```

Doctor checks toolchain availability, confirms pnpm is the only frontend
lockfile, runs Go tests, runs frontend typecheck/lint/format checks, and probes
the live backend if it is running.

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
   curl -fsS http://127.0.0.1:10804/api/version
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

## Data storage

Argus stores all data in a single SQLite database file.

Default location: `backend/argus.db` (relative to the repo root when started from `backend/`).

Override with the `DB_PATH` environment variable:

```bash
DB_PATH="$HOME/.local/share/argus/argus.db" ./argus
```

The resolved path is printed at startup:

```text
db -> /home/user/.local/share/argus/argus.db
```

### WAL files

SQLite WAL (Write-Ahead Log) mode is enabled for performance. You will see two companion
files alongside the database:

- `argus.db-wal` - write-ahead log (in-progress writes)
- `argus.db-shm` - shared memory index

These are normal. They are managed automatically by SQLite. Do not delete them while the
server is running.

## Backup

To back up your data, copy all three files while the server is stopped:

```bash
cp argus.db argus.db.bak
cp argus.db-wal argus.db-wal.bak 2>/dev/null || true
cp argus.db-shm argus.db-shm.bak 2>/dev/null || true
```

Or run a WAL checkpoint first (merges WAL into the main file), then copy only the `.db`:

```bash
sqlite3 argus.db "PRAGMA wal_checkpoint(FULL);"
cp argus.db argus.db.bak
```

## Reset

To reset all stored data and start fresh:

1. Stop the argus server.
2. Delete the database and WAL files:

```bash
rm -f backend/argus.db backend/argus.db-wal backend/argus.db-shm
```

3. Restart the server. Migrations run automatically on the empty database.

## Manual data prune

To delete events older than 30 days without resetting everything:

```bash
sqlite3 backend/argus.db \
  "DELETE FROM events WHERE created_at < datetime('now', '-30 days');"
```

To see how many events exist by date:

```bash
sqlite3 backend/argus.db \
  "SELECT date(created_at), count(*) FROM events GROUP BY date(created_at) ORDER BY 1 DESC LIMIT 14;"
```

## Privacy

Argus captures and stores the following data locally:

- **Prompts** - the full text of prompts sent to coding agents
- **Diffs** - code changes made during agent sessions
- **File paths** - absolute paths to every file read, written, or modified
- **Tool outputs** - complete output from tool calls (file reads, shell commands, search results)
- **Raw payloads** - original hook request bodies stored with events
- **Exports** - NDJSON event streams and SQLite snapshots that contain full-fidelity data

All data is stored only on your machine in the SQLite database. Nothing is sent to any
external service by argus itself.

See [docs/privacy.md](privacy.md) for ignore rules and export implications.

The hook endpoint (`POST /api/hook`) accepts requests only from localhost by default.
Setting `ADDR` to a non-loopback address exposes this data to your local network.
Use `./scripts/argus doctor` to verify your ADDR setting and read
[docs/security.md](security.md) before changing it.
