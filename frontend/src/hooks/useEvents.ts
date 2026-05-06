import { useEffect, useState } from 'react'
import type { EventRecord, EventsResponse } from '@/types'

export function useEvents() {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let timeoutId: number | undefined
    let controller: AbortController | null = null

    const fetchEvents = async () => {
      controller?.abort()
      controller = new AbortController()

      try {
        const res = await fetch('/api/events', { signal: controller.signal })
        if (!res.ok) {
          throw new Error(`Failed to fetch events: ${res.status}`)
        }

        const data = (await res.json()) as EventsResponse
        if (!active) {
          return
        }

        setEvents(data.events ?? [])
        setError(null)
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) {
          return
        }

        setError('Failed to fetch events')
      }

      if (!active) {
        return
      }

      timeoutId = window.setTimeout(() => {
        void fetchEvents()
      }, 1000)
    }

    void fetchEvents()

    return () => {
      active = false
      controller?.abort()
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [])

  return { events, error }
}
