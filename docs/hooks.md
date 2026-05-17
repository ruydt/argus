# Hooks

Hooker receives agent events at:

```text
http://127.0.0.1:8765/api/hook
```

Start the backend before using hooks. Hook delivery fails while the backend is
offline.

## Codex

Enable Codex hooks in `~/.codex/config.toml`:

```toml
[features]
codex_hooks = true
```

Create or update `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
            "timeout": 5
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
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
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
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
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
            "timeout": 5
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
            "timeout": 5
          }
        ]
      }
    ],
    "PostCompact": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
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
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

After editing `hooks.json`, run `codex`, open `/hooks`, and trust the updated
hook hashes.

## Claude Code

Create or update `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-"
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
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ]
  }
}
```

## Gemini CLI

Gemini CLI support is experimental. Existing setup remains in
[docs/setup/geminicli.md](setup/geminicli.md).

## Validate hook delivery

With backend running:

```bash
curl -fsS http://127.0.0.1:8765/api/version
```

Then run one prompt in your configured agent and confirm an event appears in the
dashboard.
