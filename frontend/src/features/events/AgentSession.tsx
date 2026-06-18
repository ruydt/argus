import { memo, useMemo, useState } from 'react'
import { CopyIconButton } from '@/components/shared/CopyIconButton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { PaginationBar } from '@/components/shared/PaginationBar'
import { cn } from '@/lib/utils'
import { highlight, shortId } from '@/lib/format'
import { agentForEvent } from '@/agents'
import { projectName } from '@/features/sessions/utils'
import type { SessionGroup } from '@/types/events'
import { buildEventKey } from './eventKey'
import { EventRow } from './EventRow'

const DEFAULT_PAGE_SIZE = 50

type AgentSessionProps = {
  session: SessionGroup
  lastTime: Date
  isCollapsed: boolean
  toggleSession: (id: string) => void
  searchQuery: string
  targetSessionId: string | null
  targetEventKey: string | null
  highlightedEventKey: string | null
  onTargetVisible: () => void
  isEventDraggable?: boolean
}

export const AgentSession = memo(function AgentSession({
  session,
  lastTime,
  isCollapsed,
  toggleSession,
  searchQuery,
  targetSessionId,
  targetEventKey,
  highlightedEventKey,
  onTargetVisible,
  isEventDraggable = false,
}: AgentSessionProps) {
  const { sessionId, transcriptPath, cwd, events } = session
  const firstEvent = events[0]
  const agent = agentForEvent(firstEvent)
  const { Logo } = agent

  const [manualPage, setManualPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const { totalPages, clampedPage, pageStart, pageEnd, visibleEvents } = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(events.length / pageSize))
    const targetEventIndex =
      targetEventKey && targetSessionId === sessionId
        ? events.findIndex((event) => buildEventKey(event) === targetEventKey)
        : -1
    const page =
      targetEventIndex >= 0
        ? Math.min(Math.floor(targetEventIndex / pageSize), totalPages - 1)
        : Math.min(manualPage, totalPages - 1)
    const pageStart = page * pageSize
    const pageEnd = Math.min(pageStart + pageSize, events.length)
    return {
      totalPages,
      clampedPage: page,
      pageStart,
      pageEnd,
      visibleEvents: events.slice(pageStart, pageEnd),
    }
  }, [events, pageSize, manualPage, targetEventKey, targetSessionId, sessionId])
  const needsPagination = events.length > pageSize

  const lastTimeLabel = useMemo(
    () => `${lastTime.toLocaleDateString()} • ${lastTime.toLocaleTimeString()}`,
    [lastTime]
  )

  return (
    <Collapsible
      open={!isCollapsed}
      onOpenChange={() => toggleSession(sessionId)}
      className="border border-foreground/[0.08] rounded-lg mb-3 overflow-hidden bg-foreground/[0.015]"
    >
      <CollapsibleTrigger asChild>
        <div
          draggable
          onDragStart={(ev) => {
            ev.dataTransfer.setData('text/plain', `session:${sessionId}`)
            ev.dataTransfer.effectAllowed = 'move'
          }}
          className={cn(
            'flex items-start gap-2 px-3 py-[10px] cursor-grab active:cursor-grabbing',
            'bg-foreground/[0.04] border-b border-foreground/[0.08]',
            isCollapsed && 'border-b-0'
          )}
        >
          <span className={cn('agent-badge shrink-0', `agent-${agent.badgeClass}`)}>
            <Logo size={18} />
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="group inline-flex min-w-0 max-w-full items-center gap-2 text-[0.8rem] font-bold text-[#16a34a]">
              <span title={sessionId} className="min-w-[8ch] truncate">
                {highlight(firstEvent.session || shortId(transcriptPath), searchQuery)}
              </span>
              {cwd !== '' && (
                <span
                  title={cwd}
                  className="shrink-0 max-w-[180px] truncate text-[0.68rem] font-normal text-muted-foreground"
                >
                  {projectName(cwd)}
                </span>
              )}
              <CopyIconButton
                text={sessionId}
                label="session ID"
                className="shrink-0 opacity-0 group-hover:opacity-100 size-4 text-muted-foreground hover:text-[#16a34a] hover:bg-transparent"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="inline-flex flex-wrap items-center gap-2 text-[0.68rem] text-muted-foreground">
              {events.length} events • {lastTimeLabel}
            </div>
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {needsPagination && (
          <PaginationBar
            page={clampedPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={events.length}
            rangeStart={pageStart}
            rangeEnd={pageEnd}
            defaultPageSize={DEFAULT_PAGE_SIZE}
            onPageChange={setManualPage}
            onPageSizeChange={setPageSize}
          />
        )}
        <div className="px-[10px] py-[6px]">
          {visibleEvents.map((e) => {
            const eventKey = buildEventKey(e)
            return (
              <EventRow
                key={eventKey}
                event={e}
                searchQuery={searchQuery}
                highlighted={highlightedEventKey === eventKey}
                isPendingTarget={targetEventKey === eventKey}
                onTargetVisible={onTargetVisible}
                isDraggable={isEventDraggable}
              />
            )
          })}
        </div>
        {needsPagination && (
          <PaginationBar
            page={clampedPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={events.length}
            rangeStart={pageStart}
            rangeEnd={pageEnd}
            defaultPageSize={DEFAULT_PAGE_SIZE}
            onPageChange={setManualPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  )
})
