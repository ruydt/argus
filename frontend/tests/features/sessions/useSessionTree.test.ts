import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSessionTree } from '@/features/sessions/hooks/useSessionTree'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

let latestES: MockES

class MockES {
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  onopen: (() => void) | null = null
  close = vi.fn()
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    latestES = this
  }
}

vi.stubGlobal('EventSource', MockES)

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useSessionTree', () => {
  it('fetches tree with correct since param', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [{ session: { session_id: 's1' }, children: [] }] }),
    })

    const since = '2026-05-01T00:00:00Z'
    const { result } = renderHook(() => useSessionTree(since))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('since='))
    expect(result.current.nodes).toHaveLength(1)
  })

  it('refetches when SubagentStart SSE event arrives', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [] }),
    })

    const { result } = renderHook(() => useSessionTree('2026-01-01T00:00:00Z'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const callsBefore = mockFetch.mock.calls.length

    latestES.onmessage?.({
      data: JSON.stringify({ hook_event_name: 'SubagentStart', session: 's1' }),
    } as MessageEvent)

    await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('refetches when SessionEnd SSE event arrives', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [] }),
    })

    const { result } = renderHook(() => useSessionTree('2026-01-01T00:00:00Z'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const callsBefore = mockFetch.mock.calls.length

    latestES.onmessage?.({
      data: JSON.stringify({ hook_event_name: 'SessionEnd', session: 's1' }),
    } as MessageEvent)

    await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('refetches when SubagentStop SSE event arrives', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [] }),
    })

    const { result } = renderHook(() => useSessionTree('2026-01-01T00:00:00Z'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const callsBefore = mockFetch.mock.calls.length

    latestES.onmessage?.({
      data: JSON.stringify({ hook_event_name: 'SubagentStop', session: 's1' }),
    } as MessageEvent)

    await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('refetches when Stop SSE event arrives', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [] }),
    })

    const { result } = renderHook(() => useSessionTree('2026-01-01T00:00:00Z'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const callsBefore = mockFetch.mock.calls.length

    latestES.onmessage?.({
      data: JSON.stringify({ hook_event_name: 'Stop', session: 's1' }),
    } as MessageEvent)

    await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('refetches when STOP action event arrives', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [] }),
    })

    const { result } = renderHook(() => useSessionTree('2026-01-01T00:00:00Z'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const callsBefore = mockFetch.mock.calls.length

    latestES.onmessage?.({
      data: JSON.stringify({ action: 'STOP', session: 's1' }),
    } as MessageEvent)

    await waitFor(() => expect(mockFetch.mock.calls.length).toBeGreaterThan(callsBefore))
  })

  it('does not refetch for lifecycle event without session id', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [] }),
    })

    const { result } = renderHook(() => useSessionTree('2026-01-01T00:00:00Z'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const callsBefore = mockFetch.mock.calls.length

    latestES.onmessage?.({
      data: JSON.stringify({ hook_event_name: 'SessionEnd', session: '' }),
    } as MessageEvent)

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mockFetch.mock.calls.length).toBe(callsBefore)
  })

  it('sets error on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useSessionTree('2026-01-01T00:00:00Z'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeTruthy()
  })
})
