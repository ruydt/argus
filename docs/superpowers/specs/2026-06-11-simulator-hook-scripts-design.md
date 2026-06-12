# Simulator Hook-Script Picker — Design

**Date:** 2026-06-11
**Status:** Approved
**Scope:** Hooks-config Simulator tab — let the user pick a script from `~/.argus/hooks` as the command to run against the payload.

## Decision

Frontend-only. Reuse `GET /api/diagnostics` → `fileSystem.hooks` (already lists `~/.argus/hooks` files with name + absolute path; directories are skipped by `scanDir`). No new endpoint.

## Changes — `frontend/src/features/hooks-config/SimulatorTab.tsx`

- On mount, fetch `/api/diagnostics`; read `fileSystem.hooks` with a narrow inline type (`{ fileSystem?: { hooks?: { name: string; path: string }[] } }`). Fetch failure → empty list, silent.
- Filter to names ending `.js`, `.sh`, `.py` (drops README.md and other non-scripts).
- The command Select gains one option per script, appended after the config-derived hook options and before "Custom command…":
  - label: `script: <name>` (e.g. `script: stop.js`)
  - value: the composed shell command string
- Command composition:
  - `.js` → `node <path>`, `.sh` → `sh <path>`, `.py` → `python3 <path>`
  - When the active agent tab is `claudecode`, prefix `CLAUDECODE=1 ` so the script exercises its Claude Code output path; Codex tab gets no prefix.
- The composed value is an ordinary command string — the existing Run flow (`POST /api/hooks/simulate`) works unchanged, default timeout applies.
- "Apply to config" remains custom-command-only.

## Accepted quirk

Switching the agent tab does not retroactively re-compose an already-selected script command (the stale `CLAUDECODE=1` prefix persists until the user re-picks). The dropdown options themselves are re-derived per render, so a re-pick always composes correctly.

## Testing

Extend `frontend/tests/features/hooks-config/` (or create alongside existing hooks-config tests): mock `/api/diagnostics` fetch → script options appear; selecting one sets the composed command (assert `CLAUDECODE=1 node …` for claudecode agent, bare `node …` for codex); `README.md` filtered out.

## Out of scope

- New backend endpoints.
- Applying script commands to the hooks config from the simulator.
- Interpreter detection beyond the three extensions.
