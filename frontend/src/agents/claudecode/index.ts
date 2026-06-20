import type { AgentConfig } from '../types'
import { AnthropicLogo } from '../logos'

export const claudeCodeAgent: AgentConfig = {
  id: 'claudecode',
  label: 'Claude Code',
  badgeClass: 'claude',
  Logo: AnthropicLogo,
  matchesEvent: (event) => Boolean(event.transcript_path?.includes('/.claude/')),
}
