import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EventRow } from '@/features/events/EventRow'
import type { EventRecord } from '@/types/events'

function buildEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    time: '2026-06-03T10:00:00.000Z',
    action: 'ELICIT',
    path: '',
    ...overrides,
  }
}

describe('EventRow — new event types', () => {
  it('renders ElicitBlock for ELICIT action', () => {
    render(
      <EventRow
        event={buildEvent({
          action: 'ELICIT',
          hook_event_name: 'Elicitation',
          server_name: 'memory',
          prompt: 'Should I delete?',
        })}
        searchQuery=""
      />
    )
    expect(screen.getByText('memory')).toBeTruthy()
    expect(screen.getByText('Should I delete?')).toBeTruthy()
  })

  it('renders DisplayBlock for DISPLAY action', () => {
    render(
      <EventRow
        event={buildEvent({
          action: 'DISPLAY',
          hook_event_name: 'MessageDisplay',
          notification_message: 'Hello from model',
        })}
        searchQuery=""
      />
    )
    expect(screen.getByText('Hello from model')).toBeTruthy()
  })

  it('renders WorktreeBlock for WORKTREE action', () => {
    render(
      <EventRow
        event={buildEvent({
          action: 'WORKTREE',
          hook_event_name: 'WorktreeCreate',
          branch: 'feature/foo',
        })}
        searchQuery=""
      />
    )
    expect(screen.getByText('feature/foo')).toBeTruthy()
  })

  it('renders InstructBlock for INSTRUCT action', () => {
    render(
      <EventRow
        event={buildEvent({
          action: 'INSTRUCT',
          hook_event_name: 'InstructionsLoaded',
          memory_type: 'project',
          load_reason: 'startup',
        })}
        searchQuery=""
      />
    )
    expect(screen.getByText('project')).toBeTruthy()
    expect(screen.getByText('startup')).toBeTruthy()
  })
})

describe('EventBadges — expansion fields', () => {
  it('shows command_name badge for UserPromptExpansion', () => {
    const { container } = render(
      <EventRow
        event={buildEvent({
          action: 'PROMPT',
          hook_event_name: 'UserPromptExpansion',
          command_name: '/brainstorming',
          expansion_type: 'slash_command',
        })}
        searchQuery=""
      />
    )
    expect(container.textContent).toContain('/brainstorming')
    expect(container.textContent).toContain('slash_command')
  })
})
