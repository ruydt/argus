import { describe, expect, it } from 'vitest'
import {
  HOOK_PRESETS,
  ARGUS_STATUS_MESSAGE,
  applyPreset,
  detectHookConfigLabel,
  hasAnyArgusHooks,
  removeArgusHooks,
} from '@/features/hooks-config/presets'
import type { HooksConfig } from '@/features/hooks-config/types'

function argusEntry() {
  return { type: 'command' as const, command: 'curl ...', statusMessage: ARGUS_STATUS_MESSAGE }
}

function userEntry() {
  return { type: 'command' as const, command: 'echo user' }
}

// ─── applyPreset ────────────────────────────────────────────────────────────

describe('applyPreset', () => {
  it('adds all preset events to empty config', () => {
    const result = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.baseline)
    const keys = Object.keys(result.hooks)
    expect(keys).toContain('SessionStart')
    expect(keys).toContain('SessionEnd')
    expect(keys).toContain('PostToolUse')
    expect(keys).toContain('Stop')
    expect(keys).toContain('UserPromptSubmit')
  })

  it('replaces event that already has a argus-marked entry', () => {
    const current: HooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [{ ...argusEntry(), command: 'echo old argus hook' }] }],
      },
    }
    const result = applyPreset(current, HOOK_PRESETS.claudecode.baseline)
    expect(result.hooks['SessionStart']).toHaveLength(1)
    expect(result.hooks['SessionStart'][0].hooks[0].command).not.toBe('echo old argus hook')
  })

  it('preserves existing non-argus entries alongside the preset', () => {
    const current: HooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [userEntry()] }],
      },
    }
    const result = applyPreset(current, HOOK_PRESETS.claudecode.baseline)
    // user group + preset group both present
    expect(result.hooks['SessionStart']).toHaveLength(2)
    const allEntries = result.hooks['SessionStart'].flatMap((g) => g.hooks)
    expect(allEntries.some((e) => e.statusMessage === ARGUS_STATUS_MESSAGE)).toBe(true)
    expect(allEntries.some((e) => e.statusMessage === undefined)).toBe(true)
  })

  it('replaces prior argus-managed preset coverage when applying a new preset', () => {
    const afterMedium = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.medium)
    const afterBaseline = applyPreset(afterMedium, HOOK_PRESETS.claudecode.baseline)

    expect(afterBaseline.hooks['PreToolUse']).toBeUndefined()
    expect(afterBaseline.hooks['SubagentStart']).toBeUndefined()
    expect(afterBaseline.hooks['SessionStart']).toHaveLength(1)
    expect(
      afterBaseline.hooks['SessionStart'][0].hooks.every(
        (entry) => entry.statusMessage === ARGUS_STATUS_MESSAGE
      )
    ).toBe(true)
  })

  it('does not mutate the current config', () => {
    const current: HooksConfig = { hooks: {} }
    applyPreset(current, HOOK_PRESETS.claudecode.baseline)
    expect(Object.keys(current.hooks)).toHaveLength(0)
  })

  it('keeps unrelated manual hooks when replacing argus-managed entries', () => {
    const current: HooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [userEntry(), argusEntry()] }],
        PreToolUse: [{ hooks: [argusEntry()] }],
      },
    }
    const result = applyPreset(current, HOOK_PRESETS.claudecode.baseline)

    expect(result.hooks['PreToolUse']).toBeUndefined()
    expect(result.hooks['SessionStart']).toHaveLength(2)
    const sessionStartEntries = result.hooks['SessionStart'].flatMap((group) => group.hooks)
    expect(sessionStartEntries.some((entry) => entry.command === 'echo user')).toBe(true)
    expect(sessionStartEntries.some((entry) => entry.statusMessage === ARGUS_STATUS_MESSAGE)).toBe(
      true
    )
  })

  it('medium applied over baseline replaces baseline coverage with medium coverage', () => {
    const afterBaseline = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.baseline)
    const afterMedium = applyPreset(afterBaseline, HOOK_PRESETS.claudecode.medium)

    expect(afterMedium.hooks['SessionStart']).toHaveLength(1)
    expect(afterMedium.hooks['PreToolUse']).toBeDefined()
    expect(afterMedium.hooks['SubagentStart']).toBeDefined()
  })
})

// ─── removeArgusHooks ──────────────────────────────────────────────────────

describe('removeArgusHooks', () => {
  it('removes argus-marked entries', () => {
    const config: HooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [argusEntry()] }],
      },
    }
    const result = removeArgusHooks(config)
    expect(result.hooks['SessionStart']).toBeUndefined()
  })

  it('keeps non-argus entries', () => {
    const config: HooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [userEntry(), argusEntry()] }],
      },
    }
    const result = removeArgusHooks(config)
    const entries = result.hooks['SessionStart']?.[0]?.hooks ?? []
    expect(entries).toHaveLength(1)
    expect(entries[0].statusMessage).toBeUndefined()
  })

  it('drops empty groups after removing argus entries', () => {
    const config: HooksConfig = {
      hooks: {
        PostToolUse: [
          { hooks: [argusEntry()] }, // becomes empty → dropped
          { hooks: [userEntry(), argusEntry()] }, // one user entry remains
        ],
      },
    }
    const result = removeArgusHooks(config)
    expect(result.hooks['PostToolUse']).toHaveLength(1)
  })

  it('drops event key when all groups become empty', () => {
    const config: HooksConfig = {
      hooks: {
        Stop: [{ hooks: [argusEntry()] }],
        SessionStart: [{ hooks: [userEntry()] }],
      },
    }
    const result = removeArgusHooks(config)
    expect(result.hooks['Stop']).toBeUndefined()
    expect(result.hooks['SessionStart']).toBeDefined()
  })

  it('returns empty hooks object when config is already empty', () => {
    const result = removeArgusHooks({ hooks: {} })
    expect(result.hooks).toEqual({})
  })
})

// ─── hasAnyArgusHooks ──────────────────────────────────────────────────────

describe('hasAnyArgusHooks', () => {
  it('returns true when at least one argus entry exists', () => {
    const config: HooksConfig = {
      hooks: { SessionStart: [{ hooks: [argusEntry()] }] },
    }
    expect(hasAnyArgusHooks(config)).toBe(true)
  })

  it('returns false when no argus entries', () => {
    const config: HooksConfig = {
      hooks: { SessionStart: [{ hooks: [userEntry()] }] },
    }
    expect(hasAnyArgusHooks(config)).toBe(false)
  })

  it('returns false for empty config', () => {
    expect(hasAnyArgusHooks({ hooks: {} })).toBe(false)
  })
})

// ─── detectHookConfigLabel ──────────────────────────────────────────────────

describe('detectHookConfigLabel', () => {
  it('returns Missing when no hooks at all', () => {
    expect(detectHookConfigLabel('claudecode', { hooks: {} })).toBe('Missing')
  })

  it('returns Missing when event keys present but all groups empty', () => {
    const config: HooksConfig = { hooks: { SessionStart: [] } }
    expect(detectHookConfigLabel('claudecode', config)).toBe('Missing')
  })

  it('returns Configured when hooks exist but none are argus-managed', () => {
    const config: HooksConfig = {
      hooks: { SessionStart: [{ hooks: [userEntry()] }] },
    }
    expect(detectHookConfigLabel('claudecode', config)).toBe('Configured')
  })

  it('returns Configured (n/Y) for exact claudecode baseline preset — not preset name', () => {
    const config = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.baseline)
    const label = detectHookConfigLabel('claudecode', config)
    expect(label).toMatch(/^Configured \(\d+\/30\)$/)
    expect(label).not.toBe('Baseline')
  })

  it('returns Configured (n/Y) for exact claudecode medium preset — not preset name', () => {
    const config = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.medium)
    const label = detectHookConfigLabel('claudecode', config)
    expect(label).toMatch(/^Configured \(\d+\/30\)$/)
    expect(label).not.toBe('Medium')
  })

  it('returns Configured (30/30) for exact claudecode full preset', () => {
    const config = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.full)
    expect(detectHookConfigLabel('claudecode', config)).toBe('Configured (30/30)')
  })

  it('returns Configured (n/Y) for exact codex baseline preset — not preset name', () => {
    const config = applyPreset({ hooks: {} }, HOOK_PRESETS.codex.baseline)
    const label = detectHookConfigLabel('codex', config)
    expect(label).toMatch(/^Configured \(\d+\/10\)$/)
    expect(label).not.toBe('Baseline')
  })

  it('returns Configured (10/10) for codex full preset', () => {
    const config = applyPreset({ hooks: {} }, HOOK_PRESETS.codex.full)
    expect(detectHookConfigLabel('codex', config)).toBe('Configured (10/10)')
  })

  it('returns Configured (X/30) for partial argus coverage', () => {
    // Apply baseline then add one extra argus event manually
    const config = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.baseline)
    config.hooks['StopFailure'] = [{ hooks: [argusEntry()] }]
    const label = detectHookConfigLabel('claudecode', config)
    expect(label).toMatch(/^Configured \(\d+\/30\)$/)
    // 5 baseline events + 1 extra = 6
    expect(label).toBe('Configured (6/30)')
  })

  it('Configured label uses argus-event count, not total event count', () => {
    // One argus event + one user event — only argus event counts toward X
    const config: HooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [argusEntry()] }],
        PostToolUse: [{ hooks: [userEntry()] }],
      },
    }
    const label = detectHookConfigLabel('claudecode', config)
    expect(label).toBe('Configured (1/30)')
  })

  it('returns Configured (X/10) for codex agent with partial coverage', () => {
    const config: HooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [argusEntry()] }],
        Stop: [{ hooks: [argusEntry()] }],
      },
    }
    expect(detectHookConfigLabel('codex', config)).toBe('Configured (2/10)')
  })

  it('non-argus entries in same config do not affect Configured (X/Y) count', () => {
    // Baseline argus events + a user entry on a different event
    const config = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.baseline)
    config.hooks['PreToolUse'] = [{ hooks: [userEntry()] }]
    const label = detectHookConfigLabel('claudecode', config)
    expect(label).toMatch(/^Configured \(\d+\/30\)$/)
  })
})
