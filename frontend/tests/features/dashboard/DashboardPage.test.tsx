import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/features/dashboard/DashboardPage'

// Mock recharts to avoid canvas/SVG rendering issues in jsdom
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="recharts-container">{children}</div>
    ),
  }
})

const minimalStats = {
  total_sessions: 12,
  total_events: 240,
  total_input_tokens: 5000,
  total_output_tokens: 2500,
  timeline_granularity: 'day' as const,
  timeline: [],
  timeline_by_agent: [],
  token_timeline: [],
  token_timeline_by_agent: [],
  top_actions: [],
  agent_usage: [],
  session_usage: [],
}

function renderDashboardPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => minimalStats,
    })
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('DashboardPage', () => {
  it('renders skeleton loading state while fetching stats', () => {
    // Return a promise that never resolves to keep the loading state
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))

    renderDashboardPage()

    // DashboardSkeleton renders multiple Skeleton elements; heading stays
    expect(screen.getByText('Summary')).toBeInTheDocument()
    // Stats cards are not yet rendered
    expect(screen.queryByText('Sessions')).not.toBeInTheDocument()
  })

  it('renders stat cards after stats load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => minimalStats,
      })
    )

    renderDashboardPage()

    expect(await screen.findByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('Events')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('240')).toBeInTheDocument()
  })

  it('renders tab navigation after stats load', async () => {
    renderDashboardPage()

    expect(await screen.findByText('Token usage')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
  })

  it('renders page heading regardless of loading state', () => {
    renderDashboardPage()
    expect(screen.getByText('Summary')).toBeInTheDocument()
  })
})
