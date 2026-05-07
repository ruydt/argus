import type { Dispatch, ReactNode, SetStateAction } from 'react'
import ReactMarkdown from 'react-markdown'
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
              <div className={cn('font-bold shrink-0 w-[96px] pt-[2px]', e.action)}>{e.action}</div>
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
                      {e.prompt ? (
                        <div className="stop-md mt-2 max-h-[300px] overflow-y-auto">
                          <ReactMarkdown>{e.prompt}</ReactMarkdown>
                        </div>
                      ) : (
                        <pre className="mt-1 mb-0 whitespace-pre-wrap break-words text-[0.75rem] text-[#a0a0a0] max-h-[300px] overflow-y-auto font-[inherit]">
                          {highlight(e.command || '', searchQuery)}
                        </pre>
                      )}
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

                {e.action === 'STOP' && e.response && (
                  <div className="mt-2 bg-black/30 border border-white/[0.05] px-3 py-2 rounded-[6px]">
                    <strong className="text-[#aaa] text-[0.7rem]">Response</strong>
                    <div className="stop-md mt-2 max-h-[400px] overflow-y-auto">
                      <ReactMarkdown>{e.response}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {(e.error_message || e.error_type) && (
                  <div className="mt-2 text-[0.75rem] text-[#ff6b6b] bg-red-950/20 border border-red-900/30 px-3 py-2 rounded-[6px]">
                    <strong className="text-[#ff9999] text-[0.7rem]">
                      Error{e.error_type ? `: ${e.error_type}` : ''}
                    </strong>
                    {e.error_message && (
                      <pre className="mt-1 mb-0 whitespace-pre-wrap text-[0.73rem]">
                        {e.error_message}
                      </pre>
                    )}
                  </div>
                )}

                {e.action === 'TASK' && e.task_title && (
                  <div className="mt-2 text-[0.75rem] text-[#ccc] bg-black/30 border border-white/[0.05] px-3 py-2 rounded-[6px]">
                    <strong className="text-[#aaa] text-[0.7rem]">{e.task_title}</strong>
                    {e.task_description && (
                      <pre className="mt-1 mb-0 whitespace-pre-wrap text-[0.73rem] text-[#888]">
                        {e.task_description}
                      </pre>
                    )}
                  </div>
                )}

                {e.action === 'NOTIFY' && e.notification_message && (
                  <div className="mt-2 text-[0.75rem] text-[#ccc] bg-black/30 border border-white/[0.05] px-3 py-2 rounded-[6px]">
                    <strong className="text-[#aaa] text-[0.7rem]">
                      {e.notification_title || 'Notification'}
                    </strong>
                    <pre className="mt-1 mb-0 whitespace-pre-wrap text-[0.73rem] text-[#888]">
                      {e.notification_message}
                    </pre>
                  </div>
                )}

                {e.action === 'CWD' && (e.old_cwd || e.new_cwd) && (
                  <div className="mt-1 text-[0.72rem] text-[#888]">
                    {e.old_cwd && <span className="text-[#ff6b6b]">{e.old_cwd}</span>}
                    {e.old_cwd && e.new_cwd && <span className="mx-2 text-[#666]">→</span>}
                    {e.new_cwd && <span className="text-[#47ff9c]">{e.new_cwd}</span>}
                  </div>
                )}

                {e.hook_event_name === 'PostToolUse' && e.tool_result_stdout && (
                  <div className="mt-2 text-[0.75rem] bg-black/40 border border-white/[0.05] rounded-[6px] overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1 border-b border-white/[0.05]">
                      <strong className="text-[#aaa] text-[0.7rem]">stdout</strong>
                      {e.duration_ms != null && e.duration_ms > 0 && (
                        <span className="text-[#555] text-[0.65rem]">{e.duration_ms}ms</span>
                      )}
                    </div>
                    <pre className="px-3 py-2 mb-0 whitespace-pre-wrap break-words text-[0.73rem] text-[#a0a0a0] max-h-[240px] overflow-y-auto font-[inherit]">
                      {e.tool_result_stdout}
                    </pre>
                  </div>
                )}

                {e.hook_event_name === 'PostToolUse' && e.tool_result_stderr && (
                  <div className="mt-1 text-[0.75rem] bg-red-950/20 border border-red-900/30 rounded-[6px] overflow-hidden">
                    <div className="px-3 py-1 border-b border-red-900/20">
                      <strong className="text-[#ff9999] text-[0.7rem]">stderr</strong>
                    </div>
                    <pre className="px-3 py-2 mb-0 whitespace-pre-wrap break-words text-[0.73rem] text-[#ff9999] max-h-[120px] overflow-y-auto font-[inherit]">
                      {e.tool_result_stderr}
                    </pre>
                  </div>
                )}

                {e.action === 'BATCH' && e.tool_calls_json && (() => {
                  try {
                    const calls: Array<{ tool_name: string; tool_input: { file_path?: string; command?: string } }> =
                      JSON.parse(e.tool_calls_json)
                    return (
                      <div className="mt-2 flex flex-col gap-[3px]">
                        {calls.map((c, ci) => (
                          <div key={ci} className="flex gap-2 text-[0.72rem] text-[#888]">
                            <span className="text-[#aaa] font-bold shrink-0">[{c.tool_name}]</span>
                            <span className="break-all text-[#777]">
                              {c.tool_input?.file_path || c.tool_input?.command || ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  } catch {
                    return null
                  }
                })()}

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
                  {e.permission_mode && (
                    <Badge
                      variant="outline"
                      className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
                    >
                      <strong className="text-[#aaa] font-semibold mr-1">Mode:</strong>{' '}
                      {e.permission_mode}
                    </Badge>
                  )}
                  {e.subagent_type && (
                    <Badge
                      variant="outline"
                      className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
                    >
                      <strong className="text-[#aaa] font-semibold mr-1">Agent:</strong>{' '}
                      {e.subagent_type}
                    </Badge>
                  )}
                  {e.subagent_id && e.action === 'AGENT' && (
                    <Badge
                      variant="outline"
                      className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
                    >
                      <strong className="text-[#aaa] font-semibold mr-1">Agent ID:</strong>{' '}
                      {shortId(e.subagent_id)}
                    </Badge>
                  )}
                  {e.task_id && (
                    <Badge
                      variant="outline"
                      className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
                    >
                      <strong className="text-[#aaa] font-semibold mr-1">Task:</strong>{' '}
                      {shortId(e.task_id)}
                    </Badge>
                  )}
                  {e.notification_type && (
                    <Badge
                      variant="outline"
                      className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
                    >
                      <strong className="text-[#aaa] font-semibold mr-1">Notify:</strong>{' '}
                      {e.notification_type}
                    </Badge>
                  )}
                  {e.change_type && (
                    <Badge
                      variant="outline"
                      className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
                    >
                      <strong className="text-[#aaa] font-semibold mr-1">Change:</strong>{' '}
                      {e.change_type}
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
