import type { AgentKey, HookGroup, HooksConfig } from './types'

export const ARGUS_STATUS_MESSAGE = 'argus'

const HOOK_CMD =
  "curl -s --max-time 2 -X POST http://127.0.0.1:10804/api/hook -H 'Content-Type: application/json' -d @- || true"

function argusGroup(matcher?: string): HookGroup {
  return {
    id: crypto.randomUUID(),
    ...(matcher !== undefined ? { matcher } : {}),
    hooks: [
      {
        id: crypto.randomUUID(),
        type: 'command',
        command: HOOK_CMD,
        statusMessage: ARGUS_STATUS_MESSAGE,
      },
    ],
  }
}

type PresetKey = 'baseline' | 'medium' | 'full'

const CLAUDE_PRESETS: Record<PresetKey, HooksConfig> = {
  baseline: {
    hooks: {
      SessionStart: [argusGroup()],
      SessionEnd: [argusGroup()],
      UserPromptSubmit: [argusGroup()],
      PostToolUse: [argusGroup('.*')],
      Stop: [argusGroup()],
    },
  },
  medium: {
    hooks: {
      SessionStart: [argusGroup()],
      SessionEnd: [argusGroup()],
      UserPromptSubmit: [argusGroup()],
      PreToolUse: [argusGroup('.*')],
      PostToolUse: [argusGroup('.*')],
      PostToolUseFailure: [argusGroup('.*')],
      StopFailure: [argusGroup()],
      Stop: [argusGroup()],
      SubagentStart: [argusGroup()],
      SubagentStop: [argusGroup()],
      PreCompact: [argusGroup()],
      PostCompact: [argusGroup()],
    },
  },
  full: {
    hooks: {
      // Session lifecycle
      SessionStart: [argusGroup()],
      Setup: [argusGroup()],
      SessionEnd: [argusGroup()],
      // Per-turn
      UserPromptSubmit: [argusGroup()],
      UserPromptExpansion: [argusGroup()],
      Stop: [argusGroup()],
      StopFailure: [argusGroup()],
      // Tool lifecycle
      PreToolUse: [argusGroup('.*')],
      PostToolUse: [argusGroup('.*')],
      PostToolUseFailure: [argusGroup('.*')],
      PostToolBatch: [argusGroup()],
      PermissionRequest: [argusGroup()],
      PermissionDenied: [argusGroup()],
      // Subagent & tasks
      SubagentStart: [argusGroup()],
      SubagentStop: [argusGroup()],
      TeammateIdle: [argusGroup()],
      TaskCreated: [argusGroup()],
      TaskCompleted: [argusGroup()],
      // File & config
      FileChanged: [argusGroup()],
      CwdChanged: [argusGroup()],
      ConfigChange: [argusGroup()],
      InstructionsLoaded: [argusGroup()],
      // Context & display
      MessageDisplay: [argusGroup()],
      Notification: [argusGroup()],
      // Compaction
      PreCompact: [argusGroup()],
      PostCompact: [argusGroup()],
      // Worktree
      WorktreeCreate: [argusGroup()],
      WorktreeRemove: [argusGroup()],
      // MCP elicitation
      Elicitation: [argusGroup()],
      ElicitationResult: [argusGroup()],
    },
  },
}

// Codex event set is smaller — no SessionEnd, PostToolUseFailure, StopFailure in its hook list.
// Baseline and Medium share the same events; Full adds PermissionRequest.
const CODEX_PRESETS: Record<PresetKey, HooksConfig> = {
  baseline: {
    hooks: {
      SessionStart: [argusGroup()],
      UserPromptSubmit: [argusGroup()],
      PostToolUse: [argusGroup()],
      Stop: [argusGroup()],
    },
  },
  medium: {
    hooks: {
      SessionStart: [argusGroup()],
      UserPromptSubmit: [argusGroup()],
      PreToolUse: [argusGroup('.*')],
      PostToolUse: [argusGroup()],
      Stop: [argusGroup()],
      SubagentStart: [argusGroup()],
      SubagentStop: [argusGroup()],
      PreCompact: [argusGroup()],
      PostCompact: [argusGroup()],
    },
  },
  full: {
    hooks: {
      SessionStart: [argusGroup()],
      UserPromptSubmit: [argusGroup()],
      PreToolUse: [argusGroup('.*')],
      PermissionRequest: [argusGroup()],
      PostToolUse: [argusGroup()],
      Stop: [argusGroup()],
      SubagentStart: [argusGroup()],
      SubagentStop: [argusGroup()],
      PreCompact: [argusGroup()],
      PostCompact: [argusGroup()],
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

export function applyPreset(current: HooksConfig, preset: HooksConfig): HooksConfig {
  const merged = removeArgusHooks(current)
  for (const [eventType, presetGroups] of Object.entries(preset.hooks)) {
    const existing = merged.hooks[eventType] ?? []
    merged.hooks[eventType] = [...existing, ...presetGroups]
  }
  return merged
}

export function removeArgusHooks(current: HooksConfig): HooksConfig {
  const cleaned: HooksConfig['hooks'] = {}
  for (const [eventType, groups] of Object.entries(current.hooks)) {
    const filteredGroups = groups
      .map((g) => ({
        ...g,
        hooks: g.hooks.filter((e) => e.statusMessage !== ARGUS_STATUS_MESSAGE),
      }))
      .filter((g) => g.hooks.length > 0)
    if (filteredGroups.length > 0) {
      cleaned[eventType] = filteredGroups
    }
  }
  return { hooks: cleaned }
}

export function hasAnyArgusHooks(config: HooksConfig): boolean {
  return Object.values(config.hooks).some((groups) =>
    groups.some((g) => g.hooks.some((e) => e.statusMessage === ARGUS_STATUS_MESSAGE))
  )
}

// Total hook event types available per agent (used as denominator in Custom (X/Y) label)
const AGENT_EVENT_TOTALS: Record<AgentKey, number> = {
  claudecode: 30,
  codex: 10,
}

/**
 * Returns a human-readable label for the hook config status of an agent.
 * - "Configured (X/Y)" when argus-managed hooks exist.
 *   X = argus-managed event count; Y = total available events for this agent.
 * - "Configured" when hooks exist but none are argus-managed (manual setup).
 * - "Missing" when no hooks are configured at all.
 */
export function detectHookConfigLabel(agent: AgentKey, config: HooksConfig): string {
  const anyEvents = Object.values(config.hooks).some((groups) =>
    groups.some((g) => g.hooks.length > 0)
  )
  if (!anyEvents) return 'Missing'

  const argusEventTypes = new Set(
    Object.entries(config.hooks)
      .filter(([, groups]) =>
        groups.some((g) => g.hooks.some((e) => e.statusMessage === ARGUS_STATUS_MESSAGE))
      )
      .map(([eventType]) => eventType)
  )

  if (argusEventTypes.size === 0) return 'Configured'

  const total = AGENT_EVENT_TOTALS[agent]
  return `Configured (${argusEventTypes.size}/${total})`
}
