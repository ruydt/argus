import { describe, expect, it } from 'vitest'
import { getTemplate } from '../hookTemplates'
import { resolveSimPayload } from '../simPayload'

describe('resolveSimPayload', () => {
  const postToolUse = JSON.stringify(getTemplate('claudecode', 'PostToolUse'), null, 2)

  it('regenerates the template when the deep-linked event differs from the current one', () => {
    // Repro: user simulated PostToolUse, then opens a PreToolUse script from My
    // Collection. The payload must switch to PreToolUse, not stay PostToolUse.
    const out = resolveSimPayload({
      agent: 'claudecode',
      event: 'PreToolUse',
      currentEventType: 'PostToolUse',
      currentPayload: postToolUse,
      handoff: null,
    })
    expect(JSON.parse(out).hook_event_name).toBe('PreToolUse')
  })

  it('preserves the current payload when the event is unchanged (keeps user edits)', () => {
    const edited = '{\n  "hook_event_name": "PostToolUse",\n  "edited": true\n}'
    const out = resolveSimPayload({
      agent: 'claudecode',
      event: 'PostToolUse',
      currentEventType: 'PostToolUse',
      currentPayload: edited,
      handoff: null,
    })
    expect(out).toBe(edited)
  })

  it('regenerates the template when there is no current payload', () => {
    const out = resolveSimPayload({
      agent: 'codex',
      event: 'PreToolUse',
      currentEventType: '',
      currentPayload: '',
      handoff: null,
    })
    expect(JSON.parse(out).hook_event_name).toBe('PreToolUse')
  })

  it('always uses the handoff payload when present', () => {
    const handoff = '{"real":"payload"}'
    const out = resolveSimPayload({
      agent: 'claudecode',
      event: 'PreToolUse',
      currentEventType: 'PostToolUse',
      currentPayload: postToolUse,
      handoff,
    })
    expect(out).toBe(handoff)
  })
})
