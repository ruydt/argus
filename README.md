<div align="center">

<img src="docs/argus-eye.png" alt="Argus" width="120" />

# Argus

**the watchman whose eyes never all close**

[![Release](https://img.shields.io/github/v/release/ruydt/argus)](https://github.com/ruydt/argus/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Stars](https://img.shields.io/github/stars/ruydt/argus?style=flat)](https://github.com/ruydt/argus/stargazers)
[![Website](https://img.shields.io/badge/website-getargus.org-863bff)](https://getargus.org)

[Quick start](#quick-start) · [What it looks like](#what-it-looks-like) · [Hook scripts](my-custom-hook-scripts/) · [Docs](#documentation) · [getargus.org](https://getargus.org)

</div>

---

**The hook control center for AI coding agents.** Hooks are how you govern what
Claude Code and Codex can do — block dangerous commands, protect secrets, enforce
branch policy, get notified. But managing them means hand-editing JSON, testing
them means waiting for a live agent to misbehave, and good scripts are scattered
across a thousand gists. Argus fixes all three, locally:

- **Hook management** — a config editor with one-click presets for Claude Code and
  Codex. No JSON surgery; argus-managed entries are tagged and reversible.
- **Hook simulator** — run any hook command or script against a realistic synthetic
  payload for any event type, and inspect stdout/stderr/exit code/duration *before*
  an agent ever fires it. The missing debugger for the hook ecosystem.
- **Public script collection** — [`my-custom-hook-scripts/`](my-custom-hook-scripts/)
  ships battle-tested, zero-dependency guardrails free for everyone: dangerous-command
  blocker, secrets protection, branch guard, auto-format with lint feedback,
  prompt-injection scanner, webhook notifications, and more. Every script works
  with Claude Code and Codex — and the in-app **Scripts library** lets you browse,
  search, and one-click install any of them into `~/.argus/hooks/`.
- **Community sharing** — browse and install the whole community registry, and (with
  an optional GitHub login) **publish your own** scripts via a pull request or back
  up your collection to a private gist. Nothing is uploaded except the scripts you
  choose to share.

Backing it up: a **live observability layer** — every hook payload is normalized to a
canonical event model, persisted to SQLite, and streamed to a real-time dashboard
(event feed, session explorer, usage and cost stats). You see your hooks — and your
agents — actually working. No cloud, no telemetry, your data stays local.

## Quick start

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/ruydt/argus/main/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/ruydt/argus/main/install.ps1 | iex
```

> **Requirements:** Node.js 18+ (plus curl/tar on macOS/Linux) — no Go or pnpm needed.
>
> The installer downloads a pre-built binary for your OS and arch, wires the Claude Code
> `SessionStart` hook, and places `argus` in `~/.argus/bin`.

Open **http://127.0.0.1:10804** after your next Claude Code or Codex session starts.

Then follow [docs/quickstart.md](docs/quickstart.md) to verify your first event.

## What it looks like

The dashboard is one local panel over your agents: a live event feed, per-project
sessions, token-usage stats, the hooks config editor, and the built-in hook
simulator. Take the full visual tour at **[getargus.org](https://getargus.org)**.

| Surface | What it does |
| ------- | ------------ |
| **Hooks config + simulator** | One-click presets; fire a synthetic payload at any hook and read stdout/stderr/exit code before a live agent runs it. |
| **Event feed** | Every normalized tool call streamed over SSE, with server-side search across session id and project. |
| **Sessions** | Per-project session table — duration, tokens, agent, timing — with a file-change drawer of per-edit diffs. |
| **Dashboard** | Token-usage roll-ups (input/output/cache) charted over time and by model — computed locally. |
| **Projects** | Cards per working directory, server-searchable with infinite scroll and cascade delete. |
| **Diagnostics** | Health, storage, hook-preset detection, `~/.argus` inventory, and log tails. |
| **Scripts library** | Browse community scripts, inspect source in a modal, install into `~/.argus/hooks/`, and manage local/gist copies from My Collection. |
| **Script collection** | Free zero-dependency guardrails in [`my-custom-hook-scripts/`](my-custom-hook-scripts/). |

## Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/ruydt/argus/main/uninstall.sh | bash
```

Stops the server, removes binaries and scripts, unwires hooks from `~/.claude/settings.json`, and optionally deletes your data.

## Documentation

- [docs/hooks.md](docs/hooks.md) - hook management, presets, and the hook simulator
- [my-custom-hook-scripts/](my-custom-hook-scripts/) - the public hook script collection
- [docs/quickstart.md](docs/quickstart.md) - first-event walkthrough (under 10 minutes)
- [docs/install.md](docs/install.md) - full install reference, support matrix, data lifecycle
- [docs/privacy.md](docs/privacy.md) - capture categories, ignore controls, export implications
- [docs/security.md](docs/security.md) - local threat model and remote-sharing posture
- [docs/releases.md](docs/releases.md) - release runbook and conventional commit format

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[LICENSE](LICENSE)
