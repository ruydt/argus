import { useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import type { EventRecord, SessionGroup, SessionUsage, TooltipState } from '@/types/events'
import { AgentSession } from './AgentSession'

type SessionListProps = {
  events: EventRecord[]
  sortOrder: string
  searchQuery: string
  collapsedSessions: Set<string>
  toggleSession: (id: string) => void
  sessionUsage: Record<string, SessionUsage>
  setTooltip: Dispatch<SetStateAction<TooltipState | null>>
  targetSessionId: string | null
  targetEventKey: string | null
  highlightedEventKey: string | null
  onTargetVisible: () => void
}

export function SessionList({
  events,
  sortOrder,
  searchQuery,
  collapsedSessions,
  toggleSession,
  sessionUsage,
  setTooltip,
  targetSessionId,
  targetEventKey,
  highlightedEventKey,
  onTargetVisible,
}: SessionListProps) {
  const sessionList = useMemo(() => {
    const grouped = new Map<string, SessionGroup>()

    events.forEach((event) => {
      const key = event.session || event.transcript_path || 'ungrouped'
      const existing = grouped.get(key)

      if (existing) {
        existing.events.push(event)
        return
      }

      grouped.set(key, {
        sessionId: key,
        transcriptPath: event.transcript_path ?? '',
        events: [event],
      })
    })

    const list = Array.from(grouped.values()).map((session) => {
      const sortedEvents = [...session.events].sort((a, b) =>
        sortOrder === 'newest'
          ? new Date(b.time).getTime() - new Date(a.time).getTime()
          : new Date(a.time).getTime() - new Date(b.time).getTime()
      )

      const lastTime = new Date(
        Math.max(...sortedEvents.map((event) => new Date(event.time).getTime()))
      )

      return {
        session: {
          ...session,
          events: sortedEvents,
        },
        lastTime,
      }
    })

    list.sort((a, b) =>
      sortOrder === 'newest'
        ? b.lastTime.getTime() - a.lastTime.getTime()
        : a.lastTime.getTime() - b.lastTime.getTime()
    )

    return list
  }, [events, sortOrder])

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
          sessionUsage={sessionUsage}
          setTooltip={setTooltip}
          targetSessionId={targetSessionId}
          targetEventKey={targetEventKey}
          highlightedEventKey={highlightedEventKey}
          onTargetVisible={onTargetVisible}
        />
      ))}
    </>
  )
}
