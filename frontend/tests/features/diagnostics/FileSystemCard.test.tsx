import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSystemCard } from '@/features/diagnostics/FileSystemCard'
import type { DiagnosticsFileSystem } from '@/features/diagnostics/types'

const mockFS: DiagnosticsFileSystem = {
  hookerDir: '/home/user/.hooker',
  binary: {
    name: 'hooker',
    path: '/home/user/.hooker/bin/hooker',
    sizeBytes: 18700000,
    lastModified: '2026-06-08T10:00:00Z',
    exists: true,
  },
  logs: [
    {
      name: 'hooker.log',
      path: '/home/user/.hooker/hooker.log',
      sizeBytes: 2900000,
      lastModified: '2026-06-08T10:00:00Z',
      exists: true,
    },
    {
      name: 'build.log',
      path: '/home/user/.hooker/build.log',
      sizeBytes: null,
      lastModified: null,
      exists: false,
    },
  ],
  hooks: [
    {
      name: 'permission-request.sh',
      path: '/home/user/.hooker/hooks/permission-request.sh',
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

describe('FileSystemCard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders hookerDir', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    expect(screen.getByText('/home/user/.hooker')).toBeInTheDocument()
  })

  it('renders binary size', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    expect(screen.getByText('17.8 MB')).toBeInTheDocument()
  })

  it('shows Not found for missing log', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    expect(screen.getByText('Not found')).toBeInTheDocument()
  })

  it('renders hook file name', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    expect(screen.getByText('permission-request.sh')).toBeInTheDocument()
  })

  it('shows Tail button for existing log files', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    const tailButtons = screen.getAllByRole('button', { name: /tail/i })
    expect(tailButtons.length).toBeGreaterThan(0)
  })

  it('renders Uninstalled badge when codexHooksDirExists is false', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    expect(screen.getByText('Uninstalled')).toBeInTheDocument()
  })

  it('renders history.jsonl line count', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    expect(screen.getByText(/48,231 lines/)).toBeInTheDocument()
  })

  it('renders Codex DB file name', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    expect(screen.getByText('logs_2.sqlite')).toBeInTheDocument()
  })

  it('fetches and shows log lines when Tail is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ file: 'hooker.log', lines: ['log line A', 'log line B'] }),
      })
    )
    render(<FileSystemCard fileSystem={mockFS} />)
    const tailButtons = screen.getAllByRole('button', { name: /tail/i })
    fireEvent.click(tailButtons[0])
    await waitFor(() => {
      expect(screen.getByText('log line A')).toBeInTheDocument()
    })
  })
})
