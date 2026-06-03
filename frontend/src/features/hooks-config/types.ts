export type HookEntry = {
  id: string
  type: string
  command: string
  timeout?: number
  statusMessage?: string
}

export type HookGroup = {
  id: string
  matcher?: string
  hooks: HookEntry[]
}

export type HooksConfig = {
  hooks: Record<string, HookGroup[]>
}

export type AgentKey = 'claudecode' | 'codex'

export type HooksConfigState = {
  config: HooksConfig | null
  draftJSON: string
  loading: boolean
  saving: boolean
  error: string | null
  saveError: string | null
  isDirty: boolean
  setDraftJSON: (json: string) => void
  setConfig: (config: HooksConfig) => void
  save: () => Promise<void>
  reload: () => void
}
