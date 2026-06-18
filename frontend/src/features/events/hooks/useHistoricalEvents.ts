import { useCallback, useEffect, useRef, useState } from 'react'
import type { EventRecord, EventsResponse } from '@/types'
import { buildEventKey } from '../eventKey'

function buildHistoricalKey(event: EventRecord): string {
  // Include dedup_key when present so cursor-paginated batches with identical
  // structural fields (same time/action/path) don't collapse via dedup.
  const base = buildEventKey(event)
  return event.dedup_key ? `${base}|${event.dedup_key}` : base
}

export function useHistoricalEvents(
  since: string,
  until: string,
  sessionFilter: string,
  enabled: boolean,
  search = ''
) {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadVersion, setLoadVersion] = useState(0)
  const cursorRef = useRef<number>(0)

  const buildUrl = useCallback(
    (cursor: number) => {
      const params = new URLSearchParams()
      // Search spans the whole DB by session id / project, so it ignores the
      // time window — a matching session may sit outside the selected range.
      const searching = search.trim() !== ''
      if (searching) params.set('q', search.trim())
      if (!searching && since) params.set('since', since)
      if (!searching && until) params.set('until', until)
      if (sessionFilter) {
        // Single-session view: event-based pagination
        params.set('session', sessionFilter)
        if (cursor > 0) params.set('before_id', String(cursor))
        params.set('limit', '200')
      } else {
        // Multi-session view: session-based pagination
        params.set('session_limit', '100')
        if (cursor > 0) params.set('before_session_cursor', String(cursor))
      }
      const qs = params.toString()
      return `/api/events${qs ? `?${qs}` : ''}`
    },
    [since, until, sessionFilter, search]
  )

  const fetchPage = useCallback(
    async (cursor: number, replace: boolean) => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(buildUrl(cursor))
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
        const data = (await res.json()) as EventsResponse
        const incoming = data.events ?? []
        setHasMore(data.has_more ?? false)
        cursorRef.current = data.next_cursor ?? 0

        setEvents((prev) => {
          if (replace) {
            return incoming
          }
          const seen = new Set(prev.map(buildHistoricalKey))
          const next = [...prev]
          incoming.forEach((e) => {
            const key = buildHistoricalKey(e)
            if (!seen.has(key)) {
              seen.add(key)
              next.push(e)
            }
          })
          return next
        })
        if (replace) setLoadVersion((v) => v + 1)
      } catch {
        setError('Failed to load events.')
      } finally {
        setLoading(false)
      }
    },
    [buildUrl]
  )

  // Re-fetch from scratch whenever params or enabled change.
  useEffect(() => {
    if (!enabled) return
    cursorRef.current = 0
    const timeout = window.setTimeout(() => {
      void fetchPage(0, true)
    }, 0)
    return () => window.clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since, until, sessionFilter, enabled, search])

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return
    fetchPage(cursorRef.current, false)
  }, [fetchPage, loading, hasMore])

  const refresh = useCallback(() => {
    cursorRef.current = 0
    void fetchPage(0, true)
  }, [fetchPage])

  return { events, hasMore, loading, error, loadMore, refresh, loadVersion }
}
