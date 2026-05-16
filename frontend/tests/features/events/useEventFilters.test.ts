import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { createElement } from 'react'
import { useEventFilters } from '@/features/events/hooks/useEventFilters'
import type { EventRecord } from '@/types'

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock)
  vi.clearAllMocks()
  localStorageMock.getItem.mockReturnValue(null)
})

const makeWrapper =
  (search = '') =>
  ({ children }: { children: React.ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [`/${search}`] }, children)

describe('useEventFilters — sessionFilter', () => {
  it('filters events to matching session when ?session param set', () => {
    const events: EventRecord[] = [
      {
        time: new Date().toISOString(),
        action: 'EDIT',
        path: '/a',
        session: 'target-session',
        agent: 'claudecode',
      },
      {
        time: new Date().toISOString(),
        action: 'EDIT',
        path: '/b',
        session: 'other-session',
        agent: 'claudecode',
      },
    ]

    const { result } = renderHook(() => useEventFilters(events, '', vi.fn()), {
      wrapper: makeWrapper('?session=target-session'),
    })

    expect(result.current.filteredEvents).toHaveLength(1)
    expect(result.current.filteredEvents[0].session).toBe('target-session')
  })

  it('shows all events when no ?session param', () => {
    const events: EventRecord[] = [
      {
        time: new Date().toISOString(),
        action: 'EDIT',
        path: '/a',
        session: 'sess-1',
        agent: 'claudecode',
      },
      {
        time: new Date().toISOString(),
        action: 'EDIT',
        path: '/b',
        session: 'sess-2',
        agent: 'claudecode',
      },
    ]

    const { result } = renderHook(() => useEventFilters(events, '', vi.fn()), {
      wrapper: makeWrapper(),
    })

    expect(result.current.filteredEvents).toHaveLength(2)
  })

  it('shows old events for selected session regardless of time window', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const events: EventRecord[] = [
      {
        time: twoDaysAgo,
        action: 'EDIT',
        path: '/a',
        session: 'target-session',
        agent: 'claudecode',
      },
      {
        time: new Date().toISOString(),
        action: 'EDIT',
        path: '/b',
        session: 'other-session',
        agent: 'claudecode',
      },
    ]

    const { result } = renderHook(() => useEventFilters(events, '', vi.fn()), {
      wrapper: makeWrapper('?session=target-session'),
    })

    expect(result.current.filteredEvents).toHaveLength(1)
    expect(result.current.filteredEvents[0].session).toBe('target-session')
  })

  it('filters events to override session even when URL has no session param', () => {
    const events: EventRecord[] = [
      {
        time: new Date().toISOString(),
        action: 'EDIT',
        path: '/a',
        session: 'target-session',
        agent: 'claudecode',
      },
      {
        time: new Date().toISOString(),
        action: 'EDIT',
        path: '/b',
        session: 'other-session',
        agent: 'claudecode',
      },
    ]

    const { result } = renderHook(() => useEventFilters(events, '', vi.fn(), 'target-session'), {
      wrapper: makeWrapper(),
    })

    expect(result.current.filteredEvents).toHaveLength(1)
    expect(result.current.filteredEvents[0].session).toBe('target-session')
  })
})
