import type { AgentConfig } from '../types'
import { OpenAILogo } from '../logos'

export const codexAgent: AgentConfig = {
  id: 'codex',
  label: 'Codex',
  badgeClass: 'codex',
  Logo: OpenAILogo,
  matchesEvent: () => true,
}
