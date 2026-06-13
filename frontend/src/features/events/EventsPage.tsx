import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Columns2, SlidersHorizontal } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { cn } from '@/lib/utils'
import { useEventFilters } from './hooks/useEventFilters'
import { useEventLinkState, useSplitViewInteractions } from './hooks/useEventsPageInteractions'
import { useEventsTimeRangeState } from './hooks/useEventsTimeRangeState'
import { useHistoricalEvents } from './hooks/useHistoricalEvents'
import { useLiveEvents } from './hooks/useLiveEvents'
import { mergeByKey } from './eventKey'
import { EventFilters } from './EventFilters'
import { SessionList } from './SessionList'
import type { EventRecord, LayoutOutletContext, SessionUsage, TooltipState } from '@/types'

function handleTargetVisible() {}

const KNOWN_SESSIONS_KEY = 'events_known_sessions'

function loadKnownSessions(): Set<string> {
  try {
    const raw = sessionStorage.getItem(KNOWN_SESSIONS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === 'string'))
      : new Set()
  } catch {
    return new Set()
  }
}

function saveKnownSessions(ids: Set<string>) {
  try {
    sessionStorage.setItem(KNOWN_SESSIONS_KEY, JSON.stringify(Array.from(ids)))
  } catch {
    /* quota exceeded */
  }
}

type EdgeDropZoneProps = {
  edgeZoneHover: boolean
  onDragEnter: () => void
  onDragLeave: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}

function EdgeDropZone({
  edgeZoneHover,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}: EdgeDropZoneProps) {
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

type SessionListSharedProps = {
  sortOrder: string
  searchQuery: string
  collapsedSessions: Set<string>
  toggleSession: (id: string) => void
  sessionUsage: Record<string, SessionUsage>
  setTooltip: Dispatch<SetStateAction<TooltipState | null>>
  highlightedEventKey: string | null
  onTargetVisible: () => void
}

type SplitPanelsProps = SessionListSharedProps & {
  activeEvents: EventRecord[]
  activeError: string | null
  panel1Events: EventRecord[]
  panel2Events: EventRecord[]
  dragOverPanel: 1 | 2 | null
  targetSessionId: string | null
  targetEventKey: string | null
  handleDragOver: (panel: 1 | 2) => (ev: React.DragEvent) => void
  handleDragLeave: (ev: React.DragEvent) => void
  handleDropToPanel: (panel: 1 | 2) => (ev: React.DragEvent) => void
}

function SplitPanels({
  activeEvents,
  activeError,
  panel1Events,
  panel2Events,
  dragOverPanel,
  targetSessionId,
  targetEventKey,
  handleDragOver,
  handleDragLeave,
  handleDropToPanel,
  sortOrder,
  searchQuery,
  collapsedSessions,
  toggleSession,
  sessionUsage,
  setTooltip,
  highlightedEventKey,
  onTargetVisible,
}: SplitPanelsProps) {
  return (
    <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
      <ResizablePanel minSize={20} defaultSize={50}>
        <div
          data-testid="events-panel-1"
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
              targetSessionId={targetSessionId}
              targetEventKey={targetEventKey}
              highlightedEventKey={highlightedEventKey}
              onTargetVisible={onTargetVisible}
              isEventDraggable
            />
          )}
        </div>
      </ResizablePanel>

      <ResizableHandle className="w-[3px] bg-[#222] hover:bg-[#444] active:bg-[#555] transition-colors cursor-col-resize" />

      <ResizablePanel minSize={20} defaultSize={50}>
        <div
          data-testid="events-panel-2"
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
              onTargetVisible={onTargetVisible}
              isEventDraggable
            />
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

type SinglePanelProps = SessionListSharedProps & {
  activeEvents: EventRecord[]
  activeError: string | null
  filteredEvents: EventRecord[]
  isLive: boolean
  histLoading: boolean
  hasMore: boolean
  onLoadMore: () => void
  targetSessionId: string | null
  targetEventKey: string | null
}

function SinglePanel({
  activeEvents,
  activeError,
  filteredEvents,
  isLive,
  histLoading,
  hasMore,
  onLoadMore,
  targetSessionId,
  targetEventKey,
  sortOrder,
  searchQuery,
  collapsedSessions,
  toggleSession,
  sessionUsage,
  setTooltip,
  highlightedEventKey,
  onTargetVisible,
}: SinglePanelProps) {
  return (
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
          targetSessionId={targetSessionId}
          targetEventKey={targetEventKey}
          highlightedEventKey={highlightedEventKey}
          onTargetVisible={onTargetVisible}
        />
      )}

      {!isLive && hasMore && (
        <div className="flex justify-center py-4">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={histLoading}>
            {histLoading ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  )
}

export function EventsPage() {
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

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const {
    clearLink,
    eventLink,
    sessionFilterOverride,
    setSearchParams,
    toggleSession,
    urlSession,
  } = useEventLinkState({
    setCollapsedSessions,
  })

  const {
    timeRange,
    setTimeRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    fetchSince,
    fetchUntil,
  } = useEventsTimeRangeState({
    isLive,
    sessionFilter: sessionFilterOverride,
  })

  const liveState = useLiveEvents(sessionFilterOverride, {
    enabled: isLive,
    since: fetchSince,
    until: fetchUntil,
  })
  const histState = useHistoricalEvents(fetchSince, fetchUntil, sessionFilterOverride, true)
  // Collapse every newly-seen session by default — including ones appended via
  // "load more" (which keeps loadVersion unchanged), so they appear closed.
  useEffect(() => {
    if (histState.events.length === 0) return
    const allIds = histState.events.map((e) => e.session || e.transcript_path || 'ungrouped')
    const known = loadKnownSessions()
    const newIds = allIds.filter((id) => !known.has(id))
    if (newIds.length === 0) return
    saveKnownSessions(new Set([...known, ...allIds]))
    setCollapsedSessions((prev) => {
      const next = new Set(prev)
      newIds.forEach((id) => next.add(id))
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histState.events])
  const activeEvents = useMemo(
    () => (isLive ? mergeByKey(histState.events, liveState.events) : histState.events),
    [isLive, histState.events, liveState.events]
  )
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

  const {
    dragOverPanel,
    edgeZoneHover,
    handleDragLeave,
    handleDragOver,
    handleDropToEdge,
    handleDropToPanel,
    isDragging,
    panel1Events,
    panel2Events,
    setEdgeZoneHover,
    splitView,
    toggleSplitView,
  } = useSplitViewInteractions({
    filteredEvents,
    sortOrder,
  })

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
        searchQuery={searchQuery}
        setSearchQuery={(value) => {
          clearLink()
          setSearchQuery(value)
        }}
        actionFilter={actionFilter}
        setActionFilter={(value) => {
          clearLink()
          setActionFilter(value)
        }}
        agentFilter={agentFilter}
        setAgentFilter={(value) => {
          clearLink()
          setAgentFilter(value)
        }}
        availableAgents={availableAgents}
        projectFilter={projectFilter}
        setProjectFilter={(value) => {
          clearLink()
          setProjectFilter(value)
        }}
        availableProjects={availableProjects}
        sortOrder={sortOrder}
        setSortOrder={(value) => {
          clearLink()
          setSortOrder(value)
        }}
        timeRange={timeRange}
        setTimeRange={(value) => {
          clearLink()
          setTimeRange(value)
        }}
        customStart={customStart}
        setCustomStart={(value) => {
          clearLink()
          setCustomStart(value)
        }}
        customEnd={customEnd}
        setCustomEnd={(value) => {
          clearLink()
          setCustomEnd(value)
        }}
        isLive={isLive}
        onToggleLive={(value) => {
          if (value) {
            clearLink()
            if (urlSession) setSearchParams({})
          }
          setIsLive(value)
        }}
        onRefresh={() => {
          if (urlSession) {
            setSearchParams({})
          }
          setActionFilter('all')
          setAgentFilter('all')
          setProjectFilter('all')
          histState.refresh()
          refreshSessionUsage()
          refreshProjects()
        }}
        histLoading={histState.loading}
        splitView={splitView}
        onToggleSplit={toggleSplitView}
        className={mobileFiltersOpen ? 'sm:flex' : 'hidden sm:flex'}
      />

      {splitView ? (
        <SplitPanels
          activeEvents={activeEvents}
          activeError={activeError}
          panel1Events={panel1Events}
          panel2Events={panel2Events}
          dragOverPanel={dragOverPanel}
          targetSessionId={eventLink.pendingEventLink?.sessionId ?? null}
          targetEventKey={eventLink.pendingEventLink?.eventKey ?? null}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDropToPanel={handleDropToPanel}
          sortOrder={sortOrder}
          searchQuery={searchQuery}
          collapsedSessions={collapsedSessions}
          toggleSession={toggleSession}
          sessionUsage={sessionUsage}
          setTooltip={setTooltip}
          highlightedEventKey={eventLink.highlightedEventKey}
          onTargetVisible={handleTargetVisible}
        />
      ) : (
        <SinglePanel
          activeEvents={activeEvents}
          activeError={activeError}
          filteredEvents={filteredEvents}
          isLive={isLive}
          histLoading={histState.loading}
          hasMore={histState.hasMore}
          onLoadMore={histState.loadMore}
          targetSessionId={eventLink.pendingEventLink?.sessionId ?? null}
          targetEventKey={eventLink.pendingEventLink?.eventKey ?? null}
          sortOrder={sortOrder}
          searchQuery={searchQuery}
          collapsedSessions={collapsedSessions}
          toggleSession={toggleSession}
          sessionUsage={sessionUsage}
          setTooltip={setTooltip}
          highlightedEventKey={eventLink.highlightedEventKey}
          onTargetVisible={handleTargetVisible}
        />
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
          onDragEnter={() => setEdgeZoneHover(true)}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setEdgeZoneHover(false)
            }
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }}
          onDrop={handleDropToEdge}
        />
      )}
    </div>
  )
}
