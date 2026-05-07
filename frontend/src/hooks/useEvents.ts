import { useCallback, useEffect, useState } from 'react'
import type { EventRecord, EventsResponse } from '@/types'

function eventKey(e: EventRecord): string {
  return `${e.session ?? ''}|${e.time}|${e.action}|${e.path}`
}

export function useEvents() {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const mergeEvents = useCallback((incoming: EventRecord[]) => {
    setEvents((prev) => {
      const seen = new Set(prev.map(eventKey))
      const next = [...prev]
      incoming.forEach((event) => {
        const key = eventKey(event)
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
      const res = await fetch('/api/events')
      if (!res.ok) throw new Error(`Failed to reload events: ${res.status}`)
      const data = (await res.json()) as EventsResponse
      mergeEvents(data.events ?? [])
      setError(null)
    } catch {
      setError('Failed to reload events.')
    } finally {
      setRefreshing(false)
    }
  }, [mergeEvents])

  useEffect(() => {
    const seen = new Set<string>()
    const buffer: EventRecord[] = []
    let rafId: number | undefined

    const es = new EventSource('/api/events/stream')

    const flush = () => {
      const batch = buffer.splice(0)
      if (batch.length > 0) {
        mergeEvents(batch)
      }
    }

    es.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data as string) as EventRecord
        const key = eventKey(e)
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

    es.onerror = () => {
      setError('Connection lost, reconnecting...')
    }

    return () => {
      es.close()
      if (rafId !== undefined) cancelAnimationFrame(rafId)
    }
  }, [mergeEvents])

  return { events, error, refreshing, reload }
}
