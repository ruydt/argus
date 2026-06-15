# Scripts UI Tweaks — Minimal Community Rows + Test-in-Simulator

**Status:** Approved design
**Date:** 2026-06-14
**Builds on:** scripts-v2 (registry-only)
**Branch:** continue on `feat/community-script-sharing`

---

## 1. Goal

Slim the Community list rows to the essentials and relocate "Test" from the row into the My
Collection ⋯ menu, where it deep-links to the existing hooks-config simulator with the script's hook
event and file preselected. Pure frontend; no backend or registry changes.

## 2. Decisions (locked)

1. **Community row** shows only: `filename.js` · `<author>` · `<event>` hook badge · row-click
   source modal · **Install**/Installed. Remove the title, the purpose/description line, and the row
   **Test** button.
2. **My Collection ⋯ menu** gains a **Test** item for **local** entries only. It navigates to the
   simulator with the event + script preselected. Gist-only (not-installed) entries get no Test.
3. **Hooks-config** reads query params (`view`, `event`, `script`) on mount to open the simulator
   preselected. No forced agent tab; empty event leaves the dropdown unset.

## 3. How the hook event is known (answer to the recurring question)

The script's `@argus-meta` header declares `// event: <HookEvent>`. The registry Action
(`build-index.mjs`) parses it into `index.json`'s `event`; argus serves it as `CommunityScript.event`
and `CollectionEntry.event`. The row renders that value as the hook badge. No inference.

## 4. Component changes (frontend only)

### 4.1 `community/CommunityRow.tsx` — strip down

Render, in order:
- **filename** (monospace) — derived from `source`: `script.source.split('/').pop() ?? script.id`.
- `{script.author}` as the secondary monospaced label.
- `{script.event}` hook badge (only if present).
- a runtime-missing warning badge stays (if `!script.runtime_available`) — it's a safety signal, not
  cosmetic, so keep it.
- Clicking any non-button row area opens the shared `ScriptViewerModal` source viewer.
- **Install** button, or an `Installed` badge when `script.installed`.

Remove: the title element, the `purpose` paragraph, and the **Test** button (plus the now-unused
`simulate`/`getBody`-for-test wiring on the community side, IF nothing else uses it — `getBody` still
backs Source view, so keep `getBody`; remove only the `simulate` prop usage from the community row).

`CommunityTab.tsx` stops passing `simulate` to `CommunityRow` (and `useCommunity.simulate` may remain
exported but unused by the community UI; leave the hook method in place — harmless, and the backend
`/api/community/simulate` endpoint stays).

### 4.2 `collection/CollectionRow.tsx` — add Test to ⋯

Add a new prop `onTest?: (entry: CollectionEntry) => void`. In the ⋯ `Popover`, when `entry.local`,
render a **Test** item as the first entry, before *Save to gist*. Order: *Test* (local) · *Save to
gist* (local && !gist) · *Remove local* (local) · *Remove from gist* (gist) · *Remove both* (local
&& gist).

### 4.3 `collection/CollectionTab.tsx` — wire Test → navigate

Use React Router's `useNavigate`. Add:

```tsx
function testInSimulator(entry: CollectionEntry) {
  const params = new URLSearchParams({ view: 'simulator', script: entry.filename })
  if (entry.event) params.set('event', entry.event)
  navigate(`/hooks-config?${params.toString()}`)
}
```

Pass `onTest={testInSimulator}` to `CollectionRow`. (`navigate` from `useNavigate()`.)

### 4.4 `hooks-config/HooksConfigPage.tsx` — read deep-link params

On mount, read `useSearchParams()`:
- If `view === 'simulator'`, set `viewMode = 'simulator'` (overriding the localStorage default for
  this load).
- If `event` is present, set the page's `eventType` state to it.
- Pass a new `initialScript={searchParams.get('script') ?? undefined}` prop to `SimulatorTab`.

This runs once (guard so it doesn't re-fire on every render / when the user later changes tabs).

### 4.5 `hooks-config/SimulatorTab.tsx` — preselect the script

Accept `initialScript?: string`. The component already loads `hookScripts` from `/api/diagnostics`
asynchronously and builds command options via `composeScriptCommand(script, agent)`. After
`hookScripts` loads, if `initialScript` matches a loaded script's `name` and no command is selected
yet, set the command select to that script's composed command. Apply once (don't override later user
selection).

## 5. Data flow (Test path)

```
My Collection row (local) ⋯ → Test
  → navigate('/hooks-config?view=simulator&event=<event>&script=<filename>')
  → HooksConfigPage: viewMode=simulator, eventType=<event>, initialScript=<filename>
  → SimulatorTab: waits for ~/.argus/hooks list, matches <filename>, preselects command
  → user reviews payload + Run (existing behavior)
```

## 6. Edge cases / error handling

- **Script not in `~/.argus/hooks`:** only local entries expose Test, and "local" means the file is
  in `~/.argus/hooks`, so the simulator's list will contain it. If a race leaves it missing, the
  command dropdown simply has no preselection (no crash).
- **Empty event:** event param omitted; event dropdown stays unset (user picks).
- **Stale deep-link params on later navigation:** the param read is one-shot on mount; switching
  view tabs afterward behaves normally and the URL params are ignored thereafter.

## 7. Testing

- `CommunityRow`/`CommunityTab`: row renders filename + author + event badge + Source + Install;
  asserts NO Test button and NO purpose text.
- `CollectionRow`: ⋯ shows Test for a local entry; hidden for a gist-only entry.
- `CollectionTab`: clicking ⋯ → Test calls `navigate` with
  `/hooks-config?view=simulator&event=...&script=...` (mock `useNavigate`).
- `SimulatorTab`: given `initialScript` matching a loaded hook script, the command select is
  preselected after the diagnostics fetch resolves.
- Gates: `tsc -b --noEmit` (NOT `tsc --noEmit`) + `vitest run` + prettier.

## 8. Out of scope (YAGNI)

- Backend/registry changes (none).
- Forcing a specific agent tab in the simulator.
- Carrying title/purpose anywhere in the Community list (intentionally dropped; Source shows the
  full script).
- Removing `useCommunity.simulate` / `/api/community/simulate` (left in place, unused by the row).
