import { useState } from 'react'
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
  const { collapsedSessions, setCollapsedSessions, sessionUsage } =
    useOutletContext<LayoutOutletContext>()

  const {
    actionFilter,
    setActionFilter,
    searchQuery,
    setSearchQuery,
    sortOrder,
    setSortOrder,
    timeRange,
    setTimeRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    filteredEvents,
  } = useEventFilters(events)

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

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
      <EventFilters
        actionFilter={actionFilter}
        setActionFilter={setActionFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        timeRange={timeRange}
        setTimeRange={setTimeRange}
        customStart={customStart}
        setCustomStart={setCustomStart}
        customEnd={customEnd}
        setCustomEnd={setCustomEnd}
      />

      <div className="flex-1 p-5 overflow-y-auto min-h-0 relative">
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
