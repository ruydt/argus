import { claudeCodeAgent } from './claudecode'
import { geminiCliAgent } from './geminicli'
import { codexAgent } from './codex'
import type { AgentConfig, EventRecord } from './types'

export const AGENTS: AgentConfig[] = [claudeCodeAgent, geminiCliAgent, codexAgent]

export function agentForEvent(event: EventRecord): AgentConfig {
  return AGENTS.find((agent) => agent.matchesEvent(event)) ?? codexAgent
}
