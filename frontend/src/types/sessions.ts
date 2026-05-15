export interface SessionUsageType {
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  turns: number
}

export interface Session {
  session_id: string
  agent: string
  model: string
  source: string
  cwd: string
  transcript_path: string
  started_at: string
  last_seen_at: string
  ended_at?: string
  usage: SessionUsageType
}

export interface Project {
  cwd: string
  name: string
  session_count: number
  last_activity: string
  total_tokens: number
  agents: string[]
  live_count: number
}

export interface SessionTreeNode {
  session: Session
  agent_id?: string
  children: SessionTreeNode[]
}
