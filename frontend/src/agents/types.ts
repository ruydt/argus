import type { ComponentType } from 'react'
import type { EventRecord, SessionUsage } from '@/types'

export type { EventRecord, SessionUsage } from '@/types'

export type AgentId = 'claudecode' | 'codex' | 'geminicli'

export type UsageTooltipItem = {
  cls: string
  label: string
  tip: string
}

export type AgentConfig = {
  id: AgentId
  label: string
  badgeClass: string
  Logo: ComponentType<{ size?: number }>
  supportsSessionUsage: boolean
  matchesEvent: (event: EventRecord) => boolean
  buildUsageItems?: (usage: SessionUsage, formatTokens: (n: number) => string) => UsageTooltipItem[]
}
