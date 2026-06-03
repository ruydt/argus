import { useEffect, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { cn, displayModel } from '@/lib/utils'
import { highlight } from '@/lib/format'
import type { EventRecord } from '@/types/events'
import { buildEventKey } from './eventKey'
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
import { ElicitBlock } from './renderers/ElicitBlock'
import { DisplayBlock } from './renderers/DisplayBlock'
import { WorktreeBlock } from './renderers/WorktreeBlock'
import { InstructBlock } from './renderers/InstructBlock'
import { EventBadges } from './EventBadges'
import { Braces } from 'lucide-react'
import { RawPayloadModal } from './RawPayloadModal'

type EventRowProps = {
  event: EventRecord
  searchQuery: string
  highlighted?: boolean
  isPendingTarget?: boolean
  onTargetVisible?: () => void
  isDraggable?: boolean
}

export function EventRow({
  event: e,
  searchQuery,
  highlighted = false,
  isPendingTarget = false,
  onTargetVisible,
  isDraggable = false,
}: EventRowProps) {
  const isPatchCommand =
    (e.action === 'EDIT' && String(e.prompt).includes('*** Begin Patch')) ||
    String(e.command).includes('*** Begin Patch')
  const rowRef = useRef<HTMLDivElement>(null)
  const targetHandledRef = useRef(false)
  const suppressDragRef = useRef(false)
  const [rawModalOpen, setRawModalOpen] = useState(false)

  const handleDragStart = (ev: DragEvent<HTMLDivElement>) => {
    if (suppressDragRef.current) {
      ev.preventDefault()
      return
    }

    const target = ev.target as HTMLElement | null
    if (
      target?.closest(
        '[data-event-drag-ignore], pre, code, button, a, [role="button"], [contenteditable="true"]'
      )
    ) {
      ev.preventDefault()
      return
    }

    ev.dataTransfer.setData('text/plain', buildEventKey(e))
    ev.dataTransfer.effectAllowed = 'move'
  }

  useEffect(() => {
    if (!isPendingTarget || !rowRef.current || targetHandledRef.current) return

    rowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    targetHandledRef.current = true
    onTargetVisible?.()
  }, [isPendingTarget, onTargetVisible])

  return (
    <div
      ref={rowRef}
      draggable={isDraggable}
      onDragStart={isDraggable ? handleDragStart : undefined}
      onMouseDownCapture={(ev) => {
        if (!isDraggable) return
        suppressDragRef.current = Boolean(
          (ev.target as HTMLElement | null)?.closest(
            '[data-event-drag-ignore], pre, code, button, a, [role="button"], [contenteditable="true"]'
          )
        )
      }}
      onMouseUpCapture={() => {
        suppressDragRef.current = false
      }}
      onDragEnd={() => {
        suppressDragRef.current = false
      }}
      data-testid="event-row"
      className={cn(
        'border-b border-white/[0.03] py-2 text-[0.82rem] leading-[1.4] hover:bg-white/[0.02]',
        highlighted ? 'rounded-md bg-sky-500/8 ring-1 ring-sky-400/35' : '',
        isDraggable && 'cursor-grab active:cursor-grabbing'
      )}
    >
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
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {e.hook_event_name && (
                <span className={`hook hook-${e.hook_event_name}`}>{e.hook_event_name}</span>
              )}
              {(e.hook_event_name === 'PreToolUse' ||
                e.hook_event_name === 'PostToolUse' ||
                e.hook_event_name === 'PreCompact' ||
                e.hook_event_name === 'PostCompact') &&
                e.model && <span className="event-model">{displayModel(e.model)}</span>}
              {e.action !== 'BASH' && (highlight(e.path || '', searchQuery) as ReactNode)}
            </div>
            {e.dedup_key && (
              <button
                type="button"
                data-event-drag-ignore
                onClick={() => setRawModalOpen(true)}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded text-[#8f8f8f] transition hover:bg-white/[0.08] hover:text-[#d0d0d0]"
                aria-label="View raw payload"
                title="Raw payload"
              >
                <Braces className="size-3.5" />
              </button>
            )}
          </div>

          {/* Prompts and commands */}
          {(e.prompt || e.command) &&
            !isPatchCommand &&
            e.action !== 'ELICIT' &&
            e.action !== 'DISPLAY' &&
            e.action !== 'INSTRUCT' &&
            e.action !== 'WORKTREE' && (
              <CommandBlock
                prompt={e.prompt}
                command={e.command}
                path={e.path}
                searchQuery={searchQuery}
              />
            )}

          {/* Standard string replacement diff */}
          {e.action === 'EDIT' && (e.old_string || e.new_string) && (
            <div className="eblock eblock-diff mt-2 select-text" data-event-drag-ignore>
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
            <div className="eblock eblock-diff mt-2 select-text" data-event-drag-ignore>
              <strong>{e.path || 'Changes'}</strong>
              <PatchBlock text={e.prompt || e.command || ''} startLine={e.start_line} />
            </div>
          )}

          {/* Action-specific renderers */}
          {e.action === 'STOP' && (
            <StopBlock response={e.response || ''} searchQuery={searchQuery} />
          )}
          {(e.error_message || e.error_type) && (
            <ErrorBlock
              errorMessage={e.error_message}
              errorType={e.error_type}
              searchQuery={searchQuery}
            />
          )}
          {e.action === 'TASK' && (
            <TaskBlock
              title={e.task_title}
              description={e.task_description}
              searchQuery={searchQuery}
            />
          )}
          {e.action === 'NOTIFY' && (
            <NotifyBlock
              title={e.notification_title}
              message={e.notification_message}
              searchQuery={searchQuery}
            />
          )}
          {e.action === 'CWD' && <CwdBlock oldCwd={e.old_cwd} newCwd={e.new_cwd} />}

          {/* Tool hooks */}
          {e.hook_event_name === 'PostToolUse' && (
            <ToolResultBlock
              stdout={e.tool_result_stdout}
              stderr={e.tool_result_stderr}
              durationMs={e.duration_ms}
              searchQuery={searchQuery}
            />
          )}
          {e.action === 'BATCH' && <BatchBlock json={e.tool_calls_json} />}
          {e.action === 'DISPLAY' && (
            <DisplayBlock message={e.notification_message || e.prompt} searchQuery={searchQuery} />
          )}
          {e.action === 'ELICIT' && (
            <ElicitBlock
              serverName={e.server_name}
              prompt={e.prompt || e.notification_message}
              response={e.response}
              searchQuery={searchQuery}
            />
          )}
          {e.action === 'WORKTREE' && (
            <WorktreeBlock branch={e.branch} hookEventName={e.hook_event_name} />
          )}
          {e.action === 'INSTRUCT' && (
            <InstructBlock
              memoryType={e.memory_type}
              loadReason={e.load_reason}
              searchQuery={searchQuery}
            />
          )}

          {/* Metadata Badges */}
          <EventBadges event={e} />
        </div>
      </div>
      {e.dedup_key && (
        <RawPayloadModal
          dedupKey={e.dedup_key}
          label={[
            e.hook_event_name,
            e.action,
            new Date(e.time).toLocaleTimeString([], { hour12: false }),
          ]
            .filter(Boolean)
            .join(' · ')}
          open={rawModalOpen}
          onClose={() => setRawModalOpen(false)}
        />
      )}
    </div>
  )
}
