import type { AgentConfig } from '../types'
import { GeminiLogo } from '../logos'

export const geminiCliAgent: AgentConfig = {
  id: 'geminicli',
  label: 'Gemini CLI',
  badgeClass: 'gemini',
  Logo: GeminiLogo,
  supportsSessionUsage: true,
  matchesEvent: (event) =>
    event.agent === 'geminicli' ||
    event.source === 'gemini' ||
    Boolean(event.transcript_path?.includes('/.gemini/')),
  buildUsageItems: (usage, formatTokens) => [
    {
      cls: 'usage-in',
      label: `↓${formatTokens(usage.input_tokens)}`,
      tip: `Input tokens: ${usage.input_tokens.toLocaleString()}\nTotal prompt tokens sent to Gemini.`,
    },
    {
      cls: 'usage-out',
      label: `↑${formatTokens(usage.output_tokens)}`,
      tip: `Output tokens: ${usage.output_tokens.toLocaleString()}\nTotal tokens Gemini generated across all ${usage.turns} turns.`,
    },
    ...(usage.cache_read_tokens > 0
      ? [
          {
            cls: 'usage-cache',
            label: `⚡${formatTokens(usage.cache_read_tokens)}`,
            tip: `Cache read: ${usage.cache_read_tokens.toLocaleString()}\nTokens served from cache.`,
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
