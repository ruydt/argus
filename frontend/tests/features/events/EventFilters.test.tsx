import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventFilters } from '@/features/events/EventFilters'

beforeEach(() => {
  sessionStorage.clear()
})

function renderEventFilters(props: Partial<ComponentProps<typeof EventFilters>> = {}) {
  return render(
    <EventFilters
      searchQuery=""
      setSearchQuery={vi.fn()}
      actionFilter="all"
      setActionFilter={vi.fn()}
      agentFilter="all"
      setAgentFilter={vi.fn()}
      availableAgents={[]}
      projectFilter="all"
      setProjectFilter={vi.fn()}
      availableProjects={[]}
      sortOrder="newest"
      setSortOrder={vi.fn()}
      timeRange="15m"
      setTimeRange={vi.fn()}
      customStart=""
      setCustomStart={vi.fn()}
      customEnd=""
      setCustomEnd={vi.fn()}
      {...props}
    />
  )
}

describe('EventFilters search', () => {
  it('expands and focuses the search input when the magnifier is clicked', () => {
    renderEventFilters()

    const input = screen.getByRole('textbox', { name: /search events/i })
    expect(input).toHaveClass('w-0')

    fireEvent.click(screen.getByRole('button', { name: /search events/i }))

    expect(input).not.toHaveClass('w-0')
    expect(input).toHaveFocus()
  })

  it('calls setSearchQuery with the typed value', () => {
    const setSearchQuery = vi.fn()
    renderEventFilters({ setSearchQuery })

    fireEvent.click(screen.getByRole('button', { name: /search events/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /search events/i }), {
      target: { value: 'bash' },
    })

    expect(setSearchQuery).toHaveBeenCalledWith('bash')
  })

  it('clears the query and collapses on Escape', () => {
    const setSearchQuery = vi.fn()
    renderEventFilters({ searchQuery: 'bash', setSearchQuery })

    const input = screen.getByRole('textbox', { name: /search events/i })
    expect(input).not.toHaveClass('w-0')

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(setSearchQuery).toHaveBeenCalledWith('')
    expect(input).toHaveClass('w-0')
  })

  it('collapses the search input on a second magnifier click', () => {
    const setSearchQuery = vi.fn()
    renderEventFilters({ setSearchQuery })

    const toggle = screen.getByRole('button', { name: /search events/i })
    fireEvent.click(toggle)
    const input = screen.getByRole('textbox', { name: /search events/i })
    expect(input).not.toHaveClass('w-0')

    fireEvent.click(screen.getByRole('button', { name: /close events search/i }))
    expect(input).toHaveClass('w-0')
    expect(setSearchQuery).toHaveBeenCalledWith('')
  })

  it('keeps the search input open when the filter group is toggled', () => {
    renderEventFilters()

    fireEvent.click(screen.getByRole('button', { name: /search events/i }))
    fireEvent.click(screen.getByRole('button', { name: /show filters/i }))

    expect(screen.getByRole('textbox', { name: /search events/i })).not.toHaveClass('w-0')
  })

  it('starts expanded when a query is already set', () => {
    renderEventFilters({ searchQuery: 'session' })

    expect(screen.getByRole('textbox', { name: /search events/i })).not.toHaveClass('w-0')
  })
})

describe('EventFilters collapsible filter group', () => {
  it('shows the filter selects when the funnel button is clicked and hides them again', () => {
    renderEventFilters()

    // starts collapsed
    expect(screen.queryByText('Event')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show filters/i }))

    expect(screen.getByText('Event')).toBeInTheDocument()
    expect(screen.getByText('Sort')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /hide filters/i }))
    expect(screen.queryByText('Event')).not.toBeInTheDocument()
  })

  it('persists the collapsed state in sessionStorage', () => {
    renderEventFilters()
    // default is collapsed; expand then re-collapse to verify both states
    fireEvent.click(screen.getByRole('button', { name: /show filters/i }))
    expect(sessionStorage.getItem('events_filters_collapsed')).toBe('0')

    fireEvent.click(screen.getByRole('button', { name: /hide filters/i }))
    expect(sessionStorage.getItem('events_filters_collapsed')).toBe('1')
  })

  it('shows an active-filters dot when collapsed with a non-default filter', () => {
    renderEventFilters({ actionFilter: 'BASH' })

    // starts collapsed with a non-default filter → dot visible
    expect(screen.getByTestId('active-filters-dot')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show filters/i }))

    // expanded → no dot
    expect(screen.queryByTestId('active-filters-dot')).not.toBeInTheDocument()
  })

  it('shows no dot when collapsed with all filters default', () => {
    renderEventFilters()

    // starts collapsed with default filters → no dot
    expect(screen.queryByTestId('active-filters-dot')).not.toBeInTheDocument()
  })
})

describe('EventFilters', () => {
  it('renders a state-aware split view button', () => {
    const onToggleSplit = vi.fn()
    renderEventFilters({ onToggleSplit })

    const button = screen.getByRole('button', { name: /open split view/i })
    fireEvent.click(button)

    expect(onToggleSplit).toHaveBeenCalledTimes(1)
  })

  it('labels the split view button for closing when split view is active', () => {
    renderEventFilters({ splitView: true, onToggleSplit: vi.fn() })

    expect(screen.getByRole('button', { name: /close split view/i })).toBeInTheDocument()
  })
})
