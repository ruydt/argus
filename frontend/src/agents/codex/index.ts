import type { AgentConfig } from '../types'
import { OpenAILogo } from '../logos'

export const codexAgent: AgentConfig = {
  id: 'codex',
  label: 'Codex',
  badgeClass: 'codex',
  Logo: OpenAILogo,
  supportsSessionUsage: true,
  buildUsageItems: (usage, formatTokens) => [
    {
      cls: 'usage-in',
      label: `↓${formatTokens(usage.input_tokens)}`,
      tip: `Input tokens: ${usage.input_tokens.toLocaleString()}\nTotal prompt tokens for this Codex session.`,
    },
    {
      cls: 'usage-out',
      label: `↑${formatTokens(usage.output_tokens)}`,
      tip: `Output tokens: ${usage.output_tokens.toLocaleString()}\nTotal model output tokens for this Codex session.`,
    },
    ...(usage.cache_read_tokens > 0
      ? [
          {
            cls: 'usage-cache',
            label: `⚡${formatTokens(usage.cache_read_tokens)}`,
            tip: `Cached input tokens: ${usage.cache_read_tokens.toLocaleString()}\nInput tokens served from cache.`,
          },
        ]
      : []),
  ],
  matchesEvent: () => true,
}
