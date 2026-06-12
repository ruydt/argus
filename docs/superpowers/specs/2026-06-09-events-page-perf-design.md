# EventsPage Performance Fixes — Design Spec

**Date:** 2026-06-09  
**Scope:** `frontend/src/features/events/`  
**Goal:** Eliminate drag lag and reduce re-render cost for large time ranges (1h–30d)

---

## Problem Summary

Three independent lag sources:

| Symptom | Root cause |
|---|---|
| Drag lag (session header + edge zone) | `SET_DRAG_OVER` dispatches every `dragover` frame (~60/s), each triggers full EventsPage re-render |
| 1h–30d sluggish vs 5m smooth | `AgentSession` and `EventRow` have no `React.memo`, re-render on every state change even when their data is unchanged |
| Search input lag | `filteredEvents` useMemo rescans all event fields on every keystroke, no debounce |

---

## Approach: Memo + Throttle + Debounce (no new dependencies)

Chosen over `@tanstack/react-virtual` virtualization. Server already limits to 20 sessions per fetch; the bottleneck is re-render cost, not DOM node count.

---

## Fix 1 — `React.memo` on `AgentSession`

**File:** `frontend/src/features/events/AgentSession.tsx`

Wrap with `React.memo`. Props are stable across unchanged events:
- `session` object comes from `useMemo` in `SessionList` — stable reference when underlying events unchanged
- `lastTime` is a `Date` derived from the same memo — stable
- `toggleSession` is wrapped in `useCallback` in `useEventLinkState` — stable
- `searchQuery`, `sessionUsage`, `setTooltip` etc. are primitives or stable refs

```tsx
export const AgentSession = React.memo(function AgentSession({ ... }) {
  // unchanged body
})
```

No custom comparator needed — shallow equality sufficient given stable props.

---

## Fix 2 — `React.memo` on `EventRow`

**File:** `frontend/src/features/events/EventRow.tsx`

Wrap with `React.memo`. All props are primitives (`searchQuery: string`, `highlighted: boolean`, `isPendingTarget: boolean`, `isDraggable: boolean`) or a stable event object reference.

```tsx
export const EventRow = React.memo(function EventRow({ ... }) {
  // unchanged body
})
```

**Also fix:** `AgentSession` calls `buildEventKey(e)` 3× per event inline (for `key`, `highlighted` check, `isPendingTarget` check). Extract to one variable per iteration:

```tsx
// Before:
<EventRow
  key={buildEventKey(e)}
  highlighted={highlightedEventKey === buildEventKey(e)}
  isPendingTarget={targetEventKey === buildEventKey(e)}
  ...
/>

// After:
const eventKey = buildEventKey(e)
<EventRow
  key={eventKey}
  highlighted={highlightedEventKey === eventKey}
  isPendingTarget={targetEventKey === eventKey}
  ...
/>
```

---

## Fix 3 — Throttle `handleDragOver` dispatch

**File:** `frontend/src/features/events/hooks/useEventsPageInteractions.ts`

`dragover` fires ~60 times/second. Each `SET_DRAG_OVER` dispatch triggers a reducer → new state object → React re-render of the full component tree that owns `panelDrag`.

Fix: track last dispatched panel in a ref; only dispatch when panel value changes.

```ts
const lastDragOverPanelRef = useRef<1 | 2 | null>(null)

const handleDragOver = useCallback(
  (panel: 1 | 2) => (ev: React.DragEvent) => {
    ev.preventDefault()
    ev.dataTransfer.dropEffect = 'move'
    if (lastDragOverPanelRef.current !== panel) {
      lastDragOverPanelRef.current = panel
      dispatchPanelDrag({ type: 'SET_DRAG_OVER', panel })
    }
  },
  []
)
```

Also reset the ref in `handleDragLeave` and `handleDropToPanel` when panel is set to `null`.

---

## Fix 4 — Debounce search query in `useEventFilters`

**File:** `frontend/src/features/events/hooks/useEventFilters.ts`

The `filteredEvents` useMemo scans up to 12 string fields per event on every `searchQuery` character. For 1000+ events, this is CPU-intensive.

Add an internal `debouncedSearchQuery` state updated 150ms after `searchQuery` changes. Use `debouncedSearchQuery` in the filter memo, not `searchQuery`.

```ts
const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery)

useEffect(() => {
  const t = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 150)
  return () => window.clearTimeout(t)
}, [searchQuery])

const filteredEvents = useMemo(() => {
  return events.filter((e) => {
    // ...other filters unchanged...
    if (debouncedSearchQuery) {
      const q = debouncedSearchQuery.toLowerCase()
      // ...field checks unchanged...
    }
    return true
  })
}, [events, actionFilter, agentFilter, projectFilter, debouncedSearchQuery, sessionFilter])
```

The `searchQuery` prop is still used for `highlight()` rendering (so highlighting updates live). Only the filter scan is debounced.

---

## Files Changed

| File | Change |
|---|---|
| `AgentSession.tsx` | Wrap with `React.memo`; extract `buildEventKey(e)` per iteration |
| `EventRow.tsx` | Wrap with `React.memo` |
| `useEventsPageInteractions.ts` | Add `lastDragOverPanelRef`, only dispatch `SET_DRAG_OVER` on panel change |
| `useEventFilters.ts` | Add `debouncedSearchQuery` state + useEffect |

---

## Testing

- Run `npx tsc --noEmit` — no type errors
- Run `npx vitest run` — all 207 tests pass
- Manual: drag a session header and edge zone — no stutter
- Manual: switch filter to 30d — render should be visibly faster
- Manual: type in search box — filtering no longer blocks every keystroke

---

## Out of Scope

- `@tanstack/react-virtual` DOM windowing (deferred — server 20-session limit makes this low ROI for now)
- Backend pagination changes
- `panel1Events` / `panel2Events` `buildEventKey` O(n) on drag — acceptable since dragover dispatch is now throttled
