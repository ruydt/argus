import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { EventRecord, EventsResponse } from '@/types'
import { buildEventKey } from '../eventKey'

export function useEvents(sessionFilterOverride = '') {
  const [searchParams] = useSearchParams()
  const sessionFilter = sessionFilterOverride || searchParams.get('session') || ''
  const [events, setEvents] = useState<EventRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

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

  const reload = useCallback(async () => {
    setRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (sessionFilter) params.set('session', sessionFilter)
      const qs = params.toString()
      const res = await fetch(`/api/events${qs ? `?${qs}` : ''}`)
      if (!res.ok) throw new Error(`Failed to reload events: ${res.status}`)
      const data = (await res.json()) as EventsResponse
      mergeEvents(data.events ?? [])
      setError(null)
    } catch {
      setError('Failed to reload events.')
    } finally {
      setRefreshing(false)
    }
  }, [mergeEvents, sessionFilter])

  useEffect(() => {
    if (!sessionFilter) return
    queueMicrotask(() => void reload())
  }, [reload, sessionFilter])

  useEffect(() => {
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
  }, [mergeEvents, sessionFilter])

  return { events, error, refreshing, reload }
}
