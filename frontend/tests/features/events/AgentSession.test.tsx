import { fireEvent, render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest'
import { AgentSession } from '@/features/events/AgentSession'
import type { SessionGroup } from '@/types/events'

// jsdom does not implement navigator.clipboard — mock it
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function buildSession(overrides: Partial<SessionGroup> = {}): SessionGroup {
  return {
    sessionId: 'test-session-abc123',
    transcriptPath: '/home/user/.claude/test',
    cwd: '',
    events: [
      {
        time: '2026-05-21T10:00:00.000Z',
        action: 'BASH',
        path: '',
        command: 'echo test',
        session: 'test-session-abc123',
        transcript_path: '/home/user/.claude/test',
        agent: 'claudecode',
        normalization_status: 'ok',
      } as import('@/types/events').EventRecord,
    ],
    ...overrides,
  }
}

function renderSession(props: Partial<Parameters<typeof AgentSession>[0]> = {}) {
  const defaults = {
    session: buildSession(),
    lastTime: new Date('2026-05-21T10:00:00.000Z'),
    isCollapsed: false,
    toggleSession: vi.fn(),
    searchQuery: '',
    sessionUsage: {},
    setTooltip: vi.fn(),
    targetSessionId: null,
    targetEventKey: null,
    highlightedEventKey: null,
    onTargetVisible: vi.fn(),
  }
  return render(
    <MemoryRouter>
      <AgentSession {...defaults} {...props} />
    </MemoryRouter>
  )
}

describe('AgentSession copy session ID', () => {
  it('renders a copy button with aria-label "Copy session ID"', () => {
    renderSession()
    expect(screen.getByRole('button', { name: /copy session id/i })).toBeDefined()
  })

  it('calls navigator.clipboard.writeText with the sessionId on click', async () => {
    renderSession()
    const btn = screen.getByRole('button', { name: /copy session id/i })
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-session-abc123')
  })

  it('shows "Copied session ID" aria-label after click for 1500ms then reverts', async () => {
    renderSession()
    const btn = screen.getByRole('button', { name: /copy session id/i })
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(screen.getByRole('button', { name: /copied session id/i })).toBeDefined()
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByRole('button', { name: /copy session id/i })).toBeDefined()
  })
})

describe('AgentSession project label', () => {
  it('shows shortened project cwd in the header', () => {
    renderSession({ session: buildSession({ cwd: '/Users/dev/GitHub/argus' }) })
    const label = screen.getByText('~/GitHub/argus')
    expect(label).toBeInTheDocument()
    expect(label).toHaveAttribute('title', '/Users/dev/GitHub/argus')
  })

  it('omits project label when session has no cwd', () => {
    renderSession({ session: buildSession({ cwd: '' }) })
    expect(screen.queryByText(/^~\//)).not.toBeInTheDocument()
  })
})
