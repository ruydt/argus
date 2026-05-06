import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { AgentConfig } from '../../agents/types'
import type { CtxLine, SessionUsage, SessionGroup, TooltipState } from '@/types'

type AgentSessionProps = {
  session: SessionGroup
  lastTime: Date
  isCollapsed: boolean
  toggleSession: (id: string) => void
  searchQuery: string
  shortId: (value: string) => string
  highlight: (text: string, query: string) => ReactNode
  sessionUsage: Record<string, SessionUsage>
  fmtTokens: (value: number) => string
  setTooltip: Dispatch<SetStateAction<TooltipState | null>>
  renderDiffLines: (
    oldStr: string,
    newStr: string,
    startLine: number,
    ctxBefore: CtxLine[],
    ctxAfter: CtxLine[],
    patchText?: string
  ) => ReactNode
  renderPatchDiff: (text: string, startLine: number) => ReactNode
  agent: AgentConfig
}

export function AgentSession({
  session,
  lastTime,
  isCollapsed,
  toggleSession,
  searchQuery,
  shortId,
  highlight,
  sessionUsage,
  fmtTokens,
  setTooltip,
  renderDiffLines,
  renderPatchDiff,
  agent,
}: AgentSessionProps) {
  const { sessionId, transcriptPath, events } = session
  const firstEvent = events[0]
  const { Logo } = agent

  return (
    <Collapsible
      open={!isCollapsed}
      onOpenChange={() => toggleSession(sessionId)}
      className="border border-white/[0.06] rounded-lg mb-3 overflow-hidden bg-white/[0.015]"
    >
      <CollapsibleTrigger asChild>
        <div
          className={cn(
            'flex justify-between gap-3 items-center px-3 py-[10px] cursor-pointer',
            'bg-white/[0.03] border-b border-white/[0.06]',
            isCollapsed && 'border-b-0'
          )}
        >
          <div className="text-[0.8rem] text-[#47ff9c] font-bold break-all inline-flex items-center gap-2">
            <span className={cn('agent-badge', `agent-${agent.badgeClass}`)}>
              <Logo size={12} />
            </span>
            {highlight(firstEvent.session || shortId(transcriptPath), searchQuery)}
            <span className="text-[#666] text-[0.7rem] ml-[10px]">{isCollapsed ? '▼' : '▲'}</span>
          </div>
          <div className="text-[0.68rem] text-[#666] text-right whitespace-nowrap inline-flex items-center gap-2">
            {sessionUsage[sessionId] &&
              agent.buildUsageItems &&
              (() => {
                const u = sessionUsage[sessionId]
                return (
                  <span className="usage-summary">
                    {agent.buildUsageItems(u, fmtTokens).map(({ cls, label, tip }) => (
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
            {events.length} events • {lastTime.toLocaleTimeString()}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-[10px] py-[6px]">
          {events.map((e, i) => (
            <div
              key={i}
              className="flex gap-3 py-2 text-[0.82rem] leading-[1.4] border-b border-white/[0.03] items-start hover:bg-white/[0.02]"
            >
              <div className="text-[#666] shrink-0 w-[75px] pt-[2px]">
                {new Date(e.time).toLocaleTimeString([], { hour12: false })}
              </div>
              <div className={cn('font-bold shrink-0 w-[60px] pt-[2px]', e.action)}>{e.action}</div>
              <div className="flex-1 break-all text-[#e2e8f0] text-[0.85rem]">
                <div>
                  {e.hook_event_name && (
                    <span className={`hook hook-${e.hook_event_name}`}>{e.hook_event_name}</span>
                  )}
                  {e.hook_event_name === 'PreToolUse' && e.model && (
                    <span className="event-model">{e.model}</span>
                  )}
                  {e.action !== 'BASH' && highlight(e.path || '', searchQuery)}
                </div>

                {(e.prompt || e.command) &&
                  !(
                    e.action === 'EDIT' &&
                    (String(e.prompt).includes('*** Begin Patch') ||
                      String(e.command).includes('*** Begin Patch'))
                  ) && (
                    <div className="mt-2 text-[0.75rem] text-[#ccc] bg-black/30 border border-white/[0.05] px-3 py-2 rounded-[6px]">
                      <strong className="text-[#aaa] text-[0.7rem]">
                        {e.prompt ? 'Prompt' : e.command ? 'Command' : e.path ? 'File' : 'Shell'}
                      </strong>
                      <pre className="mt-1 mb-0 whitespace-pre-wrap break-words text-[0.75rem] text-[#a0a0a0] max-h-[300px] overflow-y-auto font-[inherit]">
                        {highlight(e.prompt || e.command || '', searchQuery)}
                      </pre>
                    </div>
                  )}

                {e.action === 'EDIT' && (e.old_string || e.new_string) && (
                  <div className="eblock eblock-diff mt-2">
                    <strong>{e.path || 'Changes'}</strong>
                    {renderDiffLines(
                      e.old_string || '',
                      e.new_string || '',
                      e.start_line ?? 0,
                      e.ctx_before ?? [],
                      e.ctx_after ?? [],
                      e.command || e.prompt || ''
                    )}
                  </div>
                )}

                {e.action === 'EDIT' &&
                  !e.old_string &&
                  !e.new_string &&
                  (String(e.prompt).includes('*** Begin Patch') ||
                    String(e.command).includes('*** Begin Patch')) && (
                    <div className="eblock eblock-diff mt-2">
                      <strong>{e.path || 'Changes'}</strong>
                      {renderPatchDiff(e.prompt || e.command || '', e.start_line || 1)}
                    </div>
                  )}

                <div className="mt-[6px] text-[0.68rem] text-[#888] flex flex-wrap gap-[6px]">
                  {e.tool && (
                    <Badge
                      variant="outline"
                      className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
                    >
                      <strong className="text-[#aaa] font-semibold mr-1">Tool:</strong> {e.tool}
                    </Badge>
                  )}
                  {e.source && (
                    <Badge
                      variant="outline"
                      className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
                    >
                      <strong className="text-[#aaa] font-semibold mr-1">Source:</strong> {e.source}
                    </Badge>
                  )}
                  {e.turn_id && (
                    <Badge
                      variant="outline"
                      className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
                    >
                      <strong className="text-[#aaa] font-semibold mr-1">Turn:</strong>{' '}
                      {shortId(e.turn_id)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
