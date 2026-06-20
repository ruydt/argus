import { useEffect, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { agentForEvent } from '@/agents'
import { useHistoricalEvents } from '@/features/events/hooks/useHistoricalEvents'
import { useLiveEvents } from '@/features/events/hooks/useLiveEvents'
import { mergeByKey, buildEventKey } from '@/features/events/eventKey'
import { EventRow } from '@/features/events/EventRow'
import { projectName } from './utils'

export function SessionDetailPage() {
  const params = useParams<{ sessionId: string }>()
  const sessionId = params.sessionId ? decodeURIComponent(params.sessionId) : ''

  const hist = useHistoricalEvents('', '', sessionId, true, '')
  const live = useLiveEvents(sessionId, { enabled: true })

  // Newest first, deduped across the historical backfill and the live stream.
  const events = useMemo(() => {
    const merged = mergeByKey(hist.events, live.events)
    return merged.slice().sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  }, [hist.events, live.events])

  const firstEvent = events[0]
  const agent = firstEvent ? agentForEvent(firstEvent) : null
  const cwd = events.find((e) => e.cwd)?.cwd ?? ''
  const project = cwd ? projectName(cwd) : ''

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const autoLoad = hist.hasMore
  const loadMore = hist.loadMore

  useEffect(() => {
    if (!autoLoad) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore()
      },
      { root: scrollRef.current, rootMargin: '400px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [autoLoad, loadMore])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5 sm:px-5">
        {agent && (
          <span className={cn('agent-badge shrink-0', `agent-${agent.badgeClass}`)}>
            <agent.Logo size={17} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div title={sessionId} className="truncate text-[0.82rem] font-semibold text-foreground">
            {sessionId}
          </div>
          <div className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
            {project && (
              <>
                <span className="truncate font-medium text-foreground/70">{project}</span>
                <span aria-hidden className="text-foreground/25">
                  ·
                </span>
              </>
            )}
            <span>{events.length} events</span>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
        {live.error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription>{live.error}</AlertDescription>
          </Alert>
        )}

        {events.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
            {hist.loading ? 'Loading session…' : 'No events for this session yet.'}
          </div>
        ) : (
          <div className="mx-auto max-w-5xl">
            {events.map((event) => (
              <EventRow key={buildEventKey(event)} event={event} searchQuery="" />
            ))}
          </div>
        )}

        {autoLoad && (
          <div ref={sentinelRef} className="flex justify-center py-4 text-xs text-muted-foreground">
            {hist.loading ? 'Loading…' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
