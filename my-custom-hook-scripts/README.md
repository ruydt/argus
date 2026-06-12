# my-custom-hook-scripts

Standalone hook scripts for Claude Code and Codex. Zero dependencies — each file
is self-contained and can be copied anywhere. All scripts fail open: any internal
error exits 0 (blockers emit a harmless `{}`) so a hook bug never blocks the agent. Scripts log to
`~/.argus/hook-scripts.log`.

Agent detection: `CLAUDECODE=1` env var → Claude Code (JSON hook output);
otherwise Codex (plain text / exit codes).

## Scripts

| Script | Hook event | Purpose |
| --- | --- | --- |
| `block-dangerous.js` | PreToolUse (`Bash`) | Deny dangerous shell commands (`rm -rf ~`, `curl \| sh`, force-push to main, `mkfs`, ...) with a reason the agent can act on. |
| `protect-secrets.js` | PreToolUse (`Read\|Edit\|Write\|Bash`) | Deny access to secret files (`.env`, `*.pem`, `~/.ssh/`, `~/.aws/`, ...). `.env.example/sample/template` and `secrets.test/spec.*` files are allowed. |
| `cost-warn.js` | SessionStart | Warn when token usage in the rolling 5h window (from the local argus DB) crosses a threshold. Silent otherwise. |
| `permission-request.js` | PermissionRequest | Native macOS approval dialog with an "Always" list. |
| `stop.js` | Stop | Local notification when the agent finishes. |
| `argus-activate-local.js` | SessionStart | Argus liveness banner with event/session counts. |
| `format-lint.js` | PostToolUse (`Edit\|Write\|MultiEdit`) | Auto-format the edited file (prettier/ruff/gofmt, single-file scope) and feed lint errors back as `{"decision":"block","reason":...}` so the agent fixes them. |
| `protect-branch.js` | PreToolUse (`Bash`) | Deny `git commit`/`git push`/branch deletion on protected branches (default `main`, `master`); suggests a feature branch. Worktree-safe, quiet on detached HEAD. |
| `notify-webhook.js` | Stop, SubagentStop, Notification | Slack / Discord / ntfy / Telegram / custom webhook when the agent finishes or needs attention. Rate-limited; silent without config. |
| `git-autostage.js` | Stop | Opt-in checkpoint per agent turn: `git add -u` (tracked files only — never sweeps a new `.env`), optional local commit, never pushes. |
| `scan-injection.js` | PostToolUse (`Read\|WebFetch\|WebSearch\|Grep\|Bash\|Task` or `mcp__.*`) | Warn-only prompt-injection scanner on tool output (instruction override, fake system context, hidden directives, exfiltration nudges). Injects a caution into context instead of blocking. |
| `inject-context.js` | UserPromptSubmit | Inject just-in-time context per prompt: git branch + working-tree state, plus `<cwd>/.argus-context.md` or `~/.argus/context.md` if present. |

## Claude Code wiring (`~/.claude/settings.json`)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node /path/to/my-custom-hook-scripts/block-dangerous.js" }]
      },
      {
        "matcher": "Read|Edit|Write|Bash",
        "hooks": [{ "type": "command", "command": "node /path/to/my-custom-hook-scripts/protect-secrets.js" }]
      }
    ],
    "SessionStart": [
      {
        "hooks": [{ "type": "command", "command": "node /path/to/my-custom-hook-scripts/cost-warn.js" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "node /path/to/my-custom-hook-scripts/format-lint.js" }]
      },
      {
        "matcher": "Read|WebFetch|WebSearch|Grep|Bash|Task",
        "hooks": [{ "type": "command", "command": "node /path/to/my-custom-hook-scripts/scan-injection.js" }]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [{ "type": "command", "command": "node /path/to/my-custom-hook-scripts/inject-context.js" }]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node /path/to/my-custom-hook-scripts/notify-webhook.js" },
          { "type": "command", "command": "node /path/to/my-custom-hook-scripts/git-autostage.js" }
        ]
      }
    ]
  }
}
```

Add `protect-branch.js` next to `block-dangerous.js` under the `Bash` matcher in
`PreToolUse` to enable branch protection.

## Configuration (all optional, in `~/.argus/`)

| File | Shape | Used by |
| --- | --- | --- |
| `dangerous-patterns.json` | `{ "extra": ["<regex>"], "allow": ["<regex>"] }` | `block-dangerous.js` |
| `protected-paths.json` | `{ "extra": ["<regex>"], "allow": ["<regex>"] }` | `protect-secrets.js` |
| `cost-warn.json` | `{ "threshold_tokens": 5000000, "warn_pct": 80 }` | `cost-warn.js` |
| `format-lint.json` | `{ "disable": ["lint"], "skip_ext": [".md"], "timeout_ms": 8000 }` | `format-lint.js` |
| `protected-branches.json` | `{ "branches": ["main", "master"], "allow_amend": false, "allow": ["<regex>"] }` | `protect-branch.js` |
| `notify.json` | `{ "preset": "slack", "url": "https://...", "events": ["Stop"], "min_interval_s": 60 }` | `notify-webhook.js` (**required** to activate; keeps the webhook URL out of the repo) |
| `git-autostage.json` | `{ "enabled": true, "commit": false, "message_prefix": "checkpoint:" }` | `git-autostage.js` (**required** to activate — off by default) |
| `scan-injection.json` | `{ "extra": ["<regex>"], "allow": ["<regex>"], "max_scan_bytes": 200000 }` | `scan-injection.js` |
| `inject-context.json` | `{ "git": true, "context_file": true, "max_file_bytes": 4096 }` | `inject-context.js` |

`allow` lists are checked before deny patterns — first match wins.

## Testing

Pipe a fixture into a script and check the output:

```bash
CLAUDECODE=1 node block-dangerous.js < fixtures/bash-dangerous.json   # deny JSON
CLAUDECODE=1 node block-dangerous.js < fixtures/bash-safe.json        # {}
CLAUDECODE=1 node protect-secrets.js < fixtures/read-env.json         # deny JSON
CLAUDECODE=1 node protect-secrets.js < fixtures/read-env-example.json # {}
CLAUDECODE=1 node protect-secrets.js < fixtures/read-safe.json        # {}
CLAUDECODE=1 node protect-secrets.js < fixtures/bash-cat-env.json     # deny JSON
CLAUDECODE=1 node cost-warn.js < fixtures/session-start.json          # silent unless over threshold
CLAUDECODE=1 node protect-branch.js < fixtures/bash-git-commit-main.json      # deny JSON (when cwd repo is on main)
CLAUDECODE=1 node protect-branch.js < fixtures/bash-git-commit-feature.json   # {}
CLAUDECODE=1 node scan-injection.js < fixtures/post-read-injection.json       # additionalContext warning
CLAUDECODE=1 node scan-injection.js < fixtures/post-read-clean.json           # {}
CLAUDECODE=1 node inject-context.js < fixtures/prompt-submit.json             # git status context
CLAUDECODE=1 node format-lint.js < fixtures/post-edit-ts.json                 # {} (formats if prettier found)
CLAUDECODE=1 node git-autostage.js < fixtures/stop-event.json                 # no-op unless enabled in config
CLAUDECODE=1 node notify-webhook.js < fixtures/stop-event.json                # no-op unless ~/.argus/notify.json exists
```

The git fixtures reference repos under `/tmp/argus-hook-test/`; `protect-branch.js`,
`git-autostage.js`, and `inject-context.js` resolve branch/state from the payload's
`cwd`, so point a fixture's `cwd` at any local repo to exercise them.

Codex behavior: drop `CLAUDECODE=1` — blockers exit 2 with the reason on stderr;
`cost-warn.js` prints plain text instead of JSON.

## Known limitations

- `cost-warn.js` approximates the Claude billing window with a rolling 5-hour
  lookback over session activity (`last_seen_at`); it does not track exact
  billing-block boundaries.
- Blockers are regex-based: they stop common accidents, not a determined
  adversary. Shell obfuscation can evade them.
- Pattern matching applies to the whole command string, so quoted text can
  false-positive (e.g. `git commit -m "drop table cleanup"` trips the SQL DROP
  pattern). Use the `allow` config lists as an escape hatch.
- `protect-branch.js` resolves the current branch via `git branch --show-current`
  in the payload's `cwd` — chained commands (`cd elsewhere && git push`), `git -C`,
  and aliases can bypass it. Safety net for honest mistakes, not a security boundary.
- `format-lint.js` only uses project-local tools (`node_modules/.bin`, `ruff`/`gofmt`
  on PATH) and skips silently when absent. PostToolUse cannot undo an edit — lint
  feedback arrives on the agent's next turn.
- `scan-injection.js` is warn-only by design: regex scanning is a tripwire, and
  base64/homoglyph obfuscation can evade it. Want enforcement? Wire a model-based
  second stage.
- For TDD enforcement use [`tdd-guard`](https://github.com/nizos/tdd-guard) (npm)
  instead of a script here — it needs per-framework test reporters and an LLM
  validator, which doesn't fit this collection's zero-dependency constraint.
