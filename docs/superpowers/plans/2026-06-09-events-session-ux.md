# EventsPage Session UX + Navigation Cache — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load 5 sessions on first render (down from 20), start all collapsed, and restore filter + split-view state when the user navigates back to the events page.

**Architecture:** `useHistoricalEvents` gains a `loadVersion` counter that ticks on each fresh fetch; EventsPage watches it to auto-collapse. Filter state (`actionFilter`, `agentFilter`, `projectFilter`, `sortOrder`) and split-view state are read from `sessionStorage` on mount and written back on every change. Time range is already persisted in `localStorage` by `useEventsTimeRangeState` — no change needed there.

**Tech Stack:** React 19, TypeScript 6, Vitest 4, Testing Library, sessionStorage/localStorage

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/features/events/hooks/useHistoricalEvents.ts` | `session_limit` 20→5; add `loadVersion` state |
| `frontend/src/features/events/EventsPage.tsx` | `useEffect` on `loadVersion` to auto-collapse sessions |
| `frontend/src/features/events/hooks/useEventFilters.ts` | Read/write `actionFilter`, `agentFilter`, `projectFilter`, `sortOrder` from sessionStorage |
| `frontend/src/features/events/hooks/useEventsPageInteractions.ts` | Read/write split-view state from sessionStorage |
| `frontend/tests/features/events/useHistoricalEvents.test.tsx` | New — test `loadVersion` increments |
| `frontend/tests/features/events/useEventFilters.test.tsx` | Add — test filter state restores from sessionStorage |
| `frontend/tests/features/events/useEventsPageInteractions.test.tsx` | Add — test split-view restores from sessionStorage |

---

## Task 1: Reduce initial session_limit to 5

**Files:**
- Modify: `frontend/src/features/events/hooks/useHistoricalEvents.ts:37`

- [ ] **Step 1: Change the constant**

In `useHistoricalEvents.ts`, find the multi-session branch inside `buildUrl` (around line 37):

```ts
// Before:
params.set('session_limit', '20')

// After:
params.set('session_limit', '5')
```

- [ ] **Step 2: Verify build and tests**

```bash
cd /Users/duytran/GitHub/argus/frontend
npx tsc --noEmit
npx vitest run
```

Expected: 0 type errors, 213 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/events/hooks/useHistoricalEvents.ts
git commit -m "perf(events): reduce initial session_limit from 20 to 5"
```

---

## Task 2: Add `loadVersion` counter to `useHistoricalEvents`

Every time a `replace=true` fetch completes successfully, `loadVersion` increments. EventsPage (Task 3) watches this to trigger auto-collapse.

**Files:**
- Modify: `frontend/src/features/events/hooks/useHistoricalEvents.ts`
- Create: `frontend/tests/features/events/useHistoricalEvents.test.tsx`

- [ ] **Step 1: Write failing test**

Create `frontend/tests/features/events/useHistoricalEvents.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHistoricalEvents } from '@/features/events/hooks/useHistoricalEvents'

function makeEventsResponse(events = [{ time: new Date().toISOString(), action: 'BASH', path: '' }]) {
  return { ok: true, json: async () => ({ events, has_more: false, next_cursor: 0 }) }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeEventsResponse()))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useHistoricalEvents — loadVersion', () => {
  it('starts at 0 before any fetch completes', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // never resolves
    const { result } = renderHook(() =>
      useHistoricalEvents('2026-01-01T00:00:00Z', '', '', true)
    )
    expect(result.current.loadVersion).toBe(0)
  })

  it('increments to 1 after first replace fetch completes', async () => {
    const { result } = renderHook(() =>
      useHistoricalEvents('2026-01-01T00:00:00Z', '', '', true)
    )
    await waitFor(() => expect(result.current.loadVersion).toBe(1))
  })

  it('increments again on refresh', async () => {
    const { result } = renderHook(() =>
      useHistoricalEvents('2026-01-01T00:00:00Z', '', '', true)
    )
    await waitFor(() => expect(result.current.loadVersion).toBe(1))

    act(() => { result.current.refresh() })
    await waitFor(() => expect(result.current.loadVersion).toBe(2))
  })

  it('does NOT increment on loadMore (append fetch)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [{ time: new Date().toISOString(), action: 'BASH', path: '' }], has_more: true, next_cursor: 99 }),
      })
    )
    const { result } = renderHook(() =>
      useHistoricalEvents('2026-01-01T00:00:00Z', '', '', true)
    )
    await waitFor(() => expect(result.current.loadVersion).toBe(1))

    act(() => { result.current.loadMore() })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.loadVersion).toBe(1) // still 1 — append, not replace
  })
})
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd /Users/duytran/GitHub/argus/frontend
npx vitest run tests/features/events/useHistoricalEvents.test.tsx
```

Expected: tests fail because `loadVersion` doesn't exist yet.

- [ ] **Step 3: Add `loadVersion` state to `useHistoricalEvents`**

In `useHistoricalEvents.ts`, add state after the existing state declarations (around line 18):

```ts
const [loadVersion, setLoadVersion] = useState(0)
```

Then in `fetchPage`, after the `setEvents(...)` call, add the increment — only for `replace=true` fetches. The full updated `fetchPage` try block:

```ts
try {
  const res = await fetch(buildUrl(cursor))
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
  const data = (await res.json()) as EventsResponse
  const incoming = data.events ?? []
  setHasMore(data.has_more ?? false)
  cursorRef.current = data.next_cursor ?? 0

  setEvents((prev) => {
    if (replace) {
      return incoming
    }
    const seen = new Set(prev.map(buildHistoricalKey))
    const next = [...prev]
    incoming.forEach((e) => {
      const key = buildHistoricalKey(e)
      if (!seen.has(key)) {
        seen.add(key)
        next.push(e)
      }
    })
    return next
  })

  if (replace) setLoadVersion((v) => v + 1)
} catch {
  setError('Failed to load events.')
} finally {
  setLoading(false)
}
```

Add `loadVersion` to the return object at the bottom:

```ts
return { events, hasMore, loading, error, loadMore, refresh, loadVersion }
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
cd /Users/duytran/GitHub/argus/frontend
npx vitest run tests/features/events/useHistoricalEvents.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Run full suite**

```bash
cd /Users/duytran/GitHub/argus/frontend
npx tsc --noEmit
npx vitest run
```

Expected: 0 type errors, 217 tests pass (213 + 4 new).

- [ ] **Step 6: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/events/hooks/useHistoricalEvents.ts \
        frontend/tests/features/events/useHistoricalEvents.test.tsx
git commit -m "feat(events): add loadVersion counter to useHistoricalEvents for fresh-load detection"
```

---

## Task 3: Auto-collapse all sessions on fresh load

When `loadVersion` increments, EventsPage collapses all sessions by filling `collapsedSessions` with every session ID from the current event list.

**Files:**
- Modify: `frontend/src/features/events/EventsPage.tsx:302-307`

- [ ] **Step 1: Destructure `loadVersion` from `histState`**

In `EventsPage.tsx`, the `histState` line is around line 302. Change the destructuring that uses `histState` — `loadVersion` is now returned. Directly after the line:

```ts
const histState = useHistoricalEvents(fetchSince, fetchUntil, sessionFilterOverride, true)
```

Add the auto-collapse effect:

```tsx
useEffect(() => {
  if (histState.loadVersion === 0) return
  setCollapsedSessions(
    new Set(
      histState.events.map((e) => e.session || e.transcript_path || 'ungrouped')
    )
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [histState.loadVersion])
```

Place this effect immediately after the `histState` declaration, before `activeEvents`.

- [ ] **Step 2: Verify build and tests**

```bash
cd /Users/duytran/GitHub/argus/frontend
npx tsc --noEmit
npx vitest run
```

Expected: 0 type errors, 217 tests pass (no regressions).

- [ ] **Step 3: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/events/EventsPage.tsx
git commit -m "feat(events): auto-collapse all sessions on fresh data load"
```

---

## Task 4: Cache filter state in sessionStorage

`actionFilter`, `agentFilter`, `projectFilter`, `sortOrder` currently reset to defaults when the user navigates away. Read from sessionStorage on mount, write on every change.

**Files:**
- Modify: `frontend/src/features/events/hooks/useEventFilters.ts`
- Modify: `frontend/tests/features/events/useEventFilters.test.tsx` (append new tests)

- [ ] **Step 1: Write failing tests**

Append these tests to the existing `frontend/tests/features/events/useEventFilters.test.tsx` file (after the existing `describe` block):

```tsx
describe('useEventFilters — sessionStorage cache', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('initializes actionFilter from sessionStorage', () => {
    sessionStorage.setItem('events_action_filter', 'EDIT')
    const { result } = renderHook(
      ({ q }) =>
        useEventFilters([], q, vi.fn(), '', '5m', vi.fn(), '', vi.fn(), '', vi.fn(), false),
      { wrapper, initialProps: { q: '' } }
    )
    expect(result.current.actionFilter).toBe('EDIT')
  })

  it('initializes agentFilter from sessionStorage', () => {
    sessionStorage.setItem('events_agent_filter', 'codex')
    const { result } = renderHook(
      ({ q }) =>
        useEventFilters([], q, vi.fn(), '', '5m', vi.fn(), '', vi.fn(), '', vi.fn(), false),
      { wrapper, initialProps: { q: '' } }
    )
    expect(result.current.agentFilter).toBe('codex')
  })

  it('initializes sortOrder from sessionStorage', () => {
    sessionStorage.setItem('events_sort_order', 'oldest')
    const { result } = renderHook(
      ({ q }) =>
        useEventFilters([], q, vi.fn(), '', '5m', vi.fn(), '', vi.fn(), '', vi.fn(), false),
      { wrapper, initialProps: { q: '' } }
    )
    expect(result.current.sortOrder).toBe('oldest')
  })

  it('writes actionFilter to sessionStorage when changed', () => {
    const { result } = renderHook(
      ({ q }) =>
        useEventFilters([], q, vi.fn(), '', '5m', vi.fn(), '', vi.fn(), '', vi.fn(), false),
      { wrapper, initialProps: { q: '' } }
    )
    act(() => { result.current.setActionFilter('BASH') })
    // useEffect runs synchronously inside act — no waitFor needed
    expect(sessionStorage.getItem('events_action_filter')).toBe('BASH')
  })
})

- [ ] **Step 2: Run new tests — confirm they fail**

```bash
cd /Users/duytran/GitHub/argus/frontend
npx vitest run tests/features/events/useEventFilters.test.tsx
```

Expected: the 4 new `sessionStorage cache` tests fail (state still initializes from hardcoded defaults).

- [ ] **Step 3: Add `readStr` helper and update state initializers**

In `useEventFilters.ts`, add the helper before the function (after the imports):

```ts
function readStr(key: string, fallback: string): string {
  try {
    return sessionStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
```

Update the four state declarations inside `useEventFilters` (around lines 23-27):

```ts
// Before:
const [actionFilter, setActionFilter] = useState('all')
const [agentFilter, setAgentFilter] = useState('all')
const [sortOrder, setSortOrder] = useState('newest')
const [projectFilter, setProjectFilter] = useState('all')

// After:
const [actionFilter, setActionFilter] = useState(() => readStr('events_action_filter', 'all'))
const [agentFilter, setAgentFilter] = useState(() => readStr('events_agent_filter', 'all'))
const [sortOrder, setSortOrder] = useState(() => readStr('events_sort_order', 'newest'))
const [projectFilter, setProjectFilter] = useState(() => readStr('events_project_filter', 'all'))
```

- [ ] **Step 4: Add persistence effects**

After the existing `useEffect` blocks (after the `refreshProjects` effect around line 72), add four effects:

```ts
useEffect(() => { sessionStorage.setItem('events_action_filter', actionFilter) }, [actionFilter])
useEffect(() => { sessionStorage.setItem('events_agent_filter', agentFilter) }, [agentFilter])
useEffect(() => { sessionStorage.setItem('events_sort_order', sortOrder) }, [sortOrder])
useEffect(() => { sessionStorage.setItem('events_project_filter', projectFilter) }, [projectFilter])
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd /Users/duytran/GitHub/argus/frontend
npx vitest run tests/features/events/useEventFilters.test.tsx
```

Expected: all tests pass (2 existing + 4 new = 6).

- [ ] **Step 6: Run full suite**

```bash
cd /Users/duytran/GitHub/argus/frontend
npx tsc --noEmit
npx vitest run
```

Expected: 0 type errors, 221 tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/events/hooks/useEventFilters.ts \
        frontend/tests/features/events/useEventFilters.test.tsx
git commit -m "feat(events): persist filter state (action/agent/project/sort) in sessionStorage"
```

---

## Task 5: Cache split-view state in sessionStorage

Split-view state (`splitView`, `panel2Sessions`, `panel2EventKeys`) lives in `useSplitViewInteractions`. Restore it on mount; write on every change.

**Files:**
- Modify: `frontend/src/features/events/hooks/useEventsPageInteractions.ts`
- Modify: `frontend/tests/features/events/useEventsPageInteractions.test.tsx` (append new tests)

- [ ] **Step 1: Write failing tests**

Append these tests to the existing `frontend/tests/features/events/useEventsPageInteractions.test.tsx` file:

```tsx
describe('useSplitViewInteractions — sessionStorage restore', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  afterEach(() => {
    sessionStorage.clear()
  })

  it('starts with splitView=false when sessionStorage is empty', () => {
    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: [], sortOrder: 'newest' }),
      { wrapper }
    )
    expect(result.current.splitView).toBe(false)
  })

  it('restores splitView=true from sessionStorage', () => {
    sessionStorage.setItem('events_split_enabled', 'true')
    sessionStorage.setItem('events_split_panel2_sessions', JSON.stringify(['sess-abc']))
    sessionStorage.setItem('events_split_panel2_event_keys', '[]')

    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: [], sortOrder: 'newest' }),
      { wrapper }
    )
    expect(result.current.splitView).toBe(true)
  })

  it('writes splitView state to sessionStorage when toggled', () => {
    const events = [
      {
        time: new Date().toISOString(),
        action: 'BASH',
        path: '',
        session: 'sess-1',
        transcript_path: '/path/to/session.jsonl',
      },
    ] as import('@/types/events').EventRecord[]

    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: events, sortOrder: 'newest' }),
      { wrapper }
    )

    act(() => { result.current.toggleSplitView() })
    // useEffect runs synchronously inside act — no waitFor needed
    expect(sessionStorage.getItem('events_split_enabled')).toBe('true')
  })
})

- [ ] **Step 2: Run new tests — confirm they fail**

```bash
cd /Users/duytran/GitHub/argus/frontend
npx vitest run tests/features/events/useEventsPageInteractions.test.tsx
```

Expected: the 3 new `sessionStorage restore` tests fail.

- [ ] **Step 3: Add `loadSplitState` initializer and persistence effect**

In `useEventsPageInteractions.ts`, add the loader function before `useSplitViewInteractions` (after `isPanel2Empty`):

```ts
function loadSplitState(): PanelDragState {
  try {
    const splitView = sessionStorage.getItem('events_split_enabled') === 'true'
    const sessions = JSON.parse(
      sessionStorage.getItem('events_split_panel2_sessions') ?? '[]'
    ) as string[]
    const eventKeys = JSON.parse(
      sessionStorage.getItem('events_split_panel2_event_keys') ?? '[]'
    ) as string[]
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
```

Inside `useSplitViewInteractions`, change the `useReducer` call from:

```ts
const [panelDrag, dispatchPanelDrag] = useReducer(panelDragReducer, initialPanelDragState)
```

to:

```ts
const [panelDrag, dispatchPanelDrag] = useReducer(panelDragReducer, undefined, loadSplitState)
```

- [ ] **Step 4: Add persistence effect**

After the existing `useEffect` for drag listeners (around line 229–238), add:

```ts
useEffect(() => {
  try {
    sessionStorage.setItem('events_split_enabled', String(panelDrag.splitView))
    sessionStorage.setItem(
      'events_split_panel2_sessions',
      JSON.stringify(Array.from(panelDrag.panel2Sessions))
    )
    sessionStorage.setItem(
      'events_split_panel2_event_keys',
      JSON.stringify(Array.from(panelDrag.panel2EventKeys))
    )
  } catch {
    // sessionStorage unavailable — silently ignore
  }
}, [panelDrag.splitView, panelDrag.panel2Sessions, panelDrag.panel2EventKeys])
```

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd /Users/duytran/GitHub/argus/frontend
npx vitest run tests/features/events/useEventsPageInteractions.test.tsx
```

Expected: all tests pass (4 existing + 3 new = 7).

- [ ] **Step 6: Run full suite**

```bash
cd /Users/duytran/GitHub/argus/frontend
npx tsc --noEmit
npx vitest run
```

Expected: 0 type errors, 224 tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/events/hooks/useEventsPageInteractions.ts \
        frontend/tests/features/events/useEventsPageInteractions.test.tsx
git commit -m "feat(events): persist split-view state in sessionStorage across navigation"
```

---

## Final Verification

- [ ] Manual: open events page — 5 sessions load, all collapsed
- [ ] Manual: expand 2 sessions, navigate to hooks-config, come back — those 2 sessions still expanded
- [ ] Manual: change time range — all sessions collapse again
- [ ] Manual: set action filter to EDIT, sort to oldest, navigate away, come back — filters restored
- [ ] Manual: open split view, navigate away, come back — split view still open with same panels
- [ ] `cd /Users/duytran/GitHub/argus/frontend && npx vitest run` — all 224 tests pass
