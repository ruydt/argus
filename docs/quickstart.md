# Quickstart

Target: first successful local run in 5 to 10 minutes.

## 1. Install argus

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/ruydt/argus/main/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/ruydt/argus/main/install.ps1 | iex
```

Installs the argus binary to `~/.argus/bin/argus`, adds it to your PATH, and
writes the activate hook to `~/.argus/hooks/argus-activate.js`. The installer
does **not** edit any agent's config — you wire hooks yourself from the
dashboard (step 3), which keeps install side-effect-free.

Before you send the first hook event, know what argus captures: prompts, diffs,
file paths, tool outputs, raw payloads, and exports are sensitive local data.
See [privacy controls](privacy.md) and the [local security model](security.md).

## 2. Start argus

```bash
argus start
```

`argus start` launches the server and opens **http://127.0.0.1:10804** in your
browser. (Bare `argus` runs the server without opening a browser; `argus stop`
shuts it down.)

## 3. Configure agent hooks

In the dashboard, open the **Hooks** page, select your agent's tab, and click
**Apply preset** (Baseline is a good start). The preset wires Argus into that
agent's events — and, for agents with a session-start event, also adds
`argus-activate.js` so the server auto-starts on the next session. Click **Save**.

Prefer manual JSON? Use the per-agent hook guide:

- [Codex](setup/codex.md)
- [Claude Code](setup/claudecode.md)

## 4. Verify one event

1. Start your agent (Codex, Claude Code, …) in any repo.
2. Send one prompt or run one tool command.
3. Confirm the event appears in the dashboard.

If no event appears, run:

```bash
curl -fsS http://127.0.0.1:10804/api/version
./scripts/argus doctor
```
