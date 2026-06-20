import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EventRow } from '@/features/events/EventRow'
import type { EventRecord } from '@/types/events'

function buildEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    time: '2026-05-21T10:00:00.000Z',
    action: '',
    path: '',
    hook_event_name: 'PreToolUse',
    ...overrides,
  }
}

function createDragStartEvent(target: HTMLElement) {
  const event = new Event('dragstart', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'target', { configurable: true, value: target })
  Object.defineProperty(event, 'dataTransfer', {
    configurable: true,
    value: {
      effectAllowed: '',
      setData: vi.fn(),
    },
  })
  return event as DragEvent & {
    dataTransfer: {
      effectAllowed: string
      setData: ReturnType<typeof vi.fn>
    }
  }
}

describe('EventRow thin layout', () => {
  it('shows the event name', () => {
    render(<EventRow event={buildEvent({ hook_event_name: 'PostToolUse' })} searchQuery="" />)
    expect(screen.getByText('PostToolUse')).toBeTruthy()
  })

  it('falls back to action when hook_event_name is absent', () => {
    render(
      <EventRow event={buildEvent({ hook_event_name: undefined, action: 'BASH' })} searchQuery="" />
    )
    expect(screen.getByText('BASH')).toBeTruthy()
  })

  it('shows the tool name when present', () => {
    render(<EventRow event={buildEvent({ tool: 'Bash' })} searchQuery="" />)
    expect(screen.getByText('Bash')).toBeTruthy()
  })

  it('labels the agent from the stored agent id', () => {
    render(<EventRow event={buildEvent({ agent: 'claudecode' })} searchQuery="" />)
    expect(screen.getByLabelText('Claude Code')).toBeTruthy()
  })

  it('does not render diff/command blocks inline', () => {
    render(
      <EventRow
        event={buildEvent({ action: 'BASH', command: 'echo hello', description: 'List files' })}
        searchQuery=""
      />
    )
    expect(screen.queryByText('echo hello')).toBeNull()
    expect(screen.queryByText('Intent:')).toBeNull()
  })
})

describe('EventRow raw payload', () => {
  it('marks the row clickable when dedup_key is present', () => {
    const { container } = render(
      <EventRow event={buildEvent({ dedup_key: 'abc123' })} searchQuery="" />
    )
    expect(container.firstElementChild?.className).toContain('cursor-pointer')
  })

  it('is not clickable when dedup_key is absent', () => {
    const { container } = render(<EventRow event={buildEvent()} searchQuery="" />)
    expect(container.firstElementChild?.className).not.toContain('cursor-pointer')
  })
})

describe('EventRow dragging', () => {
  it('marks the row draggable and drags from the time label', () => {
    const { container } = render(<EventRow event={buildEvent()} searchQuery="" isDraggable />)
    expect(container.firstElementChild).toHaveAttribute('draggable', 'true')

    const timeLabel = screen.getByText(/\d{2}:\d{2}:\d{2}/)
    const dragStart = createDragStartEvent(timeLabel)
    timeLabel.dispatchEvent(dragStart)

    expect(dragStart.dataTransfer.setData).toHaveBeenCalledWith(
      'text/plain',
      expect.stringContaining('2026-05-21T10:00:00.000Z')
    )
  })

  it('does not start dragging from a code block', () => {
    const { container } = render(
      <EventRow event={buildEvent({ dedup_key: 'abc123' })} searchQuery="" isDraggable />
    )

    const code = document.createElement('code')
    container.firstElementChild?.appendChild(code)
    const dragStart = createDragStartEvent(code)
    code.dispatchEvent(dragStart)

    expect(dragStart.dataTransfer.setData).not.toHaveBeenCalled()
  })
})
