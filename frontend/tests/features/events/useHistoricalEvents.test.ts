import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHistoricalEvents } from '@/features/events/hooks/useHistoricalEvents'

function makeEvent(overrides = {}) {
  return {
    session: 'sess-1',
    time: '2026-06-01T12:00:00Z',
    agent: 'codex',
    action: 'READ',
    path: '/tmp/f',
    hook_event_name: 'PreToolUse',
    dedup_key: Math.random().toString(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useHistoricalEvents', () => {
  it('fetches events on mount when enabled', async () => {
    const events = [makeEvent(), makeEvent()]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events, has_more: false, next_cursor: 0 }) })
    )

    const { result } = renderHook(() =>
      useHistoricalEvents('2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z', '', true)
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.events).toHaveLength(2)
    expect(result.current.hasMore).toBe(false)
  })

  it('does not fetch when enabled=false', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useHistoricalEvents('2026-06-01T00:00:00Z', '', '', false))

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not fetch when enabled=false even if since changes', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = renderHook(
      ({ since }) => useHistoricalEvents(since, '', '', false),
      { initialProps: { since: '2026-06-01T00:00:00Z' } }
    )

    rerender({ since: '2026-06-01T00:00:01Z' })
    rerender({ since: '2026-06-01T00:00:02Z' })

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not fetch on rerender when enabled=true and since is constant', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [], has_more: false, next_cursor: 0 }) })
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = renderHook(
      ({ since }) => useHistoricalEvents(since, '', '', true),
      { initialProps: { since: '2026-06-01T00:00:00Z' } }
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    rerender({ since: '2026-06-01T00:00:00Z' })
    rerender({ since: '2026-06-01T00:00:00Z' })

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('loadMore appends next page using next_cursor', async () => {
    const page1 = [makeEvent({ dedup_key: 'a' }), makeEvent({ dedup_key: 'b' })]
    const page2 = [makeEvent({ dedup_key: 'c' })]
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ events: page1, has_more: true, next_cursor: 42 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ events: page2, has_more: false, next_cursor: 0 }) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useHistoricalEvents('2026-06-01T00:00:00Z', '', '', true)
    )

    await waitFor(() => expect(result.current.events).toHaveLength(2))
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())

    await waitFor(() => expect(result.current.events).toHaveLength(3))
    expect(result.current.hasMore).toBe(false)

    // Second fetch must include before_session_cursor=42 (session-paginated mode)
    expect(fetchMock.mock.calls[1][0]).toContain('before_session_cursor=42')
  })

  it('refresh resets state and re-fetches from scratch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ events: [makeEvent()], has_more: false, next_cursor: 0 }) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useHistoricalEvents('2026-06-01T00:00:00Z', '', '', true)
    )

    await waitFor(() => expect(result.current.events).toHaveLength(1))

    act(() => result.current.refresh())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    // After refresh, cursor resets — second call must NOT contain before_id
    expect(fetchMock.mock.calls[1][0]).not.toContain('before_id')
  })

  it('sets error on fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    )

    const { result } = renderHook(() =>
      useHistoricalEvents('', '', '', true)
    )

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.loading).toBe(false)
  })
})
