# EventsPage Performance Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate drag lag and reduce large time-range (1h–30d) re-render cost with no new dependencies.

**Architecture:** Four targeted fixes across four files — `React.memo` on leaf components to skip unchanged re-renders, a `useRef`-based gate to drop redundant `SET_DRAG_OVER` dispatches, and a debounced search query to stop per-keystroke full-array scans.

**Tech Stack:** React 19, TypeScript 6, Vitest 4, Testing Library

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/features/events/EventRow.tsx` | Wrap export with `memo` |
| `frontend/src/features/events/AgentSession.tsx` | Wrap export with `memo`; extract `buildEventKey` per iteration |
| `frontend/src/features/events/hooks/useEventsPageInteractions.ts` | Add `lastDragOverPanelRef`; only dispatch `SET_DRAG_OVER` on panel change; reset ref in leave/drop |
| `frontend/src/features/events/hooks/useEventFilters.ts` | Add `debouncedSearchQuery` state + 150ms `useEffect`; use in filter memo |
| `frontend/tests/features/events/useEventsPageInteractions.test.tsx` | New — tests for handleDragOver behavior |
| `frontend/tests/features/events/useEventFilters.test.tsx` | New — tests for debounce behavior |

---

## Task 1: React.memo on EventRow

**Files:**
- Modify: `frontend/src/features/events/EventRow.tsx:35`

- [ ] **Step 1: Add `memo` to the React import**

In `EventRow.tsx`, change line 1:

```tsx
import { memo, useEffect, useRef, useState } from 'react'
```

- [ ] **Step 2: Wrap the export with `memo`**

Replace the function declaration and export:

```tsx
// Before:
export function EventRow({
  event: e,
  searchQuery,
  highlighted = false,
  isPendingTarget = false,
  onTargetVisible,
  isDraggable = false,
}: EventRowProps) {
```

```tsx
// After:
export const EventRow = memo(function EventRow({
  event: e,
  searchQuery,
  highlighted = false,
  isPendingTarget = false,
  onTargetVisible,
  isDraggable = false,
}: EventRowProps) {
```

Close the function body with an extra `)` after the final `}`:

```tsx
  )
  {/* existing JSX */}
}
)
```

Full closing — the component body is unchanged. Only the declaration and closing change:

```tsx
export const EventRow = memo(function EventRow({ ... }: EventRowProps) {
  // ... entire existing body unchanged ...
})
```

- [ ] **Step 3: Verify build and tests**

```bash
cd frontend
npx tsc --noEmit
npx vitest run
```

Expected: 0 type errors, 207 tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/events/EventRow.tsx
git commit -m "perf(events): wrap EventRow with React.memo to skip unchanged re-renders"
```

---

## Task 2: React.memo on AgentSession + deduplicate buildEventKey calls

**Files:**
- Modify: `frontend/src/features/events/AgentSession.tsx:1,146-156`

- [ ] **Step 1: Add `memo` to the React import**

In `AgentSession.tsx`, change line 1:

```tsx
import { memo, useState } from 'react'
```

- [ ] **Step 2: Extract buildEventKey per iteration in the visibleEvents map**

In `AgentSession.tsx`, the current `visibleEvents.map` block (around line 146):

```tsx
{visibleEvents.map((e) => (
  <EventRow
    key={buildEventKey(e)}
    event={e}
    searchQuery={searchQuery}
    highlighted={highlightedEventKey === buildEventKey(e)}
    isPendingTarget={targetEventKey === buildEventKey(e)}
    onTargetVisible={onTargetVisible}
    isDraggable={isEventDraggable}
  />
))}
```

Replace with:

```tsx
{visibleEvents.map((e) => {
  const eventKey = buildEventKey(e)
  return (
    <EventRow
      key={eventKey}
      event={e}
      searchQuery={searchQuery}
      highlighted={highlightedEventKey === eventKey}
      isPendingTarget={targetEventKey === eventKey}
      onTargetVisible={onTargetVisible}
      isDraggable={isEventDraggable}
    />
  )
})}
```

- [ ] **Step 3: Wrap the export with `memo`**

Replace the function declaration:

```tsx
// Before:
export function AgentSession({
```

```tsx
// After:
export const AgentSession = memo(function AgentSession({
```

Close with `})` after the final `</Collapsible>`:

```tsx
    </Collapsible>
  )
})
```

- [ ] **Step 4: Verify build and tests**

```bash
cd frontend
npx tsc --noEmit
npx vitest run
```

Expected: 0 type errors, 207 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/events/AgentSession.tsx
git commit -m "perf(events): wrap AgentSession with React.memo, deduplicate buildEventKey calls"
```

---

## Task 3: Throttle handleDragOver dispatch

The `dragover` DOM event fires ~60×/second while dragging. Each call currently dispatches `SET_DRAG_OVER` unconditionally, which triggers a `useReducer` state update, which re-renders everything that reads `panelDrag`. Fix: only dispatch when the target panel differs from the last dispatched value.

**Files:**
- Modify: `frontend/src/features/events/hooks/useEventsPageInteractions.ts:266-279`
- Create: `frontend/tests/features/events/useEventsPageInteractions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/features/events/useEventsPageInteractions.test.tsx`:

```ts
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useSplitViewInteractions } from '@/features/events/hooks/useEventsPageInteractions'

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

function makeDragEvent(): React.DragEvent {
  return {
    preventDefault: () => {},
    dataTransfer: { dropEffect: '' as DataTransfer['dropEffect'] },
  } as unknown as React.DragEvent
}

describe('useSplitViewInteractions — handleDragOver', () => {
  it('sets dragOverPanel on first call', () => {
    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: [], sortOrder: 'newest' }),
      { wrapper }
    )
    act(() => {
      result.current.handleDragOver(1)(makeDragEvent())
    })
    expect(result.current.dragOverPanel).toBe(1)
  })

  it('updates dragOverPanel when called with a different panel', () => {
    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: [], sortOrder: 'newest' }),
      { wrapper }
    )
    act(() => {
      result.current.handleDragOver(1)(makeDragEvent())
    })
    act(() => {
      result.current.handleDragOver(2)(makeDragEvent())
    })
    expect(result.current.dragOverPanel).toBe(2)
  })

  it('dragOverPanel stays unchanged when called repeatedly with same panel', () => {
    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: [], sortOrder: 'newest' }),
      { wrapper }
    )
    act(() => {
      result.current.handleDragOver(1)(makeDragEvent())
    })
    // Second call same panel — should not change the exposed value
    act(() => {
      result.current.handleDragOver(1)(makeDragEvent())
    })
    expect(result.current.dragOverPanel).toBe(1)
  })
})

describe('useSplitViewInteractions — handleDragLeave', () => {
  it('clears dragOverPanel', () => {
    const { result } = renderHook(
      () => useSplitViewInteractions({ filteredEvents: [], sortOrder: 'newest' }),
      { wrapper }
    )
    act(() => {
      result.current.handleDragOver(1)(makeDragEvent())
    })
    act(() => {
      result.current.handleDragLeave({
        currentTarget: document.createElement('div'),
        relatedTarget: null,
      } as unknown as React.DragEvent)
    })
    expect(result.current.dragOverPanel).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm tests pass (behavior already correct, tests just verify it)**

```bash
cd frontend
npx vitest run tests/features/events/useEventsPageInteractions.test.ts
```

Expected: all 4 tests PASS (the behavior is correct; we're about to make the implementation more efficient without breaking it).

- [ ] **Step 3: Add `lastDragOverPanelRef` and gate the dispatch**

In `useEventsPageInteractions.ts`, inside `useSplitViewInteractions` function, add the ref after the `useReducer` call:

```ts
const lastDragOverPanelRef = useRef<1 | 2 | null>(null)
```

Replace the `handleDragOver` callback (currently around line 266):

```ts
// Before:
const handleDragOver = useCallback(
  (panel: 1 | 2) => (ev: React.DragEvent) => {
    ev.preventDefault()
    ev.dataTransfer.dropEffect = 'move'
    dispatchPanelDrag({ type: 'SET_DRAG_OVER', panel })
  },
  []
)
```

```ts
// After:
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

- [ ] **Step 4: Reset the ref in `handleDragLeave`**

Replace `handleDragLeave` (currently around line 275):

```ts
// Before:
const handleDragLeave = useCallback((ev: React.DragEvent) => {
  if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
    dispatchPanelDrag({ type: 'SET_DRAG_OVER', panel: null })
  }
}, [])
```

```ts
// After:
const handleDragLeave = useCallback((ev: React.DragEvent) => {
  if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
    lastDragOverPanelRef.current = null
    dispatchPanelDrag({ type: 'SET_DRAG_OVER', panel: null })
  }
}, [])
```

- [ ] **Step 5: Reset the ref in `handleDropToPanel`**

Add `lastDragOverPanelRef.current = null` before the existing `SET_DRAG_OVER null` dispatch in `handleDropToPanel` (around line 247):

```ts
const handleDropToPanel = useCallback(
  (targetPanel: 1 | 2) => (ev: React.DragEvent) => {
    ev.preventDefault()
    const data = ev.dataTransfer.getData('text/plain')
    if (!data) return
    if (targetPanel === 2) dispatchPanelDrag({ type: 'ADD_TO_PANEL2', data })
    else dispatchPanelDrag({ type: 'REMOVE_FROM_PANEL2', data })
    lastDragOverPanelRef.current = null
    dispatchPanelDrag({ type: 'SET_DRAG_OVER', panel: null })
    dispatchPanelDrag({ type: 'SET_DRAGGING', isDragging: false })
  },
  []
)
```

- [ ] **Step 6: Verify build and all tests**

```bash
cd frontend
npx tsc --noEmit
npx vitest run
```

Expected: 0 type errors, all tests pass (207 existing + 4 new = 211).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/events/hooks/useEventsPageInteractions.ts \
        frontend/tests/features/events/useEventsPageInteractions.test.tsx
git commit -m "perf(events): throttle SET_DRAG_OVER dispatch — only fire on panel change"
```

---

## Task 4: Debounce search query in useEventFilters

`filteredEvents` rescans all event fields on every keystroke. A 150ms debounce makes typing feel instant while the filter only runs when the user pauses.

**Note:** `searchQuery` is still used raw for `highlight()` rendering (text highlighting updates live). Only the filter scan is debounced.

**Files:**
- Modify: `frontend/src/features/events/hooks/useEventFilters.ts:1,74-109`
- Create: `frontend/tests/features/events/useEventFilters.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/features/events/useEventFilters.test.tsx`:

```ts
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventRecord } from '@/types/events'
import { useEventFilters } from '@/features/events/hooks/useEventFilters'

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

function makeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    time: new Date().toISOString(),
    action: 'BASH',
    path: '',
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ projects: [] }) })
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useEventFilters — search debounce', () => {
  it('does not filter events before 150ms after searchQuery change', () => {
    const events = [
      makeEvent({ command: 'echo hello' }),
      makeEvent({ command: 'cat file.txt' }),
    ]
    const { result, rerender } = renderHook(
      ({ q }) =>
        useEventFilters(
          events,
          q,
          vi.fn(),
          '',
          '5m',
          vi.fn(),
          '',
          vi.fn(),
          '',
          vi.fn(),
          false
        ),
      { wrapper, initialProps: { q: '' } }
    )

    // Both events visible initially
    expect(result.current.filteredEvents).toHaveLength(2)

    // Change query — matches only 1 event via 'command' field
    rerender({ q: 'hello' })

    // Before debounce expires — still unfiltered
    expect(result.current.filteredEvents).toHaveLength(2)

    // After 150ms — filter applied
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(result.current.filteredEvents).toHaveLength(1)
  })

  it('applies filter immediately when debounce expires', () => {
    const events = [makeEvent({ command: 'grep pattern file' })]
    const { result, rerender } = renderHook(
      ({ q }) =>
        useEventFilters(
          events,
          q,
          vi.fn(),
          '',
          '5m',
          vi.fn(),
          '',
          vi.fn(),
          '',
          vi.fn(),
          false
        ),
      { wrapper, initialProps: { q: '' } }
    )

    rerender({ q: 'nomatch' })
    act(() => { vi.advanceTimersByTime(150) })
    expect(result.current.filteredEvents).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to confirm tests FAIL**

```bash
cd frontend
npx vitest run tests/features/events/useEventFilters.test.ts
```

Expected: both tests FAIL because filter currently runs immediately on `searchQuery` change (no debounce yet).

- [ ] **Step 3: Add `debouncedSearchQuery` state and effect**

In `useEventFilters.ts`, add `useState` to the existing import line:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
```

(`useState` is already imported — confirm it's there; if not, add it.)

After the existing `const [agentFilter, setAgentFilter] = useState('all')` block (around line 25), add:

```ts
const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery)

useEffect(() => {
  const t = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 150)
  return () => window.clearTimeout(t)
}, [searchQuery])
```

- [ ] **Step 4: Swap `searchQuery` → `debouncedSearchQuery` in `filteredEvents` memo**

In the `filteredEvents` useMemo (around line 74), change the `if (searchQuery)` block and the dependency array:

```ts
// Before:
const filteredEvents = useMemo(() => {
  return events.filter((e) => {
    if (actionFilter !== 'all' && e.action !== actionFilter) return false
    if (agentFilter !== 'all' && e.agent !== agentFilter) return false
    if (
      projectFilter !== 'all' &&
      e.cwd !== projectFilter &&
      !e.cwd?.startsWith(projectFilter + '/')
    )
      return false
    if (sessionFilter && e.session !== sessionFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (
        !e.path?.toLowerCase().includes(q) &&
        !e.session?.toLowerCase().includes(q) &&
        !e.command?.toLowerCase().includes(q) &&
        !e.prompt?.toLowerCase().includes(q) &&
        !e.notification_message?.toLowerCase().includes(q) &&
        !e.error_message?.toLowerCase().includes(q) &&
        !e.response?.toLowerCase().includes(q) &&
        !e.task_title?.toLowerCase().includes(q) &&
        !e.subagent_type?.toLowerCase().includes(q) &&
        !e.trigger?.toLowerCase().includes(q) &&
        !e.tool_result_stdout?.toLowerCase().includes(q) &&
        !e.tool_result_stderr?.toLowerCase().includes(q)
      )
        return false
    }
    return true
  })
}, [events, actionFilter, agentFilter, projectFilter, searchQuery, sessionFilter])
```

```ts
// After:
const filteredEvents = useMemo(() => {
  return events.filter((e) => {
    if (actionFilter !== 'all' && e.action !== actionFilter) return false
    if (agentFilter !== 'all' && e.agent !== agentFilter) return false
    if (
      projectFilter !== 'all' &&
      e.cwd !== projectFilter &&
      !e.cwd?.startsWith(projectFilter + '/')
    )
      return false
    if (sessionFilter && e.session !== sessionFilter) return false
    if (debouncedSearchQuery) {
      const q = debouncedSearchQuery.toLowerCase()
      if (
        !e.path?.toLowerCase().includes(q) &&
        !e.session?.toLowerCase().includes(q) &&
        !e.command?.toLowerCase().includes(q) &&
        !e.prompt?.toLowerCase().includes(q) &&
        !e.notification_message?.toLowerCase().includes(q) &&
        !e.error_message?.toLowerCase().includes(q) &&
        !e.response?.toLowerCase().includes(q) &&
        !e.task_title?.toLowerCase().includes(q) &&
        !e.subagent_type?.toLowerCase().includes(q) &&
        !e.trigger?.toLowerCase().includes(q) &&
        !e.tool_result_stdout?.toLowerCase().includes(q) &&
        !e.tool_result_stderr?.toLowerCase().includes(q)
      )
        return false
    }
    return true
  })
}, [events, actionFilter, agentFilter, projectFilter, debouncedSearchQuery, sessionFilter])
```

- [ ] **Step 5: Run tests — confirm they now pass**

```bash
cd frontend
npx vitest run tests/features/events/useEventFilters.test.ts
```

Expected: both tests PASS.

- [ ] **Step 6: Run full test suite**

```bash
cd frontend
npx tsc --noEmit
npx vitest run
```

Expected: 0 type errors, all tests pass (211 existing + 2 new = 213).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/events/hooks/useEventFilters.ts \
        frontend/tests/features/events/useEventFilters.test.tsx
git commit -m "perf(events): debounce search filter scan 150ms to reduce per-keystroke CPU"
```

---

## Final Verification

- [ ] **Manual drag test:** Start dev server (`pnpm dev` in `frontend/`). Open events page with 1h+ time range. Drag a session header — should be smooth, no stutter.
- [ ] **Manual filter test:** Switch to 30d. Drag to edge zone — no lag.
- [ ] **Manual search test:** Type into search box — input feels instant, results update 150ms after pause.
- [ ] **Full test suite:** `npx vitest run` — all tests pass.
