import { format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import type { DashboardStats } from './hooks/useDashboardStats'

function csvCell(value: string | number): string {
  const text = String(value)
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function csvRow(cells: Array<string | number>): string {
  return cells.map(csvCell).join(',')
}

const HEADER = [
  'Session ID',
  'Agent',
  'Provider',
  'Model',
  'Started At',
  'Last Seen At',
  'Input Tokens',
  'Output Tokens',
]

export function buildStatsCsv(stats: DashboardStats): string {
  const rows = stats.session_usage.map((s) =>
    csvRow([
      s.session_id,
      s.agent,
      s.provider,
      s.model,
      s.started_at,
      s.last_seen_at,
      s.input,
      s.output,
    ])
  )
  return [csvRow(HEADER), ...rows].join('\n') + '\n'
}

export function statsCsvFilename(range: DateRange): string {
  const from = range.from ? format(range.from, 'yyyyMMdd') : 'all'
  const to = range.to ? format(range.to, 'yyyyMMdd') : from
  return `argus-sessions-${from}-${to}.csv`
}

export function downloadStatsCsv(stats: DashboardStats, range: DateRange): void {
  const csv = buildStatsCsv(stats)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = statsCsvFilename(range)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
