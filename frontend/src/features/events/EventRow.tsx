import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { cn } from '@/lib/utils'
import { formatEventTime, highlight } from '@/lib/format'
import type { EventRecord } from '@/types/events'
import { AgentLogo, agentMeta } from '@/agents/catalog'
import { buildEventKey } from './eventKey'

// Lazy so CodeMirror (the raw-payload viewer's editor, ~159 kB gzip) only
// downloads when a user first opens a payload — not on session-page load.
const RawPayloadModal = lazy(() =>
  import('./RawPayloadModal').then((m) => ({ default: m.RawPayloadModal }))
)

type EventRowProps = {
  event: EventRecord
  searchQuery: string
  highlighted?: boolean
  isPendingTarget?: boolean
  onTargetVisible?: () => void
  isDraggable?: boolean
}

// EventRow renders one hook event as a single agent-agnostic line. Because every
// agent's payload differs, the row shows only the fields common to all agents —
// time · agent · event · tool · session. Everything else (diffs, commands, tool
// output, per-agent fields) lives in the raw payload, opened via the icon.
export const EventRow = memo(function EventRow({
  event: e,
  searchQuery,
  highlighted = false,
  isPendingTarget = false,
  onTargetVisible,
  isDraggable = false,
}: EventRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const targetHandledRef = useRef(false)
  const suppressDragRef = useRef(false)
  const [rawModalOpen, setRawModalOpen] = useState(false)
  // Latch: once opened, keep the modal mounted so close/re-open keep their
  // animations and the editor chunk isn't re-fetched.
  const [modalMounted, setModalMounted] = useState(false)

  const agentId = e.agent || 'unknown'
  const eventName = e.hook_event_name || e.action || '—'

  const handleDragStart = (ev: DragEvent<HTMLDivElement>) => {
    if (suppressDragRef.current) {
      ev.preventDefault()
      return
    }
    const target = ev.target as HTMLElement | null
    if (target?.closest('[data-event-drag-ignore], pre, code, button, a, [role="button"]')) {
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
            '[data-event-drag-ignore], pre, code, button, a, [role="button"]'
          )
        )
      }}
      onMouseUpCapture={() => {
        suppressDragRef.current = false
      }}
      onDragEnd={() => {
        suppressDragRef.current = false
      }}
      onClick={
        e.dedup_key
          ? () => {
              setModalMounted(true)
              setRawModalOpen(true)
            }
          : undefined
      }
      data-testid="event-row"
      className={cn(
        'flex items-center gap-3 border-b border-foreground/[0.04] py-2 text-[0.82rem] leading-[1.4] hover:bg-foreground/[0.02]',
        highlighted ? 'rounded-md bg-sky-500/8 ring-1 ring-sky-400/35' : '',
        e.dedup_key && 'cursor-pointer',
        isDraggable && 'cursor-grab active:cursor-grabbing'
      )}
    >
      <span className="w-[64px] shrink-0 text-muted-foreground">{formatEventTime(e.time)}</span>

      <span
        className="flex shrink-0 items-center text-muted-foreground"
        title={agentMeta(agentId).label}
        aria-label={agentMeta(agentId).label}
      >
        <AgentLogo id={agentId} size={15} />
      </span>

      <span className={cn('shrink-0 font-semibold text-foreground', e.action)}>{eventName}</span>

      {e.tool && (
        <span className="min-w-0 truncate text-muted-foreground">
          {highlight(e.tool, searchQuery)}
        </span>
      )}

      <span className="flex-1" />

      {e.dedup_key && modalMounted && (
        // Radix portals the dialog, but React events still bubble through the
        // portal to this row's onClick. Stop them here so closing the modal
        // (overlay click / X) doesn't immediately re-open it.
        <span onClick={(ev) => ev.stopPropagation()}>
          <Suspense fallback={null}>
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
          </Suspense>
        </span>
      )}
    </div>
  )
})
