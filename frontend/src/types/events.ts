import type { Dispatch, SetStateAction } from 'react'

export interface CtxLine {
  num: number
  text: string
}

export interface EventRecord {
  time: string
  action: string
  path: string
  command?: string
  session?: string
  transcript_path?: string
  tool?: string
  hook_event_name?: string
  turn_id?: string
  tool_use_id?: string
  source?: string
  model?: string
  cwd?: string
  prompt?: string
  description?: string
  old_string?: string
  new_string?: string
  start_line?: number
  ctx_before?: CtxLine[]
  ctx_after?: CtxLine[]
  // new fields from expanded hook coverage
  permission_mode?: string
  response?: string
  error_message?: string
  error_type?: string
  subagent_id?: string
  subagent_type?: string
  task_id?: string
  task_title?: string
  task_description?: string
  notification_type?: string
  notification_title?: string
  notification_message?: string
  change_type?: string
  old_cwd?: string
  new_cwd?: string
  tool_calls_json?: string
  tool_result_stdout?: string
  tool_result_stderr?: string
  duration_ms?: number
  trigger?: string
  agent?: string
  normalization_status?: 'ok' | 'degraded'
  normalizer_version?: string
  agent_version?: string
  dedup_key?: string
  expansion_type?: string
  command_name?: string
  memory_type?: string
  load_reason?: string
  branch?: string
  server_name?: string
  tool_input_questions_json?: string
  permission_suggestions_json?: string
}

export interface SessionGroup {
  sessionId: string
  transcriptPath: string
  cwd: string
  events: EventRecord[]
}

export interface LayoutOutletContext {
  collapsedSessions: Set<string>
  setCollapsedSessions: Dispatch<SetStateAction<Set<string>>>
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
  isLive: boolean
  setIsLive: Dispatch<SetStateAction<boolean>>
}

export interface EventsResponse {
  events?: EventRecord[]
  has_more?: boolean
  next_cursor?: number
}
