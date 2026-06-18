import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { EventRecord } from '@/types/events'
import type { Session } from '@/types/sessions'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { usePollingInterval } from '@/hooks/usePollingInterval'
import { formatDuration, isRunning, projectName, sessionDurationMs } from './utils'

const PAGE_SIZE = 20

function totalTokens(session: Session) {
  return (
    session.usage.input_tokens +
    session.usage.output_tokens +
    session.usage.cache_creation_tokens +
    session.usage.cache_read_tokens
  )
}

export function SessionListPage() {
  const { encodedCwd = '' } = useParams()
  const cwd = useMemo(() => decodeURIComponent(encodedCwd), [encodedCwd])
  const cwdBasename = projectName(cwd)
  const navigate = useNavigate()
  const [refreshKey, setRefreshKey] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const fetchPage = useCallback(
    async (page: number) => {
      const res = await fetch(
        `/api/sessions?cwd=${encodeURIComponent(cwd)}&page=${page}&size=${PAGE_SIZE}`
      )
      if (!res.ok) return { items: [] as Session[], hasMore: false }
      const data = (await res.json()) as { sessions: Session[]; has_more: boolean }
      return { items: data.sessions ?? [], hasMore: data.has_more ?? false }
    },
    [cwd]
  )

  // resetKey combines cwd + refreshKey so SSE updates reset from page 1
  const resetKey = `${cwd}:${refreshKey}`

  const {
    items: sessions,
    loading,
    loadingMore,
    sentinelRef,
  } = useInfiniteScroll<Session>(fetchPage, resetKey, PAGE_SIZE)

  // SSE subscription — refresh list when a matching event arrives
  useEffect(() => {
    const es = new EventSource('/api/events/stream')
    es.onmessage = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as EventRecord
        if (event.cwd === cwd) setRefreshKey((k) => k + 1)
      } catch {
        // ignore malformed stream events
      }
    }
    return () => es.close()
  }, [cwd])

  // Only tick the 1s "now" clock while at least one session is live (and the tab
  // is visible). A project full of ended sessions re-renders zero times per second.
  const hasLive = useMemo(() => sessions.some((s) => isRunning(s, nowMs)), [sessions, nowMs])
  usePollingInterval(() => setNowMs(Date.now()), 1000, hasLive)

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="border-b border-foreground/10 bg-foreground/[0.04] px-6 py-4">
        <div className="text-[12px] font-semibold uppercase tracking-widest text-foreground/45">
          <Link to="/projects" className="hover:text-foreground/70 transition-colors">
            Projects
          </Link>
          {' › '}
          {cwdBasename}
        </div>
        <h1 className="mt-1 text-xl font-semibold" title={cwd}>
          {cwdBasename}
        </h1>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-sm text-foreground/45">Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div className="text-sm text-foreground/55">No sessions for this project.</div>
        ) : (
          <>
            <div
              className="overflow-hidden rounded-lg border border-foreground/10"
              data-tour="sessions-table"
            >
              <table className="w-full border-collapse text-sm">
                <thead className="bg-foreground/[0.04] text-left text-[11px] uppercase tracking-wider text-foreground/45">
                  <tr>
                    <th className="px-4 py-3 font-medium">Session</th>
                    <th className="px-4 py-3 font-medium">Agent</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Tokens</th>
                    <th className="px-4 py-3 font-medium">Started</th>
                    <th className="px-4 py-3 font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session, i) => {
                    const running = isRunning(session, nowMs)
                    const sessionPath = `/sessions/${encodeURIComponent(cwd)}/${session.session_id}`
                    return (
                      <tr
                        key={session.session_id}
                        className="cursor-pointer border-t border-foreground/10 hover:bg-accent"
                        onClick={() => navigate(sessionPath)}
                        {...(i === 0
                          ? { 'data-tour': 'sessions-first-row', 'data-tour-navigate': sessionPath }
                          : {})}
                      >
                        <td className="px-4 py-3 text-[12px] text-foreground/75">
                          <span className="flex items-center gap-2">
                            {running && <span className="h-1.5 w-1.5 rounded-full bg-green-400" />}
                            {session.session_id.slice(0, 12)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded border border-foreground/10 bg-foreground/[0.04] px-2 py-1 text-[12px]">
                            {session.agent}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground/70">
                          {formatDuration(sessionDurationMs(session, nowMs))}
                        </td>
                        <td className="px-4 py-3 text-foreground/70">
                          {totalTokens(session).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-foreground/55">
                          {new Date(session.started_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-foreground/55">
                          {new Date(session.last_seen_at).toLocaleString()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loadingMore && <span className="text-xs text-foreground/40">Loading more…</span>}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
