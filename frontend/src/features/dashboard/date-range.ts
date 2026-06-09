import { endOfDay, format, startOfDay, startOfMonth, startOfWeek, subDays } from 'date-fns'
import type { DateRange } from 'react-day-picker'

export const PRESETS = ['wtd', 'mtd', '7d', '14d', '30d'] as const

export type DashboardRangePreset = (typeof PRESETS)[number] | 'custom'

export function presetToDateRange(preset: Exclude<DashboardRangePreset, 'custom'>): DateRange {
  const now = new Date()

  switch (preset) {
    case 'wtd':
      return { from: startOfWeek(now, { weekStartsOn: 0 }), to: now }
    case 'mtd':
      return { from: startOfMonth(now), to: now }
    case '7d':
      return { from: subDays(now, 6), to: now }
    case '14d':
      return { from: subDays(now, 13), to: now }
    case '30d':
      return { from: subDays(now, 29), to: now }
  }
}

export function formatRangeLabel(range: DateRange) {
  if (!range.from) return 'Select date range'
  if (!range.to) return format(range.from, 'MM/dd/yy')
  return `${format(range.from, 'MM/dd/yy')} - ${format(range.to, 'MM/dd/yy')}`
}

export function rangeToDashboardQuery(range: DateRange) {
  if (!range.from) return ''
  const start = startOfDay(range.from).toISOString()
  const end = endOfDay(range.to ?? range.from).toISOString()
  const params = new URLSearchParams({ start, end })
  return params.toString()
}
