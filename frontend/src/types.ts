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
}

export interface SessionUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  turns: number
}

export interface SessionGroup {
  sessionId: string
  transcriptPath: string
  events: EventRecord[]
}

export interface LayoutOutletContext {
  collapsedSessions: Set<string>
  setCollapsedSessions: Dispatch<SetStateAction<Set<string>>>
  sessionUsage: Record<string, SessionUsage>
  setSessionUsage: Dispatch<SetStateAction<Record<string, SessionUsage>>>
}

export interface EventsResponse {
  events?: EventRecord[]
}

export interface OpenAIBucketResult {
  num_model_requests?: number
  input_tokens?: number
  output_tokens?: number
  model?: string | null
  api_key_id?: string | null
}

export interface OpenAIBucket {
  start_time: number
  end_time: number
  results?: OpenAIBucketResult[]
}

export interface OpenAIUsageResponse {
  data?: OpenAIBucket[]
  has_more?: boolean
  next_page?: string | null
  page?: string
  error?: { message?: string }
}

export interface UsageDailyPoint {
  date: string
  tokens: number
  requests: number
  models: Record<string, number>
}

export interface UsageStats {
  reqs: number
  toks: number
  models: Record<string, number>
  keys: Record<string, number>
  daily: UsageDailyPoint[]
}

export interface TooltipState {
  text: string
  x: number
  y: number
}
