import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { EventTimeline } from '@/features/sessions/EventTimeline'
import { SessionListPage } from '@/features/sessions/SessionListPage'
import { TraceInspectionPanel } from '@/features/sessions/TraceInspectionPanel'
import { TraceViewPage } from '@/features/sessions/TraceViewPage'
import type { TraceSpan } from '@/features/sessions/hooks/useTraces'
import { buildTimelineTicks, formatElapsed } from '@/features/sessions/timelineScale'
import { setMatchMediaMatches } from '@/test/setup'
import type { EventRecord } from '@/types/events'

class MockES {
  onmessage: ((ev: MessageEvent) => void) | null = null
  close = vi.fn()
  constructor(public url: string) {}
}

vi.mock('react-resizable-panels', () => ({
  Panel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Group: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Separator: () => <div />,
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('EventSource', MockES)
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
            ended_at: '',
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              cache_creation_tokens: 0,
              cache_read_tokens: 0,
              turns: 1,
            },
          },
          {
            session_id: 'sess-ended-1234',
            agent: 'claudecode',
            model: 'claude-opus-4-1',
            source: 'startup',
            cwd: '/Users/duytran/GitHub/hooker',
            transcript_path: '',
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
        `/api/sessions?cwd=${encodeURIComponent('/Users/duytran/GitHub/hooker')}&page=1&size=20`
      )
    )
    expect(screen.getByText('Ended')).toBeInTheDocument()
    expect(await screen.findByText('sess-1234567')).toBeInTheDocument()
    expect(screen.getByText('codex')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText(new Date('2026-05-14T08:10:00Z').toLocaleString())).toBeInTheDocument()
  })
})

describe('trace rendering', () => {
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

  it('keeps zero-duration events at zero duration', () => {
    const firstEvent: EventRecord = {
      time: '2026-05-14T10:00:00Z',
      action: 'READ',
      path: '/tmp/a',
      session: 'sess',
      hook_event_name: 'PreToolUse',
      tool: 'Read',
      duration_ms: 0,
    }
    const secondEvent: EventRecord = {
      time: '2026-05-14T10:00:05Z',
      action: 'READ',
      path: '/tmp/b',
      session: 'sess',
      hook_event_name: 'PostToolUse',
      tool: 'Read',
      duration_ms: 0,
    }
    const onSelect = vi.fn()

    render(
      <EventTimeline
        events={[firstEvent, secondEvent]}
        selected={null}
        onSelect={onSelect}
        globalStart={new Date(firstEvent.time).getTime()}
        globalDuration={5_000}
        timelineWidth={960}
      />
    )

    fireEvent.click(screen.getByText('PreToolUse'))

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ duration: 0, event: firstEvent })
    )
  })

  it('keeps the trace axis aligned to the real session duration', async () => {
    const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'clientWidth'
    )
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 960,
    })

    const session = {
      session_id: 'sess-1234567890',
      agent: 'codex',
      model: 'gpt-5.4',
      source: 'startup',
      cwd: '/Users/duytran/GitHub/hooker',
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
    const traceEvent: EventRecord = {
      time: '2026-05-14T10:00:00Z',
      action: 'READ',
      path: '/tmp/a',
      session: session.session_id,
      hook_event_name: 'PreToolUse',
      tool: 'Read',
      duration_ms: 10_000,
    }
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input)

      if (url.startsWith('/api/sessions?cwd=')) {
        return Promise.resolve({
          ok: true,
          json: async () => [session],
        })
      }

      if (url.startsWith('/api/traces?session_id=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ traces: [traceEvent] }),
        })
      }

      if (url.startsWith('/api/file-changes?session_id=')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(
      <MemoryRouter
        initialEntries={[`/sessions/${encodeURIComponent(session.cwd)}/${session.session_id}`]}
      >
        <Routes>
          <Route path="/sessions/:encodedCwd/:sessionId" element={<TraceViewPage />} />
        </Routes>
      </MemoryRouter>
    )

    try {
      expect(await screen.findByText((text) => text.startsWith('Ended '))).toBeInTheDocument()
      await waitFor(() => {
        const tickLabels = Array.from(container.querySelectorAll('span.tracking-wide')).map(
          (node) => node.textContent
        )
        expect(tickLabels).toContain('10s')
      })
    } finally {
      if (clientWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidthDescriptor)
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).clientWidth
      }
    }
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

  it('opens trace details in overlay drawer on mobile after selecting an event', async () => {
    setMatchMediaMatches(true)

    const session = {
      session_id: 'sess-mobile',
      agent: 'codex',
      model: 'gpt-5.4',
      source: 'startup',
      cwd: '/Users/duytran/GitHub/hooker',
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
    const traceEvent: EventRecord = {
      time: '2026-05-14T10:00:00Z',
      action: 'READ',
      path: '/tmp/a',
      session: session.session_id,
      hook_event_name: 'PreToolUse',
      tool: 'Read',
      duration_ms: 10_000,
    }
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const url = String(input)

      if (url.startsWith('/api/sessions?cwd=')) {
        return Promise.resolve({
          ok: true,
          json: async () => [session],
        })
      }

      if (url.startsWith('/api/traces?session_id=')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ traces: [traceEvent] }),
        })
      }

      if (url.startsWith('/api/file-changes?session_id=')) {
        return Promise.resolve({ ok: true, json: async () => [] })
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter
        initialEntries={[`/sessions/${encodeURIComponent(session.cwd)}/${session.session_id}`]}
      >
        <Routes>
          <Route path="/sessions/:encodedCwd/:sessionId" element={<TraceViewPage />} />
        </Routes>
      </MemoryRouter>
    )

    fireEvent.click(await screen.findByText('PreToolUse'))

    const closeButton = await screen.findByRole('button', { name: /close details/i })
    expect(closeButton).toBeInTheDocument()
    expect(screen.getByText('See Event')).toBeInTheDocument()

    fireEvent.click(closeButton)
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /close details/i })).not.toBeInTheDocument()
    )
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
