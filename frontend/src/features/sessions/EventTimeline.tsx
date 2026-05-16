import { cn } from '@/lib/utils'
import type { EventRecord } from '@/types/events'
import type { TraceSpan } from './hooks/useTraces'

interface Props {
  events: EventRecord[]
  selected: TraceSpan | null
  onSelect: (span: TraceSpan) => void
  onOpenPanel: () => void
  globalStart: number
  globalDuration: number
  timelineWidth: number
}

function eventColor(name = '') {
  switch (name) {
    case 'PreToolUse':
    case 'PostToolUse':
      return 'bg-[linear-gradient(90deg,rgba(139,92,246,0.95),rgba(168,85,247,0.82))] shadow-[0_0_16px_rgba(168,85,247,0.18)]'
    case 'Stop':
    case 'SessionEnd':
      return 'bg-[linear-gradient(90deg,rgba(16,185,129,0.95),rgba(52,211,153,0.82))] shadow-[0_0_16px_rgba(16,185,129,0.18)]'
    case 'SubagentStart':
    case 'SubagentStop':
      return 'bg-[linear-gradient(90deg,rgba(249,115,22,0.95),rgba(251,146,60,0.82))] shadow-[0_0_16px_rgba(249,115,22,0.18)]'
    default:
      return 'bg-[linear-gradient(90deg,rgba(56,189,248,0.95),rgba(59,130,246,0.82))] shadow-[0_0_16px_rgba(56,189,248,0.16)]'
  }
}

function eventSpan(event: EventRecord, index: number): TraceSpan {
  const startTime = new Date(event.time).getTime()
  const duration = Math.max(event.duration_ms || 0, 0)

  return {
    id: `${event.session || 'event'}-${event.time}-${index}`,
    name: [event.hook_event_name || 'Event', event.tool].filter(Boolean).join(' / '),
    type: event.hook_event_name || 'event',
    startTime,
    endTime: startTime + duration,
    duration,
    children: [],
    event,
  }
}

export function EventTimeline({
  events,
  selected,
  onSelect,
  onOpenPanel,
  globalStart,
  globalDuration,
  timelineWidth,
}: Props) {
  const minBarWidth = Math.min(4, timelineWidth)

  return (
    <div className="flex flex-col min-w-max pb-4">
      {events.map((event, index) => {
        const span = eventSpan(event, index)
        const selectedRow = selected?.id === span.id
        const rawLeftPx = ((span.startTime - globalStart) / globalDuration) * timelineWidth
        const safeLeftPx = Math.min(
          Math.max(rawLeftPx, 0),
          Math.max(timelineWidth - minBarWidth, 0)
        )
        const rawWidthPx = (span.duration / globalDuration) * timelineWidth
        const barWidthPx = Math.min(timelineWidth - safeLeftPx, Math.max(rawWidthPx, minBarWidth))
        const color = eventColor(event.hook_event_name)

        return (
          <button
            key={span.id}
            type="button"
            className={cn(
              'flex h-[44px] w-full items-center border-b border-b-white/6 text-left transition-colors'
            )}
            onClick={() => onSelect(span)}
            onDoubleClick={() => {
              onSelect(span)
              onOpenPanel()
            }}
          >
            <div
              className="relative mx-5 flex h-full items-center"
              style={{ width: `${timelineWidth}px` }}
            >
              <div className="absolute inset-y-0 left-0 right-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02)_0,rgba(255,255,255,0.02)_1px,transparent_1px,transparent_100%)] bg-[length:56px_100%]" />
              <div
                className={cn(
                  'absolute h-[26px] rounded-md opacity-95 transition-opacity hover:opacity-100',
                  selectedRow ? 'ring-2 ring-sky-300/70' : 'ring-1 ring-white/10',
                  color
                )}
                style={{
                  left: `${safeLeftPx}px`,
                  width: `${barWidthPx}px`,
                }}
              />
              <div
                className="pointer-events-none absolute z-10 flex min-w-0 items-center"
                style={{ left: `${safeLeftPx}px` }}
              >
                <div
                  className="flex max-w-[400px] items-center gap-1.5 px-2 text-[12px] font-medium text-white"
                  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}
                >
                  {event.hook_event_name?.includes('Tool') ? (
                    <span className="flex-shrink-0 text-[10px] opacity-90">🔗</span>
                  ) : (
                    <span className="flex-shrink-0 text-[11px] font-bold text-amber-400">A|</span>
                  )}
                  <span className="truncate">{event.hook_event_name || event.tool || 'Event'}</span>
                  {event.tool && event.tool !== event.hook_event_name ? (
                    <span className="truncate text-white/72">{event.tool}</span>
                  ) : null}
                  {span.duration > 0 && (
                    <span className="flex-shrink-0 whitespace-nowrap opacity-80">
                      - {(span.duration / 1000).toFixed(2)}s
                    </span>
                  )}
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
