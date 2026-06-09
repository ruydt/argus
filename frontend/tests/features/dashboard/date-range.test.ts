import { describe, expect, it, vi } from 'vitest'
import {
  formatRangeLabel,
  presetToDateRange,
  rangeToDashboardQuery,
} from '@/features/dashboard/date-range'

describe('date-range helpers', () => {
  it('returns a 14-day preset with a bounded range', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-09T12:00:00Z'))

    const range = presetToDateRange('14d')
    expect(range.from).toBeTruthy()
    expect(range.to).toBeTruthy()

    vi.useRealTimers()
  })

  it('formats labels for empty and closed ranges', () => {
    expect(formatRangeLabel({ from: undefined, to: undefined })).toBe('Select date range')
    expect(
      formatRangeLabel({
        from: new Date('2026-05-01T00:00:00Z'),
        to: new Date('2026-05-03T00:00:00Z'),
      })
    ).toBe('05/01/26 - 05/03/26')
  })

  it('builds dashboard query params with start and end', () => {
    const query = rangeToDashboardQuery({
      from: new Date('2026-05-01T12:00:00Z'),
      to: new Date('2026-05-03T12:00:00Z'),
    })
    const params = new URLSearchParams(query)
    expect(params.get('start')).toBeTruthy()
    expect(params.get('end')).toBeTruthy()
  })
})
