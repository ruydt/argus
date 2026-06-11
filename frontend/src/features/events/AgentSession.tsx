import { memo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { CopyIconButton } from '@/components/shared/CopyIconButton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { PaginationBar } from '@/components/shared/PaginationBar'
import { cn } from '@/lib/utils'
import { formatTokenCount, highlight, shortId } from '@/lib/format'
import { agentForEvent } from '@/agents'
import { shortenCwd } from '@/features/sessions/utils'
import type { SessionGroup, SessionUsage, TooltipState } from '@/types/events'
import { buildEventKey } from './eventKey'
import { EventRow } from './EventRow'

const DEFAULT_PAGE_SIZE = 50

type AgentSessionProps = {
  session: SessionGroup
  lastTime: Date
  isCollapsed: boolean
  toggleSession: (id: string) => void
  searchQuery: string
  sessionUsage: Record<string, SessionUsage>
  setTooltip: Dispatch<SetStateAction<TooltipState | null>>
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
  sessionUsage,
  setTooltip,
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
  const totalPages = Math.max(1, Math.ceil(events.length / pageSize))
  const targetEventIndex =
    targetEventKey && targetSessionId === sessionId
      ? events.findIndex((event) => buildEventKey(event) === targetEventKey)
      : -1

  const page =
    targetEventIndex >= 0
      ? Math.min(Math.floor(targetEventIndex / pageSize), totalPages - 1)
      : Math.min(manualPage, totalPages - 1)
  const clampedPage = page
  const pageStart = page * pageSize
  const pageEnd = Math.min(pageStart + pageSize, events.length)
  const visibleEvents = events.slice(pageStart, pageEnd)
  const needsPagination = events.length > pageSize

  return (
    <Collapsible
      open={!isCollapsed}
      onOpenChange={() => toggleSession(sessionId)}
      className="border border-white/[0.06] rounded-lg mb-3 overflow-hidden bg-white/[0.015]"
    >
      <CollapsibleTrigger asChild>
        <div
          draggable
          onDragStart={(ev) => {
            ev.dataTransfer.setData('text/plain', `session:${sessionId}`)
            ev.dataTransfer.effectAllowed = 'move'
          }}
          className={cn(
            'flex flex-col items-start justify-between gap-3 px-3 py-[10px] cursor-grab active:cursor-grabbing sm:flex-row sm:items-center',
            'bg-white/[0.03] border-b border-white/[0.06]',
            isCollapsed && 'border-b-0'
          )}
        >
          <div className="group inline-flex min-w-0 items-center gap-2 text-[0.8rem] font-bold text-[#47ff9c]">
            <span className={cn('agent-badge', `agent-${agent.badgeClass}`)}>
              <Logo size={18} />
            </span>
            <span className="min-w-0 break-words sm:break-all">
              {highlight(firstEvent.session || shortId(transcriptPath), searchQuery)}
            </span>
            {cwd !== '' && (
              <span
                title={cwd}
                className="shrink-0 max-w-[180px] truncate text-[0.68rem] font-normal text-[#666]"
              >
                {shortenCwd(cwd)}
              </span>
            )}
            <CopyIconButton
              text={sessionId}
              label="session ID"
              className="opacity-0 group-hover:opacity-100 size-4 text-[#666] hover:text-[#47ff9c] hover:bg-transparent"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="inline-flex w-full flex-wrap items-center gap-2 text-[0.68rem] text-[#666] sm:w-auto sm:justify-end sm:text-right">
            {sessionUsage[sessionId] &&
              agent.buildUsageItems &&
              (() => {
                const u = sessionUsage[sessionId]
                return (
                  <span className="usage-summary">
                    {agent.buildUsageItems(u, formatTokenCount).map(({ cls, label, tip }) => (
                      <span
                        key={cls}
                        className={`usage-item ${cls}`}
                        onMouseEnter={(ev) =>
                          setTooltip({ text: tip, x: ev.clientX, y: ev.clientY })
                        }
                        onMouseMove={(ev) =>
                          setTooltip((t) => (t ? { ...t, x: ev.clientX, y: ev.clientY } : null))
                        }
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {label}
                      </span>
                    ))}
                  </span>
                )
              })()}
            {events.length} events • {lastTime.toLocaleDateString()} •{' '}
            {lastTime.toLocaleTimeString()}
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
