import { useEffect, useMemo, useState } from 'react'
import type { EventRecord } from '@/types/events'

export function useEventFilters(events: EventRecord[]) {
  const [actionFilter, setActionFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
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

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const eventTime = new Date(e.time).getTime()
      if (timeRange === 'custom') {
        const startMs = parseLocalDateTime(customStart)
        const endMs = parseLocalDateTime(customEnd)
        if (!Number.isNaN(startMs) && eventTime < startMs) return false
        if (!Number.isNaN(endMs) && eventTime > endMs) return false
      } else {
        if (rangeStartMs !== null && eventTime < rangeStartMs) return false
      }
      
      if (actionFilter !== 'all' && e.action !== actionFilter) return false
      
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
          !e.subagent_type?.toLowerCase().includes(q)
        )
          return false
      }
      return true
    })
  }, [events, actionFilter, searchQuery, timeRange, customStart, customEnd, rangeStartMs])

  return {
    actionFilter,
    setActionFilter,
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
  }
}
