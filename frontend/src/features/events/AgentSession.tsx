import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { PaginationBar } from '@/components/shared/PaginationBar'
import { cn } from '@/lib/utils'
import { formatTokenCount, highlight, shortId } from '@/lib/format'
import { agentForEvent } from '@/agents'
import type { SessionGroup, SessionUsage, TooltipState } from '@/types/events'
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
}

export function AgentSession({
  session,
  lastTime,
  isCollapsed,
  toggleSession,
  searchQuery,
  sessionUsage,
  setTooltip,
}: AgentSessionProps) {
  const { sessionId, transcriptPath, events } = session
  const firstEvent = events[0]
  const agent = agentForEvent(firstEvent)
  const { Logo } = agent

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const totalPages = Math.max(1, Math.ceil(events.length / pageSize))
  const clampedPage = Math.min(page, totalPages - 1)
  const pageStart = clampedPage * pageSize
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
          className={cn(
            'flex flex-col items-start justify-between gap-3 px-3 py-[10px] cursor-pointer sm:flex-row sm:items-center',
            'bg-white/[0.03] border-b border-white/[0.06]',
            isCollapsed && 'border-b-0'
          )}
        >
          <div className="inline-flex min-w-0 items-center gap-2 text-[0.8rem] font-bold text-[#47ff9c]">
            <span className={cn('agent-badge', `agent-${agent.badgeClass}`)}>
              <Logo size={12} />
            </span>
            <span className="min-w-0 break-words sm:break-all">
              {highlight(firstEvent.session || shortId(transcriptPath), searchQuery)}
            </span>
            <span className="ml-[10px] shrink-0 text-[0.7rem] text-[#666]">
              {isCollapsed ? '▼' : '▲'}
            </span>
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
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
        <div className="px-[10px] py-[6px]">
          {visibleEvents.map((e, i) => (
            <EventRow key={i} event={e} searchQuery={searchQuery} />
          ))}
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
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
