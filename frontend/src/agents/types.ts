import type { ComponentType } from 'react'
import type { EventRecord } from '@/types'

export type { EventRecord } from '@/types'

export type AgentId = 'claudecode' | 'codex'

export type AgentConfig = {
  id: AgentId
  label: string
  badgeClass: string
  Logo: ComponentType<{ size?: number }>
  matchesEvent: (event: EventRecord) => boolean
}
