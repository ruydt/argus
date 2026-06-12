# Hook Guardrail Scripts — Design

**Date:** 2026-06-10
**Status:** Approved
**Scope:** Three new scripts in `my-custom-hook-scripts/` — dangerous-command blocker, secrets file-access guard, argus-powered cost warning.

## Background

Market research (22 sources) identified dangerous-command blocking and secrets protection as the two most-built hook scripts in the ecosystem, and cost/usage warnings as the strongest demand signal (ccusage ~15.9k stars). The cost warning leverages argus's local SQLite data layer — a differentiator no other collection has. Cross-agent support (Claude Code + Codex) is the collection's competitive edge.

## Decisions

- Build top 3 from research: dangerous-command blocker, secrets protection (file-access guard only, no prompt scanner), cost warning (SessionStart only, no per-prompt check).
- Cross-agent: Claude Code + Codex.
- Block behavior: hard deny + reason fed back to agent (no ask-escalation, no tiering).
- Architecture: three standalone scripts (approach A) — helpers duplicated per script, no shared lib, no mega-script. Shareability of single files is the product.

## Shared conventions (all scripts)

- Node.js, zero dependencies, shebang `#!/usr/bin/env node`, fully standalone.
- Duplicated helpers (~40 lines each): `readStdin`, `parsePayload`, `logScript`.
- Logging to `~/.argus/hook-scripts.log`, same line format as existing scripts.
- Agent detection: `CLAUDECODE=1` env var → Claude Code; otherwise Codex (matches `permission-request.js`).
- **Fail-open:** payload parse error, missing config file, missing database → exit 0 silently. A hook bug must never block the agent.
- Optional per-script config JSON in `~/.argus/`; built-in defaults make every script work with zero configuration.

## Script 1: `block-dangerous.js`

**Hook event:** PreToolUse, matcher `Bash`.

- Parses `tool_input.command` (Claude Code) or the Codex command field.
- Built-in regex patterns: `rm -rf` targeting `/`, `~`, `$HOME`, or `.`; fork bomb; `curl | sh` / `wget | sh`; `chmod -R 777`; `git push --force` to main/master; `DROP DATABASE` / `DROP TABLE`; `dd of=/dev/...`; `mkfs`; redirect to `/dev/sd*`.
- On match, deny with reason:
  - Claude Code: `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<why>"}}`
  - Codex: exit code 2 with reason on stderr (fallback path).
- Config `~/.argus/dangerous-patterns.json`: `{ "extra": ["<regex>"], "allow": ["<regex>"] }`. Allow list is checked before deny patterns.
- Deny reason states what was blocked and why, so the agent can self-correct.

## Script 2: `protect-secrets.js`

**Hook event:** PreToolUse, matcher `Read|Edit|Write|Bash`.

- Extracts target path from `tool_input.file_path`; for Bash, scans the command string for protected path tokens.
- Built-in protected patterns: `.env*` (excluding `.env.example`, `.env.sample`, `.env.template`), `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`, `~/.ssh/`, `~/.aws/`, `~/.config/gh/`, `.netrc`, `*.p12`, `secrets.*`.
- Same deny output shape as `block-dangerous.js`.
- Config `~/.argus/protected-paths.json`: `{ "extra": [...], "allow": [...] }`.

## Script 3: `cost-warn.js`

**Hook event:** SessionStart.

- Queries `~/.argus/argus.db` via the `sqlite3` CLI (same mechanism as `argus-activate-local.js`):
  `SELECT SUM(input_tokens + output_tokens + cache_creation_tokens), COUNT(*) FROM sessions WHERE started_at >= datetime('now','-5 hours')`.
- Config `~/.argus/cost-warn.json`: `{ "threshold_tokens": 5000000, "warn_pct": 80 }` (defaults shown).
- Below warn level → silent (no output). At or above → emits window total, percent of threshold, and session count via `systemMessage` JSON (Claude Code) or plain stdout (Codex).
- Known limitation, documented in the script header: rolling 5-hour lookback approximates the billing window; it does not track exact block boundaries.

## Testing

- Manual fixture tests per script: `echo '<payload json>' | node <script>.js`, assert output / exit code.
- Fixtures committed under `my-custom-hook-scripts/fixtures/*.json`: dangerous command, safe command, `.env` read, normal file read, and similar.
- `my-custom-hook-scripts/README.md`: per-script purpose, `settings.json` wiring snippet, and test commands.

## Out of scope

- Prompt-content secret scanning (UserPromptSubmit variant).
- Per-prompt cost checks.
- Tier 2/3 research ideas (auto-format gate, protected-branch guard, remote notifications, git auto-stage, TDD gate, etc.) — candidates for later iterations.
