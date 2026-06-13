import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCollection } from '@/features/scripts/collection/useCollection'

afterEach(() => vi.restoreAllMocks())

describe('useCollection', () => {
  it('shows unauthenticated when status says so', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/github/status')
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ authenticated: false }),
          })
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ scripts: [] }) })
      })
    )
    const { result } = renderHook(() => useCollection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.status?.authenticated).toBe(false)
    expect(result.current.collection).toBeNull()
  })

  it('loads the collection when authenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/github/status')
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ authenticated: true, login: 'ruy' }),
          })
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ scripts: [{ id: 'g', filename: 'g.js', installed: false }] }),
        })
      })
    )
    const { result } = renderHook(() => useCollection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.status?.login).toBe('ruy')
    expect(result.current.collection?.scripts[0].id).toBe('g')
  })
})
