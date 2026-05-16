import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEvents } from '@/features/events/hooks/useEvents'

let latestES: MockES
let searchParams = new URLSearchParams()

class MockES {
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()
  url: string

  constructor(url: string) {
    this.url = url
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    latestES = this
  }
}

vi.stubGlobal('EventSource', MockES)
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useSearchParams: () => [searchParams, vi.fn()],
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  searchParams = new URLSearchParams()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [] }),
    })
  )
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useEvents', () => {
  it('opens session-scoped EventSource url when session query exists', async () => {
    searchParams = new URLSearchParams('session=sess-1')
    renderHook(() => useEvents())

    await waitFor(() => expect(latestES.url).toBe('/api/events/stream?session=sess-1'))
  })

  it('clears accumulated events when session query changes', async () => {
    searchParams = new URLSearchParams('session=old')
    const { result, rerender } = renderHook(() => useEvents())

    await waitFor(() => expect(latestES.url).toBe('/api/events/stream?session=old'))

    latestES.onmessage?.({
      data: JSON.stringify({
        session: 'old',
        time: '2026-05-14T00:00:00Z',
        action: 'EDIT',
        path: '/tmp/old',
      }),
    } as MessageEvent)

    await waitFor(() => expect(result.current.events).toHaveLength(1))

    searchParams = new URLSearchParams('session=new')
    rerender()
    await waitFor(() => expect(latestES.url).toBe('/api/events/stream?session=new'))
    await waitFor(() => expect(result.current.events).toHaveLength(0))
  })

  it('fetches historical session events when session override provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useEvents('sess-override'))

    await waitFor(() => expect(latestES.url).toBe('/api/events/stream?session=sess-override'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/events?session=sess-override'))
  })
})
