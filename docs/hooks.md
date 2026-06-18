# Hooks

Hook management is Argus's core: configure hooks with presets, test them in the
simulator before an agent ever runs them, and grab ready-made scripts from the
[public hook script collection](../registry/) (guardrails,
formatters, notifications — zero dependencies, Claude Code + Codex).

Argus receives agent events at:

```text
http://127.0.0.1:10804/api/hook
```

Start the backend before configuring hooks. Hook delivery fails while the backend is offline.

---

## Quickest setup: Hooks Config UI

Open the **Hooks Config** page in the Argus dashboard. Select your agent tab (Claude Code or Codex), then use the **Apply preset** dropdown to install a preset in one click — no JSON editing required.

### Presets

| Preset | What it captures |
|--------|-----------------|
| **Baseline** | Session lifecycle, user prompts, tool results, stop events. Minimum needed for logging and analytics. |
| **Medium** | Baseline + pre-tool-use, failures, subagent events, context compaction. |
| **Full** | All available events except high-frequency streaming ones (`MessageDisplay`, `FileChanged`). |

Presets are additive — they append to your existing config and never overwrite entries you already have.

Each installed entry is tagged `statusMessage: "argus"` so Argus can identify its own entries. The **Diagnostics** page shows `Configured (X/Y)` — `X` argus-managed event types out of `Y` available for that agent (30 for Claude Code, 10 for Codex) — `Configured` when hooks exist but none are argus-managed, or `Missing` when no hooks are configured.

### Adding individual events

Use the **Add hook event** dropdown (top of the structured editor) to add a single event type. A default argus curl entry is pre-filled.

### Removing argus-managed hooks

Click **Remove Argus hooks** to strip all entries tagged `statusMessage: "argus"`. Manually added hooks are preserved. Save after removal.

---

## Hook simulator

The simulator (open it with the **Simulator** button on the Hooks Config page) runs any hook command against a synthetic payload — no live agent session needed. Use it to test a guardrail script before wiring it, debug a hook that misbehaves, or inspect exactly what an event payload looks like.

How it works:

1. Pick a **hook event** (searchable — every event type the selected agent supports). A realistic JSON payload template loads into the editor; edit it freely.
2. Pick a **command**:
   - hooks already wired in your config for that event,
   - scripts auto-discovered from `~/.argus/hooks` (`.js` runs with `node`, `.sh` with `sh`, `.py` with `python3`; on the Claude Code tab the command is prefixed with `CLAUDECODE=1` so scripts exercise their Claude Code output path),
   - or **Custom command…** for anything else.
3. Click **Run**. The backend executes the command with the payload piped to stdin (the hook contract), honoring the hook's configured timeout (default 10s), and shows stdout, stderr, exit code, and duration.

A custom command can be saved into your hooks config for the selected event with **Apply** (idempotent — applying the same command twice adds nothing).

Example: select `PreToolUse`, pick `block-dangerous.js`, set `tool_input.command` to `rm -rf ~` in the payload — the output panel shows the deny JSON the agent would receive.

---

## Manual JSON setup

If you prefer editing config files directly, see the per-agent guides:

- [Claude Code](setup/claudecode.md)
- [Codex](setup/codex.md)

The curl command used by all presets:

```bash
curl -s --max-time 2 -X POST http://127.0.0.1:10804/api/hook \
  -H 'Content-Type: application/json' -d @- || true
```

`--max-time 2` caps hook latency. `|| true` prevents hook failures from blocking the agent.

---

## Validate hook delivery

With backend running:

```bash
curl -fsS http://127.0.0.1:10804/api/version
```

Then trigger one prompt in your configured agent and confirm an event appears in the dashboard.
