import { claudeCodeAgent } from './claudecode'
import { codexAgent } from './codex'
import type { AgentConfig, EventRecord } from './types'

export const AGENTS: AgentConfig[] = [claudeCodeAgent, codexAgent]

export function agentForEvent(event: EventRecord): AgentConfig {
  return AGENTS.find((agent) => agent.matchesEvent(event)) ?? codexAgent
}
