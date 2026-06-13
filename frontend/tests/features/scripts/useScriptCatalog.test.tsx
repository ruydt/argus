import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useScriptCatalog } from '@/features/scripts/hooks/useScriptCatalog'

const catalog = {
  packages: [{ id: 'stop', filename: 'stop.js', installed: false, runtime_available: true }],
  bundles: [],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useScriptCatalog', () => {
  it('loads the catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(catalog) }))
    )
    const { result } = renderHook(() => useScriptCatalog())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.catalog?.packages[0].id).toBe('stop')
  })

  it('posts install then reloads', async () => {
    const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST')
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      return Promise.resolve({ ok: true, json: () => Promise.resolve(catalog) })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useScriptCatalog())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.install('stop')
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/scripts/install',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('surfaces an error on failed load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 500 }))
    )
    const { result } = renderHook(() => useScriptCatalog())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('500')
  })
})
