import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { EventTimeline } from '@/features/sessions/EventTimeline'
import { SessionListPage } from '@/features/sessions/SessionListPage'
import { TraceInspectionPanel } from '@/features/sessions/TraceInspectionPanel'
import { TraceViewPage } from '@/features/sessions/TraceViewPage'
import type { TraceSpan } from '@/features/sessions/hooks/useTraces'
import { buildTimelineTicks, formatElapsed } from '@/features/sessions/timelineScale'
import type { EventRecord } from '@/types/events'
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
        <Route path="/sessions/:encodedCwd/:sessionId" element={<TraceViewPage />} />
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
              old_string: 'const title = "Trace"',
              new_string: 'const title = "File changes"',
            },
          ],
        },
      ])
    )
    renderSessionFileChanges()

    expect(await screen.findByText('1 file changed')).toBeInTheDocument()
    expect(screen.getAllByText('File changes').length).toBeGreaterThan(0)
    expect(screen.queryByText('Trace')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /zoom/i })).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: /App\.tsx/i }))

    expect(screen.getByText('Before')).toBeInTheDocument()
    expect(screen.getByText('After')).toBeInTheDocument()
    expect(screen.getByText('const title = "Trace"')).toBeInTheDocument()
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

describe('trace support components', () => {
  it('renders event type as the primary timeline label', () => {
    const event: EventRecord = {
      time: '2026-05-14T10:00:00Z',
      action: 'READ',
      path: '/tmp/a',
      session: 'sess',
      hook_event_name: 'PreToolUse',
      tool: 'Read',
      duration_ms: 25,
    }
    const onSelect = vi.fn()

    render(
      <EventTimeline
        events={[event]}
        selected={null}
        onSelect={onSelect}
        globalStart={new Date(event.time).getTime()}
        globalDuration={1000}
        timelineWidth={960}
      />
    )

    fireEvent.click(screen.getByText('PreToolUse'))
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ event }))
  })

  it('formats axis labels as elapsed time with zoom-aware steps', () => {
    expect(formatElapsed(1_000)).toBe('1s')
    expect(formatElapsed(5 * 60_000)).toBe('5m')
    expect(formatElapsed(15 * 60_000)).toBe('15m')

    const zoomedIn = buildTimelineTicks(90 * 1_000, 90_000)
    const zoomedOut = buildTimelineTicks(90 * 60_000, 1_440)

    expect(zoomedIn.stepMs).toBe(1_000)
    expect(zoomedOut.stepMs).toBe(10 * 60_000)
  })

  it('renders JSON as text instead of unsafe HTML', () => {
    const span: TraceSpan = {
      id: 'span-1',
      name: 'Span',
      type: 'event',
      startTime: 0,
      endTime: 1,
      duration: 1,
      children: [],
      event: {
        time: '2026-05-14T10:00:00Z',
        action: '',
        path: '',
        prompt: '<img src=x onerror=alert(1)>',
      },
    }

    const { container } = render(
      <MemoryRouter>
        <TraceInspectionPanel span={span} />
      </MemoryRouter>
    )

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders optional close control in trace inspection panel', () => {
    const span: TraceSpan = {
      id: 'span-close',
      name: 'InstructionsLoaded',
      type: 'InstructionsLoaded',
      startTime: 0,
      endTime: 1,
      duration: 1,
      children: [],
      event: {
        time: '2026-05-14T10:00:00Z',
        action: 'INSTRUCT',
        path: '/Users/duytran/.claude/CLAUDE.md',
        session: 'sess-1',
        hook_event_name: 'InstructionsLoaded',
        agent: 'claudecode',
      },
    }

    render(
      <MemoryRouter>
        <TraceInspectionPanel span={span} onClose={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByText('Run ID')).toBeInTheDocument()
    expect(screen.getByText('Raw Payload')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /close details/i })).toBeInTheDocument()
    expect(screen.getByText(span.id)).toHaveClass('min-w-max')
    expect(screen.getByText(span.id).parentElement).toHaveClass('overflow-x-auto')
    expect(screen.getByText(/"hook_event_name": "InstructionsLoaded"/i)).toHaveClass(
      'whitespace-pre'
    )
    expect(screen.getByText(/"hook_event_name": "InstructionsLoaded"/i).parentElement).toHaveClass(
      'overflow-x-auto'
    )
    expect(screen.getByText('Raw Payload').closest('[data-slot="card"]')).toHaveClass('w-full')
  })
})
