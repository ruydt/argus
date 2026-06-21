import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { EventRecord } from '@/types'
import { buildEventKey } from '../eventKey'

// Cap the in-memory live window. A long, busy SSE session would otherwise grow the
// events array (and per-flush dedup cost) without bound; older events remain reachable
// via historical pagination.
const MAX_LIVE_EVENTS = 2000

export function useLiveEvents(
  sessionFilterOverride = '',
  {
    enabled = true,
    since = '',
    until = '',
  }: { enabled?: boolean; since?: string; until?: string } = {}
) {
  const [searchParams] = useSearchParams()
  const sessionFilter = sessionFilterOverride || searchParams.get('session') || ''
  const [events, setEvents] = useState<EventRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    queueMicrotask(() => setEvents([]))
  }, [sessionFilter, since, until])

  const mergeEvents = useCallback((incoming: EventRecord[]) => {
    setEvents((prev) => {
      const seen = new Set(prev.map(buildEventKey))
      const next = [...prev]
      incoming.forEach((event) => {
        const key = buildEventKey(event)
        if (seen.has(key)) return
        seen.add(key)
        next.push(event)
      })
      return next.length > MAX_LIVE_EVENTS ? next.slice(next.length - MAX_LIVE_EVENTS) : next
    })
  }, [])

  useEffect(() => {
    if (!enabled) return

    const seen = new Set<string>()
    const buffer: EventRecord[] = []
    let rafId: number | undefined
    let timeoutId: number | undefined

    const params = new URLSearchParams()
    if (sessionFilter) params.set('session', sessionFilter)
    if (since) params.set('since', since)
    if (until) params.set('until', until)
    const qs = params.toString()
    const es = new EventSource(`/api/events/stream${qs ? `?${qs}` : ''}`)

    const flush = () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      rafId = undefined
      timeoutId = undefined
      const batch = buffer.splice(0)
      if (batch.length > 0) {
        mergeEvents(batch)
      }
    }

    es.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data as string) as EventRecord
        const key = buildEventKey(e)
        if (seen.has(key)) return
        seen.add(key)
        buffer.push(e)
        setError(null)

        // rAF batches paints while the tab is visible, but it's paused in
        // background tabs — a setTimeout fallback still fires there so new
        // sessions reach the sidebar without a manual reload.
        if (rafId !== undefined) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(flush)
        if (timeoutId === undefined) timeoutId = window.setTimeout(flush, 1000)
      } catch {
        // ignore parse errors
      }
    }

    es.onopen = () => {
      setError(null)
    }

    es.onerror = () => {
      setError('Connection lost, reconnecting...')
    }

    return () => {
      es.close()
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }, [mergeEvents, sessionFilter, enabled, since, until])

  return { events, error }
}
