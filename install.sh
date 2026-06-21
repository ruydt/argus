#!/bin/bash
set -e

REPO="ruydt/argus"
ARGUS_DIR="$HOME/.argus"
BINARY_DIR="$ARGUS_DIR/bin"
BINARY="$BINARY_DIR/argus"
HOOKS_DIR="$ARGUS_DIR/hooks"
ACTIVATE_SCRIPT="$HOOKS_DIR/argus-activate.js"
ARGUS_PORT=10804

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

echo "Fetching latest argus release..."
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

ARCHIVE="argus_${VERSION#v}_${OS}_${ARCH}.tar.gz"
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

echo "Installing argus..."
mkdir -p "$BINARY_DIR"
tar -xzf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR"
[ -f "$WORK_DIR/argus" ] || { echo "error: binary not found in archive — check release assets" >&2; exit 1; }
mv "$WORK_DIR/argus" "$BINARY"
chmod +x "$BINARY"
echo "  → $BINARY"

# ── 5. Write argus-activate.js (SessionStart hook; starts the server itself) ──

mkdir -p "$HOOKS_DIR"
# BINARY path is interpolated by the shell; all \${...} are JS template literals.
cat > "$ACTIVATE_SCRIPT" << SCRIPTEOF
#!/usr/bin/env node
// @argus-meta
// title: Argus session start
// author: argus
// event: SessionStart
// runtime: node
// purpose: Start the Argus server and show a liveness banner at session start.
// @end
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const db = path.join(os.homedir(), '.argus', 'argus.db');
const logPath = path.join(os.homedir(), '.argus', 'argus.log');
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
const url = 'http://127.0.0.1:10804';
const binary = '${BINARY}';
const isClaudeCode = process.env.CLAUDECODE === '1';

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

function emit(msg) {
  if (isClaudeCode) {
    process.stdout.write(JSON.stringify({ systemMessage: msg }));
  } else {
    process.stdout.write(msg);
  }
}

function logScript(level, msg) {
  try {
    fs.appendFileSync(scriptLog, \`\${new Date().toISOString()} argus-activate.js \${level} \${msg}\n\`);
  } catch (_) {}
}

// Launch the server detached so it outlives this hook process. Output goes to
// argus.log; the child is fully unref'd so the agent isn't held open.
function startServer() {
  try {
    fs.mkdirSync(path.dirname(db), { recursive: true });
  } catch (_) {}
  let out;
  try {
    out = fs.openSync(logPath, 'a');
  } catch (_) {
    out = 'ignore';
  }
  const child = spawn(binary, [], {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, DB_PATH: db, ADDR: '127.0.0.1:10804' },
  });
  child.unref();
}

async function main() {
  logScript('INFO', 'start');
  let up = await isServerUp();
  if (!up) {
    logScript('WARN', 'server offline; launching');
    startServer();
    await sleep(1200);
    up = await isServerUp();
  }
  if (!up) {
    logScript('ERROR', 'server offline after start attempt');
    emit(isClaudeCode ? '\x1b[1m\x1b[31mARGUS offline\x1b[0m' : 'ARGUS offline');
    return;
  }
  let msg;
  try {
    const result = execSync(
      \`sqlite3 "\${db}" "SELECT COUNT(*), COUNT(DISTINCT session_id) FROM hook_events"\`,
      { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
    const [events, sessions] = result.split('|');
    logScript('INFO', 'sqlite counts loaded');
    msg = \`ARGUS live @ \${url} | \${parseInt(events, 10).toLocaleString()} events · \${sessions.trim()} sessions\`;
  } catch (_) {
    logScript('WARN', 'sqlite counts unavailable');
    msg = \`ARGUS live @ \${url}\`;
  }
  emit(isClaudeCode ? '\x1b[35m' + msg + '\x1b[0m' : msg);
}

main().catch(err => {
  logScript('ERROR', \`activation failed: \${err && err.message ? err.message : String(err)}\`);
});
SCRIPTEOF
chmod +x "$ACTIVATE_SCRIPT"
echo "  → $ACTIVATE_SCRIPT"

# ── 6. (No hook wiring) ─────────────────────────────────────────────────────
# Argus no longer edits any agent's settings during install. The activate hook
# above is written to ~/.argus/hooks but left unwired — wire it (and the ingest
# hooks) per agent from the Hooks page in the dashboard: "Apply preset" adds the
# argus-activate.js session-start hook plus event capture for that agent.
# Run `argus start` to launch the server and open the dashboard.

# ── 7. Add ~/.argus/bin to PATH in shell rc ──────────────────────────────

PATH_LINE="export PATH=\"\$HOME/.argus/bin:\$PATH\""
# Pick the rc for the user's LOGIN shell ($SHELL), not the shell running this
# script — `curl | bash` runs under bash even when the user lives in zsh.
case "$(basename "${SHELL:-}")" in
  zsh)  SHELL_RC="$HOME/.zshrc" ;;
  bash) SHELL_RC="$HOME/.bashrc" ;;
  *)    SHELL_RC="$HOME/.profile" ;; # sane fallback for fish/other/unset
esac

PATH_UPDATED=0
if ! grep -qF '.argus/bin' "$SHELL_RC" 2>/dev/null; then
  echo "" >> "$SHELL_RC"
  echo "# argus" >> "$SHELL_RC"
  echo "$PATH_LINE" >> "$SHELL_RC"
  PATH_UPDATED=1
  echo "  → added ~/.argus/bin to PATH in $SHELL_RC"
fi

echo ""
echo "argus $VERSION installed."
echo "Activate hook: $ACTIVATE_SCRIPT"
echo ""
echo "Next steps:"
# The PATH change above only applies to NEW shells, so `argus` is not yet on the
# PATH of the terminal running this installer. Give a command that works now.
echo "  1. Start the server right now:"
echo "       ~/.argus/bin/argus start"
if [ "$PATH_UPDATED" = "1" ]; then
  echo "  2. Or open a new terminal (or run: source $SHELL_RC), then: argus start"
else
  echo "  2. In new terminals you can just run: argus start"
fi
