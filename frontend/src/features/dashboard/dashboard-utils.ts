import type { AgentModelUsage, DashboardStats, TimelineBucket } from './hooks/useDashboardStats'
import { displayModel, displayProviderModel } from '@/lib/utils'

export const DASHBOARD_TIME_RANGES = [
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: 'All', value: 'all' },
] as const

export const MODEL_COLORS: Record<string, string> = {
  'gpt-5.5': 'var(--chart-2)',
  'gpt-5.4': 'var(--chart-2)',
  'gpt-5.4-mini': 'var(--chart-3)',
  'gpt-5.3-codex': 'var(--chart-4)',
  'gpt-5.2': 'var(--chart-4)',
  'gpt-4o': 'var(--chart-2)',
  'gpt-4-turbo': 'var(--chart-2)',
  'claude-3-5-sonnet-20241022': 'var(--chart-1)',
  'claude-3-opus-20240229': 'var(--chart-1)',
  'claude-3-5-haiku-20241022': 'var(--chart-1)',
  'claude-4-6-sonnet': 'var(--chart-1)',
  'claude-4-7-opus': 'var(--chart-1)',
  'claude-4-5-haiku': 'var(--chart-1)',
}

export function apiRange(value: string) {
  return value === 'all' ? '' : value
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function getModelColor(model: string, idx: number) {
  if (MODEL_COLORS[model]) return MODEL_COLORS[model]
  const fallback = [
    'var(--chart-3)',
    'var(--chart-2)',
    'var(--chart-1)',
    'var(--chart-4)',
    'var(--chart-5)',
  ]
  return fallback[idx % fallback.length]
}

export function toTokenChartData(stats: DashboardStats | null) {
  if (!stats) return []
  return stats.agent_usage.map((usage) => ({
    label: `${usage.agent} / ${displayModel(usage.model)}`,
    agent: usage.agent,
    model: displayModel(usage.model),
    input: usage.input,
    output: usage.output,
    cache_creation: usage.cache_creation,
    cache_read: usage.cache_read,
    total: usage.input + usage.output + usage.cache_creation + usage.cache_read,
  }))
}

export function toTokenShareChartData(stats: DashboardStats | null) {
  if (!stats || stats.agent_usage.length === 0) {
    return {
      total: 0,
      data: [] as Array<Record<string, number | string>>,
      series: [] as Array<{
        key: string
        label: string
        provider: string
        model: string
        total: number
      }>,
    }
  }

  const sortedUsage = [...stats.agent_usage].sort((a, b) => {
    const aTotal = a.input + a.output
    const bTotal = b.input + b.output
    if (aTotal !== bTotal) return bTotal - aTotal
    return a.model.localeCompare(b.model)
  })

  const series = sortedUsage.map((usage, index) => ({
    key: `share_${index}`,
    label: displayProviderModel(usage.provider, usage.model),
    provider: usage.provider,
    model: usage.model,
    total: usage.input + usage.output,
  }))

  const grandTotal = series.reduce((sum, item) => sum + item.total, 0)
  const dataPoint: Record<string, number | string> = { label: 'Total tokens' }
  for (const item of series) {
    dataPoint[item.key] = (item.total / grandTotal) * 100
  }

  return {
    total: series.reduce((sum, item) => sum + item.total, 0),
    data: [dataPoint],
    series,
  }
}

export function toTimelineData(stats: DashboardStats | null) {
  if (!stats) return []
  return stats.timeline.map((bucket) => ({
    ...bucket,
    localLabel: formatTimelineLabel(bucket),
  }))
}

function formatTimelineLabel(bucket: TimelineBucket) {
  const utcDate = new Date(`${bucket.date.replace(' ', 'T')}:00Z`)
  if (Number.isNaN(utcDate.getTime())) return bucket.date
  return utcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

export type TokenChartDatum = ReturnType<typeof toTokenChartData>[number]
export type AgentUsageRow = AgentModelUsage

export function formatSharePercent(value: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((value / total) * 100)}%`
}
