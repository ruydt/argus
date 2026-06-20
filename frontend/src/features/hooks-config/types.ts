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

// Agent ids are open-ended now that users can add any installed agent. The two
// original agents keep their ids ('claudecode', 'codex'); new agents use their
// registry id from GET /api/agents.
export type AgentKey = string

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
  discardChanges: () => void
  save: () => Promise<void>
  reload: () => void
}
