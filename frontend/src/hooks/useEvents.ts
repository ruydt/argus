import { useEffect, useState } from 'react'
import type { EventRecord } from '@/types'

function eventKey(e: EventRecord): string {
  return `${e.session ?? ''}|${e.time}|${e.action}|${e.path}`
}

export function useEvents() {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const seen = new Set<string>()
    const buffer: EventRecord[] = []
    let rafId: number | undefined

    const es = new EventSource('/api/events/stream')

    const flush = () => {
      const batch = buffer.splice(0)
      if (batch.length > 0) {
        setEvents(prev => [...prev, ...batch])
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
  }, [])

  return { events, error }
}
