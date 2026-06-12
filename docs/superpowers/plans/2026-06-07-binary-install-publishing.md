# Binary Install & Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace source-build `install.sh` with a binary-download script so any user can install argus with one curl command and zero Go/Node/pnpm toolchain.

**Architecture:** GoReleaser already builds cross-platform binaries on `v*` tag push. `install.sh` rewrites to detect OS/arch, download from GitHub Releases, verify SHA256, install binary + helper scripts, and wire Claude Code SessionStart hooks. A Node.js activate script prints live status on each session start.

**Tech Stack:** bash (install.sh), Node.js (argus-activate.js), Python 3 (hook wiring), SQLite CLI (stats query), GitHub Releases API, GoReleaser

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `install.sh` | Rewrite | Binary-download install, scripts, hook wiring |
| `README.md` | Update | Replace quickstart with curl command |
| `VERSION` | Update | Bump from `0.0.0-dev` to `0.1.0` |
| `docs/install.md` | Update | Fix binary name, update quickstart section |
| `docs/quickstart.md` | Update | Replace source build steps with curl |

---

## Task 1: Rewrite `install.sh`

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Replace file header and constants**

```bash
#!/bin/bash
set -e

REPO="duytrandt04-afk/argus"
BINARY_DIR="$HOME/.local/bin"
BINARY="$BINARY_DIR/argus"
START_SCRIPT="$BINARY_DIR/start-argus.sh"
STOP_SCRIPT="$BINARY_DIR/argus-stop.sh"
HOOKS_DIR="$HOME/.argus/hooks"
ACTIVATE_SCRIPT="$HOOKS_DIR/argus-activate.js"
SETTINGS="$HOME/.claude/settings.json"
ARGUS_PORT=10804
```

- [ ] **Step 2: Add OS/arch detection block**

```bash
# ── 1. detect platform ──────────────────────────────────────────────────────

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)
    echo "error: unsupported architecture: $ARCH" >&2
    echo "Download manually from: https://github.com/$REPO/releases/latest" >&2
    exit 1
    ;;
esac

case "$OS" in
  linux|darwin) ;;
  *)
    echo "error: unsupported OS: $OS" >&2
    echo "Download manually from: https://github.com/$REPO/releases/latest" >&2
    exit 1
    ;;
esac
```

- [ ] **Step 3: Add release version fetch**

```bash
# ── 2. fetch latest release tag ─────────────────────────────────────────────

echo "Fetching latest argus release..."
VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep '"tag_name"' \
  | sed 's/.*"tag_name": *"\(.*\)".*/\1/')"

if [ -z "$VERSION" ]; then
  echo "error: could not fetch latest release from GitHub API" >&2
  echo "Download manually from: https://github.com/$REPO/releases/latest" >&2
  exit 1
fi

echo "  version: $VERSION"
```

- [ ] **Step 4: Add binary download and SHA256 verification**

```bash
# ── 3. download and verify ──────────────────────────────────────────────────

ARCHIVE="argus_${VERSION#v}_${OS}_${ARCH}.tar.gz"
BASE_URL="https://github.com/$REPO/releases/download/$VERSION"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading $ARCHIVE..."
curl -fsSL "$BASE_URL/$ARCHIVE" -o "$TMPDIR/$ARCHIVE"
curl -fsSL "$BASE_URL/checksums.txt" -o "$TMPDIR/checksums.txt"

echo "Verifying checksum..."
cd "$TMPDIR"
if command -v sha256sum &>/dev/null; then
  grep "$ARCHIVE" checksums.txt | sha256sum --check --status
elif command -v shasum &>/dev/null; then
  grep "$ARCHIVE" checksums.txt | shasum -a 256 --check --status
else
  echo "warning: no sha256sum or shasum found — skipping checksum verification" >&2
fi
cd - >/dev/null
```

- [ ] **Step 5: Add extraction and binary install**

```bash
# ── 4. install binary ────────────────────────────────────────────────────────

echo "Installing argus..."
mkdir -p "$BINARY_DIR"
tar -xzf "$TMPDIR/$ARCHIVE" -C "$TMPDIR"
mv "$TMPDIR/argus" "$BINARY"
chmod +x "$BINARY"
echo "  → $BINARY"
```

- [ ] **Step 6: Write start-argus.sh**

```bash
# ── 5. startup script ────────────────────────────────────────────────────────

cat > "$START_SCRIPT" << EOF
#!/bin/bash
ARGUS_PORT=$ARGUS_PORT
DB_DIR="\$HOME/.argus"
DB_PATH="\$DB_DIR/argus.db"
LOG_PATH="\$DB_DIR/argus.log"

mkdir -p "\$DB_DIR"

if lsof -ti:"\$ARGUS_PORT" > /dev/null 2>&1; then
  echo '{"continue":true,"suppressOutput":true}'
  exit 0
fi

DB_PATH="\$DB_PATH" ADDR="127.0.0.1:\$ARGUS_PORT" \\
  nohup "$BINARY" >> "\$LOG_PATH" 2>&1 &

echo '{"continue":true,"suppressOutput":true}'
EOF
chmod +x "$START_SCRIPT"
echo "  → $START_SCRIPT"
```

- [ ] **Step 7: Write argus-stop.sh**

```bash
# ── 6. stop script ───────────────────────────────────────────────────────────

cat > "$STOP_SCRIPT" << 'EOF'
#!/bin/bash
PID=$(lsof -ti:10804)
if [ -z "$PID" ]; then
  echo "argus not running"
  exit 0
fi
kill "$PID" && echo "argus stopped"
EOF
chmod +x "$STOP_SCRIPT"
echo "  → $STOP_SCRIPT"
```

- [ ] **Step 8: Write argus-activate.js**

```bash
# ── 7. activate script ──────────────────────────────────────────────────────

mkdir -p "$HOOKS_DIR"
cat > "$ACTIVATE_SCRIPT" << 'EOF'
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
EOF
chmod +x "$ACTIVATE_SCRIPT"
echo "  → $ACTIVATE_SCRIPT"
```

- [ ] **Step 9: Wire both SessionStart hooks via Python**

```bash
# ── 8. wire Claude Code hooks ────────────────────────────────────────────────

if ! command -v python3 &>/dev/null; then
  echo "warning: python3 not found — add hooks manually to ~/.claude/settings.json"
  echo "  start: $START_SCRIPT"
  echo "  notify: node $ACTIVATE_SCRIPT"
else
  python3 - "$SETTINGS" "$START_SCRIPT" "$ACTIVATE_SCRIPT" << 'PYEOF'
import json, sys, os

settings_path, start_script, activate_script = sys.argv[1], sys.argv[2], sys.argv[3]

settings = {}
if os.path.exists(settings_path):
    with open(settings_path) as f:
        try:
            settings = json.load(f)
        except json.JSONDecodeError:
            pass

hooks = settings.setdefault("hooks", {})
session_start = hooks.setdefault("SessionStart", [])

def already_registered(cmd):
    for entry in session_start:
        for h in entry.get("hooks", []):
            if h.get("command") == cmd:
                return True
    return False

added = []
if not already_registered(start_script):
    session_start.append({"hooks": [{"type": "command", "command": start_script}]})
    added.append("start")

activate_cmd = f"node {activate_script}"
if not already_registered(activate_cmd):
    session_start.append({"hooks": [{"type": "command", "command": activate_cmd}]})
    added.append("notify")

if added:
    os.makedirs(os.path.dirname(settings_path), exist_ok=True)
    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=2)
    print(f"  → hooks registered in {settings_path}: {', '.join(added)}")
else:
    print(f"  → hooks already registered in {settings_path}")
PYEOF
fi
```

- [ ] **Step 10: Add PATH warning and completion message**

```bash
# ── 9. PATH check and done ──────────────────────────────────────────────────

if ! echo "$PATH" | grep -q "$BINARY_DIR"; then
  echo ""
  echo "warning: $BINARY_DIR is not in your PATH."
  echo "  Add to your shell profile (~/.zshrc or ~/.bashrc):"
  echo "  export PATH=\"$BINARY_DIR:\$PATH\""
fi

echo ""
echo "argus $VERSION installed."
echo "Start:  $START_SCRIPT"
echo "Stop:   $STOP_SCRIPT"
echo "UI:     http://127.0.0.1:$ARGUS_PORT"
echo ""
echo "Restart Claude Code or Codex — argus starts automatically."
```

- [ ] **Step 11: Smoke test the full script locally**

Run from repo root (no GitHub release exists yet — test will fail at version fetch, which is expected):
```bash
bash -n install.sh  # syntax check
echo "Syntax OK"
```

Expected: `Syntax OK` with no errors.

- [ ] **Step 12: Commit**

```bash
git add install.sh
git commit -m "feat(install): rewrite install.sh to download pre-built binary from GitHub Releases"
```

---

## Task 2: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace quickstart block**

Open `README.md` and replace the entire `## Quick start` section with:

```markdown
## Quick start

```bash
curl -fsSL https://raw.githubusercontent.com/duytrandt04-afk/argus/main/install.sh | bash
```

> **Requirements:** Node.js 18+, curl, tar — no Go or pnpm needed.
>
> The installer downloads a pre-built binary for your OS/arch, wires the Claude Code
> `SessionStart` hook, and places `argus` in `~/.argus/bin`.

Open **http://127.0.0.1:10804** after your next Claude Code or Codex session starts.

Then follow [docs/quickstart.md](docs/quickstart.md) to verify your first event.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README quickstart to curl one-liner"
```

---

## Task 3: Update docs/quickstart.md and docs/install.md

**Files:**
- Modify: `docs/quickstart.md`
- Modify: `docs/install.md`

- [ ] **Step 1: Fix quickstart.md — replace source build steps**

In `docs/quickstart.md`, replace section `## 1. Install source dependencies` and `## 2. Start backend` + `## 3. Start frontend` with:

```markdown
## 1. Install argus

```bash
curl -fsSL https://raw.githubusercontent.com/duytrandt04-afk/argus/main/install.sh | bash
```

Installs the argus binary to `~/.argus/bin/argus`, wires the `SessionStart` hook in
`~/.claude/settings.json`, and creates `~/.argus/bin/start-argus.sh`.

## 2. Start argus

Open a new Claude Code or Codex session — argus starts automatically via the
`SessionStart` hook. You will see:

```
SessionStart hook (completed)
  hook context: ARGUS live @ http://127.0.0.1:10804
```

Or start manually:
```bash
~/.argus/bin/start-argus.sh
```

Open **http://127.0.0.1:10804**.
```

Keep sections `## 4. Configure agent hooks` (rename to `## 3.`) and `## 5. Verify one event` (rename to `## 4.`) unchanged.

- [ ] **Step 2: Fix install.md — update binary name and source install section**

In `docs/install.md`:
- Change binary name from `argus-monitor` to `argus` everywhere
- Update `## Source install` to note that source install requires Go 1.25+, Node.js 18+, pnpm 10.x and is for contributors only
- Add a `## Binary install` section at the top pointing to the curl command

```markdown
## Binary install (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/duytrandt04-afk/argus/main/install.sh | bash
```

Requires: Node.js 18+, curl, tar. No Go or pnpm needed.
```

- [ ] **Step 3: Commit**

```bash
git add docs/quickstart.md docs/install.md
git commit -m "docs: update quickstart and install guide for binary install"
```

---

## Task 4: Bump VERSION and trigger release

**Files:**
- Modify: `VERSION`

- [ ] **Step 1: Bump VERSION**

```bash
echo "0.1.0" > VERSION
```

- [ ] **Step 2: Verify CI is green on main**

```bash
gh run list --branch main --limit 5
```

Expected: latest run shows `completed` / `success`. If failing, fix before tagging.

- [ ] **Step 3: Commit VERSION bump**

```bash
git add VERSION
git commit -m "chore: bump version to 0.1.0"
```

- [ ] **Step 4: Push commits to main**

```bash
git push origin main
```

- [ ] **Step 5: Tag and push**

**Warning:** This triggers the release workflow and publishes a public GitHub Release with binaries. Confirm CI is green before proceeding.

```bash
git tag v0.1.0
git push origin v0.1.0
```

- [ ] **Step 6: Monitor release workflow**

```bash
gh run list --workflow=release.yml --limit 3
```

Watch until status shows `completed`. Then verify the release exists:

```bash
gh release view v0.1.0
```

Expected output includes: 4 binary archives (`linux_amd64`, `linux_arm64`, `darwin_amd64`, `darwin_arm64`) and `checksums.txt`.

---

## Task 5: End-to-end install test

**No files changed — verification only.**

- [ ] **Step 1: Run the install script against the live release**

In a fresh terminal with no existing argus binary:
```bash
rm -f ~/.argus/bin/argus ~/.argus/bin/start-argus.sh ~/.argus/bin/argus-stop.sh
curl -fsSL https://raw.githubusercontent.com/duytrandt04-afk/argus/main/install.sh | bash
```

Expected output:
```
Fetching latest argus release...
  version: v0.1.0
Downloading argus_0.1.0_darwin_arm64.tar.gz...
Verifying checksum...
Installing argus...
  → /Users/<you>/.local/bin/argus
  → /Users/<you>/.local/bin/start-argus.sh
  → /Users/<you>/.local/bin/argus-stop.sh
  → /Users/<you>/.argus/hooks/argus-activate.js
  → hooks registered in /Users/<you>/.claude/settings.json: start, notify

argus 0.1.0 installed.
...
```

- [ ] **Step 2: Verify binary version**

```bash
~/.argus/bin/argus --version 2>/dev/null || ~/.argus/bin/argus version 2>/dev/null || curl -s http://127.0.0.1:10804/api/version
```

Expected: version string containing `0.1.0`.

- [ ] **Step 3: Verify startup hook**

```bash
~/.argus/bin/start-argus.sh
curl -fsS http://127.0.0.1:10804/api/version
```

Expected: JSON response with `"version":"0.1.0"`.

- [ ] **Step 4: Verify stop script**

```bash
~/.argus/bin/argus-stop.sh
```

Expected: `argus stopped`.

- [ ] **Step 5: Verify activate script**

```bash
node ~/.argus/hooks/argus-activate.js
```

Expected: `ARGUS live @ http://127.0.0.1:10804` (no DB yet) or with event counts if DB exists.

- [ ] **Step 6: Start new Claude Code session and verify hook fires**

Open a new `claude` session. Confirm `SessionStart hook (completed)` shows:
```
hook context: ARGUS live @ http://127.0.0.1:10804
```

- [ ] **Step 7: Trigger one tool event**

Run any Claude Code command that calls a tool (read a file, run a bash command). Open `http://127.0.0.1:10804` and confirm the event appears in the dashboard.
