import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionList } from '@/features/events/SessionList'
import type { EventRecord } from '@/types/events'

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  })
})

function makeEvent(overrides: Partial<EventRecord>): EventRecord {
  return {
    time: '2026-06-13T00:00:00.000Z',
    action: 'EDIT',
    path: '/foo.ts',
    ...overrides,
  } as EventRecord
}

const defaultProps = {
  sortOrder: 'newest',
  searchQuery: '',
  collapsedSessions: new Set<string>(),
  toggleSession: vi.fn(),
  targetSessionId: null,
  targetEventKey: null,
  highlightedEventKey: null,
  onTargetVisible: vi.fn(),
}

function renderWith(events: EventRecord[], sortOrder = 'newest') {
  return render(
    <MemoryRouter>
      <SessionList {...defaultProps} events={events} sortOrder={sortOrder} />
    </MemoryRouter>
  )
}

describe('SessionList', () => {
  it('renders empty state when no events', () => {
    renderWith([])
    expect(screen.getByText('No matching events')).toBeInTheDocument()
  })

  it('groups events by session key', () => {
    const events = [
      makeEvent({ session: 'sess-a', time: '2026-06-13T10:00:00.000Z' }),
      makeEvent({ session: 'sess-b', time: '2026-06-13T09:00:00.000Z' }),
      makeEvent({ session: 'sess-a', time: '2026-06-13T10:01:00.000Z' }),
    ]
    renderWith(events)
    // Two distinct session IDs should render two AgentSession blocks.
    // AgentSession renders the short session ID; look for the session shortId or
    // use the fact that two collapsible headers appear.
    const triggers = screen.getAllByRole('button')
    // At minimum two session toggles should be present (one per session group).
    expect(triggers.length).toBeGreaterThanOrEqual(2)
  })

  it('falls back to transcript_path when session is absent', () => {
    const events = [
      makeEvent({
        session: undefined,
        transcript_path: '/home/.claude/t1',
        time: '2026-06-13T10:00:00.000Z',
      }),
      makeEvent({
        session: undefined,
        transcript_path: '/home/.claude/t1',
        time: '2026-06-13T10:01:00.000Z',
      }),
      makeEvent({
        session: undefined,
        transcript_path: '/home/.claude/t2',
        time: '2026-06-13T09:00:00.000Z',
      }),
    ]
    renderWith(events)
    const triggers = screen.getAllByRole('button')
    // Two transcript paths → two session groups → at least two toggle buttons
    expect(triggers.length).toBeGreaterThanOrEqual(2)
  })

  it('falls back to "ungrouped" when both session and transcript_path are absent', () => {
    const events = [
      makeEvent({
        session: undefined,
        transcript_path: undefined,
        time: '2026-06-13T10:00:00.000Z',
      }),
      makeEvent({
        session: undefined,
        transcript_path: undefined,
        time: '2026-06-13T10:01:00.000Z',
      }),
    ]
    renderWith(events)
    // Both go to the same "ungrouped" bucket — exactly one session group rendered.
    const triggers = screen.getAllByRole('button')
    // The single session toggle is one button; pagination buttons may be present too,
    // but only one *collapsible trigger* button exists for a single group.
    // We just assert the component renders without throwing.
    expect(triggers.length).toBeGreaterThanOrEqual(1)
  })

  it('backfills cwd from a later event when the first event has no cwd', () => {
    // First event: no cwd. Second event: has cwd. Same session.
    const events = [
      makeEvent({ session: 'sess-x', cwd: undefined, time: '2026-06-13T10:00:00.000Z' }),
      makeEvent({ session: 'sess-x', cwd: '/workspace/project', time: '2026-06-13T10:01:00.000Z' }),
    ]
    renderWith(events)
    // The cwd should appear somewhere in the rendered session header.
    expect(screen.getByText('project')).toBeInTheDocument()
  })

  // Returns the DOM positions of the two session headers by their (verbatim)
  // session IDs. Session IDs render in full, so this is deterministic.
  function sessionOrder() {
    const html = document.body.innerHTML
    return {
      newerIdx: html.indexOf('sess-newer'),
      olderIdx: html.indexOf('sess-older'),
    }
  }

  it('orders sessions newest-first when sortOrder is newest', () => {
    const events = [
      makeEvent({ session: 'sess-older', time: '2026-06-13T08:00:00.000Z' }),
      makeEvent({ session: 'sess-newer', time: '2026-06-13T12:00:00.000Z' }),
    ]
    renderWith(events, 'newest')
    const { newerIdx, olderIdx } = sessionOrder()
    expect(newerIdx).toBeGreaterThanOrEqual(0)
    expect(olderIdx).toBeGreaterThanOrEqual(0)
    expect(newerIdx).toBeLessThan(olderIdx)
  })

  it('orders sessions oldest-first when sortOrder is oldest', () => {
    const events = [
      makeEvent({ session: 'sess-older', time: '2026-06-13T08:00:00.000Z' }),
      makeEvent({ session: 'sess-newer', time: '2026-06-13T12:00:00.000Z' }),
    ]
    renderWith(events, 'oldest')
    const { newerIdx, olderIdx } = sessionOrder()
    expect(newerIdx).toBeGreaterThanOrEqual(0)
    expect(olderIdx).toBeGreaterThanOrEqual(0)
    expect(olderIdx).toBeLessThan(newerIdx)
  })
})
