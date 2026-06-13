import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePollingInterval } from '@/hooks/usePollingInterval'

function setDocumentHiddenSilently(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
}

function setDocumentHidden(hidden: boolean) {
  setDocumentHiddenSilently(hidden)
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('usePollingInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setDocumentHiddenSilently(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setDocumentHiddenSilently(false)
  })

  it('fires on the interval while visible', () => {
    const cb = vi.fn()
    renderHook(() => usePollingInterval(cb, 1000))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('pauses while hidden and fires immediately on return', () => {
    const cb = vi.fn()
    renderHook(() => usePollingInterval(cb, 1000))

    act(() => {
      setDocumentHidden(true)
      vi.advanceTimersByTime(5000)
    })
    expect(cb).toHaveBeenCalledTimes(0)

    act(() => {
      setDocumentHidden(false)
    })
    expect(cb).toHaveBeenCalledTimes(1) // immediate refresh on return

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('does nothing when disabled', () => {
    const cb = vi.fn()
    renderHook(() => usePollingInterval(cb, 1000, false))
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(cb).toHaveBeenCalledTimes(0)
  })

  it('cleans up on unmount', () => {
    const cb = vi.fn()
    const { unmount } = renderHook(() => usePollingInterval(cb, 1000))
    unmount()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(cb).toHaveBeenCalledTimes(0)
  })
})
