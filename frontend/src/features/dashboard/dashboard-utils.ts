import type { DashboardStats } from './hooks/useDashboardStats'
import { displayModel } from '@/lib/utils'
import { AGENTS } from '@/agents'

export function toTokenChartData(stats: DashboardStats | null) {
  if (!stats) return []
  return stats.agent_usage
    .filter((usage) => usage.model !== '<synthetic>')
    .map((usage) => ({
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
  const localDate = new Date(`${date.replace(' ', 'T')}:00`)
  if (Number.isNaN(localDate.getTime())) return date
  if (granularity === 'day') {
    return localDate.toLocaleDateString([], { month: 'short', day: '2-digit' })
  }
  return localDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
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
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()
  const hour = date.getHours()
  if (granularity === 'day') {
    return new Date(year, month, day, 0, 0, 0, 0)
  }
  return new Date(year, month, day, hour, 0, 0, 0)
}

function toBucketKey(date: Date, granularity: DashboardStats['timeline_granularity']) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  if (granularity === 'day') {
    return `${year}-${month}-${day} 00:00`
  }
  const hour = `${date.getHours()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:00`
}
function agentLabel(agent: string) {
  return (
    AGENTS.find((item) => item.id === agent)?.label || (agent === 'unknown' ? 'Unknown' : agent)
  )
}

export function toTokenTimelineByAgentData(stats: DashboardStats | null, query: string = '') {
  if (!stats || stats.token_timeline_by_agent.length === 0) {
    return { data: [] as Array<Record<string, number | string>>, series: [] as string[] }
  }

  const byDate = new Map<string, Record<string, number | string>>()
  const series = new Set<string>()

  for (const bucket of stats.token_timeline_by_agent) {
    const key = bucket.agent || 'unknown'
    series.add(key)
    const row = byDate.get(bucket.date) ?? {
      date: bucket.date,
      localLabel: formatTimelineLabel(bucket.date, stats.timeline_granularity),
    }
    row[key] = Number(bucket.total || 0)
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
    for (const s of orderedSeries) {
      if (typeof next[s] !== 'number') next[s] = 0
    }
    return next
  })

  return { data, series: orderedSeries }
}

export function formatSharePercent(value: number, total: number) {
  if (!total) return '0%'
  return `${Math.round((value / total) * 100)}%`
}
