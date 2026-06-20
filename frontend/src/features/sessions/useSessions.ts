import { useCallback, useMemo, useState } from 'react'
import { useHistoricalEvents } from '@/features/events/hooks/useHistoricalEvents'
import { useLiveEvents } from '@/features/events/hooks/useLiveEvents'
import { mergeByKey } from '@/features/events/eventKey'
import type { EventRecord, SessionSummary } from '@/types'

type Accumulator = {
  sessionId: string
  cwd: string
  transcriptPath: string
  count: number
  lastTimeMs: number
  sample: EventRecord
}

/**
 * Recents data source. Pulls the most recent sessions via the multi-session
 * pagination on /api/events (session_limit), folds in the live SSE stream so
 * new sessions surface in real time, and groups everything into one summary
 * row per session id — newest activity first.
 */
export function useSessions() {
  // Empty session filter → the historical hook paginates by *session*
  // (session_limit=100) and exposes loadMore for older sessions.
  const hist = useHistoricalEvents('', '', '', true, '')
  const live = useLiveEvents('', { enabled: true })

  const merged = useMemo(() => mergeByKey(hist.events, live.events), [hist.events, live.events])

  // Optimistically hide deleted sessions. A backend delete removes their rows
  // from the DB, but the live SSE buffer may still hold their events — without
  // this they'd re-merge and reappear until the page reloads.
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const removeSessions = useCallback((ids: string[]) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
  }, [])

  const sessions = useMemo(() => {
    const map = new Map<string, Accumulator>()
    for (const event of merged) {
      const key = event.session || event.transcript_path || 'ungrouped'
      if (excluded.has(key)) continue
      const timeMs = new Date(event.time).getTime()
      const existing = map.get(key)
      if (existing) {
        existing.count += 1
        if (timeMs > existing.lastTimeMs) {
          existing.lastTimeMs = timeMs
          existing.sample = event
        }
        if (!existing.cwd && event.cwd) existing.cwd = event.cwd
        continue
      }
      map.set(key, {
        sessionId: key,
        cwd: event.cwd ?? '',
        transcriptPath: event.transcript_path ?? '',
        count: 1,
        lastTimeMs: Number.isNaN(timeMs) ? 0 : timeMs,
        sample: event,
      })
    }

    return Array.from(map.values())
      .map<SessionSummary>((acc) => ({
        sessionId: acc.sessionId,
        cwd: acc.cwd,
        transcriptPath: acc.transcriptPath,
        count: acc.count,
        lastTimeMs: acc.lastTimeMs,
        sample: acc.sample,
      }))
      .sort((a, b) => b.lastTimeMs - a.lastTimeMs)
  }, [merged, excluded])

  return {
    sessions,
    loading: hist.loading,
    error: live.error ?? hist.error,
    hasMore: hist.hasMore,
    loadMore: hist.loadMore,
    refresh: hist.refresh,
    removeSessions,
  }
}
