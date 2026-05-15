import { useState } from 'react'
import { ChevronRight, ChevronDown, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TraceSpan } from './hooks/useTraces'

interface Props {
  span: TraceSpan
  depth: number
  selected: TraceSpan | null
  onSelect: (span: TraceSpan) => void
  onOpenPanel: () => void
  globalStart: number
  globalDuration: number
  timelineWidth: number
}

function getSpanColor(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('llm') || t.includes('chat') || t.includes('model')) {
    return 'bg-[linear-gradient(90deg,rgba(245,158,11,0.95),rgba(249,115,22,0.82))] shadow-[0_0_16px_rgba(245,158,11,0.18)]'
  }
  if (t.includes('retriever') || t.includes('tool') || t.includes('vector')) {
    return 'bg-[linear-gradient(90deg,rgba(99,102,241,0.95),rgba(168,85,247,0.82))] shadow-[0_0_16px_rgba(129,140,248,0.18)]'
  }
  return 'bg-[linear-gradient(90deg,rgba(56,189,248,0.95),rgba(59,130,246,0.82))] shadow-[0_0_16px_rgba(56,189,248,0.16)]'
}

export function TraceTreeNode({
  span,
  depth,
  selected,
  onSelect,
  onOpenPanel,
  globalStart,
  globalDuration,
  timelineWidth,
}: Props) {
  const [expanded, setExpanded] = useState(true)
  const isSelected = selected?.id === span.id

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    setExpanded(!expanded)
  }

  const colorClass = getSpanColor(span.type)
  const minBarWidth = Math.min(4, timelineWidth)
  const rawLeftPx = ((span.startTime - globalStart) / globalDuration) * timelineWidth
  const rawRightPx = ((span.endTime - globalStart) / globalDuration) * timelineWidth
  const depthOffsetPx = depth * 18
  const barLeftPx = Math.min(
    Math.max(Math.max(rawLeftPx, depthOffsetPx + 12), 0),
    Math.max(timelineWidth - minBarWidth, 0)
  )
  const barWidthPx = Math.min(
    timelineWidth - barLeftPx,
    Math.max(Math.max(rawRightPx - barLeftPx, 0), minBarWidth)
  )
  const outsideLabelLeftPx = Math.min(
    barLeftPx + barWidthPx + 8,
    Math.max(timelineWidth - 44, 0)
  )

  return (
    <div className="flex flex-col">
      <div
        className="group flex h-[44px] cursor-pointer items-center border-b border-b-white/6 transition-all duration-200"
        onClick={() => onSelect(span)}
        onDoubleClick={() => {
          onSelect(span)
          onOpenPanel()
        }}
      >
        <div className="relative mx-5 flex h-full items-center" style={{ width: `${timelineWidth}px` }}>
          <div className="absolute inset-y-0 left-0 right-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02)_0,rgba(255,255,255,0.02)_1px,transparent_1px,transparent_100%)] bg-[length:56px_100%]" />
          <div
            className="absolute inset-y-0 left-0 w-px bg-white/8"
            style={{ left: `${depth * 18}px` }}
          />
          <div
            className={cn(
              'absolute h-[26px] rounded-md opacity-95 ring-1 ring-white/10 transition-all duration-300 group-hover:opacity-100',
              isSelected ? 'ring-2 ring-sky-300/70' : '',
              colorClass
            )}
            style={{
              left: `${barLeftPx}px`,
              width: `${barWidthPx}px`,
            }}
          />
          <div
            className="pointer-events-none absolute z-10 flex min-w-0 items-center gap-1.5"
            style={{ left: `${Math.max(barLeftPx - 4, depthOffsetPx + 8)}px` }}
          >
            {span.children.length > 0 && (
              <button
                type="button"
                onClick={toggleExpand}
                className="pointer-events-auto flex size-5 items-center justify-center rounded-sm bg-black/45 text-[#8e96a3] hover:text-white"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <div
              className={cn(
                'flex max-w-[240px] items-center gap-1.5 rounded-md border border-white/10 bg-[#111723]/90 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white shadow-sm backdrop-blur-sm',
                isSelected ? 'ring-1 ring-sky-400/30' : ''
              )}
            >
              <Cpu className="h-3 w-3 shrink-0 text-white/80" />
              <span className="truncate">{span.type}</span>
              <span className="truncate text-white/72 normal-case tracking-normal">{span.name}</span>
            </div>
          </div>
          {barWidthPx > 84 ? (
            <span
              className="pointer-events-none absolute truncate px-2 text-[10px] font-semibold text-white/92"
              style={{
                left: `${barLeftPx}px`,
                width: `${barWidthPx}px`,
              }}
            >
              {(span.duration / 1000).toFixed(2)}s
            </span>
          ) : (
            <span
              className="absolute text-[10px] font-medium tracking-wide text-white/50"
              style={{ left: `${outsideLabelLeftPx}px` }}
            >
              {(span.duration / 1000).toFixed(2)}s
            </span>
          )}
        </div>
      </div>

      {expanded && span.children.length > 0 && (
        <div className="relative flex flex-col">
          {span.children.map((child) => (
            <TraceTreeNode
              key={child.id}
              span={child}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
              onOpenPanel={onOpenPanel}
              globalStart={globalStart}
              globalDuration={globalDuration}
              timelineWidth={timelineWidth}
            />
          ))}
        </div>
      )}
    </div>
  )
}
