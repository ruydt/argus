import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { SessionFileChangesPage } from '@/features/sessions/SessionFileChangesPage'
import { SessionListPage } from '@/features/sessions/SessionListPage'
import type { FileChangeGroup, Session } from '@/types/sessions'

class MockES {
  onmessage: ((ev: MessageEvent) => void) | null = null
  close = vi.fn()
  constructor(public url: string) {}
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('EventSource', MockES)
})

const cwd = '/Users/duytran/GitHub/hooker'
const session: Session = {
  session_id: 'sess-1234567890',
  agent: 'codex',
  model: 'gpt-5.4',
  source: 'startup',
  cwd,
  transcript_path: '',
  started_at: '2026-05-14T10:00:00Z',
  ended_at: '2026-05-14T10:00:10Z',
  last_seen_at: '2026-05-14T10:00:10Z',
  usage: {
    input_tokens: 10,
    output_tokens: 5,
    cache_creation_tokens: 0,
    cache_read_tokens: 0,
    turns: 1,
  },
}

function renderSessionFileChanges() {
  return render(
    <MemoryRouter initialEntries={[`/sessions/${encodeURIComponent(cwd)}/${session.session_id}`]}>
      <Routes>
        <Route path="/sessions/:encodedCwd/:sessionId" element={<SessionFileChangesPage />} />
      </Routes>
    </MemoryRouter>
  )
}

function stubSessionFetch(fileChangesResponse: Promise<Response>) {
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = String(input)

    if (url.startsWith('/api/sessions?cwd=')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          sessions: [session],
          total: 1,
          page: 1,
          size: 20,
          has_more: false,
        }),
      } as Response)
    }

    if (url.startsWith('/api/file-changes?session_id=')) {
      return fileChangesResponse
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function okFileChanges(groups: FileChangeGroup[]): Promise<Response> {
  return Promise.resolve({
    ok: true,
    json: async () => groups,
  } as Response)
}

describe('project scoped sessions pages', () => {
  it('renders project cards from /api/projects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          projects: [
            {
              cwd,
              name: 'hooker',
              session_count: 2,
              total_tokens: 0,
              last_activity: '2026-05-14T10:00:00Z',
              agents: ['codex'],
              live_count: 1,
            },
          ],
        }),
      })
    )

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('hooker')).toBeInTheDocument()
    expect(screen.getByText('2 sessions')).toBeInTheDocument()
    expect(screen.getByText('codex')).toBeInTheDocument()
    expect(screen.getByText('0 tokens')).toBeInTheDocument()
  })

  it('fetches sessions for decoded cwd route param', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessions: [
          session,
          {
            ...session,
            session_id: 'sess-ended-1234',
            started_at: '2026-05-14T08:00:00Z',
            last_seen_at: '2026-05-14T08:10:00Z',
            ended_at: '2026-05-14T08:10:00Z',
            usage: {
              input_tokens: 1,
              output_tokens: 2,
              cache_creation_tokens: 0,
              cache_read_tokens: 0,
              turns: 1,
            },
          },
        ],
        total: 2,
        page: 1,
        size: 20,
        has_more: false,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={[`/sessions/${encodeURIComponent(cwd)}`]}>
        <Routes>
          <Route path="/sessions/:encodedCwd" element={<SessionListPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/sessions?cwd=${encodeURIComponent(cwd)}&page=1&size=20`
      )
    )
    expect(screen.getByText('Ended')).toBeInTheDocument()
    expect(await screen.findByText('sess-1234567')).toBeInTheDocument()
    expect(screen.getAllByText('codex')).toHaveLength(2)
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText(new Date('2026-05-14T08:10:00Z').toLocaleString())).toBeInTheDocument()
  })
})

describe('session file-change page', () => {
  it('shows the loading state while file changes load', async () => {
    stubSessionFetch(new Promise<Response>(() => {}))
    renderSessionFileChanges()

    expect(await screen.findByText('Loading file changes...')).toBeInTheDocument()
  })

  it('shows the file-change error state', async () => {
    stubSessionFetch(Promise.resolve({ ok: false, status: 500 } as Response))
    renderSessionFileChanges()

    expect(await screen.findByText('Failed to load file changes: 500')).toBeInTheDocument()
  })

  it('shows the empty file-change state', async () => {
    stubSessionFetch(okFileChanges([]))
    renderSessionFileChanges()

    expect(
      await screen.findByText('No file changes recorded for this session.')
    ).toBeInTheDocument()
    expect(
      screen.getByText('This session did not create or modify files that hooker captured.')
    ).toBeInTheDocument()
  })

  it('renders expanded old and new snippets for a changed file', async () => {
    stubSessionFetch(
      okFileChanges([
        {
          path: `${cwd}/frontend/src/App.tsx`,
          count: 1,
          changes: [
            {
              time: '2026-05-14T10:00:03Z',
              tool: 'Edit',
              action: 'UPDATE',
              start_line: 42,
              old_string: 'const title = "Old heading"',
              new_string: 'const title = "File changes"',
            },
          ],
        },
      ])
    )
    renderSessionFileChanges()

    expect(await screen.findByText('1 file changed')).toBeInTheDocument()
    expect(screen.getAllByText('File changes').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /zoom/i })).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: /App\.tsx/i }))

    expect(screen.getByText('Before')).toBeInTheDocument()
    expect(screen.getByText('After')).toBeInTheDocument()
    expect(screen.getByText('const title = "Old heading"')).toBeInTheDocument()
    expect(screen.getByText('const title = "File changes"')).toBeInTheDocument()
    expect(screen.getByText('L42')).toBeInTheDocument()
    expect(screen.getByText('edit')).toBeInTheDocument()
  })

  it('paginates file rows by file group', async () => {
    const groups = Array.from({ length: 26 }, (_, index) => ({
      path: `/tmp/file-${String(index).padStart(2, '0')}.ts`,
      count: 1,
      changes: [
        {
          time: '2026-05-14T10:00:00Z',
          tool: 'Write',
          new_string: `file ${index}`,
        },
      ],
    }))

    stubSessionFetch(okFileChanges(groups))
    renderSessionFileChanges()

    expect(await screen.findByText('1-25 of 26 files')).toBeInTheDocument()
    expect(screen.getByText('/tmp/file-00.ts')).toBeInTheDocument()
    expect(screen.queryByText('/tmp/file-25.ts')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /next page/i }))

    expect(await screen.findByText('26-26 of 26 files')).toBeInTheDocument()
    expect(screen.getByText('/tmp/file-25.ts')).toBeInTheDocument()
    expect(screen.queryByText('/tmp/file-00.ts')).not.toBeInTheDocument()
  })
})
