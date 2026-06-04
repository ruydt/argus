import type { AgentKey, HookGroup, HooksConfig } from './types'

export const HOOKER_STATUS_MESSAGE = 'hooker'

const HOOK_CMD =
  "curl -s --max-time 2 -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @- || true"

function hookerGroup(matcher?: string): HookGroup {
  return {
    id: crypto.randomUUID(),
    ...(matcher !== undefined ? { matcher } : {}),
    hooks: [
      {
        id: crypto.randomUUID(),
        type: 'command',
        command: HOOK_CMD,
        statusMessage: HOOKER_STATUS_MESSAGE,
      },
    ],
  }
}

type PresetKey = 'baseline' | 'medium' | 'full'

const CLAUDE_PRESETS: Record<PresetKey, HooksConfig> = {
  baseline: {
    hooks: {
      SessionStart: [hookerGroup()],
      SessionEnd: [hookerGroup()],
      UserPromptSubmit: [hookerGroup()],
      PostToolUse: [hookerGroup('.*')],
      Stop: [hookerGroup()],
    },
  },
  medium: {
    hooks: {
      SessionStart: [hookerGroup()],
      SessionEnd: [hookerGroup()],
      UserPromptSubmit: [hookerGroup()],
      PreToolUse: [hookerGroup('.*')],
      PostToolUse: [hookerGroup('.*')],
      PostToolUseFailure: [hookerGroup('.*')],
      StopFailure: [hookerGroup()],
      Stop: [hookerGroup()],
      SubagentStart: [hookerGroup()],
      SubagentStop: [hookerGroup()],
      PreCompact: [hookerGroup()],
      PostCompact: [hookerGroup()],
    },
  },
  full: {
    hooks: {
      // Session lifecycle
      SessionStart: [hookerGroup()],
      Setup: [hookerGroup()],
      SessionEnd: [hookerGroup()],
      // Per-turn
      UserPromptSubmit: [hookerGroup()],
      UserPromptExpansion: [hookerGroup()],
      Stop: [hookerGroup()],
      StopFailure: [hookerGroup()],
      // Tool lifecycle
      PreToolUse: [hookerGroup('.*')],
      PostToolUse: [hookerGroup('.*')],
      PostToolUseFailure: [hookerGroup('.*')],
      PostToolBatch: [hookerGroup()],
      PermissionRequest: [hookerGroup()],
      PermissionDenied: [hookerGroup()],
      // Subagent & tasks
      SubagentStart: [hookerGroup()],
      SubagentStop: [hookerGroup()],
      TeammateIdle: [hookerGroup()],
      TaskCreated: [hookerGroup()],
      TaskCompleted: [hookerGroup()],
      // File & config
      CwdChanged: [hookerGroup()],
      ConfigChange: [hookerGroup()],
      InstructionsLoaded: [hookerGroup()],
      // Notifications
      Notification: [hookerGroup()],
      // Compaction
      PreCompact: [hookerGroup()],
      PostCompact: [hookerGroup()],
      // Worktree
      WorktreeCreate: [hookerGroup()],
      WorktreeRemove: [hookerGroup()],
      // MCP elicitation
      Elicitation: [hookerGroup()],
      ElicitationResult: [hookerGroup()],
      // Excluded: MessageDisplay (fires per streaming token — floods DB)
      // Excluded: FileChanged (requires watchPaths setup in SessionStart — dead without it)
    },
  },
}

// Codex event set is smaller — no SessionEnd, PostToolUseFailure, StopFailure in its hook list.
// Baseline and Medium share the same events; Full adds PermissionRequest.
const CODEX_PRESETS: Record<PresetKey, HooksConfig> = {
  baseline: {
    hooks: {
      SessionStart: [hookerGroup()],
      UserPromptSubmit: [hookerGroup()],
      PostToolUse: [hookerGroup()],
      Stop: [hookerGroup()],
    },
  },
  medium: {
    hooks: {
      SessionStart: [hookerGroup()],
      UserPromptSubmit: [hookerGroup()],
      PreToolUse: [hookerGroup('.*')],
      PostToolUse: [hookerGroup()],
      Stop: [hookerGroup()],
      SubagentStart: [hookerGroup()],
      SubagentStop: [hookerGroup()],
      PreCompact: [hookerGroup()],
      PostCompact: [hookerGroup()],
    },
  },
  full: {
    hooks: {
      SessionStart: [hookerGroup()],
      UserPromptSubmit: [hookerGroup()],
      PreToolUse: [hookerGroup('.*')],
      PermissionRequest: [hookerGroup()],
      PostToolUse: [hookerGroup()],
      Stop: [hookerGroup()],
      SubagentStart: [hookerGroup()],
      SubagentStop: [hookerGroup()],
      PreCompact: [hookerGroup()],
      PostCompact: [hookerGroup()],
    },
  },
}

export const HOOK_PRESETS: Record<AgentKey, Record<PresetKey, HooksConfig>> = {
  claudecode: CLAUDE_PRESETS,
  codex: CODEX_PRESETS,
}

export const PRESET_LABELS: Record<PresetKey, { label: string; description: string }> = {
  baseline: { label: 'Baseline', description: 'Session, prompts, tool results, stop' },
  medium: { label: 'Medium', description: 'Baseline + pre-tool, failures, subagents, compaction' },
  full: { label: 'Full', description: 'All events (excl. high-frequency streaming)' },
}

export const PRESET_KEYS: PresetKey[] = ['baseline', 'medium', 'full']

function hasHookerEntry(config: HooksConfig, eventType: string): boolean {
  return (config.hooks[eventType] ?? []).some((g) =>
    g.hooks.some((e) => e.statusMessage === HOOKER_STATUS_MESSAGE)
  )
}

export function applyPreset(current: HooksConfig, preset: HooksConfig): HooksConfig {
  const merged: HooksConfig = { hooks: { ...current.hooks } }
  for (const [eventType, presetGroups] of Object.entries(preset.hooks)) {
    if (hasHookerEntry(merged, eventType)) continue
    const existing = merged.hooks[eventType] ?? []
    merged.hooks[eventType] = [...existing, ...presetGroups]
  }
  return merged
}

export function removeHookerHooks(current: HooksConfig): HooksConfig {
  const cleaned: HooksConfig['hooks'] = {}
  for (const [eventType, groups] of Object.entries(current.hooks)) {
    const filteredGroups = groups
      .map((g) => ({
        ...g,
        hooks: g.hooks.filter((e) => e.statusMessage !== HOOKER_STATUS_MESSAGE),
      }))
      .filter((g) => g.hooks.length > 0)
    if (filteredGroups.length > 0) {
      cleaned[eventType] = filteredGroups
    }
  }
  return { hooks: cleaned }
}

export function hasAnyHookerHooks(config: HooksConfig): boolean {
  return Object.values(config.hooks).some((groups) =>
    groups.some((g) => g.hooks.some((e) => e.statusMessage === HOOKER_STATUS_MESSAGE))
  )
}

// Total hook event types available per agent (used as denominator in Custom (X/Y) label)
const AGENT_EVENT_TOTALS: Record<AgentKey, number> = {
  claudecode: 30,
  codex: 10,
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const item of a) if (!b.has(item)) return false
  return true
}

/**
 * Returns a human-readable label for the hook config status of an agent.
 * - Preset name when hooker-marked events exactly equal a preset's event set.
 * - "Custom (X/Y)" when hooker-marked events exist but don't match any preset.
 *   X = hooker-managed event count; Y = total available events for this agent.
 * - "Configured" when hooks exist but none are hooker-managed (manual setup).
 * - "Missing" when no hooks are configured at all.
 */
export function detectHookConfigLabel(agent: AgentKey, config: HooksConfig): string {
  const anyEvents = Object.values(config.hooks).some((groups) =>
    groups.some((g) => g.hooks.length > 0)
  )
  if (!anyEvents) return 'Missing'

  const hookerEventTypes = new Set(
    Object.entries(config.hooks)
      .filter(([, groups]) =>
        groups.some((g) => g.hooks.some((e) => e.statusMessage === HOOKER_STATUS_MESSAGE))
      )
      .map(([eventType]) => eventType)
  )

  if (hookerEventTypes.size === 0) return 'Configured'

  for (const key of ['full', 'medium', 'baseline'] as const) {
    const presetEvents = new Set(Object.keys(HOOK_PRESETS[agent][key].hooks))
    if (setsEqual(hookerEventTypes, presetEvents)) return PRESET_LABELS[key].label
  }

  const total = AGENT_EVENT_TOTALS[agent]
  return `Custom (${hookerEventTypes.size}/${total})`
}
