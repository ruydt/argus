import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCollection, __resetCollectionCache } from '@/features/scripts/collection/useCollection'

afterEach(() => {
  vi.restoreAllMocks()
  __resetCollectionCache()
})

const view = {
  authenticated: true,
  gist_url: 'https://gist.github.com/x',
  entries: [
    { id: 'a', filename: 'a.js', title: 'A', local: true, gist: false },
    { id: 'b', filename: 'b.js', title: 'B', local: false, gist: true },
  ],
}

describe('useCollection', () => {
  it('loads the union view', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    const { result } = renderHook(() => useCollection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.authenticated).toBe(true)
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.gistUrl).toBe('https://gist.github.com/x')
  })

  it('removeBoth deletes local then gist', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => view }) // initial load
      .mockResolvedValueOnce({ ok: true }) // DELETE local
      .mockResolvedValueOnce({ ok: true }) // DELETE gist
      .mockResolvedValueOnce({ ok: true, json: async () => view }) // reload
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCollection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.removeBoth({
        id: 'a',
        filename: 'a.js',
        title: 'A',
        local: true,
        gist: true,
      })
    })
    const urls = fetchMock.mock.calls.map((c) => c[0])
    expect(urls).toContain('/api/collection/local?filename=a.js')
    expect(urls).toContain('/api/collection?id=a')
  })
})
