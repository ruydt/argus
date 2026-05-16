import { useEffect, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useEvents } from './hooks/useEvents'
import { useEventFilters } from './hooks/useEventFilters'
import { EventFilters } from './EventFilters'
import { SessionList } from './SessionList'
import type { LayoutOutletContext, TooltipState } from '@/types'

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
  const { events, refreshing, error, reload } = useEvents(sessionFilterOverride)

  const {
    actionFilter,
    setActionFilter,
    agentFilter,
    setAgentFilter,
    availableAgents,
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

  const handleSearchQueryChange = (value: string) => {
    clearPendingEventLink()
    setSearchQuery(value)
  }

  const handleTargetVisible = () => {}

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c0c]">
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
        sortOrder={sortOrder}
        setSortOrder={handleSortOrderChange}
        timeRange={timeRange}
        setTimeRange={handleTimeRangeChange}
        customStart={customStart}
        setCustomStart={handleCustomStartChange}
        customEnd={customEnd}
        setCustomEnd={handleCustomEndChange}
        searchQuery={searchQuery}
        setSearchQuery={handleSearchQueryChange}
        className={mobileFiltersOpen ? 'sm:flex' : 'hidden sm:flex'}
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
        {error && (
          <Alert variant="destructive" className="mb-4 bg-red-950/50 border-red-900">
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={reload}>
                Retry Connection
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {events.length === 0 && !refreshing && !error ? (
          <div className="text-[#666] text-sm h-full flex flex-col items-center justify-center">
            No events found. Start a session to see events stream here.
          </div>
        ) : (
          <SessionList
            events={filteredEvents}
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

        {tooltip && (
          <div
            className="fixed pointer-events-none z-[1000] bg-black text-[#ccc] px-2 py-1 text-[0.7rem] rounded border border-white/10"
            style={{ top: tooltip.y + 10, left: tooltip.x + 10 }}
          >
            {tooltip.text}
          </div>
        )}
      </div>
    </div>
  )
}
