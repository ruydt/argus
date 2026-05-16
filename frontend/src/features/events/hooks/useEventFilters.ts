import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Dispatch, SetStateAction } from 'react'
import type { EventRecord } from '@/types/events'

export function useEventFilters(
  events: EventRecord[],
  searchQuery: string,
  setSearchQuery: Dispatch<SetStateAction<string>>,
  sessionFilterOverride = ''
) {
  const [searchParams] = useSearchParams()
  const sessionFilter = sessionFilterOverride || searchParams.get('session') || ''

  const [actionFilter, setActionFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')
  const [timeRange, setTimeRange] = useState(
    () => localStorage.getItem('events_time_range') ?? '15m'
  )
  const [customStart, setCustomStart] = useState(
    () => localStorage.getItem('events_custom_start') ?? ''
  )
  const [customEnd, setCustomEnd] = useState(() => localStorage.getItem('events_custom_end') ?? '')

  useEffect(() => {
    localStorage.setItem('events_time_range', timeRange)
  }, [timeRange])

  useEffect(() => {
    localStorage.setItem('events_custom_start', customStart)
  }, [customStart])

  useEffect(() => {
    localStorage.setItem('events_custom_end', customEnd)
  }, [customEnd])

  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (timeRange === 'custom') return

    const updateNow = () => setNowMs(Date.now())
    const timeout = window.setTimeout(updateNow, 0)
    const interval = window.setInterval(updateNow, 1000)

    return () => {
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [timeRange])

  const parseLocalDateTime = (s: string) => {
    if (!s) return NaN
    return new Date(s.replace(' ', 'T')).getTime()
  }

  const rangeStartMs = useMemo(() => {
    switch (timeRange) {
      case '5m':
        return nowMs - 5 * 60 * 1000
      case '15m':
        return nowMs - 15 * 60 * 1000
      case '1h':
        return nowMs - 60 * 60 * 1000
      case '6h':
        return nowMs - 6 * 60 * 60 * 1000
      case '24h':
        return nowMs - 24 * 60 * 60 * 1000
      case '7d':
        return nowMs - 7 * 24 * 60 * 60 * 1000
      case '30d':
        return nowMs - 30 * 24 * 60 * 60 * 1000
      default:
        return null
    }
  }, [nowMs, timeRange])

  const availableAgents = useMemo(() => {
    const agents = new Set<string>()
    for (const e of events) {
      if (e.agent) agents.add(e.agent)
    }
    return Array.from(agents).sort()
  }, [events])

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const eventTime = new Date(e.time).getTime()
      // When deep-linking by ?session=<id>, prioritize showing all events for that session.
      if (!sessionFilter) {
        if (timeRange === 'custom') {
          const startMs = parseLocalDateTime(customStart)
          const endMs = parseLocalDateTime(customEnd)
          if (!Number.isNaN(startMs) && eventTime < startMs) return false
          if (!Number.isNaN(endMs) && eventTime > endMs) return false
        } else {
          if (rangeStartMs !== null && eventTime < rangeStartMs) return false
        }
      }

      if (actionFilter !== 'all' && e.action !== actionFilter) return false

      if (agentFilter !== 'all' && e.agent !== agentFilter) return false

      if (sessionFilter && e.session !== sessionFilter) return false

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (
          !e.path?.toLowerCase().includes(q) &&
          !e.session?.toLowerCase().includes(q) &&
          !e.command?.toLowerCase().includes(q) &&
          !e.prompt?.toLowerCase().includes(q) &&
          !e.notification_message?.toLowerCase().includes(q) &&
          !e.error_message?.toLowerCase().includes(q) &&
          !e.response?.toLowerCase().includes(q) &&
          !e.task_title?.toLowerCase().includes(q) &&
          !e.subagent_type?.toLowerCase().includes(q) &&
          !e.trigger?.toLowerCase().includes(q) &&
          !e.tool_result_stdout?.toLowerCase().includes(q) &&
          !e.tool_result_stderr?.toLowerCase().includes(q)
        )
          return false
      }
      return true
    })
  }, [
    events,
    actionFilter,
    agentFilter,
    searchQuery,
    timeRange,
    customStart,
    customEnd,
    rangeStartMs,
    sessionFilter,
  ])

  return {
    actionFilter,
    setActionFilter,
    agentFilter,
    setAgentFilter,
    availableAgents,
    searchQuery,
    setSearchQuery,
    sortOrder,
    setSortOrder,
    timeRange,
    setTimeRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    filteredEvents,
    sessionFilter,
  }
}
