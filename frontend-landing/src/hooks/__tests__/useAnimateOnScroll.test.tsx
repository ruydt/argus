import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useAnimateOnScroll } from '../useAnimateOnScroll'

type ObserverCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver
) => void

let capturedCallback: ObserverCallback | null = null
const mockObserve = vi.fn()
const mockUnobserve = vi.fn()
const mockDisconnect = vi.fn()

function TestComponent() {
  const ref = useAnimateOnScroll<HTMLDivElement>()
  return <div ref={ref} data-testid="el" className="animate-on-scroll" />
}

beforeEach(() => {
  capturedCallback = null
  mockObserve.mockClear()
  mockUnobserve.mockClear()
  mockDisconnect.mockClear()

  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: ObserverCallback) {
        capturedCallback = cb
      }
      observe = mockObserve
      unobserve = mockUnobserve
      disconnect = mockDisconnect
    }
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAnimateOnScroll', () => {
  it('observes the element on mount', () => {
    render(<TestComponent />)
    expect(mockObserve).toHaveBeenCalledTimes(1)
  })

  it('adds visible class when element intersects', () => {
    render(<TestComponent />)
    const el = screen.getByTestId('el')
    expect(el.classList.contains('visible')).toBe(false)
    capturedCallback!(
      [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
    expect(el.classList.contains('visible')).toBe(true)
  })

  it('unobserves after intersection fires', () => {
    render(<TestComponent />)
    const el = screen.getByTestId('el')
    capturedCallback!(
      [{ isIntersecting: true, target: el } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
    expect(mockUnobserve).toHaveBeenCalledWith(el)
  })

  it('does not add visible class when not intersecting', () => {
    render(<TestComponent />)
    const el = screen.getByTestId('el')
    capturedCallback!(
      [{ isIntersecting: false, target: el } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver
    )
    expect(el.classList.contains('visible')).toBe(false)
  })

  it('disconnects observer on unmount', () => {
    const { unmount } = render(<TestComponent />)
    unmount()
    expect(mockDisconnect).toHaveBeenCalledTimes(1)
  })
})
