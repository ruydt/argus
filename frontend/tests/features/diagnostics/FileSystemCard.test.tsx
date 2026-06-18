import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSystemCard } from '@/features/diagnostics/FileSystemCard'
import type { DiagnosticsFileSystem } from '@/features/diagnostics/types'

const mockFS: DiagnosticsFileSystem = {
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
  hooks: [
    {
      name: 'permission-request.sh',
      path: '/home/user/.argus/hooks/permission-request.sh',
      sizeBytes: 5600,
      lastModified: '2026-06-08T09:00:00Z',
      exists: true,
    },
  ],
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
  codexDirExists: true,
  codexHooks: [],
  codexHooksDirExists: false,
  codexDBs: [
    {
      name: 'logs_2.sqlite',
      path: '/home/user/.codex/logs_2.sqlite',
      sizeBytes: 368000000,
      lastModified: '2026-06-09T10:00:00Z',
      exists: true,
    },
  ],
  codexDBsDirExists: true,
}

// Mounts collapse by default; expand the one whose contents a test asserts.
function openMount(label: '~/.argus' | '~/.claude' | '~/.codex') {
  fireEvent.click(screen.getByRole('button', { name: `Toggle ${label}` }))
}

describe('FileSystemCard', () => {
  let store: Record<string, string> = {}
  const localStorageMock = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      store = {}
    },
  }

  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', localStorageMock)
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders argusDir path in the header (visible while collapsed)', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    expect(screen.getByText('/home/user/.argus')).toBeInTheDocument()
  })

  it('keeps mount contents hidden until expanded', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    expect(screen.queryByText('permission-request.sh')).not.toBeInTheDocument()
    openMount('~/.argus')
    expect(screen.getByText('permission-request.sh')).toBeInTheDocument()
  })

  it('renders binary size', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    openMount('~/.argus')
    expect(screen.getByText('17.8 MB')).toBeInTheDocument()
  })

  it('shows Not found for missing log', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    openMount('~/.argus')
    expect(screen.getByText('Not found')).toBeInTheDocument()
  })

  it('renders hook file name', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    openMount('~/.argus')
    expect(screen.getByText('permission-request.sh')).toBeInTheDocument()
  })

  it('shows Tail button for existing log files', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    openMount('~/.argus')
    const tailButtons = screen.getAllByRole('button', { name: /tail/i })
    expect(tailButtons.length).toBeGreaterThan(0)
  })

  it('renders Uninstalled badge when codexHooksDirExists is false', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    openMount('~/.codex')
    expect(screen.getByText('Uninstalled')).toBeInTheDocument()
  })

  it('renders history.jsonl line count', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    openMount('~/.claude')
    expect(screen.getByText(/48,231 lines/)).toBeInTheDocument()
  })

  it('renders Codex DB file name', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    openMount('~/.codex')
    expect(screen.getByText('logs_2.sqlite')).toBeInTheDocument()
  })

  it('remembers a mount toggle across remounts (localStorage)', () => {
    const { unmount } = render(<FileSystemCard fileSystem={mockFS} />)
    openMount('~/.argus')
    expect(screen.getByText('permission-request.sh')).toBeInTheDocument()
    unmount()
    render(<FileSystemCard fileSystem={mockFS} />)
    // Still expanded — no click needed this time.
    expect(screen.getByText('permission-request.sh')).toBeInTheDocument()
  })

  it('fetches and shows log lines when Tail is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ file: 'argus.log', lines: ['log line A', 'log line B'] }),
      })
    )
    render(<FileSystemCard fileSystem={mockFS} />)
    openMount('~/.argus')
    const tailButtons = screen.getAllByRole('button', { name: /tail/i })
    fireEvent.click(tailButtons[0])
    await waitFor(() => {
      expect(screen.getByText('log line A')).toBeInTheDocument()
    })
  })

  it('tails hook-scripts.log', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ file: 'hook-scripts.log', lines: ['script log A'] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(<FileSystemCard fileSystem={mockFS} />)
    openMount('~/.argus')

    const rows = screen.getAllByRole('button', { name: /Tail hook-scripts\.log/i })
    fireEvent.click(rows[0])

    expect(mockFetch).toHaveBeenCalledWith('/api/diagnostics/log-tail?file=hook-scripts&lines=50')
    expect(await screen.findByText('script log A')).toBeInTheDocument()
  })
})
