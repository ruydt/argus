import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventsPage } from '@/features/events/EventsPage'
import type { EventRecord, LayoutOutletContext } from '@/types'

const setActionFilter = vi.fn()
const setAgentFilter = vi.fn()
const setProjectFilter = vi.fn()
const histRefresh = vi.fn()
const setSearchParams = vi.fn()
const clearLink = vi.fn()
const toggleSession = vi.fn()
const setIsLive = vi.fn()
const setCollapsedSessions = vi.fn()

let mockHistEvents: EventRecord[] = []

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useOutletContext: () =>
      ({
        collapsedSessions: new Set<string>(),
        setCollapsedSessions,
        searchQuery: '',
        setSearchQuery: vi.fn(),
        isLive: false,
        setIsLive,
      }) as LayoutOutletContext,
  }
})

vi.mock('@/features/events/EventFilters', () => ({
  EventFilters: ({ onRefresh }: { onRefresh?: () => void }) => (
    <button type="button" onClick={onRefresh}>
      refresh
    </button>
  ),
}))

vi.mock('@/features/events/hooks/useEventLinkState', () => ({
  useEventLinkState: () => ({
    clearLink,
    eventLink: { pendingEventLink: null, highlightedEventKey: null },
    sessionFilterOverride: '',
    setSearchParams,
    toggleSession,
    urlSession: '',
  }),
}))

vi.mock('@/features/events/hooks/useEventsTimeRangeState', () => ({
  useEventsTimeRangeState: () => ({
    timeRange: '15m',
    setTimeRange: vi.fn(),
    customStart: '',
    setCustomStart: vi.fn(),
    customEnd: '',
    setCustomEnd: vi.fn(),
    fetchSince: '',
    fetchUntil: '',
  }),
}))

vi.mock('@/features/events/hooks/useLiveEvents', () => ({
  useLiveEvents: () => ({ events: [], error: null }),
}))

vi.mock('@/features/events/hooks/useHistoricalEvents', () => ({
  useHistoricalEvents: () => ({
    events: mockHistEvents,
    hasMore: false,
    loading: false,
    error: null,
    loadMore: vi.fn(),
    refresh: histRefresh,
    loadVersion: 0,
  }),
}))

vi.mock('@/features/events/hooks/useEventFilters', () => ({
  useEventFilters: () => ({
    actionFilter: 'EDIT',
    setActionFilter,
    agentFilter: 'claudecode',
    setAgentFilter,
    availableAgents: ['claudecode'],
    projectFilter: '/tmp/project',
    setProjectFilter,
    availableProjects: ['/tmp/project'],
    sortOrder: 'newest',
    setSortOrder: vi.fn(),
    filteredEvents: [],
  }),
}))

vi.mock('@/features/events/hooks/useEventsPageInteractions', () => ({
  useEventLinkState: () => ({
    clearLink,
    eventLink: { pendingEventLink: null, highlightedEventKey: null },
    sessionFilterOverride: '',
    setSearchParams,
    toggleSession,
    urlSession: '',
  }),
  useSplitViewInteractions: () => ({
    dragOverPanel: null,
    edgeZoneHover: false,
    handleDragLeave: vi.fn(),
    handleDragOver: vi.fn(),
    handleDropToEdge: vi.fn(),
    handleDropToPanel: vi.fn(),
    isDragging: false,
    panel1Events: [],
    panel2Events: [],
    setEdgeZoneHover: vi.fn(),
    splitView: false,
    toggleSplitView: vi.fn(),
  }),
}))

describe('EventsPage refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHistEvents = []
  })

  it('resets action, agent, and project filters before refresh', () => {
    render(<EventsPage />)

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))

    expect(setActionFilter).toHaveBeenCalledWith('all')
    expect(setAgentFilter).toHaveBeenCalledWith('all')
    expect(setProjectFilter).toHaveBeenCalledWith('all')
    expect(histRefresh).toHaveBeenCalledTimes(1)
  })
})

describe('EventsPage session collapse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockHistEvents = []
  })

  it('collapses newly-seen sessions by default (covers load-more appends)', () => {
    mockHistEvents = [{ session: 'sess-new' } as EventRecord]

    render(<EventsPage />)

    expect(setCollapsedSessions).toHaveBeenCalled()
    const updater = setCollapsedSessions.mock.calls.at(-1)?.[0] as (
      prev: Set<string>
    ) => Set<string>
    expect(updater(new Set()).has('sess-new')).toBe(true)
  })

  it('does not re-collapse sessions already known', () => {
    sessionStorage.setItem('events_known_sessions', JSON.stringify(['sess-old']))
    mockHistEvents = [{ session: 'sess-old' } as EventRecord]

    render(<EventsPage />)

    expect(setCollapsedSessions).not.toHaveBeenCalled()
  })
})
