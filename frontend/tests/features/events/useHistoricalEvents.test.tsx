import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHistoricalEvents } from '@/features/events/hooks/useHistoricalEvents'

function makeEventsResponse(
  events = [{ time: new Date().toISOString(), action: 'BASH', path: '' }]
) {
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
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {}))
    ) // never resolves
    const { result } = renderHook(() => useHistoricalEvents('2026-01-01T00:00:00Z', '', '', true))
    expect(result.current.loadVersion).toBe(0)
  })

  it('increments to 1 after first replace fetch completes', async () => {
    const { result } = renderHook(() => useHistoricalEvents('2026-01-01T00:00:00Z', '', '', true))
    await waitFor(() => expect(result.current.loadVersion).toBe(1))
  })

  it('increments again on refresh', async () => {
    const { result } = renderHook(() => useHistoricalEvents('2026-01-01T00:00:00Z', '', '', true))
    await waitFor(() => expect(result.current.loadVersion).toBe(1))
    act(() => {
      result.current.refresh()
    })
    await waitFor(() => expect(result.current.loadVersion).toBe(2))
  })

  it('does NOT increment on loadMore (append fetch)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          events: [{ time: new Date().toISOString(), action: 'BASH', path: '' }],
          has_more: true,
          next_cursor: 99,
        }),
      })
    )
    const { result } = renderHook(() => useHistoricalEvents('2026-01-01T00:00:00Z', '', '', true))
    await waitFor(() => expect(result.current.loadVersion).toBe(1))
    act(() => {
      result.current.loadMore()
    })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.loadVersion).toBe(1) // still 1 — append, not replace
  })
})
