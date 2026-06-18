import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

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

// Parse a free-text local datetime into an ISO string. Returns '' for partial/invalid
// input (which occurs on nearly every keystroke) so an in-progress custom range is
// treated as "no bound" instead of throwing RangeError during render.
function toISOOrEmpty(value: string): string {
  if (!value) return ''
  const d = new Date(value.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

type NowStore = {
  getSnapshot: () => number
  setSnapshot: (value: number) => void
  subscribe: (listener: () => void) => () => void
}

function createNowStore(initialValue: number): NowStore {
  let current = initialValue
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => current,
    setSnapshot: (value) => {
      if (value === current) return
      current = value
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
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
  const [nowStore] = useState(() => createNowStore(Date.now()))

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

    nowStore.setSnapshot(Date.now())
    if (isLive) return

    // Non-live relative windows resnap immediately on mode/range changes,
    // then advance once per minute without refetching on unrelated renders.
    const id = window.setInterval(() => nowStore.setSnapshot(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [isLive, nowStore, timeRange])

  const nowMs = useSyncExternalStore(nowStore.subscribe, nowStore.getSnapshot, nowStore.getSnapshot)

  const sinceISO = useMemo(() => {
    if (timeRange === 'custom') {
      return toISOOrEmpty(customStart)
    }

    const mins = TIME_RANGE_OFFSETS_MINUTES[timeRange]
    return mins !== undefined ? new Date(nowMs - mins * 60 * 1000).toISOString() : ''
  }, [customStart, nowMs, timeRange])

  const untilISO = useMemo(() => {
    if (timeRange !== 'custom') return ''
    return toISOOrEmpty(customEnd)
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
