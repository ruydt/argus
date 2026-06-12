# EventsPage Session UX + Navigation Cache — Design Spec

**Date:** 2026-06-09  
**Scope:** `frontend/src/features/events/`  
**Goal:** Faster initial load, sessions collapsed by default, and page state preserved across navigation.

---

## Problems Solved

| Problem | Current behaviour | New behaviour |
|---|---|---|
| Slow initial load | 20 sessions fetched at once | 5 sessions, load more on demand |
| Sessions start expanded | All sessions open — overwhelming with large history | All sessions collapsed on fresh load |
| State lost on navigation | Filter, split view reset when leaving events page | Restored from sessionStorage on return |

---

## Feature 1: Fewer Sessions on Initial Load

**File:** `frontend/src/features/events/hooks/useHistoricalEvents.ts`

Change the multi-session page size constant from `20` to `5`:

```ts
// Before:
params.set('session_limit', '20')

// After:
params.set('session_limit', '5')
```

The existing load-more button already handles incremental fetching. No other changes needed.

---

## Feature 2: Sessions Collapsed by Default

### How it works

`collapsedSessions` is a `Set<string>` in `Layout.tsx` that tracks which session IDs are collapsed. When a session ID is in the set, `AgentSession` renders collapsed. Currently the set starts empty (all expanded).

To start sessions collapsed: populate `collapsedSessions` with all session IDs whenever fresh data arrives.

### `loadVersion` counter in `useHistoricalEvents`

Add a `loadVersion: number` to the hook's return value. It starts at `0` and increments each time a `replace=true` fetch completes successfully (i.e. when the event list is reset, not appended).

```ts
// Inside useHistoricalEvents:
const [loadVersion, setLoadVersion] = useState(0)

// In fetchPage, after setEvents on the replace path:
if (replace) {
  setEvents(incoming)
  setLoadVersion((v) => v + 1)  // signals fresh data arrived
}
```

### EventsPage effect

In `EventsPage.tsx`, add a `useEffect` on `loadVersion`:

```ts
useEffect(() => {
  if (loadVersion === 0) return  // no data yet
  setCollapsedSessions(
    new Set(events.map((e) => e.session || e.transcript_path || 'ungrouped'))
  )
}, [loadVersion])
```

**Result:**
- Fresh load → all session IDs added to `collapsedSessions` → all collapsed
- User expands a session → its ID removed from `collapsedSessions` → stays expanded
- User navigates away and back → localStorage still has the set → expanded sessions remain open
- Time range / session filter changes → triggers new replace=true fetch → `loadVersion` increments → all collapse again

### No change to localStorage persistence

`collapsedSessions` already writes to `localStorage` on every change (in Layout). This means the collapsed-by-default state survives page refresh too, until the user expands something.

---

## Feature 3: Cache Page State Across Navigation

State is persisted to `sessionStorage` (not `localStorage`) so it resets on browser close but survives in-tab navigation.

### Storage keys

| Key | Value |
|---|---|
| `events_time_range` | `string` — e.g. `"1h"`, `"30d"`, `"custom"` |
| `events_custom_start` | `string` |
| `events_custom_end` | `string` |
| `events_action_filter` | `string` |
| `events_agent_filter` | `string` |
| `events_project_filter` | `string` |
| `events_sort_order` | `string` |
| `events_split_panel2_sessions` | `string` — JSON array of session IDs |
| `events_split_panel2_event_keys` | `string` — JSON array of event keys |
| `events_split_enabled` | `string` — `"true"` / `"false"` |

### `useEventsTimeRangeState`

**File:** `frontend/src/features/events/hooks/useEventsTimeRangeState.ts`

Read initial values from sessionStorage; write on every change.

```ts
function readStr(key: string, fallback: string): string {
  try { return sessionStorage.getItem(key) ?? fallback } catch { return fallback }
}

// Init:
const [timeRange, setTimeRange] = useState(() => readStr('events_time_range', '1h'))
const [customStart, setCustomStart] = useState(() => readStr('events_custom_start', ''))
const [customEnd, setCustomEnd] = useState(() => readStr('events_custom_end', ''))

// Persist:
useEffect(() => { sessionStorage.setItem('events_time_range', timeRange) }, [timeRange])
useEffect(() => { sessionStorage.setItem('events_custom_start', customStart) }, [customStart])
useEffect(() => { sessionStorage.setItem('events_custom_end', customEnd) }, [customEnd])
```

### `useEventFilters`

**File:** `frontend/src/features/events/hooks/useEventFilters.ts`

Same pattern — read initial filter values from sessionStorage; write on change.

```ts
const [actionFilter, setActionFilter] = useState(() => readStr('events_action_filter', 'all'))
const [agentFilter, setAgentFilter] = useState(() => readStr('events_agent_filter', 'all'))
const [projectFilter, setProjectFilter] = useState(() => readStr('events_project_filter', 'all'))
const [sortOrder, setSortOrder] = useState(() => readStr('events_sort_order', 'newest'))
```

Each state value is written to sessionStorage via a `useEffect` when it changes.

### `useSplitViewInteractions`

**File:** `frontend/src/features/events/hooks/useEventsPageInteractions.ts`

Read initial split state from sessionStorage and pass it to `useReducer` as the initial state. Write on every `panelDrag` state change.

```ts
function loadSplitState(): PanelDragState {
  try {
    const splitView = sessionStorage.getItem('events_split_enabled') === 'true'
    const sessions = JSON.parse(sessionStorage.getItem('events_split_panel2_sessions') ?? '[]')
    const eventKeys = JSON.parse(sessionStorage.getItem('events_split_panel2_event_keys') ?? '[]')
    return {
      ...initialPanelDragState,
      splitView,
      panel2Sessions: new Set(sessions),
      panel2EventKeys: new Set(eventKeys),
    }
  } catch {
    return initialPanelDragState
  }
}

// Init:
const [panelDrag, dispatchPanelDrag] = useReducer(panelDragReducer, undefined, loadSplitState)

// Persist on every change:
useEffect(() => {
  sessionStorage.setItem('events_split_enabled', String(panelDrag.splitView))
  sessionStorage.setItem(
    'events_split_panel2_sessions',
    JSON.stringify(Array.from(panelDrag.panel2Sessions))
  )
  sessionStorage.setItem(
    'events_split_panel2_event_keys',
    JSON.stringify(Array.from(panelDrag.panel2EventKeys))
  )
}, [panelDrag.splitView, panelDrag.panel2Sessions, panelDrag.panel2EventKeys])
```

### Excluded from cache

- `searchQuery` — already cleared on nav away from `/events` (existing behaviour, intentional)
- `isLive` — lives in Layout, not EventsPage, already persists across nav
- `collapsedSessions` — already in localStorage, already persists

---

## Files Changed

| File | Change |
|---|---|
| `hooks/useHistoricalEvents.ts` | `session_limit` 20→5; add `loadVersion` state counter |
| `EventsPage.tsx` | Add `useEffect` on `loadVersion` to auto-collapse sessions |
| `hooks/useEventsTimeRangeState.ts` | Read/write `timeRange`, `customStart`, `customEnd` from sessionStorage |
| `hooks/useEventFilters.ts` | Read/write filter state from sessionStorage |
| `hooks/useEventsPageInteractions.ts` | Read/write split view state from sessionStorage |

---

## Testing

- `npx tsc --noEmit` — no type errors
- `npx vitest run` — all existing tests pass (new sessionStorage effects are side-effect-only and don't break hook contracts)
- Manual: initial load shows 5 sessions, all collapsed
- Manual: expand one session, navigate to hooks-config, come back — session is still expanded
- Manual: change time range → all sessions collapse again
- Manual: split view, navigate away, come back — split view restored
- Manual: set filters, navigate away, come back — filters restored

---

## Out of Scope

- Persisting `collapsedSessions` to sessionStorage (already in localStorage, sufficient)
- Caching the actual event data (events re-fetch on mount; only UI state is cached)
- `searchQuery` cache (cleared on nav-away intentionally)
