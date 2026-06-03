import { describe, expect, it } from 'vitest'
import {
  HOOK_PRESETS,
  HOOKER_STATUS_MESSAGE,
  applyPreset,
  detectHookConfigLabel,
  hasAnyHookerHooks,
  removeHookerHooks,
} from '@/features/hooks-config/presets'
import type { HooksConfig } from '@/features/hooks-config/types'

function hookerEntry() {
  return { type: 'command' as const, command: 'curl ...', statusMessage: HOOKER_STATUS_MESSAGE }
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

  it('skips event that already has a hooker-marked entry', () => {
    const current: HooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [hookerEntry()] }],
      },
    }
    const result = applyPreset(current, HOOK_PRESETS.claudecode.baseline)
    // Should still have exactly 1 group for SessionStart (not doubled)
    expect(result.hooks['SessionStart']).toHaveLength(1)
  })

  it('appends preset groups alongside existing non-hooker entries', () => {
    const current: HooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [userEntry()] }],
      },
    }
    const result = applyPreset(current, HOOK_PRESETS.claudecode.baseline)
    // user group + preset group both present
    expect(result.hooks['SessionStart']).toHaveLength(2)
    const allEntries = result.hooks['SessionStart'].flatMap((g) => g.hooks)
    expect(allEntries.some((e) => e.statusMessage === HOOKER_STATUS_MESSAGE)).toBe(true)
    expect(allEntries.some((e) => e.statusMessage === undefined)).toBe(true)
  })

  it('does not mutate the current config', () => {
    const current: HooksConfig = { hooks: {} }
    applyPreset(current, HOOK_PRESETS.claudecode.baseline)
    expect(Object.keys(current.hooks)).toHaveLength(0)
  })

  it('medium applied over baseline adds new events without touching existing hooker entries', () => {
    const afterBaseline = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.baseline)
    const afterMedium = applyPreset(afterBaseline, HOOK_PRESETS.claudecode.medium)
    // All baseline events still present (one group each, not doubled)
    expect(afterMedium.hooks['SessionStart']).toHaveLength(1)
    // Medium-only events added
    expect(afterMedium.hooks['PreToolUse']).toBeDefined()
    expect(afterMedium.hooks['SubagentStart']).toBeDefined()
  })
})

// ─── removeHookerHooks ──────────────────────────────────────────────────────

describe('removeHookerHooks', () => {
  it('removes hooker-marked entries', () => {
    const config: HooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [hookerEntry()] }],
      },
    }
    const result = removeHookerHooks(config)
    expect(result.hooks['SessionStart']).toBeUndefined()
  })

  it('keeps non-hooker entries', () => {
    const config: HooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [userEntry(), hookerEntry()] }],
      },
    }
    const result = removeHookerHooks(config)
    const entries = result.hooks['SessionStart']?.[0]?.hooks ?? []
    expect(entries).toHaveLength(1)
    expect(entries[0].statusMessage).toBeUndefined()
  })

  it('drops empty groups after removing hooker entries', () => {
    const config: HooksConfig = {
      hooks: {
        PostToolUse: [
          { hooks: [hookerEntry()] },           // becomes empty → dropped
          { hooks: [userEntry(), hookerEntry()] }, // one user entry remains
        ],
      },
    }
    const result = removeHookerHooks(config)
    expect(result.hooks['PostToolUse']).toHaveLength(1)
  })

  it('drops event key when all groups become empty', () => {
    const config: HooksConfig = {
      hooks: {
        Stop: [{ hooks: [hookerEntry()] }],
        SessionStart: [{ hooks: [userEntry()] }],
      },
    }
    const result = removeHookerHooks(config)
    expect(result.hooks['Stop']).toBeUndefined()
    expect(result.hooks['SessionStart']).toBeDefined()
  })

  it('returns empty hooks object when config is already empty', () => {
    const result = removeHookerHooks({ hooks: {} })
    expect(result.hooks).toEqual({})
  })
})

// ─── hasAnyHookerHooks ──────────────────────────────────────────────────────

describe('hasAnyHookerHooks', () => {
  it('returns true when at least one hooker entry exists', () => {
    const config: HooksConfig = {
      hooks: { SessionStart: [{ hooks: [hookerEntry()] }] },
    }
    expect(hasAnyHookerHooks(config)).toBe(true)
  })

  it('returns false when no hooker entries', () => {
    const config: HooksConfig = {
      hooks: { SessionStart: [{ hooks: [userEntry()] }] },
    }
    expect(hasAnyHookerHooks(config)).toBe(false)
  })

  it('returns false for empty config', () => {
    expect(hasAnyHookerHooks({ hooks: {} })).toBe(false)
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

  it('returns Configured when hooks exist but none are hooker-managed', () => {
    const config: HooksConfig = {
      hooks: { SessionStart: [{ hooks: [userEntry()] }] },
    }
    expect(detectHookConfigLabel('claudecode', config)).toBe('Configured')
  })

  it('returns Baseline for exact claudecode baseline preset', () => {
    const config = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.baseline)
    expect(detectHookConfigLabel('claudecode', config)).toBe('Baseline')
  })

  it('returns Medium for exact claudecode medium preset', () => {
    const config = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.medium)
    expect(detectHookConfigLabel('claudecode', config)).toBe('Medium')
  })

  it('returns Full for exact claudecode full preset', () => {
    const config = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.full)
    expect(detectHookConfigLabel('claudecode', config)).toBe('Full')
  })

  it('returns Baseline for exact codex baseline preset', () => {
    const config = applyPreset({ hooks: {} }, HOOK_PRESETS.codex.baseline)
    expect(detectHookConfigLabel('codex', config)).toBe('Baseline')
  })

  it('returns Custom (X/30) when hooker events do not match any preset', () => {
    // Apply baseline then add one extra hooker event manually
    const config = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.baseline)
    config.hooks['StopFailure'] = [{ hooks: [hookerEntry()] }]
    const label = detectHookConfigLabel('claudecode', config)
    expect(label).toMatch(/^Custom \(\d+\/30\)$/)
    // 5 baseline events + 1 extra = 6
    expect(label).toBe('Custom (6/30)')
  })

  it('Custom label uses hooker-event count, not total event count', () => {
    // One hooker event + one user event — only hooker event counts toward X
    const config: HooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [hookerEntry()] }],
        PostToolUse: [{ hooks: [userEntry()] }],
      },
    }
    const label = detectHookConfigLabel('claudecode', config)
    expect(label).toBe('Custom (1/30)')
  })

  it('returns Custom (X/10) for codex agent', () => {
    const config: HooksConfig = {
      hooks: {
        SessionStart: [{ hooks: [hookerEntry()] }],
        Stop: [{ hooks: [hookerEntry()] }],
      },
    }
    expect(detectHookConfigLabel('codex', config)).toBe('Custom (2/10)')
  })

  it('preset match ignores non-hooker entries in same config', () => {
    // Baseline hooker events + a user entry on a different event — still Baseline
    const config = applyPreset({ hooks: {} }, HOOK_PRESETS.claudecode.baseline)
    config.hooks['PreToolUse'] = [{ hooks: [userEntry()] }]
    expect(detectHookConfigLabel('claudecode', config)).toBe('Baseline')
  })
})
