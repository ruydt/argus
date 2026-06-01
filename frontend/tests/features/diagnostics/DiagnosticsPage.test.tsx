import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiagnosticsPage } from '@/features/diagnostics/DiagnosticsPage'
import type { Diagnostics } from '@/features/diagnostics/types'
import { _resetDiagnosticsCache } from '@/features/diagnostics/hooks/useDiagnostics'

const healthyDiagnostics: Diagnostics = {
  version: { version: '1.1.0', commit: 'abc12345', buildDate: '2026-05-28' },
  health: { live: true, ready: true },
  storage: {
    dbPath: '/home/user/.hooker/hooker.db',
    dbSizeBytes: 1024000,
    totalEvents: 42,
    totalSessions: 5,
    latestEventAt: '2026-05-28T10:00:00Z',
  },
  agents: [
    {
      id: 'claudecode',
      label: 'Claude Code',
      eventCount: 30,
      lastSeenAt: '2026-05-28T09:55:00Z',
      degradedCount: 0,
      normalizerVersion: '1.0.0',
      hookConfigStatus: 'configured',
      status: 'healthy',
      warnings: [],
    },
    {
      id: 'codex',
      label: 'Codex',
      eventCount: 12,
      lastSeenAt: '2026-05-28T08:00:00Z',
      degradedCount: 0,
      normalizerVersion: null,
      hookConfigStatus: 'configured',
      status: 'healthy',
      warnings: [],
    },
  ],
  privacy: {
    ignoreFile: { path: '/home/user/.hooker/.ignore', status: 'loaded', activePatternCount: 3 },
    exportWarning: 'Exported data may contain prompts, diffs, file paths, and tool outputs.',
  },
  security: {
    remoteBind: { addr: '127.0.0.1:8765', status: 'loopback', allowRemote: false },
    cors: { totalOrigins: 1, localOrigins: 1, extraOrigins: 0 },
  },
}

const warningDiagnostics: Diagnostics = {
  ...healthyDiagnostics,
  agents: [
    { ...healthyDiagnostics.agents[0], status: 'degraded', degradedCount: 3 },
    ...healthyDiagnostics.agents.slice(1),
  ],
  security: {
    ...healthyDiagnostics.security,
    cors: { totalOrigins: 3, localOrigins: 1, extraOrigins: 2 },
  },
}

const emptyDiagnostics: Diagnostics = {
  ...healthyDiagnostics,
  storage: {
    ...healthyDiagnostics.storage,
    totalEvents: 0,
    latestEventAt: null,
  },
  agents: healthyDiagnostics.agents.map((a) => ({
    ...a,
    eventCount: 0,
    status: 'no events',
    lastSeenAt: null,
  })),
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DiagnosticsPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  _resetDiagnosticsCache()
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn() },
    writable: true,
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => healthyDiagnostics })
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('DiagnosticsPage', () => {
  it('renders skeleton sections and heading during loading', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderPage()
    expect(screen.getByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument()
    // Content cards are not yet rendered
    expect(screen.queryByText('Agent Connectivity')).not.toBeInTheDocument()
    expect(screen.queryByText('System Facts')).not.toBeInTheDocument()
  })

  it('renders retry panel when fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    )
    renderPage()
    expect(await screen.findByText('Failed to load diagnostics')).toBeInTheDocument()
    expect(screen.getByText('Could not reach /api/diagnostics')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry load/i })).toBeInTheDocument()
    // Heading still present in error state
    expect(screen.getByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument()
  })

  it('renders all sections when diagnostics load successfully', async () => {
    renderPage()
    expect(await screen.findByText('Agent Connectivity')).toBeInTheDocument()
    expect(screen.getByText('System Facts')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('Codex')).toBeInTheDocument()
    // Readiness tile shows Ready
    expect(screen.getByText('Ready')).toBeInTheDocument()
    // Export warning always visible
    expect(screen.getByText(/Exported data may contain prompts/)).toBeInTheDocument()
  })

  it('renders degraded and extra CORS badges in warning state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => warningDiagnostics })
    )
    renderPage()
    // Degraded badge for agent 0
    expect(await screen.findByText('Degraded')).toBeInTheDocument()
    // Extra CORS origins badge
    expect(screen.getByText(/extra origin/i)).toBeInTheDocument()
  })

  it('renders first-run hint when no events have been observed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => emptyDiagnostics })
    )
    renderPage()
    expect(await screen.findByText('No activity observed yet')).toBeInTheDocument()
    expect(screen.getByText(/hooker setup/)).toBeInTheDocument()
  })

  it('renders Not ready tile and reason when health.ready is false', async () => {
    const notReadyDiagnostics: Diagnostics = {
      ...healthyDiagnostics,
      health: { live: true, ready: false, reason: 'Database migration pending' },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => notReadyDiagnostics })
    )
    renderPage()
    expect(await screen.findByText('Not ready')).toBeInTheDocument()
    expect(screen.getByText(/Database migration pending/)).toBeInTheDocument()
    // Other sections still render
    expect(screen.getByText('Agent Connectivity')).toBeInTheDocument()
  })

  it('shows spin animation on refresh button click and keeps data visible', async () => {
    // First fetch resolves immediately
    let resolveRefresh!: (v: unknown) => void
    const refreshPromise = new Promise((res) => {
      resolveRefresh = res
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => healthyDiagnostics })
      .mockReturnValueOnce(refreshPromise)
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    // Wait for initial data
    expect(await screen.findByText('Agent Connectivity')).toBeInTheDocument()

    // Existing data still visible (not replaced with skeleton)
    const refreshBtn = screen.getByRole('button', { name: /refresh diagnostics/i })
    fireEvent.click(refreshBtn)

    // Button is disabled during refresh
    await waitFor(() => expect(refreshBtn).toBeDisabled())

    // Data remains visible (skeleton NOT shown)
    expect(screen.getByText('Claude Code')).toBeInTheDocument()

    // Resolve the refresh fetch
    resolveRefresh({ ok: true, json: async () => healthyDiagnostics })
    await waitFor(() => expect(refreshBtn).not.toBeDisabled())
  })
})

describe('useDiagnostics module cache', () => {
  beforeEach(() => {
    _resetDiagnosticsCache()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('skips fetch on re-mount when cache is warm', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(healthyDiagnostics),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { unmount } = render(
      <MemoryRouter>
        <DiagnosticsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    unmount()

    render(
      <MemoryRouter>
        <DiagnosticsPage />
      </MemoryRouter>
    )
    // Allow any pending effects to settle
    await new Promise((r) => setTimeout(r, 50))
    expect(fetchMock).toHaveBeenCalledTimes(1) // still 1 — cache hit on re-mount
  })
})
