import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useEventFilters } from '../hooks/useEventFilters'
import type { EventRecord } from '@/types/events'

function ev(partial: Partial<EventRecord>): EventRecord {
  return { time: '2026-06-18T00:00:00Z', action: '', path: '', ...partial }
}

describe('useEventFilters availableProjects', () => {
  it('derives sorted unique cwds from events with no network call', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const events = [ev({ cwd: '/b' }), ev({ cwd: '/a' }), ev({ cwd: '/b' }), ev({ cwd: '' })]
    const { result } = renderHook(
      () => useEventFilters(events, '', vi.fn(), '', 'all', vi.fn(), '', vi.fn(), '', vi.fn()),
      { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> }
    )
    expect(result.current.availableProjects).toEqual(['/a', '/b'])
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
