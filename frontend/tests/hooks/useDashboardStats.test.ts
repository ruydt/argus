import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'

// Use a unique query suffix per test to bypass the module-level statsCache.
// The cache is keyed by query string, so unique keys ensure a fresh fetch.
let testCounter = 0
function uniqueQuery() {
  return `__test__=${++testCounter}`
}

const minimalStats = {
  total_sessions: 5,
  total_events: 42,
  total_input_tokens: 1000,
  total_output_tokens: 500,
  timeline_granularity: 'day',
  timeline: [],
  timeline_by_agent: [],
  token_timeline: [],
  token_timeline_by_agent: [],
  top_actions: [],
  agent_usage: [],
  session_usage: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(minimalStats),
    })
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useDashboardStats', () => {
  it('returns stats on successful fetch', async () => {
    const query = uniqueQuery() // compute ONCE outside render fn to avoid re-render loop
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(minimalStats),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useDashboardStats(query))

    await waitFor(() => expect(result.current.stats).not.toBeNull())
    expect(result.current.stats?.total_sessions).toBe(5)
    expect(result.current.stats?.total_events).toBe(42)
    expect(result.current.loading).toBe(false)
  })

  it('calls /api/dashboard/stats with query params', async () => {
    const query = uniqueQuery()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(minimalStats),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useDashboardStats(query))

    await waitFor(() => expect(result.current.stats).not.toBeNull())
    expect(fetchMock).toHaveBeenCalledWith(`/api/dashboard/stats?${query}`)
  })

  it('leaves stats null when fetch returns ok:false', async () => {
    const query = uniqueQuery()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      })
    )

    const { result } = renderHook(() => useDashboardStats(query))

    // fetchingKey goes null→cacheKey→null in the effect's lifecycle
    // wait for the effect to complete by checking fetchingKey indirectly via loading
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    // Allow async state updates to flush
    await new Promise((r) => setTimeout(r, 50))
    expect(result.current.stats).toBeNull()
  })

  it('leaves stats null when fetch rejects', async () => {
    const query = uniqueQuery()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))

    const { result } = renderHook(() => useDashboardStats(query))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 50))
    expect(result.current.stats).toBeNull()
  })

  it('normalizes numeric fields from the response', async () => {
    const query = uniqueQuery()
    const rawStats = { ...minimalStats, total_sessions: '7', total_events: '99' }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify(rawStats),
      })
    )

    const { result } = renderHook(() => useDashboardStats(query))

    await waitFor(() => expect(result.current.stats).not.toBeNull())
    expect(result.current.stats?.total_sessions).toBe(7)
    expect(result.current.stats?.total_events).toBe(99)
  })
})
