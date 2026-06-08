import type { AgentKey } from './types'

const BASE_CC = {
  session_id: 'sim-abc123',
  transcript_path: '/Users/dev/.claude/projects/-Users-dev-project/sim.jsonl',
  cwd: '/Users/dev/project',
}

const BASE_CODEX = {
  session_id: 'sim-abc123',
  transcript_path: null,
  cwd: '/Users/dev/project',
  model: 'codex-mini-latest',
  permission_mode: 'default',
}

export const HOOK_TEMPLATES: Record<AgentKey, Record<string, object>> = {
  claudecode: {
    SessionStart: {
      ...BASE_CC,
      hook_event_name: 'SessionStart',
      source: 'startup',
      model: 'claude-sonnet-4-6',
    },
    Setup: { ...BASE_CC, hook_event_name: 'Setup', trigger: 'init' },
    SessionEnd: { ...BASE_CC, hook_event_name: 'SessionEnd', reason: 'clear' },
    UserPromptSubmit: {
      ...BASE_CC,
      hook_event_name: 'UserPromptSubmit',
      prompt: 'write a hello world in Go',
      permission_mode: 'default',
    },
    UserPromptExpansion: {
      ...BASE_CC,
      hook_event_name: 'UserPromptExpansion',
      command_name: 'gsd-debug',
      command_input: '/gsd-debug auth bug',
      expanded_prompt: 'Debug the auth bug...',
    },
    PreToolUse: {
      ...BASE_CC,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      permission_mode: 'default',
      effort: { level: 'medium' },
    },
    PostToolUse: {
      ...BASE_CC,
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      tool_output: 'PASS: 42 tests passed',
      permission_mode: 'default',
      effort: { level: 'medium' },
    },
    PostToolUseFailure: {
      ...BASE_CC,
      hook_event_name: 'PostToolUseFailure',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      error: 'command not found: npm',
      effort: { level: 'medium' },
    },
    PostToolBatch: {
      ...BASE_CC,
      hook_event_name: 'PostToolBatch',
      tool_calls: [
        {
          tool_name: 'Read',
          tool_input: { file_path: '/app/main.go' },
          tool_output: 'package main',
          status: 'success',
        },
      ],
      effort: { level: 'medium' },
    },
    PermissionRequest: {
      ...BASE_CC,
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf dist/' },
      permission_mode: 'default',
      permission_type: 'bash_command',
    },
    PermissionDenied: {
      ...BASE_CC,
      hook_event_name: 'PermissionDenied',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf dist/' },
      reason: 'user denied',
    },
    Stop: {
      ...BASE_CC,
      hook_event_name: 'Stop',
      effort: { level: 'medium' },
      permission_mode: 'default',
    },
    StopFailure: {
      ...BASE_CC,
      hook_event_name: 'StopFailure',
      error_type: 'rate_limit',
      error_message: 'Rate limit exceeded. Retry after 60s.',
    },
    SubagentStart: {
      ...BASE_CC,
      hook_event_name: 'SubagentStart',
      agent_type: 'Explore',
      agent_id: 'sub-xyz789',
    },
    SubagentStop: {
      ...BASE_CC,
      hook_event_name: 'SubagentStop',
      agent_type: 'Explore',
      agent_id: 'sub-xyz789',
      effort: { level: 'medium' },
    },
    TeammateIdle: { ...BASE_CC, hook_event_name: 'TeammateIdle', agent_type: 'Explore' },
    TaskCreated: {
      ...BASE_CC,
      hook_event_name: 'TaskCreated',
      task_id: 'task-001',
      task_title: 'Fix authentication bug',
    },
    TaskCompleted: {
      ...BASE_CC,
      hook_event_name: 'TaskCompleted',
      task_id: 'task-001',
      task_title: 'Fix authentication bug',
    },
    FileChanged: {
      ...BASE_CC,
      hook_event_name: 'FileChanged',
      file_path: '/Users/dev/project/src/auth.go',
      change_type: 'modified',
    },
    CwdChanged: {
      ...BASE_CC,
      hook_event_name: 'CwdChanged',
      new_cwd: '/Users/dev/project/frontend',
      previous_cwd: '/Users/dev/project',
    },
    ConfigChange: {
      ...BASE_CC,
      hook_event_name: 'ConfigChange',
      source: 'project_settings',
      changed_keys: ['hooks'],
    },
    InstructionsLoaded: {
      ...BASE_CC,
      hook_event_name: 'InstructionsLoaded',
      file_path: '/Users/dev/project/CLAUDE.md',
      memory_type: 'Project',
      load_reason: 'session_start',
    },
    MessageDisplay: {
      ...BASE_CC,
      hook_event_name: 'MessageDisplay',
      message_text: "I've analyzed the codebase and found 3 potential issues.",
    },
    Notification: {
      ...BASE_CC,
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
      message: 'Allow Bash(npm test)?',
    },
    PreCompact: { ...BASE_CC, hook_event_name: 'PreCompact', trigger: 'auto' },
    PostCompact: { ...BASE_CC, hook_event_name: 'PostCompact', trigger: 'auto' },
    WorktreeCreate: {
      ...BASE_CC,
      hook_event_name: 'WorktreeCreate',
      isolation_method: 'worktree',
      base_path: '/Users/dev/project/.worktrees',
    },
    WorktreeRemove: {
      ...BASE_CC,
      hook_event_name: 'WorktreeRemove',
      worktree_path: '/Users/dev/project/.worktrees/agent-abc',
    },
    Elicitation: {
      ...BASE_CC,
      hook_event_name: 'Elicitation',
      server_name: 'github',
      tool_name: 'create_pr',
      form_schema: { title: { type: 'string' } },
      tool_input: {},
    },
    ElicitationResult: {
      ...BASE_CC,
      hook_event_name: 'ElicitationResult',
      server_name: 'github',
      tool_name: 'create_pr',
      form_data: { title: 'Fix auth bug' },
    },
  },
  codex: {
    SessionStart: { ...BASE_CODEX, hook_event_name: 'SessionStart', source: 'startup' },
    UserPromptSubmit: {
      ...BASE_CODEX,
      hook_event_name: 'UserPromptSubmit',
      turn_id: 'turn-001',
      prompt: 'write a hello world in Go',
    },
    PreToolUse: {
      ...BASE_CODEX,
      hook_event_name: 'PreToolUse',
      turn_id: 'turn-001',
      tool_name: 'bash',
      tool_use_id: 'tool-abc',
      tool_input: { cmd: 'npm test' },
    },
    PermissionRequest: {
      ...BASE_CODEX,
      hook_event_name: 'PermissionRequest',
      turn_id: 'turn-001',
      tool_name: 'bash',
      tool_input: { cmd: 'rm -rf dist/', description: 'Delete build artifacts' },
    },
    PostToolUse: {
      ...BASE_CODEX,
      hook_event_name: 'PostToolUse',
      turn_id: 'turn-001',
      tool_name: 'bash',
      tool_use_id: 'tool-abc',
      tool_input: { cmd: 'npm test' },
      tool_response: { output: 'PASS: 42 tests passed', exit_code: 0 },
    },
    Stop: {
      ...BASE_CODEX,
      hook_event_name: 'Stop',
      turn_id: 'turn-001',
      stop_hook_active: false,
      last_assistant_message: 'Done! The tests pass.',
    },
    SubagentStart: {
      ...BASE_CODEX,
      hook_event_name: 'SubagentStart',
      turn_id: 'turn-001',
      agent_id: 'sub-xyz789',
      agent_type: 'researcher',
    },
    SubagentStop: {
      ...BASE_CODEX,
      hook_event_name: 'SubagentStop',
      turn_id: 'turn-001',
      agent_id: 'sub-xyz789',
      agent_type: 'researcher',
      stop_hook_active: false,
      agent_transcript_path: null,
      last_assistant_message: null,
    },
    PreCompact: {
      ...BASE_CODEX,
      hook_event_name: 'PreCompact',
      turn_id: 'turn-001',
      trigger: 'auto',
    },
    PostCompact: {
      ...BASE_CODEX,
      hook_event_name: 'PostCompact',
      turn_id: 'turn-001',
      trigger: 'auto',
    },
  },
}

export function getTemplate(agent: AgentKey, eventType: string): object {
  return (
    HOOK_TEMPLATES[agent][eventType] ?? {
      hook_event_name: eventType,
      session_id: 'sim-abc123',
      cwd: '/Users/dev/project',
    }
  )
}
