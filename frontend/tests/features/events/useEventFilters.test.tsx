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

    expect(result.current.filteredEvents).toHaveLength(2)

    rerender({ q: 'hello' })

    // Before debounce expires — still unfiltered
    expect(result.current.filteredEvents).toHaveLength(2)

    // After 150ms — filter applied
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(result.current.filteredEvents).toHaveLength(1)
  })

  it('applies filter when debounce expires', () => {
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
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(result.current.filteredEvents).toHaveLength(0)
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
    act(() => { result.current.setActionFilter('BASH') })
    // useEffect runs synchronously inside act
    expect(sessionStorage.getItem('events_action_filter')).toBe('BASH')
  })
})
