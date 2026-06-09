import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiagnosticsPage } from '@/features/diagnostics/DiagnosticsPage'
import type { Diagnostics } from '@/features/diagnostics/types'

const minimalDiagnostics: Diagnostics = {
  version: { version: '1.1.0', commit: 'abc12345', buildDate: '2026-05-28' },
  health: { live: true, ready: true },
  storage: {
    dbPath: '/tmp/hooker.db',
    dbSizeBytes: 0,
    totalEvents: 0,
    totalSessions: 0,
    latestEventAt: null,
  },
  agents: [],
  privacy: {
    ignoreFile: { path: '', status: 'missing_ok', activePatternCount: 0 },
    exportWarning: 'Exported data may contain sensitive content.',
  },
  security: {
    remoteBind: { addr: '127.0.0.1:10804', status: 'loopback', allowRemote: false },
    cors: { totalOrigins: 1, localOrigins: 1, extraOrigins: 0 },
  },
  fileSystem: {
    hookerDir: '/home/user/.hooker',
    binary: {
      name: 'hooker',
      path: '/home/user/.hooker/bin/hooker',
      sizeBytes: null,
      lastModified: null,
      exists: false,
    },
    logs: [
      {
        name: 'hooker.log',
        path: '/home/user/.hooker/hooker.log',
        sizeBytes: null,
        lastModified: null,
        exists: false,
      },
      {
        name: 'build.log',
        path: '/home/user/.hooker/build.log',
        sizeBytes: null,
        lastModified: null,
        exists: false,
      },
    ],
    hooks: [],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn() },
    writable: true,
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => minimalDiagnostics })
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('DiagnosticsPage route', () => {
  it('renders the Diagnostics heading when mounted', () => {
    render(
      <MemoryRouter initialEntries={['/diagnostics']}>
        <DiagnosticsPage />
      </MemoryRouter>
    )
    // h1 heading is always present regardless of loading state
    expect(screen.getByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument()
  })

  it('renders the page heading in all loading states', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    render(
      <MemoryRouter>
        <DiagnosticsPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument()
  })
})
