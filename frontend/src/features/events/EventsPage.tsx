import { useEffect, useState } from 'react'
import { Columns2, SlidersHorizontal } from 'lucide-react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { cn } from '@/lib/utils'
import { useLiveEvents } from './hooks/useLiveEvents'
import { useEventFilters } from './hooks/useEventFilters'
import { buildEventKey } from './eventKey'
import { EventFilters } from './EventFilters'
import { SessionList } from './SessionList'
import type { EventRecord, LayoutOutletContext, TooltipState } from '@/types'

type PendingEventLink = {
  sessionId: string
  eventKey: string
}

export function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [pendingEventLink, setPendingEventLink] = useState<PendingEventLink | null>(null)
  const [highlightedEventKey, setHighlightedEventKey] = useState<string | null>(null)
  const { collapsedSessions, setCollapsedSessions, sessionUsage, searchQuery, setSearchQuery } =
    useOutletContext<LayoutOutletContext>()
  const sessionFilterOverride = pendingEventLink?.sessionId ?? ''
  const { events, error } = useLiveEvents(sessionFilterOverride, { enabled: true })

  const {
    actionFilter,
    setActionFilter,
    agentFilter,
    setAgentFilter,
    availableAgents,
    projectFilter,
    setProjectFilter,
    availableProjects,
    sortOrder,
    setSortOrder,
    timeRange,
    setTimeRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    filteredEvents,
  } = useEventFilters(events, searchQuery, setSearchQuery, sessionFilterOverride)

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [splitView, setSplitView] = useState(false)
  // session IDs whose entire session (including future events) lives in panel 2
  const [panel2Sessions, setPanel2Sessions] = useState<Set<string>>(new Set())
  // individual event keys pinned to panel 2
  const [panel2EventKeys, setPanel2EventKeys] = useState<Set<string>>(new Set())
  const [dragOverPanel, setDragOverPanel] = useState<1 | 2 | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [edgeZoneHover, setEdgeZoneHover] = useState(false)

  const clearPanel2 = () => {
    setPanel2Sessions(new Set())
    setPanel2EventKeys(new Set())
  }

  useEffect(() => {
    const onStart = () => setIsDragging(true)
    const onEnd = () => {
      setIsDragging(false)
      setEdgeZoneHover(false)
    }
    document.addEventListener('dragstart', onStart)
    document.addEventListener('dragend', onEnd)
    return () => {
      document.removeEventListener('dragstart', onStart)
      document.removeEventListener('dragend', onEnd)
    }
  }, [])

  const getSessionId = (event: Pick<EventRecord, 'session' | 'transcript_path'>) =>
    event.session || event.transcript_path || 'ungrouped'

  const inPanel2 = (event: EventRecord) =>
    panel2Sessions.has(getSessionId(event)) || panel2EventKeys.has(buildEventKey(event))

  const panel1Events = splitView ? filteredEvents.filter((e) => !inPanel2(e)) : filteredEvents
  const panel2Events = filteredEvents.filter((e) => inPanel2(e))

  const addToPanel2 = (data: string) => {
    if (data.startsWith('session:')) {
      const sessionId = data.slice('session:'.length)
      setPanel2Sessions((prev) => new Set([...prev, sessionId]))
    } else {
      setPanel2EventKeys((prev) => new Set([...prev, data]))
    }
  }

  const removeFromPanel2 = (data: string) => {
    if (data.startsWith('session:')) {
      const sessionId = data.slice('session:'.length)
      setPanel2Sessions((prev) => {
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
    } else {
      setPanel2EventKeys((prev) => {
        const next = new Set(prev)
        next.delete(data)
        return next
      })
    }
  }

  const handleDropToPanel = (targetPanel: 1 | 2) => (ev: React.DragEvent) => {
    ev.preventDefault()
    const data = ev.dataTransfer.getData('text/plain')
    if (!data) return
    if (targetPanel === 2) addToPanel2(data)
    else removeFromPanel2(data)
    setDragOverPanel(null)
    setIsDragging(false)
  }

  const handleDragOver = (panel: 1 | 2) => (ev: React.DragEvent) => {
    ev.preventDefault()
    ev.dataTransfer.dropEffect = 'move'
    setDragOverPanel(panel)
  }

  const handleDragLeave = (ev: React.DragEvent) => {
    if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
      setDragOverPanel(null)
    }
  }

  const handleDropToEdge = (ev: React.DragEvent) => {
    ev.preventDefault()
    const data = ev.dataTransfer.getData('text/plain')
    if (!data) return
    if (!splitView) clearPanel2()
    setSplitView(true)
    addToPanel2(data)
    setEdgeZoneHover(false)
    setIsDragging(false)
  }

  useEffect(() => {
    const sessionId = searchParams.get('session') ?? ''
    const eventKey = searchParams.get('event') ?? ''
    if (!sessionId || !eventKey) return

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('session')
    nextParams.delete('event')
    queueMicrotask(() => {
      setPendingEventLink({ sessionId, eventKey })
      setHighlightedEventKey(eventKey)
      setCollapsedSessions((prev) => {
        if (!prev.has(sessionId)) return prev
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
      setSearchParams(nextParams, { replace: true })
    })
  }, [searchParams, setCollapsedSessions, setSearchParams])

  useEffect(() => {
    if (!highlightedEventKey) return

    const timeoutId = window.setTimeout(() => setHighlightedEventKey(null), 2500)
    return () => window.clearTimeout(timeoutId)
  }, [highlightedEventKey])

  const toggleSession = (id: string) => {
    setCollapsedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearPendingEventLink = () => {
    setPendingEventLink(null)
  }

  const handleActionFilterChange = (value: string) => {
    clearPendingEventLink()
    setActionFilter(value)
  }

  const handleAgentFilterChange = (value: string) => {
    clearPendingEventLink()
    setAgentFilter(value)
  }

  const handleProjectFilterChange = (value: string) => {
    clearPendingEventLink()
    setProjectFilter(value)
  }

  const handleSortOrderChange = (value: string) => {
    clearPendingEventLink()
    setSortOrder(value)
  }

  const handleTimeRangeChange = (value: string) => {
    clearPendingEventLink()
    setTimeRange(value)
  }

  const handleCustomStartChange = (value: string) => {
    clearPendingEventLink()
    setCustomStart(value)
  }

  const handleCustomEndChange = (value: string) => {
    clearPendingEventLink()
    setCustomEnd(value)
  }

  const handleTargetVisible = () => {}

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c0c] relative">
      <div className="border-b border-[#333] bg-[#111] px-4 py-2 sm:hidden">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between border-[#333] bg-black text-[#cccccc] hover:bg-white/[0.03] hover:text-[#cccccc]"
          onClick={() => setMobileFiltersOpen((open) => !open)}
          aria-expanded={mobileFiltersOpen}
          aria-controls="event-filters"
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="size-3.5" />
            Filters
          </span>
          <span>{mobileFiltersOpen ? 'Hide' : 'Show'}</span>
        </Button>
      </div>
      <EventFilters
        id="event-filters"
        actionFilter={actionFilter}
        setActionFilter={handleActionFilterChange}
        agentFilter={agentFilter}
        setAgentFilter={handleAgentFilterChange}
        availableAgents={availableAgents}
        projectFilter={projectFilter}
        setProjectFilter={handleProjectFilterChange}
        availableProjects={availableProjects}
        sortOrder={sortOrder}
        setSortOrder={handleSortOrderChange}
        timeRange={timeRange}
        setTimeRange={handleTimeRangeChange}
        customStart={customStart}
        setCustomStart={handleCustomStartChange}
        customEnd={customEnd}
        setCustomEnd={handleCustomEndChange}
        splitView={splitView}
        onToggleSplit={() => {
          if (splitView) {
            setSplitView(false)
            clearPanel2()
          } else {
            setSplitView(true)
          }
        }}
        className={mobileFiltersOpen ? 'sm:flex' : 'hidden sm:flex'}
      />

      {splitView ? (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel minSize={20} defaultSize={50}>
            <div
              className={cn(
                'relative h-full overflow-y-auto p-3 sm:p-4 lg:p-5 transition-colors',
                dragOverPanel === 1 && 'bg-sky-500/[0.04] ring-1 ring-inset ring-sky-500/20'
              )}
              onDragOver={handleDragOver(1)}
              onDragLeave={handleDragLeave}
              onDrop={handleDropToPanel(1)}
            >
              {events.length === 0 && !error ? (
                <div className="text-[#666] text-sm h-full flex flex-col items-center justify-center">
                  No events found. Start a session to see events stream here.
                </div>
              ) : (
                <SessionList
                  events={panel1Events}
                  sortOrder={sortOrder}
                  searchQuery={searchQuery}
                  collapsedSessions={collapsedSessions}
                  toggleSession={toggleSession}
                  sessionUsage={sessionUsage}
                  setTooltip={setTooltip}
                  targetSessionId={pendingEventLink?.sessionId ?? null}
                  targetEventKey={pendingEventLink?.eventKey ?? null}
                  highlightedEventKey={highlightedEventKey}
                  onTargetVisible={handleTargetVisible}
                  isEventDraggable
                />
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle className="w-[3px] bg-[#222] hover:bg-[#444] active:bg-[#555] transition-colors cursor-col-resize" />

          <ResizablePanel minSize={20} defaultSize={50}>
            <div
              className={cn(
                'relative h-full overflow-y-auto p-3 sm:p-4 lg:p-5 transition-colors',
                dragOverPanel === 2 && 'bg-sky-500/[0.04] ring-1 ring-inset ring-sky-500/20'
              )}
              onDragOver={handleDragOver(2)}
              onDragLeave={handleDragLeave}
              onDrop={handleDropToPanel(2)}
            >
              {panel2Events.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[#2a2a2a] p-10 text-[#444] text-sm transition-colors',
                      dragOverPanel === 2 && 'border-sky-500/40 text-[#666]'
                    )}
                  >
                    <span>Drop events here</span>
                  </div>
                </div>
              ) : (
                <SessionList
                  events={panel2Events}
                  sortOrder={sortOrder}
                  searchQuery={searchQuery}
                  collapsedSessions={collapsedSessions}
                  toggleSession={toggleSession}
                  sessionUsage={sessionUsage}
                  setTooltip={setTooltip}
                  targetSessionId={null}
                  targetEventKey={null}
                  highlightedEventKey={highlightedEventKey}
                  onTargetVisible={handleTargetVisible}
                  isEventDraggable
                />
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
          {error && (
            <Alert variant="destructive" className="mb-4 bg-red-950/50 border-red-900">
              <AlertTitle>Connection Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {events.length === 0 && !error ? (
            <div className="text-[#666] text-sm h-full flex flex-col items-center justify-center">
              No events found. Start a session to see events stream here.
            </div>
          ) : (
            <SessionList
              events={filteredEvents}
              isEventDraggable
              sortOrder={sortOrder}
              searchQuery={searchQuery}
              collapsedSessions={collapsedSessions}
              toggleSession={toggleSession}
              sessionUsage={sessionUsage}
              setTooltip={setTooltip}
              targetSessionId={pendingEventLink?.sessionId ?? null}
              targetEventKey={pendingEventLink?.eventKey ?? null}
              highlightedEventKey={highlightedEventKey}
              onTargetVisible={handleTargetVisible}
            />
          )}
        </div>
      )}

      {tooltip && (
        <div
          className="fixed pointer-events-none z-[1000] bg-black text-[#ccc] px-2 py-1 text-[0.7rem] rounded border border-white/10"
          style={{ top: tooltip.y + 10, left: tooltip.x + 10 }}
        >
          {tooltip.text}
        </div>
      )}

      {isDragging && (
        <div
          className={cn(
            'absolute right-0 top-0 bottom-0 z-[500] pointer-events-auto transition-all duration-150',
            edgeZoneHover ? 'w-[38%]' : 'w-12'
          )}
          onDragEnter={() => setEdgeZoneHover(true)}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setEdgeZoneHover(false)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }}
          onDrop={handleDropToEdge}
        >
          {edgeZoneHover && (
            <div className="h-full w-full bg-sky-500/10 border-l-2 border-sky-500/40 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-sky-400/90 select-none">
                <Columns2 className="size-10 opacity-80" />
                <span className="text-sm font-medium">Split here</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
