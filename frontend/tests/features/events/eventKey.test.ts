import { describe, expect, it } from 'vitest'
import { buildEventKey, mergeByKey } from '@/features/events/eventKey'
import type { EventRecord } from '@/types'

function buildEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    time: '2026-06-05T10:00:00.000Z',
    action: 'BASH',
    path: '/tmp/file.ts',
    session: 'sess-1',
    transcript_path: '/tmp/sess-1.json',
    ...overrides,
  }
}

describe('eventKey helpers', () => {
  it('builds a stable event key from identifying fields', () => {
    expect(buildEventKey(buildEvent())).toContain('sess-1')
  })

  it('merges event lists without duplicating matching events', () => {
    const shared = buildEvent()
    const result = mergeByKey([shared], [shared, buildEvent({ session: 'sess-2' })])

    expect(result).toHaveLength(2)
    expect(result[0].session).toBe('sess-1')
    expect(result[1].session).toBe('sess-2')
  })

  it('treats events with same session/time/action but different prompt as distinct', () => {
    const base = buildEvent({ hook_event_name: 'UserPromptSubmit', action: undefined })
    const e1 = { ...base, prompt: 'first prompt' }
    const e2 = { ...base, prompt: 'second prompt' }

    expect(buildEventKey(e1)).not.toBe(buildEventKey(e2))

    const result = mergeByKey([e1], [e2])
    expect(result).toHaveLength(2)
  })

  it('treats events with same session/time/action but different response as distinct', () => {
    const base = buildEvent({ hook_event_name: 'Stop', action: undefined })
    const e1 = { ...base, response: 'response A' }
    const e2 = { ...base, response: 'response B' }

    expect(buildEventKey(e1)).not.toBe(buildEventKey(e2))
  })
})
