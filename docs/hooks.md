# Hooks

Hooker receives agent events at:

```text
http://127.0.0.1:8765/api/hook
```

Start the backend before configuring hooks. Hook delivery fails while the backend is offline.

---

## Quickest setup: Hooks Config UI

Open the **Hooks Config** page in the Hooker dashboard. Select your agent tab (Claude Code or Codex), then use the **Apply preset** dropdown to install a preset in one click — no JSON editing required.

### Presets

| Preset | What it captures |
|--------|-----------------|
| **Baseline** | Session lifecycle, user prompts, tool results, stop events. Minimum needed for logging and analytics. |
| **Medium** | Baseline + pre-tool-use, failures, subagent events, context compaction. |
| **Full** | All available events except high-frequency streaming ones (`MessageDisplay`, `FileChanged`). |

Presets are additive — they append to your existing config and never overwrite entries you already have.

Each installed entry is tagged `statusMessage: "hooker"` so Hooker can identify its own entries. The **Diagnostics** page reflects the active preset name (Baseline / Medium / Full) or `Custom (X/30)` when your hooker-managed events don't match a preset exactly.

### Adding individual events

Use the **Add hook event** dropdown (top of the structured editor) to add a single event type. A default hooker curl entry is pre-filled.

### Removing hooker-managed hooks

Click **Remove Hooker hooks** to strip all entries tagged `statusMessage: "hooker"`. Manually added hooks are preserved. Save after removal.

---

## Manual JSON setup

If you prefer editing config files directly, see the per-agent guides:

- [Claude Code](setup/claudecode.md)
- [Codex](setup/codex.md)

The curl command used by all presets:

```bash
curl -s --max-time 2 -X POST http://127.0.0.1:8765/api/hook \
  -H 'Content-Type: application/json' -d @- || true
```

`--max-time 2` caps hook latency. `|| true` prevents hook failures from blocking the agent.

---

## Validate hook delivery

With backend running:

```bash
curl -fsS http://127.0.0.1:8765/api/version
```

Then trigger one prompt in your configured agent and confirm an event appears in the dashboard.
