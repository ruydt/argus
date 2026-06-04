import { useEffect, useMemo, useState } from 'react'

const TIME_RANGE_STORAGE_KEY = 'events_time_range'
const CUSTOM_START_STORAGE_KEY = 'events_custom_start'
const CUSTOM_END_STORAGE_KEY = 'events_custom_end'

const TIME_RANGE_OFFSETS_MINUTES: Record<string, number> = {
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '6h': 360,
  '24h': 1440,
  '7d': 10080,
  '30d': 43200,
}

type UseEventsTimeRangeStateOptions = {
  isLive: boolean
  sessionFilter: string
}

export function useEventsTimeRangeState({ isLive, sessionFilter }: UseEventsTimeRangeStateOptions) {
  const [timeRange, setTimeRange] = useState(
    () => localStorage.getItem(TIME_RANGE_STORAGE_KEY) ?? '15m'
  )
  const [customStart, setCustomStart] = useState(
    () => localStorage.getItem(CUSTOM_START_STORAGE_KEY) ?? ''
  )
  const [customEnd, setCustomEnd] = useState(
    () => localStorage.getItem(CUSTOM_END_STORAGE_KEY) ?? ''
  )
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    localStorage.setItem(TIME_RANGE_STORAGE_KEY, timeRange)
  }, [timeRange])

  useEffect(() => {
    localStorage.setItem(CUSTOM_START_STORAGE_KEY, customStart)
  }, [customStart])

  useEffect(() => {
    localStorage.setItem(CUSTOM_END_STORAGE_KEY, customEnd)
  }, [customEnd])

  useEffect(() => {
    if (timeRange === 'custom') return
    if (isLive) {
      // Snap once when live activates; SSE delivers new events so nowMs must not
      // tick — a rolling sinceISO would trigger repeated historical refetches.
      setNowMs(Date.now())
      return
    }
    // Non-live: re-snap immediately then tick every minute so relative windows
    // like "last 5 minutes" stay accurate instead of drifting from page-open time.
    setNowMs(Date.now())
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [timeRange, isLive])

  const sinceISO = useMemo(() => {
    if (timeRange === 'custom') {
      return customStart ? new Date(customStart.replace(' ', 'T')).toISOString() : ''
    }

    const mins = TIME_RANGE_OFFSETS_MINUTES[timeRange]
    return mins !== undefined ? new Date(nowMs - mins * 60 * 1000).toISOString() : ''
  }, [customStart, nowMs, timeRange])

  const untilISO = useMemo(() => {
    if (timeRange !== 'custom') return ''
    return customEnd ? new Date(customEnd.replace(' ', 'T')).toISOString() : ''
  }, [customEnd, timeRange])

  return {
    timeRange,
    setTimeRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    fetchSince: sessionFilter ? '' : sinceISO,
    fetchUntil: sessionFilter ? '' : untilISO,
  }
}
