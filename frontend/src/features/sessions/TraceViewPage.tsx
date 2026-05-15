import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import { Link, useParams } from 'react-router-dom'
import {
  Minus,
  PanelLeft,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Session } from '@/types/sessions'
import { EventTimeline } from './EventTimeline'
import { TraceInspectionPanel } from './TraceInspectionPanel'
import { TraceTreeNode } from './TraceTreeNode'
import { useTraces, type TraceSpan } from './hooks/useTraces'
import { buildTimelineTicks } from './timelineScale'
import { formatDuration, sessionDurationMs } from './utils'

function initialIsMobile() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
}

function flattenSpans(spans: TraceSpan[]) {
  const all: TraceSpan[] = []
  const visit = (nodes: TraceSpan[]) => {
    for (const node of nodes) {
      all.push(node)
      visit(node.children)
    }
  }
  visit(spans)
  return all
}

export function TraceViewPage() {
  const { encodedCwd = '', sessionId = '' } = useParams()
  const cwd = useMemo(() => decodeURIComponent(encodedCwd), [encodedCwd])
  const cwdBasename = cwd.split('/').filter(Boolean).at(-1) || cwd
  const [session, setSession] = useState<Session | null>(null)
  const [zoom, setZoom] = useState(1)
  const [selectedSpan, setSelectedSpan] = useState<TraceSpan | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(initialIsMobile)
  const [viewportWidth, setViewportWidth] = useState(0)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateWidth = () => setViewportWidth(element.clientWidth)
    updateWidth()

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => updateWidth())
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let mounted = true
    async function fetchSession() {
      const res = await fetch(`/api/sessions?cwd=${encodeURIComponent(cwd)}`)
      if (!res.ok) return
      const sessions = (await res.json()) as Session[]
      if (mounted) setSession(sessions.find((item) => item.session_id === sessionId) || null)
    }
    fetchSession()
    return () => {
      mounted = false
    }
  }, [cwd, sessionId])

  const { traces, events, loading } = useTraces(sessionId, session?.started_at)

  const flatSpans = useMemo(() => flattenSpans(traces), [traces])
  const hasSpans = flatSpans.length > 0
  const useSpanTree = session?.agent !== 'claudecode' && hasSpans
  const zoomLevels = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]
  const zoomIndex = zoomLevels.findIndex((level) => level === zoom)

  const minTime = useMemo(() => {
    const times = useSpanTree
      ? flatSpans.map((span) => span.startTime)
      : events.map((event) => new Date(event.time).getTime())
    const valid = times.filter(Number.isFinite)
    return valid.length ? Math.min(...valid) : 0
  }, [events, flatSpans, useSpanTree])

  const maxTime = useMemo(() => {
    const times = useSpanTree
      ? flatSpans.map((span) => span.endTime)
      : events.map((event) => new Date(event.time).getTime() + Math.max(event.duration_ms || 0, 0))
    const valid = times.filter(Number.isFinite)
    return valid.length ? Math.max(...valid) : 1000
  }, [events, flatSpans, useSpanTree])

  const totalDuration = Math.max(maxTime - minTime, 1000)
  const baseTimelineWidth = Math.max(Math.round(viewportWidth), 1)
  const timelineWidth = Math.max(Math.round(baseTimelineWidth * zoom), baseTimelineWidth)
  const { ticks } = useMemo(
    () => buildTimelineTicks(totalDuration, timelineWidth),
    [timelineWidth, totalDuration]
  )

  const setZoomLevel = (nextZoom: number) => {
    startTransition(() => {
      setZoom(nextZoom)
    })
  }

  const handleZoomIn = () => {
    const nextIndex = zoomIndex >= 0 ? Math.min(zoomIndex + 1, zoomLevels.length - 1) : 0
    setZoomLevel(zoomLevels[nextIndex])
  }

  const handleZoomOut = () => {
    const nextIndex = zoomIndex >= 0 ? Math.max(zoomIndex - 1, 0) : 0
    setZoomLevel(zoomLevels[nextIndex])
  }

  const openPanel = () => setPanelOpen(true)

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a] text-white">
      <header className="shrink-0 border-b border-white/10 bg-black/40 px-5 py-3">
        <div className="text-[12px] font-semibold uppercase tracking-widest text-white/45">
          <Link to="/projects" className="hover:text-white/70 transition-colors">
            Projects
          </Link>
          {' › '}
          <Link
            to={`/sessions/${encodeURIComponent(cwd)}`}
            className="hover:text-white/70 transition-colors"
          >
            {cwdBasename}
          </Link>
          {' › '}
          {sessionId.slice(0, 12)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-white/60">
          <span>
            Started {session?.started_at ? new Date(session.started_at).toLocaleString() : '-'}
          </span>
          <span>
            Duration{' '}
            {session
              ? formatDuration(sessionDurationMs(session, new Date(session.last_seen_at).getTime()))
              : '-'}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PanelGroup orientation={isMobile ? 'vertical' : 'horizontal'}>
          <Panel
            defaultSize={isMobile || !panelOpen ? 100 : 68}
            minSize={30}
            className="relative flex min-w-0 flex-col bg-[#0a0a0a]"
          >
            <div className="border-b border-white/10 bg-[#101116] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[12px] text-white/55">
                  <span className="font-semibold uppercase tracking-[0.18em] text-white/40">
                    Trace
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={handleZoomOut}
                    disabled={zoomIndex <= 0}
                    aria-label="Zoom out"
                    title="Zoom out"
                  >
                    <Minus />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setZoomLevel(1)}
                  >
                    Fit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={handleZoomIn}
                    disabled={zoomIndex === zoomLevels.length - 1}
                    aria-label="Zoom in"
                    title="Zoom in"
                  >
                    <Plus />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setPanelOpen((open) => !open)}
                    aria-label={panelOpen ? 'Hide panel' : 'Show panel'}
                    title={panelOpen ? 'Hide panel' : 'Show panel'}
                  >
                    <PanelLeft className={panelOpen ? '' : 'rotate-180'} />
                  </Button>
                </div>
              </div>
            </div>

            <div ref={containerRef} className="relative flex-1 overflow-auto">
              <div className="flex min-w-full flex-col" style={{ width: `${timelineWidth}px` }}>
                <div className="sticky top-0 z-30 flex h-10 w-full border-b border-white/10 bg-[#0b0c10]/95 backdrop-blur-sm">
                  <div className="relative mx-5 h-full" style={{ width: `${timelineWidth}px` }}>
                    {ticks.map((tick, index) => (
                      <div
                        key={`${tick.timeMs}-${index}`}
                        className="absolute flex h-full select-none flex-col items-center text-[10px] text-white/40"
                        style={{
                          left: `${tick.leftPx}px`,
                          transform:
                            index === 0
                              ? 'translateX(0)'
                              : index === ticks.length - 1
                                ? 'translateX(-100%)'
                                : 'translateX(-50%)',
                        }}
                      >
                        <span className="mt-1 font-medium tracking-wide">{tick.label}</span>
                        <div className="mt-1 h-full w-px bg-white/8" />
                      </div>
                    ))}
                  </div>
                </div>
                {loading ? (
                  <div className="sticky left-0 flex h-32 w-full items-center justify-center text-xs text-[#555]">
                    Loading traces...
                  </div>
                ) : events.length === 0 && traces.length === 0 ? (
                  <div className="sticky left-0 flex h-32 w-full items-center justify-center text-xs text-[#555]">
                    No traces found for this session.
                  </div>
                ) : useSpanTree ? (
                  <div className="flex min-w-max flex-col pb-4">
                    {traces.map((trace) => (
                      <TraceTreeNode
                        key={trace.id}
                        span={trace}
                        depth={0}
                        selected={selectedSpan}
                        onSelect={setSelectedSpan}
                        onOpenPanel={openPanel}
                        globalStart={minTime}
                        globalDuration={totalDuration}
                        timelineWidth={timelineWidth}
                      />
                    ))}
                  </div>
                ) : (
                  <EventTimeline
                    events={events}
                    selected={selectedSpan}
                    onSelect={setSelectedSpan}
                    onOpenPanel={openPanel}
                    globalStart={minTime}
                    globalDuration={totalDuration}
                    timelineWidth={timelineWidth}
                  />
                )}
              </div>
            </div>
          </Panel>

          {panelOpen && (
            <>
              <PanelResizeHandle className="relative z-20 flex w-1 cursor-row-resize items-center justify-center bg-white/5 transition-colors hover:bg-blue-500/50 active:bg-blue-500 md:w-1.5 md:cursor-col-resize">
                <div className="h-0.5 w-8 rounded-full bg-white/20 md:h-8 md:w-0.5" />
              </PanelResizeHandle>

              <Panel
                defaultSize={isMobile ? 50 : 32}
                minSize={24}
                className="z-10 flex min-w-0 flex-col border-t border-white/10 bg-[#111216] shadow-[-4px_0_24px_-8px_rgba(0,0,0,0.5)] md:border-l md:border-t-0"
              >
                <TraceInspectionPanel span={selectedSpan} />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
    </div>
  )
}
