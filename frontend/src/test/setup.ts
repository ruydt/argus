import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

let matchMediaMatches = false

export function setMatchMediaMatches(matches: boolean) {
  matchMediaMatches = matches
}

export const matchMediaMock = vi.fn((query: string) => ({
  matches: matchMediaMatches,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(() => false),
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: matchMediaMock,
})

// jsdom has no EventSource. The Recents data layer (useSessions → useLiveEvents)
// opens an SSE stream from Layout on every route, so provide an inert stub that
// never emits — tests that care about live events mock the hook directly.
class EventSourceStub {
  onmessage: ((ev: MessageEvent) => void) | null = null
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  close() {}
}

if (!('EventSource' in globalThis)) {
  Object.defineProperty(globalThis, 'EventSource', {
    writable: true,
    configurable: true,
    value: EventSourceStub,
  })
}

// jsdom lacks ResizeObserver (used by cmdk's Command in the SearchSelect picker)
// and Element.prototype.scrollIntoView (used by Radix/cmdk on active items).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  })
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}

beforeEach(() => {
  setMatchMediaMatches(false)
  matchMediaMock.mockClear()
})

afterEach(() => {
  cleanup()
})
