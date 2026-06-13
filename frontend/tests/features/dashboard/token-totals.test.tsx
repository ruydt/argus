import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { SummaryStats } from '@/features/dashboard/SummaryStats'
import { SessionsTable } from '@/features/dashboard/SessionsTable'
import type { DashboardStats } from '@/features/dashboard/hooks/useDashboardStats'

function renderSessionsTable(stats: DashboardStats) {
  return render(
    <MemoryRouter>
      <SessionsTable stats={stats} />
    </MemoryRouter>
  )
}

function makeStats(): DashboardStats {
  return {
    total_sessions: 1,
    total_events: 1,
    total_input_tokens: 10,
    total_output_tokens: 5,
    timeline_granularity: 'day',
    timeline: [],
    timeline_by_agent: [],
    top_actions: [],
    agent_usage: [
      {
        provider: 'anthropic',
        agent: 'claudecode',
        model: 'claude-sonnet-4-6',
        input: 10,
        output: 5,
        cache_creation: 50,
        cache_read: 100,
      },
    ],
    session_usage: [
      {
        session_id: 'session-1',
        agent: 'claudecode',
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        started_at: '2026-05-14T00:00:00Z',
        last_seen_at: '2026-05-14T00:00:00Z',
        input: 10,
        output: 5,
        models: [
          {
            provider: 'anthropic',
            agent: 'claudecode',
            model: 'claude-sonnet-4-6',
            input: 10,
            output: 5,
            cache_creation: 50,
            cache_read: 100,
            turns: 1,
          },
        ],
      },
    ],
  }
}

describe('dashboard token totals', () => {
  it('includes cache read/write in summary and total token card', () => {
    render(<SummaryStats stats={makeStats()} />)

    expect(screen.getByText('Cache read tokens')).toBeInTheDocument()
    expect(screen.getByText('Cache write tokens')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText('165')).toBeInTheDocument()
  })

  it('shows cache columns and total = input + output + cache_read + cache_write in breakdown', () => {
    renderSessionsTable(makeStats())

    expect(screen.getByText('Cache read')).toBeInTheDocument()
    expect(screen.getByText('Cache write')).toBeInTheDocument()

    const row = screen.getByText('claudecode').closest('tr')
    expect(row).toBeTruthy()
    const scope = within(row as HTMLElement)

    expect(scope.getByText('10')).toBeInTheDocument()
    expect(scope.getByText('5')).toBeInTheDocument()
    expect(scope.getByText('100')).toBeInTheDocument()
    expect(scope.getByText('50')).toBeInTheDocument()
    expect(scope.getByText('165')).toBeInTheDocument()
  })

  it('renders copy and view-events controls per session', () => {
    renderSessionsTable(makeStats())

    const row = screen.getByText('claudecode').closest('tr') as HTMLElement
    const scope = within(row)

    expect(scope.getByLabelText('Copy session ID')).toBeInTheDocument()
    const viewLink = scope.getByLabelText('View session events')
    expect(viewLink).toHaveAttribute('href', '/?session=session-1')
  })
})
