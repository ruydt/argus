import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionListPage } from '@/features/sessions/SessionListPage'
import type { Session } from '@/types/sessions'

class MockES {
  onmessage: ((ev: MessageEvent) => void) | null = null
  close = vi.fn()
  constructor(public url: string) {}
}

const SESSION: Session = {
  session_id: 'sess-abc1234567890',
  agent: 'claudecode',
  model: 'claude-opus-4-5',
  source: 'startup',
  cwd: '/Users/dev/project',
  transcript_path: '',
  started_at: '2026-05-14T09:00:00Z',
  last_seen_at: '2026-05-14T09:10:00Z',
  ended_at: '2026-05-14T09:10:00Z',
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    turns: 3,
  },
}

function renderSessionList(cwd: string) {
  return render(
    <MemoryRouter initialEntries={[`/sessions/${encodeURIComponent(cwd)}`]}>
      <Routes>
        <Route path="/sessions/:encodedCwd" element={<SessionListPage />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('EventSource', MockES)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessions: [], has_more: false }),
    })
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SessionListPage', () => {
  it('renders sessions from API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [SESSION], total: 1, has_more: false }),
      })
    )

    renderSessionList('/Users/dev/project')

    // SessionListPage slices session_id to 12 chars: 'sess-abc1234567890'.slice(0, 12) = 'sess-abc1234'
    expect(await screen.findByText('sess-abc1234')).toBeInTheDocument()
    expect(screen.getByText('claudecode')).toBeInTheDocument()
  })

  it('renders loading state before data arrives', async () => {
    // Use a promise that never resolves to keep loading state
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))

    renderSessionList('/Users/dev/project')

    expect(screen.getByText('Loading sessions…')).toBeInTheDocument()
  })

  it('renders empty state when no sessions exist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], has_more: false }),
      })
    )

    renderSessionList('/Users/dev/project')

    await waitFor(() =>
      expect(screen.getByText('No sessions for this project.')).toBeInTheDocument()
    )
  })

  it('shows project name in page header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [], has_more: false }),
      })
    )

    renderSessionList('/Users/dev/project')

    await waitFor(() => expect(screen.getByText('project')).toBeInTheDocument())
  })

  it('shows green dot for active session (last_seen_at within 10s)', async () => {
    const lastSeen = new Date('2026-05-14T09:10:02Z').getTime()
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(lastSeen + 3_000)

    const runningSession: Session = {
      ...SESSION,
      session_id: 'sess-running-xyz',
      last_seen_at: '2026-05-14T09:10:02Z',
      ended_at: undefined,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [runningSession], has_more: false }),
      })
    )

    renderSessionList('/Users/dev/project')

    await waitFor(() => expect(screen.getByText('sess-running')).toBeInTheDocument())
    expect(document.querySelector('.bg-green-400')).toBeInTheDocument()

    dateSpy.mockRestore()
  })

  it('uses the current time for running session duration', async () => {
    const now = new Date('2026-05-14T09:10:05Z').getTime()
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now)

    const runningSession: Session = {
      ...SESSION,
      session_id: 'sess-running-xyz',
      started_at: '2026-05-14T09:00:00Z',
      last_seen_at: '2026-05-14T09:10:02Z',
      ended_at: undefined,
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [runningSession], has_more: false }),
      })
    )

    renderSessionList('/Users/dev/project')

    await waitFor(() => expect(screen.getByText('sess-running')).toBeInTheDocument())
    expect(screen.getByText('10m 5s')).toBeInTheDocument()

    dateSpy.mockRestore()
  })

  it('shows last_seen_at in Last Updated column for all sessions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ sessions: [SESSION], has_more: false }),
      })
    )

    renderSessionList('/Users/dev/project')

    await waitFor(() => expect(screen.getByText('Last Updated')).toBeInTheDocument())
    expect(screen.queryByText('Ended')).not.toBeInTheDocument()
  })
})
