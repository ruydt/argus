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

describe('useEventFilters — search is backend-resolved', () => {
  it('does not filter loaded events client-side by the search query', () => {
    // Search by session id / project is resolved on the backend, which returns
    // whole matching sessions. The hook must not re-filter the loaded page by
    // free text (that previously hid project-search results).
    const events = [makeEvent({ command: 'echo hello' }), makeEvent({ command: 'cat file.txt' })]
    const { result, rerender } = renderHook(
      ({ q }) =>
        useEventFilters(events, q, vi.fn(), '', '5m', vi.fn(), '', vi.fn(), '', vi.fn(), false),
      { wrapper, initialProps: { q: '' } }
    )

    expect(result.current.filteredEvents).toHaveLength(2)

    rerender({ q: 'hello' })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    // Still both events — the query does not narrow the loaded set.
    expect(result.current.filteredEvents).toHaveLength(2)
  })
})

describe('useEventFilters — project filter is exact cwd', () => {
  it('does not match nested project cwds under the selected parent dir', () => {
    // Regression: a parent dir (/Users/duytran) must not capture sessions whose
    // cwd is a nested project (/Users/duytran/GitHub/argus). Each cwd is its own
    // project — no prefix match.
    const events = [
      makeEvent({ cwd: '/Users/duytran', session: 'home' }),
      makeEvent({ cwd: '/Users/duytran/GitHub/argus', session: 'argus' }),
      makeEvent({ cwd: '/Users/duytran/GitHub/htcstone', session: 'htcstone' }),
    ]
    const { result } = renderHook(
      ({ q }) =>
        useEventFilters(events, q, vi.fn(), '', '5m', vi.fn(), '', vi.fn(), '', vi.fn(), false),
      { wrapper, initialProps: { q: '' } }
    )

    act(() => {
      result.current.setProjectFilter('/Users/duytran')
    })

    expect(result.current.filteredEvents.map((e) => e.session)).toEqual(['home'])
  })
})

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
    act(() => {
      result.current.setActionFilter('BASH')
    })
    // useEffect runs synchronously inside act
    expect(sessionStorage.getItem('events_action_filter')).toBe('BASH')
  })
})

describe('useEventFilters append short-circuit', () => {
  function makeAppendEvent(overrides: Partial<EventRecord> = {}): EventRecord {
    return {
      time: '2026-06-13T00:00:00Z',
      agent: 'claudecode',
      session: 's1',
      action: 'EDIT',
      ...overrides,
    } as EventRecord
  }

  function renderFilters(events: EventRecord[]) {
    return renderHook(
      ({ evts }) =>
        useEventFilters(evts, '', vi.fn(), '', 'all', vi.fn(), '', vi.fn(), '', vi.fn(), true),
      { wrapper, initialProps: { evts: events } }
    )
  }

  it('append path matches a full re-filter', () => {
    const base = [
      makeAppendEvent({ session: 's1', action: 'EDIT' }),
      makeAppendEvent({ session: 's2', action: 'BASH' }),
    ]
    const { result, rerender } = renderFilters(base)
    expect(result.current.filteredEvents).toHaveLength(2)

    // Live merge appends to a fresh array, preserving item identities.
    const appended = [...base, makeAppendEvent({ session: 's3', action: 'EDIT' })]
    rerender({ evts: appended })
    expect(result.current.filteredEvents).toHaveLength(3)
    expect(result.current.filteredEvents).toEqual(appended)
  })

  it('keeps the same filtered array identity when re-rendered with the same array', () => {
    const base = [makeAppendEvent({ session: 's1' })]
    const { result, rerender } = renderFilters(base)
    const firstResult = result.current.filteredEvents

    rerender({ evts: base })
    expect(result.current.filteredEvents).toBe(firstResult)
  })

  it('full re-filter on shrink/reset', () => {
    const base = [makeAppendEvent({ session: 's1' }), makeAppendEvent({ session: 's2' })]
    const { result, rerender } = renderFilters(base)
    expect(result.current.filteredEvents).toHaveLength(2)

    rerender({ evts: [] })
    expect(result.current.filteredEvents).toHaveLength(0)
  })

  it('append path excludes an appended event that fails the active filter', () => {
    // The highest-risk path: the appended slice must be filtered with the
    // same predicate as a full re-filter, not blindly concatenated.
    const base = [makeAppendEvent({ session: 's1', hook_event_name: 'PreToolUse' })]
    const { result, rerender } = renderHook(
      ({ evts }) =>
        useEventFilters(evts, '', vi.fn(), '', 'all', vi.fn(), '', vi.fn(), '', vi.fn(), true),
      { wrapper, initialProps: { evts: base } }
    )
    act(() => {
      result.current.setActionFilter('PreToolUse')
    })
    expect(result.current.filteredEvents).toHaveLength(1)

    // Append a PostToolUse event — excluded by the active PreToolUse filter.
    const appended = [...base, makeAppendEvent({ session: 's2', hook_event_name: 'PostToolUse' })]
    rerender({ evts: appended })
    expect(result.current.filteredEvents).toHaveLength(1)
    expect(result.current.filteredEvents.map((e) => e.session)).toEqual(['s1'])
  })
})
