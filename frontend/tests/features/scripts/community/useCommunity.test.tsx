import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCommunity } from '@/features/scripts/community/useCommunity'

afterEach(() => vi.restoreAllMocks())

const sample = [
  {
    id: 'demo',
    author: 'alice',
    title: 'Demo',
    tier: 'community',
    sha256: 'abc',
    source: 'scripts/alice/demo.js',
    installed: false,
    runtime_available: true,
  },
]

describe('useCommunity', () => {
  it('loads the catalog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => sample }))
    const { result } = renderHook(() => useCommunity())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.scripts).toHaveLength(1)
    expect(result.current.scripts[0].id).toBe('demo')
  })

  it('posts an install then reloads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => sample }) // initial load
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // install POST
      .mockResolvedValueOnce({ ok: true, json: async () => sample }) // reload
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCommunity())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.install('demo')
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/community/install',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
