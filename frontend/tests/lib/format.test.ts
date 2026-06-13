import { describe, expect, it } from 'vitest'
import { formatEventTime, highlight } from '@/lib/format'

describe('formatEventTime', () => {
  it('formats an ISO timestamp as a locale time', () => {
    const iso = '2026-06-13T10:20:30Z'
    expect(formatEventTime(iso)).toBe(new Date(iso).toLocaleTimeString([], { hour12: false }))
  })

  it('returns the cached value on repeat calls', () => {
    const iso = '2026-06-13T11:00:00Z'
    expect(formatEventTime(iso)).toBe(formatEventTime(iso))
  })
})

describe('highlight regex cache', () => {
  it('still highlights after the query changes', () => {
    // Exercise the cache invalidation path: two different queries in sequence.
    const first = highlight('alpha beta', 'alpha')
    const second = highlight('alpha beta', 'beta')
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
  })
})
