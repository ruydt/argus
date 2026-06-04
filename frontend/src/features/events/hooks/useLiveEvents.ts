import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { EventRecord } from '@/types'
import { buildEventKey } from '../eventKey'

export function useLiveEvents(
  sessionFilterOverride = '',
  { enabled = true }: { enabled?: boolean } = {}
) {
  const [searchParams] = useSearchParams()
  const sessionFilter = sessionFilterOverride || searchParams.get('session') || ''
  const [events, setEvents] = useState<EventRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    queueMicrotask(() => setEvents([]))
  }, [sessionFilter])

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
      return next
    })
  }, [])

  useEffect(() => {
    if (!enabled) return

    const seen = new Set<string>()
    const buffer: EventRecord[] = []
    let rafId: number | undefined

    const params = new URLSearchParams()
    if (sessionFilter) params.set('session', sessionFilter)
    const qs = params.toString()
    const es = new EventSource(`/api/events/stream${qs ? `?${qs}` : ''}`)

    const flush = () => {
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

        if (rafId !== undefined) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(flush)
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
    }
  }, [mergeEvents, sessionFilter, enabled])

  return { events, error }
}
