import type { ReactNode } from 'react'
import { cn, displayModel } from '@/lib/utils'
import { highlight } from '@/lib/format'
import type { EventRecord } from '@/types/events'
import { DiffBlock } from './renderers/DiffBlock'
import { PatchBlock } from './renderers/PatchBlock'
import { CommandBlock } from './renderers/CommandBlock'
import { StopBlock } from './renderers/StopBlock'
import { ErrorBlock } from './renderers/ErrorBlock'
import { TaskBlock } from './renderers/TaskBlock'
import { NotifyBlock } from './renderers/NotifyBlock'
import { CwdBlock } from './renderers/CwdBlock'
import { ToolResultBlock } from './renderers/ToolResultBlock'
import { BatchBlock } from './renderers/BatchBlock'
import { EventBadges } from './EventBadges'

type EventRowProps = {
  event: EventRecord
  searchQuery: string
}

export function EventRow({ event: e, searchQuery }: EventRowProps) {
  const isPatchCommand =
    (e.action === 'EDIT' && String(e.prompt).includes('*** Begin Patch')) ||
    String(e.command).includes('*** Begin Patch')

  return (
    <div className="border-b border-white/[0.03] py-2 text-[0.82rem] leading-[1.4] hover:bg-white/[0.02]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex items-center gap-3 pt-[2px] text-[#666] sm:block sm:w-[75px] sm:shrink-0">
          <span>{new Date(e.time).toLocaleTimeString([], { hour12: false })}</span>
          <span className={cn('font-bold sm:hidden', e.action)}>{e.action}</span>
        </div>
        <div className={cn('hidden pt-[2px] font-bold sm:block sm:w-[96px] sm:shrink-0', e.action)}>
          {e.action}
        </div>
        <div className="min-w-0 flex-1 break-words text-[0.85rem] text-[#e2e8f0] sm:break-all">
          {/* Header line: hook, model, path */}
          <div>
            {e.hook_event_name && (
              <span className={`hook hook-${e.hook_event_name}`}>{e.hook_event_name}</span>
            )}
            {(e.hook_event_name === 'PreToolUse' || e.hook_event_name === 'PostToolUse') && (
              <span className="event-model">{displayModel(e.model)}</span>
            )}
            {e.action !== 'BASH' && (highlight(e.path || '', searchQuery) as ReactNode)}
          </div>

          {/* Prompts and commands */}
          {(e.prompt || e.command) && !isPatchCommand && (
            <CommandBlock
              prompt={e.prompt}
              command={e.command}
              path={e.path}
              searchQuery={searchQuery}
            />
          )}

          {/* Standard string replacement diff */}
          {e.action === 'EDIT' && (e.old_string || e.new_string) && (
            <div className="eblock eblock-diff mt-2">
              <strong>{e.path || 'Changes'}</strong>
              <DiffBlock
                oldStr={e.old_string || ''}
                newStr={e.new_string || ''}
                startLine={e.start_line ?? 0}
                ctxBefore={e.ctx_before}
                ctxAfter={e.ctx_after}
                patchText={e.command || e.prompt}
              />
            </div>
          )}

          {/* Patch application diff */}
          {isPatchCommand && !e.old_string && !e.new_string && (
            <div className="eblock eblock-diff mt-2">
              <strong>{e.path || 'Changes'}</strong>
              <PatchBlock text={e.prompt || e.command || ''} startLine={e.start_line} />
            </div>
          )}

          {/* Action-specific renderers */}
          {e.action === 'STOP' && <StopBlock response={e.response || ''} />}
          {(e.error_message || e.error_type) && (
            <ErrorBlock errorMessage={e.error_message} errorType={e.error_type} />
          )}
          {e.action === 'TASK' && (
            <TaskBlock title={e.task_title} description={e.task_description} />
          )}
          {e.action === 'NOTIFY' && (
            <NotifyBlock title={e.notification_title} message={e.notification_message} />
          )}
          {e.action === 'CWD' && <CwdBlock oldCwd={e.old_cwd} newCwd={e.new_cwd} />}

          {/* Tool hooks */}
          {e.hook_event_name === 'PostToolUse' && (
            <ToolResultBlock
              stdout={e.tool_result_stdout}
              stderr={e.tool_result_stderr}
              durationMs={e.duration_ms}
            />
          )}
          {e.action === 'BATCH' && <BatchBlock json={e.tool_calls_json} />}

          {/* Metadata Badges */}
          <EventBadges event={e} />
        </div>
      </div>
    </div>
  )
}
