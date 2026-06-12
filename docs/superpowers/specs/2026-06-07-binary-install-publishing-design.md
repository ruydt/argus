# Binary Install & Publishing Design

**Date:** 2026-06-07
**Status:** Approved
**Scope:** Make argus installable by the public with a single curl command, no toolchain required.

---

## Goal

Any developer who uses Claude Code or Codex can install argus in under 2 minutes with no Go, pnpm required.

Target experience:
```bash
curl -fsSL https://raw.githubusercontent.com/duytrandt04-afk/argus/main/install.sh | bash
```

---

## What Already Exists

- `.goreleaser.yaml` — builds `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64` archives + `checksums.txt`
- `.github/workflows/release.yml` — fires on `v*` tags, runs GoReleaser, publishes GitHub Release
- `.github/workflows/ci.yml` — runs on every push/PR
- `install.sh` — exists but builds from source (requires Go toolchain)
- `VERSION` file — currently `0.0.0-dev`

---

## What Changes

### 1. Rewrite `install.sh`

Replace source-build flow with binary-download flow:

1. Detect OS (`darwin` / `linux`) and arch (`amd64` / `arm64`)
2. Fetch latest release tag from GitHub API (`/repos/duytrandt04-afk/argus/releases/latest`)
3. Download `argus_<version>_<os>_<arch>.tar.gz` from GitHub Releases
4. Verify SHA256 against `checksums.txt`
5. Extract binary to `~/.argus/bin/argus`
6. Write `~/.argus/bin/start-argus.sh` startup wrapper (auto-start on port 10804, nohup; skip if already running)
7. Write `~/.argus/bin/argus-stop.sh` stop script (kill process on port 10804)
8. Create `~/.argus/hooks/argus-activate.js` notification script (Node.js)
9. Wire two `SessionStart` hooks in `~/.claude/settings.json` via Python

Fallback: unsupported OS/arch or GitHub API unreachable → print error with manual download URL and exit non-zero.

No Go or pnpm required. curl + tar + node + python3 (node for activate script; python3 for hook wiring — both available on macOS by default).

### Session notification script

`~/.argus/hooks/argus-activate.js` — Node.js, written by `install.sh`. Queries SQLite for event/session counts:

```js
#!/usr/bin/env node
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');
const db = path.join(os.homedir(), '.argus', 'argus.db');
const url = 'http://127.0.0.1:10804';
let output;
try {
  const result = execSync(
    `sqlite3 "${db}" "SELECT COUNT(*), COUNT(DISTINCT session_id) FROM events"`,
    { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] }
  ).trim();
  const [events, sessions] = result.split('|');
  output = `ARGUS live @ ${url} | ${parseInt(events, 10).toLocaleString()} events · ${sessions} sessions`;
} catch (_) {
  output = `ARGUS live @ ${url}`;
}
process.stdout.write(output);
```

Node.js chosen over Python: `node` reliably in Codex/Claude Code hook PATH; `python3` PATH varies by install method.

### Stop script

`~/.argus/bin/argus-stop.sh` — kills process on port 10804:

```bash
#!/bin/bash
PID=$(lsof -ti:10804)
if [ -z "$PID" ]; then
  echo "argus not running"
  exit 0
fi
kill "$PID" && echo "argus stopped"
```

### SessionStart hook wiring (two entries, in order)

```json
"SessionStart": [
  { "hooks": [{ "type": "command", "command": "~/.argus/bin/start-argus.sh" }] },
  { "hooks": [{ "type": "command", "command": "node ~/.argus/hooks/argus-activate.js" }] }
]
```

Hook 1 starts the server (skips if already running). Hook 2 prints the live notification.

### 2. Bump VERSION and push first tag

- Set `VERSION` to `0.1.0`
- `git tag v0.1.0 && git push origin v0.1.0`
- GitHub Actions fires → GoReleaser produces binaries → GitHub Release created

### 3. Update README

Replace current quickstart block with:
```bash
curl -fsSL https://raw.githubusercontent.com/duytrandt04-afk/argus/main/install.sh | bash
```

Follow with: "Open http://127.0.0.1:10804"

---

## Out of Scope

- Docker GHCR publish
- Homebrew tap
- Version check / update notification endpoint
- Windows native support

---

## Default Port

Changed from `8765` to `10804` across all source files, tests, and docs. Already done.

---

## Files Created on User Machine

```
~/.argus/bin/argus                  # server binary
~/.argus/bin/start-argus.sh        # auto-start wrapper (nohup, skip if running)
~/.argus/bin/argus-stop.sh         # stop script
~/.argus/hooks/argus-activate.js  # SessionStart notification (Node.js)
~/.argus/argus.db                 # SQLite DB (created on first run)
~/.argus/argus.log                # server log (created on first run)
```

`~/.claude/settings.json` gets two `SessionStart` hook entries added.

---

## Error Handling

| Failure | Behavior |
|---|---|
| Unsupported OS/arch | Print error + manual download URL, exit 1 |
| GitHub API unreachable | Print error + manual download URL, exit 1 |
| SHA256 mismatch | Delete downloaded file, print error, exit 1 |
| `~/.argus/bin` not on PATH | Print warning with PATH export instructions |
| Hook already registered | Skip silently |

---

## Testing

- Run `install.sh` on macOS arm64 — verify binary downloads, all scripts created, hooks wired
- Open new Claude Code session → see "ARGUS live @ http://127.0.0.1:10804" in SessionStart output
- `curl http://127.0.0.1:10804/api/version` → returns version string
- `argus-stop.sh` → process killed, "argus stopped" printed
- Open another Claude Code session → argus auto-restarts via start-argus.sh
- Trigger one Claude Code tool call → event appears in dashboard
