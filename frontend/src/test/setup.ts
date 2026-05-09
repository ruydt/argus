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

beforeEach(() => {
  setMatchMediaMatches(false)
  matchMediaMock.mockClear()
})

afterEach(() => {
  cleanup()
})
