import { useCallback, useEffect, useState } from 'react'
import type { EventRecord } from '@/types/events'

export interface TraceSpan {
  id: string
  name: string
  type: string
  startTime: number
  endTime: number
  duration: number
  parent_id?: string
  children: TraceSpan[]
  event: EventRecord
}

function buildTraceSpans(rawEvents: EventRecord[]) {
  const spanMap = new Map<string, TraceSpan>()

  for (const e of rawEvents) {
    if (!e.subagent_id) continue

    const time = new Date(e.time).getTime()

    if (!spanMap.has(e.subagent_id)) {
      spanMap.set(e.subagent_id, {
        id: e.subagent_id,
        name: e.task_title || e.tool || e.hook_event_name || 'Span',
        type: e.subagent_type || 'unknown',
        startTime: time,
        endTime: time,
        duration: 0,
        children: [],
        event: e,
        parent_id: e.turn_id || undefined,
      })
    }

    const span = spanMap.get(e.subagent_id)!
    if (time < span.startTime) span.startTime = time
    if (time > span.endTime) span.endTime = time

    if (e.duration_ms && e.duration_ms > 0) {
      const expectedEndTime = time + e.duration_ms
      if (expectedEndTime > span.endTime) {
        span.endTime = expectedEndTime
      }
    }

    span.duration = span.endTime - span.startTime
    if (e.task_title && span.name === 'Span') span.name = e.task_title
    if (e.tool && span.name === 'Span') span.name = e.tool
  }

  const sortedSpans = Array.from(spanMap.values()).sort((a, b) => a.startTime - b.startTime)
  const roots: TraceSpan[] = []
  const activeStack: TraceSpan[] = []

  for (const span of sortedSpans) {
    while (activeStack.length > 0 && activeStack[activeStack.length - 1].endTime < span.startTime) {
      activeStack.pop()
    }

    if (activeStack.length > 0) {
      const parent = activeStack[activeStack.length - 1]
      span.parent_id = parent.id
      parent.children.push(span)
    } else {
      roots.push(span)
    }

    activeStack.push(span)
  }

  return roots
}

export function useTraces(sessionId: string, since?: string) {
  const [traces, setTraces] = useState<TraceSpan[]>([])
  const [events, setEvents] = useState<EventRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTraces = useCallback(async () => {
    if (!sessionId) {
      setTraces([])
      setEvents([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const params = new URLSearchParams({ session_id: sessionId })
      if (since) params.set('since', since)
      const res = await fetch(`/api/traces?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { traces: EventRecord[] }

      const rawEvents = data.traces || []
      setEvents(rawEvents)
      setTraces(buildTraceSpans(rawEvents))
      setError(null)
    } catch {
      setError('Failed to load traces')
    } finally {
      setLoading(false)
    }
  }, [sessionId, since])

  useEffect(() => {
    queueMicrotask(() => void fetchTraces())
  }, [fetchTraces])

  useEffect(() => {
    if (!sessionId) return

    const params = new URLSearchParams({ session: sessionId })
    const es = new EventSource(`/api/events/stream?${params.toString()}`)

    es.onmessage = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as EventRecord
        if (event.session === sessionId) {
          queueMicrotask(() => void fetchTraces())
        }
      } catch {
        // ignore malformed stream events
      }
    }

    return () => es.close()
  }, [fetchTraces, sessionId])

  return { traces, events, loading, error }
}
