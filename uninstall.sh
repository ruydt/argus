#!/bin/bash
set -e

ARGUS_DIR="$HOME/.argus"
BINARY_DIR="$ARGUS_DIR/bin"
START_SCRIPT="$BINARY_DIR/start-argus.sh"
ACTIVATE_SCRIPT="$ARGUS_DIR/hooks/argus-activate.js"
SETTINGS="$HOME/.claude/settings.json"
ARGUS_PORT=10804

echo "Uninstalling argus..."

# ── 1. stop server ────────────────────────────────────────────────────────────

PID="$(lsof -ti:$ARGUS_PORT 2>/dev/null || true)"
if [ -n "$PID" ]; then
  echo "$PID" | xargs kill 2>/dev/null || true
  echo "  → stopped argus (port $ARGUS_PORT)"
fi

# ── 2. remove hooks from ~/.claude/settings.json ─────────────────────────────

if command -v python3 &>/dev/null && [ -f "$SETTINGS" ]; then
  python3 - "$SETTINGS" "$START_SCRIPT" "$ACTIVATE_SCRIPT" << 'PYEOF'
import json, sys, os

settings_path, start_script, activate_script = sys.argv[1], sys.argv[2], sys.argv[3]
activate_cmd = f'node "{activate_script}"'

try:
    with open(settings_path) as f:
        settings = json.load(f)
except (json.JSONDecodeError, FileNotFoundError):
    sys.exit(0)

hooks = settings.get("hooks", {})
session_start = hooks.get("SessionStart", [])

def matches(entry):
    for h in entry.get("hooks", []):
        cmd = h.get("command", "")
        # remove both old start hook and activate hook (either install layout)
        if cmd == start_script or cmd == activate_cmd:
            return True
    return False

before = len(session_start)
session_start[:] = [e for e in session_start if not matches(e)]
removed = before - len(session_start)

if removed:
    hooks["SessionStart"] = session_start
    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=2)
    print(f"  → removed {removed} hook(s) from {settings_path}")
PYEOF
fi

# ── 3. remove PATH line from shell rc ────────────────────────────────────────

for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
  if [ -f "$rc" ] && grep -q '.argus/bin' "$rc" 2>/dev/null; then
    grep -v '.argus/bin' "$rc" | grep -v '^# argus$' > "${rc}.tmp" && mv "${rc}.tmp" "$rc"
    echo "  → removed PATH entry from $rc"
  fi
done

# ── 4. remove ~/.argus ───────────────────────────────────────────────────────

if [ -d "$ARGUS_DIR" ]; then
  rm -rf "$ARGUS_DIR"
  echo "  → removed $ARGUS_DIR"
fi

echo ""
echo "argus uninstalled."
