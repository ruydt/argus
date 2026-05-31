import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileChanges } from '@/features/sessions/hooks/useFileChanges'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useFileChanges', () => {
  it('fetches file changes scoped to encoded session ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useFileChanges('sess 1/with slash'))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/file-changes?session_id=sess%201%2Fwith%20slash')
    )
  })

  it('exposes successful group data with old and new line fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            path: '/tmp/app.ts',
            count: 1,
            changes: [
              {
                time: '2026-05-14T10:00:00Z',
                tool: 'Edit',
                old_string: 'old line',
                new_string: 'new line',
                start_line: 7,
              },
            ],
          },
        ],
      })
    )

    const { result } = renderHook(() => useFileChanges('sess-1'))

    await waitFor(() => expect(result.current.groups).toHaveLength(1))
    expect(result.current.groups[0].changes[0]).toMatchObject({
      old_string: 'old line',
      new_string: 'new line',
      start_line: 7,
    })
    expect(result.current.error).toBeNull()
  })

  it('exposes error state when fetch returns ok:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })
    )

    const { result } = renderHook(() => useFileChanges('sess-error'))

    await waitFor(() => expect(result.current.error).toBe('500'))
    expect(result.current.groups).toEqual([])
  })

  it('exposes error state when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')))

    const { result } = renderHook(() => useFileChanges('sess-reject'))

    await waitFor(() => expect(result.current.error).toBe('network failure'))
    expect(result.current.groups).toEqual([])
  })

  it('does not fetch for an empty session ID', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useFileChanges(''))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.groups).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
