import type { AgentModelUsage, DashboardStats } from './hooks/useDashboardStats'
import { displayModel, displayProviderModel } from '@/lib/utils'
import { AGENTS } from '@/agents'

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
  'gemini-2.0-flash': 'var(--chart-5)',
  'gemini-2.0-pro-exp': 'var(--chart-5)',
  'gemini-3-flash-preview': 'var(--chart-5)',
}

export function apiRange(value: string) {
  return value === 'all' ? '' : value
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
    localLabel: formatTimelineLabel(bucket.date, stats.timeline_granularity),
  }))
}

export function toTimelineByAgentChartData(stats: DashboardStats | null, query: string = '') {
  if (!stats || stats.timeline_by_agent.length === 0) {
    return { data: [] as Array<Record<string, number | string>>, series: [] as string[] }
  }

  const byDate = new Map<string, Record<string, number | string>>()
  const series = new Set<string>()

  for (const bucket of stats.timeline_by_agent) {
    const key = bucket.agent || 'unknown'
    series.add(key)
    const row = byDate.get(bucket.date) ?? {
      date: bucket.date,
      localLabel: formatTimelineLabel(bucket.date, stats.timeline_granularity),
    }
    row[key] = Number(bucket.count || 0)
    byDate.set(bucket.date, row)
  }

  const orderedSeries = [...series].sort((a, b) => agentLabel(a).localeCompare(agentLabel(b)))
  const keysFromRange = timelineKeysFromQuery(query, stats.timeline_granularity)
  const orderedKeys =
    keysFromRange.length > 0
      ? [...new Set([...keysFromRange, ...byDate.keys()])].sort((a, b) => a.localeCompare(b))
      : [...byDate.keys()].sort((a, b) => a.localeCompare(b))

  const data = orderedKeys.map((key) => {
    const row =
      byDate.get(key) ??
      ({
        date: key,
        localLabel: formatTimelineLabel(key, stats.timeline_granularity),
      } as Record<string, number | string>)
    const next = { ...row } as Record<string, number | string>
    for (const seriesKey of orderedSeries) {
      if (typeof next[seriesKey] !== 'number') {
        next[seriesKey] = 0
      }
    }
    return next
  })

  return { data, series: orderedSeries }
}

function formatTimelineLabel(date: string, granularity: DashboardStats['timeline_granularity']) {
  const utcDate = new Date(`${date.replace(' ', 'T')}:00Z`)
  if (Number.isNaN(utcDate.getTime())) return date
  if (granularity === 'day') {
    return utcDate.toLocaleDateString([], { month: 'short', day: '2-digit' })
  }
  return utcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function timelineKeysFromQuery(query: string, granularity: DashboardStats['timeline_granularity']) {
  if (!query) return []
  const params = new URLSearchParams(query)
  const start = params.get('start')
  const end = params.get('end')
  if (!start || !end) return []

  const startDate = new Date(start)
  const endDate = new Date(end)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return []
  if (endDate < startDate) return []

  const stepMs = granularity === 'day' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000
  const current = bucketFloor(startDate, granularity).getTime()
  const last = bucketFloor(endDate, granularity).getTime()

  const keys: string[] = []
  for (let ts = current; ts <= last; ts += stepMs) {
    keys.push(toBucketKey(new Date(ts), granularity))
  }
  return keys
}

function bucketFloor(date: Date, granularity: DashboardStats['timeline_granularity']) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const hour = date.getUTCHours()
  if (granularity === 'day') {
    return new Date(Date.UTC(year, month, day, 0, 0, 0, 0))
  }
  return new Date(Date.UTC(year, month, day, hour, 0, 0, 0))
}

function toBucketKey(date: Date, granularity: DashboardStats['timeline_granularity']) {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  if (granularity === 'day') {
    return `${year}-${month}-${day} 00:00`
  }
  const hour = `${date.getUTCHours()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:00`
}

function agentLabel(agent: string) {
  return (
    AGENTS.find((item) => item.id === agent)?.label || (agent === 'unknown' ? 'Unknown' : agent)
  )
}

export type TokenChartDatum = ReturnType<typeof toTokenChartData>[number]
export type AgentUsageRow = AgentModelUsage

export function formatSharePercent(value: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((value / total) * 100)}%`
}
