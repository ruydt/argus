import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogTail } from '@/features/diagnostics/hooks/useLogTail'

describe('useLogTail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not fetch on mount', () => {
    renderHook(() => useLogTail('argus'))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches when fetch() is called', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ file: 'argus.log', lines: ['line1', 'line2'] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useLogTail('argus', 10))

    await act(async () => {
      await result.current.fetch()
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/diagnostics/log-tail?file=argus&lines=10')
    expect(result.current.lines).toEqual(['line1', 'line2'])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('fetches hook-scripts log', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ file: 'hook-scripts.log', lines: ['script line'] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useLogTail('hook-scripts', 25))

    await act(async () => {
      await result.current.fetch()
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/diagnostics/log-tail?file=hook-scripts&lines=25')
    expect(result.current.lines).toEqual(['script line'])
  })

  it('sets error on HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }))
    const { result } = renderHook(() => useLogTail('build'))

    await act(async () => {
      await result.current.fetch()
    })

    expect(result.current.error).toBe('Failed to load log')
    expect(result.current.lines).toEqual([])
  })

  it('clear() resets state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ file: 'argus.log', lines: ['x'] }),
      })
    )
    const { result } = renderHook(() => useLogTail('argus'))

    await act(async () => {
      await result.current.fetch()
    })
    expect(result.current.lines).toEqual(['x'])

    act(() => {
      result.current.clear()
    })
    expect(result.current.lines).toEqual([])
    expect(result.current.error).toBeNull()
  })
})
