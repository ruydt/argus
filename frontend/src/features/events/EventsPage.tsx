import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useEvents } from './hooks/useEvents'
import { useEventFilters } from './hooks/useEventFilters'
import { EventFilters } from './EventFilters'
import { SessionList } from './SessionList'
import type { LayoutOutletContext, TooltipState } from '@/types'

export function EventsPage() {
  const { events, refreshing, error, reload } = useEvents()
  const { collapsedSessions, setCollapsedSessions, sessionUsage, searchQuery, setSearchQuery } =
    useOutletContext<LayoutOutletContext>()

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
  } = useEventFilters(events, searchQuery, setSearchQuery)

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const toggleSession = (id: string) => {
    setCollapsedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
        setActionFilter={setActionFilter}
        agentFilter={agentFilter}
        setAgentFilter={setAgentFilter}
        availableAgents={availableAgents}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        customStart={customStart}
        setCustomStart={setCustomStart}
        customEnd={customEnd}
        setCustomEnd={setCustomEnd}
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
