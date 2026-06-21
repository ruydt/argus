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

// The session-start activate hook starts the Argus server (if not already up)
// when the agent begins a session. $HOME is expanded by the agent's shell at
// run time, so the preset is portable across machines. Tagged argus-managed so
// it is cleaned + re-added with the rest of the preset.
const ACTIVATE_CMD = 'node "$HOME/.argus/hooks/argus-activate.js"'

function activateGroup(): HookGroup {
  return {
    id: crypto.randomUUID(),
    hooks: [
      {
        id: crypto.randomUUID(),
        type: 'command',
        command: ACTIVATE_CMD,
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

// --- Presets for the JSON-config agents ------------------------------------
// Each tier wires the argus ingest hook to a subset of the agent's OWN events
// (names mirror backend/internal/agentspec). Tool events take a `.*` match-all
// matcher where the agent has matchers; Windsurf has none, so it passes an
// empty tool set and no matcher is written.

type PresetSpec = { event: string; matcher?: string }

function buildPreset(specs: PresetSpec[]): HooksConfig {
  const hooks: HooksConfig['hooks'] = {}
  for (const s of specs) {
    hooks[s.event] = [argusGroup(s.matcher)]
  }
  return { hooks }
}

function agentPresets(
  all: string[],
  tool: Set<string>,
  baseline: string[],
  mediumAdds: string[]
): Record<PresetKey, HooksConfig> {
  const spec = (e: string): PresetSpec => (tool.has(e) ? { event: e, matcher: '.*' } : { event: e })
  return {
    baseline: buildPreset(baseline.map(spec)),
    medium: buildPreset([...baseline, ...mediumAdds].map(spec)),
    full: buildPreset(all.map(spec)),
  }
}

const CURSOR_PRESETS = agentPresets(
  [
    'beforeSubmitPrompt',
    'beforeShellExecution',
    'afterShellExecution',
    'beforeMCPExecution',
    'afterMCPExecution',
    'beforeReadFile',
    'afterFileEdit',
    'stop',
    'sessionStart',
    'sessionEnd',
    'preToolUse',
    'postToolUse',
    'postToolUseFailure',
    'subagentStart',
    'subagentStop',
    'preCompact',
  ],
  new Set([
    'preToolUse',
    'postToolUse',
    'postToolUseFailure',
    'beforeShellExecution',
    'afterShellExecution',
    'beforeMCPExecution',
    'afterMCPExecution',
    'beforeReadFile',
    'afterFileEdit',
  ]),
  ['sessionStart', 'sessionEnd', 'beforeSubmitPrompt', 'postToolUse', 'stop'],
  ['preToolUse', 'postToolUseFailure', 'subagentStart', 'subagentStop', 'preCompact']
)

const ANTIGRAVITY_PRESETS = agentPresets(
  [
    'PreToolUse',
    'PostToolUse',
    'PreInvocation',
    'PostInvocation',
    'SessionStart',
    'SessionEnd',
    'Stop',
    'Notification',
  ],
  new Set(['PreToolUse', 'PostToolUse']),
  ['SessionStart', 'SessionEnd', 'PostToolUse', 'Stop'],
  ['PreToolUse', 'PreInvocation', 'PostInvocation', 'Notification']
)

const COPILOT_PRESETS = agentPresets(
  [
    'sessionStart',
    'sessionEnd',
    'userPromptSubmitted',
    'preToolUse',
    'postToolUse',
    'postToolUseFailure',
    'permissionRequest',
    'preCompact',
    'agentStop',
    'subagentStart',
    'subagentStop',
    'errorOccurred',
    'notification',
  ],
  new Set(['preToolUse', 'postToolUse', 'postToolUseFailure']),
  ['sessionStart', 'sessionEnd', 'userPromptSubmitted', 'postToolUse', 'agentStop'],
  [
    'preToolUse',
    'postToolUseFailure',
    'permissionRequest',
    'subagentStart',
    'subagentStop',
    'preCompact',
  ]
)

const QWEN_PRESETS = agentPresets(
  [
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'UserPromptSubmit',
    'SessionStart',
    'SessionEnd',
    'Stop',
    'StopFailure',
    'SubagentStart',
    'SubagentStop',
    'PreCompact',
    'PostCompact',
    'Notification',
    'PermissionRequest',
    'TodoCreated',
    'TodoCompleted',
  ],
  new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']),
  ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PostToolUse', 'Stop'],
  [
    'PreToolUse',
    'PostToolUseFailure',
    'StopFailure',
    'SubagentStart',
    'SubagentStop',
    'PreCompact',
    'PostCompact',
  ]
)

const CONTINUE_PRESETS = agentPresets(
  [
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'PermissionRequest',
    'UserPromptSubmit',
    'SessionStart',
    'SessionEnd',
    'Stop',
    'Notification',
    'SubagentStart',
    'SubagentStop',
    'PreCompact',
    'ConfigChange',
    'TeammateIdle',
    'TaskCompleted',
    'WorktreeCreate',
    'WorktreeRemove',
  ],
  new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']),
  ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PostToolUse', 'Stop'],
  [
    'PreToolUse',
    'PostToolUseFailure',
    'PermissionRequest',
    'SubagentStart',
    'SubagentStop',
    'PreCompact',
  ]
)

const AUGMENT_PRESETS = agentPresets(
  ['PreToolUse', 'PostToolUse', 'Stop', 'SessionStart', 'SessionEnd', 'Notification'],
  new Set(['PreToolUse', 'PostToolUse']),
  ['SessionStart', 'SessionEnd', 'PostToolUse', 'Stop'],
  ['PreToolUse', 'Notification']
)

const WINDSURF_PRESETS = agentPresets(
  [
    'pre_read_code',
    'post_read_code',
    'pre_write_code',
    'post_write_code',
    'pre_run_command',
    'post_run_command',
    'pre_mcp_tool_use',
    'post_mcp_tool_use',
    'pre_user_prompt',
    'post_cascade_response',
    'post_setup_worktree',
  ],
  new Set(), // Windsurf has no matcher concept
  ['pre_user_prompt', 'post_cascade_response', 'post_run_command', 'post_write_code'],
  ['pre_run_command', 'pre_write_code', 'post_read_code', 'post_mcp_tool_use']
)

const CRUSH_PRESETS = agentPresets(['PreToolUse'], new Set(['PreToolUse']), ['PreToolUse'], [])

const GOOSE_PRESETS = agentPresets(
  [
    'SessionStart',
    'SessionEnd',
    'Stop',
    'UserPromptSubmit',
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'BeforeReadFile',
    'AfterFileEdit',
    'BeforeShellExecution',
    'AfterShellExecution',
  ],
  new Set([
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'BeforeReadFile',
    'AfterFileEdit',
    'BeforeShellExecution',
    'AfterShellExecution',
  ]),
  ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PostToolUse', 'Stop'],
  ['PreToolUse', 'PostToolUseFailure', 'AfterFileEdit', 'AfterShellExecution']
)

// Each agent's own session-start event name (mirrors backend/internal/agentspec).
// Agents without a session-start event (Windsurf, Crush) are omitted — they get
// no activate hook.
const SESSION_START_EVENT: Partial<Record<AgentKey, string>> = {
  claudecode: 'SessionStart',
  codex: 'SessionStart',
  cursor: 'sessionStart',
  antigravity: 'SessionStart',
  copilot: 'sessionStart',
  qwen: 'SessionStart',
  continue: 'SessionStart',
  augment: 'SessionStart',
  goose: 'SessionStart',
}

// Prepend the server-activate hook to the agent's session-start event in every
// preset tier (so applying any preset also wires auto-start). The activate hook
// runs before the ingest POST so the server is up by the time events fire.
function withActivate(
  presets: Record<PresetKey, HooksConfig>,
  event: string | undefined
): Record<PresetKey, HooksConfig> {
  if (!event) return presets
  const out = {} as Record<PresetKey, HooksConfig>
  for (const key of Object.keys(presets) as PresetKey[]) {
    const cfg = presets[key]
    const groups = cfg.hooks[event]
    out[key] = groups ? { hooks: { ...cfg.hooks, [event]: [activateGroup(), ...groups] } } : cfg
  }
  return out
}

export const HOOK_PRESETS: Record<AgentKey, Record<PresetKey, HooksConfig>> = {
  claudecode: withActivate(CLAUDE_PRESETS, SESSION_START_EVENT.claudecode),
  codex: withActivate(CODEX_PRESETS, SESSION_START_EVENT.codex),
  cursor: withActivate(CURSOR_PRESETS, SESSION_START_EVENT.cursor),
  antigravity: withActivate(ANTIGRAVITY_PRESETS, SESSION_START_EVENT.antigravity),
  copilot: withActivate(COPILOT_PRESETS, SESSION_START_EVENT.copilot),
  qwen: withActivate(QWEN_PRESETS, SESSION_START_EVENT.qwen),
  continue: withActivate(CONTINUE_PRESETS, SESSION_START_EVENT.continue),
  augment: withActivate(AUGMENT_PRESETS, SESSION_START_EVENT.augment),
  windsurf: WINDSURF_PRESETS,
  crush: CRUSH_PRESETS,
  goose: withActivate(GOOSE_PRESETS, SESSION_START_EVENT.goose),
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
  cursor: 16,
  antigravity: 8,
  copilot: 13,
  qwen: 16,
  continue: 17,
  augment: 6,
  windsurf: 11,
  crush: 1,
  goose: 11,
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
  return total
    ? `Configured (${argusEventTypes.size}/${total})`
    : `Configured (${argusEventTypes.size})`
}
