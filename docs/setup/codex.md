# Codex Setup

## Step 1: Enable hooks in Codex

`~/.codex/config.toml`:

```toml
[features]
codex_hooks = true
```

## Step 2: Configure hook entries

### Option A: UI preset (recommended)

Open the Hooker dashboard → **Hooks Config** → **Codex** tab → **Apply preset** → choose Baseline, Medium, or Full → **Save**.

Hooker writes entries to `~/.codex/hooks.json` without touching your existing config.

See [docs/hooks.md](../hooks.md) for what each preset captures and how to manage installed hooks.

### Option B: Manual JSON

Create or update `~/.codex/hooks.json`. The Baseline equivalent:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s --max-time 2 -X POST http://127.0.0.1:10804/api/hook -H 'Content-Type: application/json' -d @- || true",
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s --max-time 2 -X POST http://127.0.0.1:10804/api/hook -H 'Content-Type: application/json' -d @- || true",
            "timeout": 5
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
            "command": "curl -s --max-time 2 -X POST http://127.0.0.1:10804/api/hook -H 'Content-Type: application/json' -d @- || true",
            "timeout": 5
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s --max-time 2 -X POST http://127.0.0.1:10804/api/hook -H 'Content-Type: application/json' -d @- || true",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

## Step 3: Trust hook hashes

After saving `hooks.json`, run `codex`, open `/hooks`, and trust the updated hook hashes.
