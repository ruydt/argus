import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTraces } from '@/features/sessions/hooks/useTraces'

let latestES: MockES

class MockES {
  onmessage: ((ev: MessageEvent) => void) | null = null
  close = vi.fn()
  url: string

  constructor(url: string) {
    this.url = url
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    latestES = this
  }
}

vi.stubGlobal('EventSource', MockES)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useTraces', () => {
  it('fetches traces scoped to session and since timestamp', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ traces: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useTraces('sess-1', '2026-05-14T10:00:00Z'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/traces?session_id=sess-1&since=2026-05-14T10%3A00%3A00Z'
      )
    )
  })

  it('refetches only for SSE events matching current session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ traces: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useTraces('sess-1'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    latestES.onmessage?.({ data: JSON.stringify({ session: 'other' }) } as MessageEvent)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    latestES.onmessage?.({ data: JSON.stringify({ session: 'sess-1' }) } as MessageEvent)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
