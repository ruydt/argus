import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { EventTimeline } from '@/features/sessions/EventTimeline'
import { SessionListPage } from '@/features/sessions/SessionListPage'
import { TraceInspectionPanel } from '@/features/sessions/TraceInspectionPanel'
import type { TraceSpan } from '@/features/sessions/hooks/useTraces'
import { buildTimelineTicks, formatElapsed } from '@/features/sessions/timelineScale'
import type { EventRecord } from '@/types/events'

class MockES {
  onmessage: ((ev: MessageEvent) => void) | null = null
  close = vi.fn()
  constructor(public url: string) {}
}

vi.stubGlobal('EventSource', MockES)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('project scoped sessions pages', () => {
  it('renders project cards from /api/projects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          projects: [
            {
              cwd: '/Users/duytran/GitHub/hooker',
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
          {
            session_id: 'sess-1234567890',
            agent: 'codex',
            model: 'gpt-5.4',
            source: 'startup',
            cwd: '/Users/duytran/GitHub/hooker',
            transcript_path: '',
            started_at: '2026-05-14T09:00:00Z',
            last_seen_at: '2026-05-14T09:05:00Z',
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              cache_creation_tokens: 0,
              cache_read_tokens: 0,
              turns: 1,
            },
          },
        ],
        total: 1,
        page: 1,
        size: 20,
        has_more: false,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter
        initialEntries={[`/sessions/${encodeURIComponent('/Users/duytran/GitHub/hooker')}`]}
      >
        <Routes>
          <Route path="/sessions/:encodedCwd" element={<SessionListPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/sessions?cwd=${encodeURIComponent('/Users/duytran/GitHub/hooker')}&page=1&size=20`,
      ),
    )
    expect(await screen.findByText('sess-1234567')).toBeInTheDocument()
    expect(screen.getByText('codex')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
  })
})

describe('trace rendering', () => {
  it('renders events without subagent spans in EventTimeline', () => {
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

    const { container } = render(<TraceInspectionPanel span={span} />)

    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})
