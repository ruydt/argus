import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEventsTimeRangeState } from '@/features/events/hooks/useEventsTimeRangeState'

const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-05T10:00:00.000Z'))
  vi.stubGlobal('localStorage', localStorageMock)
  vi.clearAllMocks()
  localStorageMock.getItem.mockImplementation((key: string) => {
    switch (key) {
      case 'events_time_range':
        return 'custom'
      case 'events_custom_start':
        return '2026-06-01 08:00:00'
      case 'events_custom_end':
        return '2026-06-01 09:30:00'
      default:
        return null
    }
  })
})

describe('useEventsTimeRangeState', () => {
  it('loads persisted values and suppresses fetch window for a session-specific view', () => {
    const { result } = renderHook(() =>
      useEventsTimeRangeState({ isLive: true, sessionFilter: 'sess-1' })
    )

    expect(result.current.timeRange).toBe('custom')
    expect(result.current.customStart).toBe('2026-06-01 08:00:00')
    expect(result.current.customEnd).toBe('2026-06-01 09:30:00')
    expect(result.current.fetchSince).toBe('')
    expect(result.current.fetchUntil).toBe('')
  })

  it('computes custom fetch bounds when no session filter is active', () => {
    const { result } = renderHook(() =>
      useEventsTimeRangeState({ isLive: true, sessionFilter: '' })
    )

    expect(result.current.fetchSince).toBe(new Date('2026-06-01T08:00:00').toISOString())
    expect(result.current.fetchUntil).toBe(new Date('2026-06-01T09:30:00').toISOString())
  })

  it('advances fetchSince after 60 seconds in non-live mode', () => {
    localStorageMock.getItem.mockReturnValue(null) // default 15m range
    const { result } = renderHook(() =>
      useEventsTimeRangeState({ isLive: false, sessionFilter: '' })
    )

    const initial = result.current.fetchSince

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current.fetchSince).not.toBe(initial)
    expect(result.current.fetchSince > initial).toBe(true)
  })

  it('does not advance fetchSince after 60 seconds in live mode', () => {
    localStorageMock.getItem.mockReturnValue(null) // default 15m range
    const { result } = renderHook(() =>
      useEventsTimeRangeState({ isLive: true, sessionFilter: '' })
    )

    const initial = result.current.fetchSince

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(result.current.fetchSince).toBe(initial)
  })

  it('persists updates when the user changes the time controls', () => {
    const { result } = renderHook(() =>
      useEventsTimeRangeState({ isLive: true, sessionFilter: '' })
    )

    act(() => {
      result.current.setTimeRange('15m')
      result.current.setCustomStart('2026-06-02 10:00:00')
      result.current.setCustomEnd('2026-06-02 11:00:00')
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith('events_time_range', '15m')
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'events_custom_start',
      '2026-06-02 10:00:00'
    )
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'events_custom_end',
      '2026-06-02 11:00:00'
    )
  })
})
