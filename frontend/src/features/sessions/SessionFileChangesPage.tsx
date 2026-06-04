import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Session } from '@/types/sessions'
import { FileChangesList } from './FileChangesList'
import { useFileChanges } from './hooks/useFileChanges'
import { formatDuration, sessionDurationMs, shortenCwd } from './utils'

type SessionsResponse = Session[] | { sessions?: Session[] }

function getSessions(payload: SessionsResponse): Session[] {
  return Array.isArray(payload) ? payload : (payload.sessions ?? [])
}

async function loadSession(
  cwd: string,
  sessionId: string,
  signal: AbortSignal
): Promise<Session | null> {
  const res = await fetch(`/api/sessions?cwd=${encodeURIComponent(cwd)}`, { signal })
  if (!res.ok) return null
  const data = (await res.json()) as SessionsResponse
  return getSessions(data).find((item) => item.session_id === sessionId) ?? null
}

function formatDateTime(value?: string): string {
  if (!value) return '-'
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) return '-'
  return new Date(time).toLocaleString()
}

function formatSessionDuration(session: Session | null): string {
  if (!session) return '-'
  return formatDuration(sessionDurationMs(session, new Date(session.last_seen_at).getTime()))
}

export function SessionFileChangesPage() {
  const { encodedCwd = '', sessionId = '' } = useParams()
  const cwd = useMemo(() => decodeURIComponent(encodedCwd), [encodedCwd])
  const cwdBasename = cwd.split('/').filter(Boolean).at(-1) || cwd
  const [session, setSession] = useState<Session | null>(null)
  const { groups: fileGroups, loading, error } = useFileChanges(sessionId)

  useEffect(() => {
    const controller = new AbortController()
    loadSession(cwd, sessionId, controller.signal)
      .then(setSession)
      .catch((err: unknown) => {
        if ((err as Error).name !== 'AbortError') setSession(null)
      })
    return () => controller.abort()
  }, [cwd, sessionId])

  const fileCount = fileGroups.length

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a] text-white">
      <header className="shrink-0 border-b border-white/10 bg-[#0d0e12] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/45">
              <Link to="/projects" className="transition-colors hover:text-white/70">
                Projects
              </Link>
              <span className="text-white/20">/</span>
              <Link
                to={`/sessions/${encodeURIComponent(cwd)}`}
                className="max-w-[18rem] truncate transition-colors hover:text-white/70"
                title={cwd}
              >
                {cwdBasename}
              </Link>
              <span className="text-white/20">/</span>
              <span className="font-mono normal-case tracking-normal text-white/60">
                {sessionId.slice(0, 12)}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-white/60">
              <span className="font-semibold text-white/85">File changes</span>
              <span className="hidden text-white/20 sm:inline">|</span>
              <span className="font-mono" title={cwd}>
                {shortenCwd(cwd)}
              </span>
              <span className="text-white/20">|</span>
              <span>Started {formatDateTime(session?.started_at)}</span>
              <span className="text-white/20">|</span>
              <span>Duration {formatSessionDuration(session)}</span>
              {session?.ended_at && (
                <>
                  <span className="text-white/20">|</span>
                  <span>Ended {formatDateTime(session.ended_at)}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="border-white/15 bg-white/[0.04] text-[12px] text-white/70 hover:bg-white/[0.08] hover:text-white"
            >
              <Link to={`/?session=${sessionId}`}>
                <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
                View Events
              </Link>
            </Button>
            <Badge
              variant="outline"
              className="border-white/15 bg-white/[0.04] font-mono text-[11px] text-white/70"
            >
              {fileCount} {fileCount === 1 ? 'file' : 'files'} changed
            </Badge>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto px-3 py-4 sm:px-5">
        <FileChangesList
          groups={fileGroups}
          sessionStartedAt={session?.started_at ?? ''}
          loading={loading}
          error={error}
        />
      </main>
    </div>
  )
}
