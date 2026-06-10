# Quickstart

Target: first successful local run in 5 to 10 minutes.

## 1. Install argus

```bash
curl -fsSL https://raw.githubusercontent.com/duytrandt04-afk/argus/main/install.sh | bash
```

Installs the argus binary to `~/.argus/bin/argus`, wires the `SessionStart` hook in
`~/.claude/settings.json`, and creates `~/.argus/bin/start-argus.sh`.

Before you send the first hook event, know what argus captures: prompts, diffs,
file paths, tool outputs, raw payloads, and exports are sensitive local data.
See [privacy controls](privacy.md) and the [local security model](security.md).

## 2. Start argus

Open a new Claude Code or Codex session — argus starts automatically via the
`SessionStart` hook. You will see:

```
SessionStart hook (completed)
  hook context: ARGUS live @ http://127.0.0.1:10804
```

Or start manually:
```bash
~/.argus/bin/start-argus.sh
```

Open **http://127.0.0.1:10804**.

## 3. Configure agent hooks

The setup script patches Claude Code and Codex hook configs automatically:

```bash
./scripts/argus setup
```

Or configure manually using the hook guide for your agent:

- [Codex](hooks.md#codex)
- [Claude Code](hooks.md#claude-code)

## 4. Verify one event

1. Start Codex or Claude Code in any repo.
2. Send one prompt or run one tool command.
3. Confirm the event appears in the dashboard.

If no event appears, run:

```bash
curl -fsS http://127.0.0.1:10804/api/version
./scripts/argus doctor
```
