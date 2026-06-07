#!/bin/bash
set -e

REPO="duytrandt04-afk/hooker"
HOOKER_DIR="$HOME/.hooker"
BINARY_DIR="$HOOKER_DIR/bin"
BINARY="$BINARY_DIR/hooker"
START_SCRIPT="$BINARY_DIR/start-hooker.sh"
STOP_SCRIPT="$BINARY_DIR/hooker-stop.sh"
HOOKS_DIR="$HOOKER_DIR/hooks"
ACTIVATE_SCRIPT="$HOOKS_DIR/hooker-activate.js"
SETTINGS="$HOME/.claude/settings.json"
HOOKER_PORT=10804

# ── 1. OS/arch detection ────────────────────────────────────────────────────

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

# ── 2. Fetch latest release tag ─────────────────────────────────────────────

echo "Fetching latest hooker release..."
VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
  | grep '"tag_name"' \
  | grep -o '"tag_name": *"[^"]*"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"

if [ -z "$VERSION" ]; then
  echo "error: could not fetch latest release from GitHub API" >&2
  echo "Download manually from: https://github.com/$REPO/releases/latest" >&2
  exit 1
fi
echo "  version: $VERSION"

# ── 3. Download archive + checksums, verify SHA256 ───────────────────────────

ARCHIVE="hooker_${VERSION#v}_${OS}_${ARCH}.tar.gz"
BASE_URL="https://github.com/$REPO/releases/download/$VERSION"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo "Downloading $ARCHIVE..."
curl -fsSL "$BASE_URL/$ARCHIVE" -o "$WORK_DIR/$ARCHIVE"
curl -fsSL "$BASE_URL/checksums.txt" -o "$WORK_DIR/checksums.txt"

echo "Verifying checksum..."
cd "$WORK_DIR"
if [ "$OS" = "darwin" ]; then
  grep -F "  $ARCHIVE" checksums.txt | shasum -a 256 --check --status
elif command -v sha256sum &>/dev/null; then
  grep -F "  $ARCHIVE" checksums.txt | sha256sum --check --status
elif command -v shasum &>/dev/null; then
  grep -F "  $ARCHIVE" checksums.txt | shasum -a 256 --check --status
else
  echo "warning: no sha256sum or shasum found — skipping checksum verification" >&2
fi
cd - >/dev/null

# ── 4. Extract and install binary ──────────────────────────────────────────

echo "Installing hooker..."
mkdir -p "$BINARY_DIR"
tar -xzf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR"
[ -f "$WORK_DIR/hooker" ] || { echo "error: binary not found in archive — check release assets" >&2; exit 1; }
mv "$WORK_DIR/hooker" "$BINARY"
chmod +x "$BINARY"
echo "  → $BINARY"

# ── 5. Write start-hooker.sh ───────────────────────────────────────────────

cat > "$START_SCRIPT" << EOF
#!/bin/bash
BINARY_PATH="$BINARY"
HOOKER_PORT=$HOOKER_PORT
DB_DIR="\$HOME/.hooker"
DB_PATH="\$DB_DIR/hooker.db"
LOG_PATH="\$DB_DIR/hooker.log"

mkdir -p "\$DB_DIR"

if lsof -ti:"\$HOOKER_PORT" > /dev/null 2>&1; then
  echo '{"continue":true,"suppressOutput":true}'
  exit 0
fi

DB_PATH="\$DB_PATH" ADDR="127.0.0.1:\$HOOKER_PORT" \\
  nohup "\$BINARY_PATH" >> "\$LOG_PATH" 2>&1 &

echo '{"continue":true,"suppressOutput":true}'
EOF
chmod +x "$START_SCRIPT"
echo "  → $START_SCRIPT"

# ── 6. Write hooker-stop.sh ────────────────────────────────────────────────

cat > "$STOP_SCRIPT" << EOF
#!/bin/bash
PID=\$(lsof -ti:$HOOKER_PORT)
if [ -z "\$PID" ]; then
  echo "hooker not running"
  exit 0
fi
echo "\$PID" | xargs kill && echo "hooker stopped"
EOF
chmod +x "$STOP_SCRIPT"
echo "  → $STOP_SCRIPT"

# ── 7. Write hooker-activate.js ────────────────────────────────────────────

mkdir -p "$HOOKS_DIR"
# Write activate script with START_SCRIPT path interpolated, rest heredoc-quoted
cat > "$ACTIVATE_SCRIPT" << SCRIPTEOF
#!/usr/bin/env node
const { execSync, spawnSync } = require('child_process');
const net = require('net');
const os = require('os');
const path = require('path');
const db = path.join(os.homedir(), '.hooker', 'hooker.db');
const url = 'http://127.0.0.1:10804';
const startScript = '${START_SCRIPT}';

function isServerUp() {
  return new Promise(resolve => {
    const sock = net.createConnection({ host: '127.0.0.1', port: 10804 });
    sock.setTimeout(500);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('error', () => resolve(false));
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  let up = await isServerUp();
  if (!up) {
    spawnSync('bash', [startScript], { stdio: 'ignore' });
    await sleep(1200);
    up = await isServerUp();
  }
  if (!up) {
    process.stdout.write('HOOKER offline');
    return;
  }
  let output;
  try {
    const result = execSync(
      \`sqlite3 "\${db}" "SELECT COUNT(*), COUNT(DISTINCT session_id) FROM hook_events"\`,
      { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    const [events, sessions] = result.split('|');
    output = \`HOOKER live @ \${url} | \${parseInt(events, 10).toLocaleString()} events · \${sessions.trim()} sessions\`;
  } catch (_) {
    output = \`HOOKER live @ \${url}\`;
  }
  process.stdout.write(output);
}

main();
SCRIPTEOF
chmod +x "$ACTIVATE_SCRIPT"
echo "  → $ACTIVATE_SCRIPT"

# ── 8. Wire SessionStart hooks in ~/.claude/settings.json ───────────────────

if ! command -v python3 &>/dev/null; then
  echo "warning: python3 not found — add hook manually to ~/.claude/settings.json"
  echo "  node \"$ACTIVATE_SCRIPT\""
else
  python3 - "$SETTINGS" "$ACTIVATE_SCRIPT" << 'PYEOF'
import json, sys, os

settings_path, activate_script = sys.argv[1], sys.argv[2]

settings = {}
if os.path.exists(settings_path):
    with open(settings_path) as f:
        try:
            settings = json.load(f)
        except json.JSONDecodeError as e:
            print(f"error: {settings_path} contains invalid JSON: {e}", file=sys.stderr)
            print("Fix the JSON manually, then re-run install.sh", file=sys.stderr)
            sys.exit(1)

hooks = settings.setdefault("hooks", {})
session_start = hooks.setdefault("SessionStart", [])

activate_cmd = f'node "{activate_script}"'

def already_registered(cmd):
    for entry in session_start:
        for h in entry.get("hooks", []):
            if h.get("command") == cmd:
                return True
    return False

if not already_registered(activate_cmd):
    session_start.append({"hooks": [{"type": "command", "command": activate_cmd}]})
    os.makedirs(os.path.dirname(settings_path), exist_ok=True)
    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=2)
    print(f"  → hook registered in {settings_path}")
else:
    print(f"  → hooks already registered in {settings_path}")
PYEOF
fi

# ── 9. Add ~/.hooker/bin to PATH in shell rc ──────────────────────────────

PATH_LINE="export PATH=\"\$HOME/.hooker/bin:\$PATH\""
SHELL_RC=""
if [ -n "$ZSH_VERSION" ] || [ "$(basename "$SHELL")" = "zsh" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ] || [ "$(basename "$SHELL")" = "bash" ]; then
  SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ] && ! grep -qF '.hooker/bin' "$SHELL_RC" 2>/dev/null; then
  echo "" >> "$SHELL_RC"
  echo "# hooker" >> "$SHELL_RC"
  echo "$PATH_LINE" >> "$SHELL_RC"
  echo "  → added ~/.hooker/bin to PATH in $SHELL_RC"
  echo "    (run: source $SHELL_RC)"
fi

echo ""
echo "hooker $VERSION installed."
echo "Start:  $START_SCRIPT"
echo "Stop:   $STOP_SCRIPT"
echo "UI:     http://127.0.0.1:$HOOKER_PORT"
echo ""
echo "Restart Claude Code or Codex — hooker starts automatically."
