import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiagnosticsPage } from '@/features/diagnostics/DiagnosticsPage'
import { HOOK_PRESETS, applyPreset } from '@/features/hooks-config/presets'
import type { Diagnostics } from '@/features/diagnostics/types'
import { formatBytes } from '@/features/diagnostics/utils'
import { _resetDiagnosticsCache } from '@/features/diagnostics/hooks/useDiagnostics'

const healthyDiagnostics: Diagnostics = {
  version: {
    version: '1.1.0',
    commit: 'abc12345',
    buildDate: '2026-05-28',
    binarySizeBytes: 12_582_912,
  },
  health: { live: true, ready: true },
  storage: {
    dbPath: '/home/user/.argus/argus.db',
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
      eventsLastHour: 5,
      eventsLast24h: 42,
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
      eventsLastHour: 5,
      eventsLast24h: 42,
    },
  ],
  privacy: {
    ignoreFile: { path: '/home/user/.argus/.ignore', status: 'loaded', activePatternCount: 3 },
    exportWarning: 'Exported data may contain prompts, diffs, file paths, and tool outputs.',
  },
  security: {
    remoteBind: { addr: '127.0.0.1:10804', status: 'loopback', allowRemote: false },
    cors: { totalOrigins: 1, localOrigins: 1, extraOrigins: 0 },
  },
  fileSystem: {
    argusDir: '/home/user/.argus',
    binary: {
      name: 'argus',
      path: '/home/user/.argus/bin/argus',
      sizeBytes: 18700000,
      lastModified: '2026-06-08T10:00:00Z',
      exists: true,
    },
    logs: [
      {
        name: 'argus.log',
        path: '/home/user/.argus/argus.log',
        sizeBytes: 2900000,
        lastModified: '2026-06-08T10:00:00Z',
        exists: true,
      },
      {
        name: 'build.log',
        path: '/home/user/.argus/build.log',
        sizeBytes: null,
        lastModified: null,
        exists: false,
      },
      {
        name: 'hook-scripts.log',
        path: '/home/user/.argus/hook-scripts.log',
        sizeBytes: 128,
        lastModified: '2026-06-10T00:00:00Z',
        exists: true,
      },
    ],
    hooks: [],
    claudeDir: '/home/user/.claude',
    claudeDirExists: true,
    claudeHooks: [],
    claudeHooksDirExists: true,
    claudeHistory: {
      name: 'history.jsonl',
      path: '/home/user/.claude/history.jsonl',
      sizeBytes: 278000,
      lastModified: '2026-06-09T10:00:00Z',
      exists: true,
      lineCount: 48231,
    },
    codexDir: '/home/user/.codex',
    codexDirExists: false,
    codexHooks: [],
    codexHooksDirExists: false,
    codexDBs: [],
    codexDBsDirExists: false,
  },
  runtime: {
    startedAt: '2026-06-09T08:00:00Z',
    uptimeSeconds: 3600,
    hookRequests: 150,
    ingestionErrors: 0,
  },
  dbHealth: {
    journalMode: 'wal',
    pageCount: 1024,
    pageSizeBytes: 4096,
    walSizeBytes: 65536,
    migrationVersion: 13,
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
  // True first run: no events AND hooks not wired up yet.
  agents: healthyDiagnostics.agents.map((a) => ({
    ...a,
    eventCount: 0,
    status: 'no events',
    lastSeenAt: null,
    hookConfigStatus: 'unknown',
  })),
}

// Hooks already configured but no events have fired yet — the setup hint must
// NOT show (agents are set up; they're just waiting for the first event).
const configuredNoEvents: Diagnostics = {
  ...emptyDiagnostics,
  agents: emptyDiagnostics.agents.map((a) => ({ ...a, hookConfigStatus: 'configured' })),
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DiagnosticsPage />
    </MemoryRouter>
  )
}

const emptyHooksConfig = { hooks: {} }

function makeFetchMock(diagnosticsData = healthyDiagnostics) {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/hooks-config')) {
      return Promise.resolve({ ok: true, json: async () => emptyHooksConfig })
    }
    return Promise.resolve({ ok: true, json: async () => diagnosticsData })
  })
}

beforeEach(() => {
  _resetDiagnosticsCache()
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    writable: true,
    value: { writeText: vi.fn() },
  })
  vi.stubGlobal('fetch', makeFetchMock())
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('DiagnosticsPage', () => {
  it('renders skeleton sections and heading during loading', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderPage()
    expect(screen.getByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument()
    // Skeleton container is marked busy for accessibility
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()
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
    // Binary size tile renders the formatted executable size
    expect(screen.getByText('Binary size')).toBeInTheDocument()
    expect(screen.getByText(formatBytes(12_582_912))).toBeInTheDocument()
    // Ingestion-errors tile (replaced Hook requests) + Agents tile + Logs card
    expect(screen.getByText('Ingestion errors')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Live Logs')).toBeInTheDocument()
    expect(screen.getByText('argus.log')).toBeInTheDocument()
  })

  it('shows Configured (X/Y) label in hook config column when config has argus hooks', async () => {
    const fullConfig = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.full)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/hooks-config?agent=claudecode')) {
          return Promise.resolve({ ok: true, json: async () => fullConfig })
        }
        if (typeof url === 'string' && url.includes('/api/hooks-config')) {
          return Promise.resolve({ ok: true, json: async () => emptyHooksConfig })
        }
        return Promise.resolve({ ok: true, json: async () => healthyDiagnostics })
      })
    )
    renderPage()
    await screen.findByText('Agent Connectivity')
    expect(await screen.findByText('Configured (30/30)')).toBeInTheDocument()
  })

  it('shows Configured label when hooks exist but none are argus-managed', async () => {
    const manualConfig = {
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'echo manual' }] }],
      },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/hooks-config')) {
          return Promise.resolve({ ok: true, json: async () => manualConfig })
        }
        return Promise.resolve({ ok: true, json: async () => healthyDiagnostics })
      })
    )
    renderPage()
    await screen.findByText('Agent Connectivity')
    // Both agents have manual config — "Configured" appears at least once
    expect(await screen.findAllByText('Configured')).not.toHaveLength(0)
  })

  it('lists configured agents in connectivity even when one is degraded', async () => {
    vi.stubGlobal('fetch', makeFetchMock(warningDiagnostics))
    renderPage()
    // Connectivity now shows only Agent + Hook Config (no status badge column);
    // a configured-but-degraded agent still appears.
    expect(await screen.findByText('Claude Code')).toBeInTheDocument()
  })

  it('shows the empty hint when no agents are configured', async () => {
    vi.stubGlobal('fetch', makeFetchMock(emptyDiagnostics))
    renderPage()
    expect(await screen.findByText('No agents configured yet')).toBeInTheDocument()
  })

  it('hides the setup hint once hooks are configured, even with no events', async () => {
    vi.stubGlobal('fetch', makeFetchMock(configuredNoEvents))
    renderPage()
    // Agent rows render, but the "configure hook integrations" hint must not.
    expect(await screen.findByText('Agent Connectivity')).toBeInTheDocument()
    expect(screen.queryByText('No activity observed yet')).not.toBeInTheDocument()
    expect(screen.queryByText(/argus setup/)).not.toBeInTheDocument()
  })

  it('shows spin animation on refresh button click and keeps data visible', async () => {
    let resolveRefresh!: (v: unknown) => void
    const refreshPromise = new Promise((res) => {
      resolveRefresh = res
    })
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/hooks-config')) {
        return Promise.resolve({ ok: true, json: async () => emptyHooksConfig })
      }
      // First diagnostics call resolves immediately; subsequent (refresh) hangs
      if (
        fetchMock.mock.calls.filter((c: unknown[]) => !String(c[0]).includes('hooks-config'))
          .length <= 1
      ) {
        return Promise.resolve({ ok: true, json: async () => healthyDiagnostics })
      }
      return refreshPromise
    })
    vi.stubGlobal('fetch', fetchMock)

    renderPage()

    // Wait for initial data
    expect(await screen.findByText('Agent Connectivity')).toBeInTheDocument()

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
    const fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    const diagnosticsCalls = () =>
      fetchMock.mock.calls.filter(
        (c: unknown[]) =>
          !String(c[0]).includes('hooks-config') && !String(c[0]).includes('log-tail')
      )

    const { unmount } = render(
      <MemoryRouter>
        <DiagnosticsPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(diagnosticsCalls()).toHaveLength(1))
    unmount()

    render(
      <MemoryRouter>
        <DiagnosticsPage />
      </MemoryRouter>
    )
    // Allow any pending effects to settle
    await new Promise((r) => setTimeout(r, 50))
    expect(diagnosticsCalls()).toHaveLength(1) // still 1 — cache hit on re-mount
  })
})
