import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { EventRecord } from '@/types/events'
import type { Session } from '@/types/sessions'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { formatDuration, sessionDurationMs } from './utils'

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
  const cwdBasename = cwd.split('/').filter(Boolean).at(-1) || cwd
  const navigate = useNavigate()
  const [refreshKey, setRefreshKey] = useState(0)

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

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a] text-white">
      <header className="border-b border-white/10 bg-black/40 px-6 py-4">
        <div className="text-[12px] font-semibold uppercase tracking-widest text-white/45">
          <Link to="/projects" className="hover:text-white/70 transition-colors">
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
          <div className="text-sm text-white/45">Loading sessions…</div>
        ) : sessions.length === 0 ? (
          <div className="text-sm text-white/55">No sessions for this project.</div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wider text-white/45">
                  <tr>
                    <th className="px-4 py-3 font-medium">Session</th>
                    <th className="px-4 py-3 font-medium">Agent</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Tokens</th>
                    <th className="px-4 py-3 font-medium">Started</th>
                    <th className="px-4 py-3 font-medium">Ended</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => {
                    return (
                      <tr
                        key={session.session_id}
                        className="cursor-pointer border-t border-white/10 bg-black/10 hover:bg-white/[0.035]"
                        onClick={() =>
                          navigate(`/sessions/${encodeURIComponent(cwd)}/${session.session_id}`)
                        }
                      >
                        <td className="px-4 py-3 font-mono text-[12px] text-white/75">
                          {session.session_id.slice(0, 12)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[12px]">
                            {session.agent}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          {formatDuration(
                            sessionDurationMs(session, new Date(session.last_seen_at).getTime())
                          )}
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          {totalTokens(session).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-white/55">
                          {new Date(session.started_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-white/55">
                          {session.ended_at
                            ? new Date(session.ended_at).toLocaleString()
                            : 'Running'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loadingMore && <span className="text-xs text-white/40">Loading more…</span>}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
