import { useMemo } from 'react'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import type { EventRecord, SessionGroup } from '@/types/events'
import { AgentSession } from './AgentSession'

type SessionListProps = {
  events: EventRecord[]
  sortOrder: string
  searchQuery: string
  collapsedSessions: Set<string>
  toggleSession: (id: string) => void
  targetSessionId: string | null
  targetEventKey: string | null
  highlightedEventKey: string | null
  onTargetVisible: () => void
  isEventDraggable?: boolean
}

type SessionAccumulator = {
  sessionId: string
  transcriptPath: string
  cwd: string
  entries: { event: EventRecord; timeMs: number }[]
  lastTimeMs: number
}

export function SessionList({
  events,
  sortOrder,
  searchQuery,
  collapsedSessions,
  toggleSession,
  targetSessionId,
  targetEventKey,
  highlightedEventKey,
  onTargetVisible,
  isEventDraggable = false,
}: SessionListProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, SessionAccumulator>()
    for (const event of events) {
      const key = event.session || event.transcript_path || 'ungrouped'
      const timeMs = new Date(event.time).getTime()
      const existing = map.get(key)
      if (existing) {
        existing.entries.push({ event, timeMs })
        if (timeMs > existing.lastTimeMs) existing.lastTimeMs = timeMs
        if (!existing.cwd && event.cwd) existing.cwd = event.cwd
        continue
      }
      map.set(key, {
        sessionId: key,
        transcriptPath: event.transcript_path ?? '',
        cwd: event.cwd ?? '',
        entries: [{ event, timeMs }],
        lastTimeMs: timeMs,
      })
    }
    return map
  }, [events])

  const sessionList = useMemo(() => {
    const list = Array.from(grouped.values()).map((acc) => {
      const sortedEntries = acc.entries.toSorted((a, b) =>
        sortOrder === 'newest' ? b.timeMs - a.timeMs : a.timeMs - b.timeMs
      )
      const session: SessionGroup = {
        sessionId: acc.sessionId,
        transcriptPath: acc.transcriptPath,
        cwd: acc.cwd,
        events: sortedEntries.map((entry) => entry.event),
      }
      return { session, lastTime: new Date(acc.lastTimeMs) }
    })

    list.sort((a, b) =>
      sortOrder === 'newest'
        ? b.lastTime.getTime() - a.lastTime.getTime()
        : a.lastTime.getTime() - b.lastTime.getTime()
    )

    return list
  }, [grouped, sortOrder])

  if (sessionList.length === 0) {
    return (
      <Empty className="min-h-[240px] border-0">
        <EmptyHeader>
          <EmptyTitle>No matching events</EmptyTitle>
          <EmptyDescription>Adjust filters or wait for incoming events.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      {sessionList.map(({ session, lastTime }) => (
        <AgentSession
          key={session.sessionId}
          session={session}
          lastTime={lastTime}
          isCollapsed={collapsedSessions.has(session.sessionId)}
          toggleSession={toggleSession}
          searchQuery={searchQuery}
          targetSessionId={targetSessionId}
          targetEventKey={targetEventKey}
          highlightedEventKey={highlightedEventKey}
          onTargetVisible={onTargetVisible}
          isEventDraggable={isEventDraggable}
        />
      ))}
    </>
  )
}
