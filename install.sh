#!/bin/bash
set -e

BINARY_DIR="$HOME/.local/bin"
BINARY="$BINARY_DIR/hooker-monitor"
STARTUP_SCRIPT="$BINARY_DIR/start-hooker.sh"
SETTINGS="$HOME/.claude/settings.json"
HOOKER_PORT=8765

# ── 1. build ────────────────────────────────────────────────────────────────

if ! command -v go &>/dev/null; then
    echo "error: go not found — install Go 1.25+ first" >&2
    exit 1
fi

echo "Building hooker-monitor..."
mkdir -p "$BINARY_DIR"
(cd "$(dirname "$0")/backend" && go build -o "$BINARY" ./cmd/server)
echo "  → $BINARY"

# ── 2. startup script ────────────────────────────────────────────────────────

cat > "$STARTUP_SCRIPT" << EOF
#!/bin/bash
# Start hooker-monitor if not already running on port $HOOKER_PORT.

HOOKER_PORT=$HOOKER_PORT
DB_DIR="\$HOME/.hooker"
DB_PATH="\$DB_DIR/hooker.db"
LOG_PATH="\$DB_DIR/hooker.log"
BINARY="$BINARY"

mkdir -p "\$DB_DIR"

if lsof -ti:"\$HOOKER_PORT" > /dev/null 2>&1; then
    echo '{"continue":true,"suppressOutput":true}'
    exit 0
fi

DB_PATH="\$DB_PATH" ADDR="127.0.0.1:\$HOOKER_PORT" \\
    nohup "\$BINARY" >> "\$LOG_PATH" 2>&1 &

echo '{"continue":true,"suppressOutput":true}'
EOF
chmod +x "$STARTUP_SCRIPT"
echo "  → $STARTUP_SCRIPT"

# ── 3. wire Claude Code SessionStart hook ────────────────────────────────────

if ! command -v python3 &>/dev/null; then
    echo "warning: python3 not found — add this to ~/.claude/settings.json manually:"
    echo '  "hooks": { "SessionStart": [{ "hooks": [{ "type": "command", "command": "'"$STARTUP_SCRIPT"'" }] }] }'
    exit 0
fi

python3 - "$SETTINGS" "$STARTUP_SCRIPT" << 'PYEOF'
import json, sys, os

settings_path = sys.argv[1]
startup_script = sys.argv[2]

settings = {}
if os.path.exists(settings_path):
    with open(settings_path) as f:
        try:
            settings = json.load(f)
        except json.JSONDecodeError:
            pass

new_hook = {"type": "command", "command": startup_script}

hooks = settings.setdefault("hooks", {})
session_start = hooks.setdefault("SessionStart", [])

# Check if our script is already registered.
for entry in session_start:
    for h in entry.get("hooks", []):
        if h.get("command") == startup_script:
            print(f"  → hook already registered in {settings_path}")
            sys.exit(0)

session_start.append({"hooks": [new_hook]})

os.makedirs(os.path.dirname(settings_path), exist_ok=True)
with open(settings_path, "w") as f:
    json.dump(settings, f, indent=2)

print(f"  → hook registered in {settings_path}")
PYEOF

echo ""
echo "Done. hooker-monitor will start automatically on 'claude'."
echo "UI: http://127.0.0.1:$HOOKER_PORT"
