import type { AgentConfig } from '../types'
import { AnthropicLogo } from '../logos'

export const claudeCodeAgent: AgentConfig = {
  id: 'claudecode',
  label: 'Claude Code',
  badgeClass: 'claude',
  Logo: AnthropicLogo,
  matchesEvent: (event) => Boolean(event.transcript_path?.includes('/.claude/')),
  buildUsageItems: (usage, formatTokens) => [
    {
      cls: 'usage-in',
      label: `↓${formatTokens(usage.input_tokens)}`,
      tip: `Input tokens: ${usage.input_tokens.toLocaleString()}\nFresh (non-cached) tokens sent to Claude. Low because the full context is cached each turn.`,
    },
    {
      cls: 'usage-out',
      label: `↑${formatTokens(usage.output_tokens)}`,
      tip: `Output tokens: ${usage.output_tokens.toLocaleString()}\nTotal tokens Claude generated across all ${usage.turns} turns.`,
    },
    ...(usage.cache_read_tokens > 0
      ? [
          {
            cls: 'usage-cache',
            label: `⚡${formatTokens(usage.cache_read_tokens)}`,
            tip: `Cache read: ${usage.cache_read_tokens.toLocaleString()}\nTokens served from cache instead of re-processed. Large because the full history is cache-hit every turn.`,
          },
        ]
      : []),
    ...(usage.cache_creation_tokens > 0
      ? [
          {
            cls: 'usage-cache-write',
            label: `✎${formatTokens(usage.cache_creation_tokens)}`,
            tip: `Cache write: ${usage.cache_creation_tokens.toLocaleString()}\nTokens written into the prompt cache during this session.`,
          },
        ]
      : []),
    {
      cls: 'usage-turns',
      label: `${usage.turns}t`,
      tip: `${usage.turns} assistant turns in this session`,
    },
  ],
}
