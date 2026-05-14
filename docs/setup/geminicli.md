# Gemini CLI Setup

**Step 1 — Create the hook script:**

```bash
mkdir -p ~/.gemini/hooks
cat > ~/.gemini/hooks/hooker-gemini.sh << 'EOF'
#!/bin/bash
cat - > /tmp/hooker-current.json
curl -s -X POST http://127.0.0.1:8765/api/hook \
  -H "Content-Type: application/json" \
  -d @/tmp/hooker-current.json
EOF
chmod +x ~/.gemini/hooks/hooker-gemini.sh
```

**Step 2 — Configure `~/.gemini/settings.json`:**

```json
{
  "hooks": {
    "SessionStart": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ],
    "SessionEnd": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ],
    "BeforeAgent": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ],
    "AfterAgent": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ],
    "BeforeModel": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ],
    "AfterModel": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ],
    "BeforeTool": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
        ]
      }
    ],
    "AfterTool": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
        ]
      }
    ],
    "Notification": [
      { "type": "command", "command": "$HOME/.gemini/hooks/hooker-gemini.sh" }
    ]
  }
}
```

*Note: If `$HOME` is not expanded by Gemini CLI, replace `$HOME` with your absolute home path.*
