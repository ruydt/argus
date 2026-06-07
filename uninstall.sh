#!/bin/bash
set -e

HOOKER_DIR="$HOME/.hooker"
BINARY_DIR="$HOOKER_DIR/bin"
BINARY="$BINARY_DIR/hooker"
START_SCRIPT="$BINARY_DIR/start-hooker.sh"
STOP_SCRIPT="$BINARY_DIR/hooker-stop.sh"
HOOKS_DIR="$HOOKER_DIR/hooks"
ACTIVATE_SCRIPT="$HOOKS_DIR/hooker-activate.js"
DATA_DIR="$HOOKER_DIR"
SETTINGS="$HOME/.claude/settings.json"
HOOKER_PORT=10804

echo "Uninstalling hooker..."

# ── 1. stop server ────────────────────────────────────────────────────────────

PID="$(lsof -ti:$HOOKER_PORT 2>/dev/null || true)"
if [ -n "$PID" ]; then
  echo "$PID" | xargs kill 2>/dev/null || true
  echo "  → stopped hooker (port $HOOKER_PORT)"
fi

# ── 2. remove binaries and scripts ────────────────────────────────────────────

for f in "$BINARY" "$START_SCRIPT" "$STOP_SCRIPT" "$ACTIVATE_SCRIPT"; do
  if [ -f "$f" ]; then
    rm -f "$f"
    echo "  → removed $f"
  fi
done

if [ -d "$HOOKS_DIR" ] && [ -z "$(ls -A "$HOOKS_DIR" 2>/dev/null)" ]; then
  rmdir "$HOOKS_DIR"
fi

# ── 3. remove hooks from ~/.claude/settings.json ─────────────────────────────

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

# ── 4. remove PATH line from shell rc ────────────────────────────────────────

for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
  if [ -f "$rc" ] && grep -q '.hooker/bin' "$rc" 2>/dev/null; then
    grep -v '.hooker/bin' "$rc" | grep -v '^# hooker$' > "${rc}.tmp" && mv "${rc}.tmp" "$rc"
    echo "  → removed PATH entry from $rc"
  fi
done

# ── 5. data directory ─────────────────────────────────────────────────────────

if [ -d "$DATA_DIR" ]; then
  echo ""
  echo "Data directory: $DATA_DIR"
  echo "  Contains: hooker.db (events), hooker.log, bin/, hooks/"
  printf "  Remove all data? [y/N] "
  read -r answer
  if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    rm -rf "$DATA_DIR"
    echo "  → removed $DATA_DIR"
  else
    echo "  → kept (delete manually: rm -rf $DATA_DIR)"
  fi
fi

echo ""
echo "hooker uninstalled."
