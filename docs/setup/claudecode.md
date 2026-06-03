# Claude Code Setup

## Option 1: UI preset (recommended)

Open the Hooker dashboard → **Hooks Config** → **Claude Code** tab → **Apply preset** → choose Baseline, Medium, or Full → **Save**.

Hooker writes the hook entries to `~/.claude/settings.json` without touching your existing config.

See [docs/hooks.md](../hooks.md) for what each preset captures and how to manage installed hooks.

## Option 2: Manual JSON

Add entries to `~/.claude/settings.json`. The Baseline equivalent:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s --max-time 2 -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @- || true"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s --max-time 2 -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @- || true"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s --max-time 2 -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @- || true"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s --max-time 2 -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @- || true"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s --max-time 2 -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @- || true"
          }
        ]
      }
    ]
  }
}
```

Claude Code picks up settings changes automatically — no restart needed.
