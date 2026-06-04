import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { Columns2, SlidersHorizontal } from 'lucide-react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { cn } from '@/lib/utils'
import { useLiveEvents } from './hooks/useLiveEvents'
import { useHistoricalEvents } from './hooks/useHistoricalEvents'
import { useEventFilters } from './hooks/useEventFilters'
import { buildEventKey } from './eventKey'
import { EventFilters } from './EventFilters'
import { SessionList } from './SessionList'
import type { EventRecord, LayoutOutletContext, TooltipState } from '@/types'

type PendingEventLink = {
  sessionId: string
  eventKey: string
}

type EventLinkState = {
  pendingEventLink: PendingEventLink | null
  highlightedEventKey: string | null
}

type PanelDragState = {
  splitView: boolean
  panel2Sessions: Set<string>
  panel2EventKeys: Set<string>
  isDragging: boolean
  dragOverPanel: 1 | 2 | null
  edgeZoneHover: boolean
}

type PanelDragAction =
  | { type: 'ADD_TO_PANEL2'; data: string }
  | { type: 'REMOVE_FROM_PANEL2'; data: string }
  | { type: 'CLEAR_PANEL2' }
  | { type: 'ENABLE_SPLIT' }
  | { type: 'DISABLE_SPLIT' }
  | { type: 'SET_DRAG_OVER'; panel: 1 | 2 | null }
  | { type: 'SET_DRAGGING'; isDragging: boolean }
  | { type: 'SET_EDGE_HOVER'; hover: boolean }

const initialPanelDragState: PanelDragState = {
  splitView: false,
  panel2Sessions: new Set(),
  panel2EventKeys: new Set(),
  isDragging: false,
  dragOverPanel: null,
  edgeZoneHover: false,
}

function panelDragReducer(state: PanelDragState, action: PanelDragAction): PanelDragState {
  switch (action.type) {
    case 'ADD_TO_PANEL2': {
      if (action.data.startsWith('session:')) {
        const id = action.data.slice('session:'.length)
        return { ...state, panel2Sessions: new Set([...state.panel2Sessions, id]) }
      }
      return { ...state, panel2EventKeys: new Set([...state.panel2EventKeys, action.data]) }
    }
    case 'REMOVE_FROM_PANEL2': {
      if (action.data.startsWith('session:')) {
        const id = action.data.slice('session:'.length)
        const next = new Set(state.panel2Sessions)
        next.delete(id)
        return { ...state, panel2Sessions: next }
      }
      const next = new Set(state.panel2EventKeys)
      next.delete(action.data)
      return { ...state, panel2EventKeys: next }
    }
    case 'CLEAR_PANEL2':
      return { ...state, panel2Sessions: new Set(), panel2EventKeys: new Set() }
    case 'ENABLE_SPLIT':
      return { ...state, splitView: true }
    case 'DISABLE_SPLIT':
      return { ...state, splitView: false, panel2Sessions: new Set(), panel2EventKeys: new Set() }
    case 'SET_DRAG_OVER':
      return { ...state, dragOverPanel: action.panel }
    case 'SET_DRAGGING':
      return { ...state, isDragging: action.isDragging, edgeZoneHover: action.isDragging ? state.edgeZoneHover : false }
    case 'SET_EDGE_HOVER':
      return { ...state, edgeZoneHover: action.hover }
  }
}

function getSessionId(event: Pick<EventRecord, 'session' | 'transcript_path'>) {
  return event.session || event.transcript_path || 'ungrouped'
}

function handleTargetVisible() {}

type EdgeDropZoneProps = {
  edgeZoneHover: boolean
  onDragEnter: () => void
  onDragLeave: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

function EdgeDropZone({ edgeZoneHover, onDragEnter, onDragLeave, onDragOver, onDrop }: EdgeDropZoneProps) {
  return (
    <div
      className={cn(
        'absolute right-0 top-0 bottom-0 z-[500] pointer-events-auto transition-all duration-150',
        edgeZoneHover ? 'w-[38%]' : 'w-12'
      )}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
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
  )
}

export function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [pendingEventLink, setPendingEventLink] = useState<PendingEventLink | null>(null)
  const [highlightedEventKey, setHighlightedEventKey] = useState<string | null>(null)
  const {
    collapsedSessions,
    setCollapsedSessions,
    sessionUsage,
    searchQuery,
    setSearchQuery,
    isLive,
    setIsLive,
    refreshSessionUsage,
  } = useOutletContext<LayoutOutletContext>()
  const sessionFilterOverride = pendingEventLink?.sessionId ?? ''

  const [timeRange, setTimeRange] = useState(
    () => localStorage.getItem('events_time_range') ?? '15m'
  )
  const [customStart, setCustomStart] = useState(
    () => localStorage.getItem('events_custom_start') ?? ''
  )
  const [customEnd, setCustomEnd] = useState(() => localStorage.getItem('events_custom_end') ?? '')

  useEffect(() => {
    localStorage.setItem('events_time_range', timeRange)
  }, [timeRange])
  useEffect(() => {
    localStorage.setItem('events_custom_start', customStart)
  }, [customStart])
  useEffect(() => {
    localStorage.setItem('events_custom_end', customEnd)
  }, [customEnd])

  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (timeRange === 'custom' || !isLive) return
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [timeRange, isLive])

  const sinceISO = useMemo(() => {
    if (timeRange === 'custom')
      return customStart ? new Date(customStart.replace(' ', 'T')).toISOString() : ''
    const offsets: Record<string, number> = {
      '5m': 5,
      '15m': 15,
      '1h': 60,
      '6h': 360,
      '24h': 1440,
      '7d': 10080,
      '30d': 43200,
    }
    const mins = offsets[timeRange]
    return mins !== undefined ? new Date(nowMs - mins * 60 * 1000).toISOString() : ''
  }, [timeRange, customStart, nowMs])

  const untilISO = useMemo(() => {
    if (timeRange === 'custom')
      return customEnd ? new Date(customEnd.replace(' ', 'T')).toISOString() : ''
    return ''
  }, [timeRange, customEnd])

  const liveState = useLiveEvents(sessionFilterOverride, { enabled: isLive })
  const histState = useHistoricalEvents(sinceISO, untilISO, sessionFilterOverride, !isLive)
  const activeEvents = isLive ? liveState.events : histState.events
  const activeError = isLive ? liveState.error : histState.error

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
    filteredEvents,
    refreshProjects,
  } = useEventFilters(
    activeEvents,
    searchQuery,
    setSearchQuery,
    sessionFilterOverride,
    timeRange,
    setTimeRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    isLive
  )

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [panelDrag, dispatchPanelDrag] = useReducer(panelDragReducer, initialPanelDragState)
  const { splitView, panel2Sessions, panel2EventKeys, isDragging, dragOverPanel, edgeZoneHover } = panelDrag

  const inPanel2 = (event: EventRecord) =>
    panel2Sessions.has(getSessionId(event)) || panel2EventKeys.has(buildEventKey(event))

  const panel1Events = splitView ? filteredEvents.filter((e) => !inPanel2(e)) : filteredEvents
  const panel2Events = filteredEvents.filter((e) => inPanel2(e))

  const applyDeepLink = useCallback((sessionId: string, eventKey: string, nextParams: URLSearchParams) => {
    setEventLink({ pendingEventLink: { sessionId, eventKey }, highlightedEventKey: eventKey })
    setCollapsedSessions((prev) => {
      if (!prev.has(sessionId)) return prev
      const next = new Set(prev)
      next.delete(sessionId)
      return next
    })
    setSearchParams(nextParams, { replace: true })
  }, [setCollapsedSessions, setSearchParams])

  useEffect(() => {
    const sessionId = searchParams.get('session') ?? ''
    const eventKey = searchParams.get('event') ?? ''
    if (!sessionId || !eventKey) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('session')
    nextParams.delete('event')
    queueMicrotask(() => applyDeepLink(sessionId, eventKey, nextParams))
  }, [searchParams, applyDeepLink])

  useEffect(() => {
    const onStart = () => dispatchPanelDrag({ type: 'SET_DRAGGING', isDragging: true })
    const onEnd = () => dispatchPanelDrag({ type: 'SET_DRAGGING', isDragging: false })
    document.addEventListener('dragstart', onStart)
    document.addEventListener('dragend', onEnd)
    return () => {
      document.removeEventListener('dragstart', onStart)
      document.removeEventListener('dragend', onEnd)
    }
  }, [])

  const toggleSession = (id: string) => {
    setCollapsedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDropToPanel = (targetPanel: 1 | 2) => (ev: React.DragEvent) => {
    ev.preventDefault()
    const data = ev.dataTransfer.getData('text/plain')
    if (!data) return
    if (targetPanel === 2) dispatchPanelDrag({ type: 'ADD_TO_PANEL2', data })
    else dispatchPanelDrag({ type: 'REMOVE_FROM_PANEL2', data })
    dispatchPanelDrag({ type: 'SET_DRAG_OVER', panel: null })
    dispatchPanelDrag({ type: 'SET_DRAGGING', isDragging: false })
  }

  const handleDropToEdge = (ev: React.DragEvent) => {
    ev.preventDefault()
    const data = ev.dataTransfer.getData('text/plain')
    if (!data) return
    if (!splitView) dispatchPanelDrag({ type: 'CLEAR_PANEL2' })
    dispatchPanelDrag({ type: 'ENABLE_SPLIT' })
    dispatchPanelDrag({ type: 'ADD_TO_PANEL2', data })
    dispatchPanelDrag({ type: 'SET_DRAGGING', isDragging: false })
  }

  const handleDragOver = (panel: 1 | 2) => (ev: React.DragEvent) => {
    ev.preventDefault()
    ev.dataTransfer.dropEffect = 'move'
    dispatchPanelDrag({ type: 'SET_DRAG_OVER', panel })
  }

  const handleDragLeave = (ev: React.DragEvent) => {
    if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
      dispatchPanelDrag({ type: 'SET_DRAG_OVER', panel: null })
    }
  }

  const clearLink = () => setEventLink((prev) => ({ ...prev, pendingEventLink: null }))

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c0c] relative">
      <div className="border-b border-[#333] bg-[#111] px-4 py-2 sm:hidden">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between border-[#333] bg-neutral-950 text-[#cccccc] hover:bg-white/[0.03] hover:text-[#cccccc]"
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
        setActionFilter={(v) => { clearLink(); setActionFilter(v) }}
        agentFilter={agentFilter}
        setAgentFilter={(v) => { clearLink(); setAgentFilter(v) }}
        availableAgents={availableAgents}
        projectFilter={projectFilter}
        setProjectFilter={(v) => { clearLink(); setProjectFilter(v) }}
        availableProjects={availableProjects}
        sortOrder={sortOrder}
        setSortOrder={(v) => { clearLink(); setSortOrder(v) }}
        timeRange={timeRange}
        setTimeRange={(v) => { clearLink(); setTimeRange(v) }}
        customStart={customStart}
        setCustomStart={(v) => { clearLink(); setCustomStart(v) }}
        customEnd={customEnd}
        setCustomEnd={(v) => { clearLink(); setCustomEnd(v) }}
        isLive={isLive}
        onToggleLive={setIsLive}
        onRefresh={() => {
          histState.refresh()
          refreshSessionUsage()
          refreshProjects()
        }}
        histLoading={histState.loading}
        splitView={splitView}
        onToggleSplit={() => {
          if (splitView) dispatchPanelDrag({ type: 'DISABLE_SPLIT' })
          else dispatchPanelDrag({ type: 'ENABLE_SPLIT' })
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
              {activeEvents.length === 0 && !activeError ? (
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
                  targetSessionId={eventLink.pendingEventLink?.sessionId ?? null}
                  targetEventKey={eventLink.pendingEventLink?.eventKey ?? null}
                  highlightedEventKey={eventLink.highlightedEventKey}
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
                  highlightedEventKey={eventLink.highlightedEventKey}
                  onTargetVisible={handleTargetVisible}
                  isEventDraggable
                />
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
          {activeError && (
            <Alert variant="destructive" className="mb-4 bg-red-950/50 border-red-900">
              <AlertTitle>Connection Error</AlertTitle>
              <AlertDescription>{activeError}</AlertDescription>
            </Alert>
          )}

          {activeEvents.length === 0 && !activeError ? (
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
              targetSessionId={eventLink.pendingEventLink?.sessionId ?? null}
              targetEventKey={eventLink.pendingEventLink?.eventKey ?? null}
              highlightedEventKey={eventLink.highlightedEventKey}
              onTargetVisible={handleTargetVisible}
            />
          )}

          {!isLive && histState.hasMore && (
            <div className="flex justify-center py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={histState.loadMore}
                disabled={histState.loading}
              >
                {histState.loading ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      )}

      {tooltip && (
        <div
          className="fixed pointer-events-none z-[1000] bg-neutral-950 text-[#ccc] px-2 py-1 text-[0.7rem] rounded border border-white/10"
          style={{ top: tooltip.y + 10, left: tooltip.x + 10 }}
        >
          {tooltip.text}
        </div>
      )}

      {isDragging && (
        <EdgeDropZone
          edgeZoneHover={edgeZoneHover}
          onDragEnter={() => dispatchPanelDrag({ type: 'SET_EDGE_HOVER', hover: true })}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node))
              dispatchPanelDrag({ type: 'SET_EDGE_HOVER', hover: false })
          }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
          onDrop={handleDropToEdge}
        />
      )}
    </div>
  )
}
