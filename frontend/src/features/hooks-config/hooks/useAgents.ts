import { useCallback, useEffect, useRef, useState } from 'react'

// AgentStatus mirrors agentspec.Status from the backend (GET /api/agents).
export type AgentStatus = {
  id: string
  display_name: string
  docs_url: string
  config_kind: string
  hooks_config_path: string
  editing_supported: boolean
  timeout_unit?: string
  supports_matcher?: boolean
  installed: boolean
  hooks_configured: boolean
  events?: string[]
}

// The two original agents stay enabled out of the box, matching argus's
// pre-multi-agent behavior. Used as a fallback when /api/agents is unavailable.
const DEFAULT_ENABLED = ['claudecode', 'codex']

export type UseAgents = {
  agents: AgentStatus[]
  enabled: string[]
  loading: boolean
  error: string | null
  reload: () => void
  enableAgent: (id: string) => Promise<void>
  disableAgent: (id: string) => Promise<void>
}

export function useAgents(): UseAgents {
  const [agents, setAgents] = useState<AgentStatus[]>([])
  const [enabled, setEnabled] = useState<string[]>(DEFAULT_ENABLED)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    fetch('/api/agents')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ agents?: AgentStatus[]; enabled?: string[] }>
      })
      .then((data) => {
        if (!mounted.current) return
        setAgents(Array.isArray(data.agents) ? data.agents : [])
        // Respect an explicitly empty enabled set (the user removed every
        // agent); only fall back to defaults when the field is missing.
        setEnabled(Array.isArray(data.enabled) ? data.enabled : DEFAULT_ENABLED)
        setError(null)
      })
      .catch((err: unknown) => {
        if (!mounted.current) return
        // Fall back to the two core agents so the page always renders.
        setAgents([])
        setEnabled(DEFAULT_ENABLED)
        setError(err instanceof Error ? err.message : 'Failed to load agents')
      })
      .finally(() => {
        if (mounted.current) setLoading(false)
      })

    return () => {
      mounted.current = false
    }
  }, [reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  const enableAgent = useCallback(async (id: string) => {
    const res = await fetch('/api/agents/enabled', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (!res.ok) throw new Error((await res.text()).trim() || `HTTP ${res.status}`)
    const data = (await res.json()) as { enabled?: string[] }
    if (Array.isArray(data.enabled)) setEnabled(data.enabled)
  }, [])

  const disableAgent = useCallback(async (id: string) => {
    const res = await fetch(`/api/agents/enabled?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error((await res.text()).trim() || `HTTP ${res.status}`)
    const data = (await res.json()) as { enabled?: string[] }
    if (Array.isArray(data.enabled)) setEnabled(data.enabled)
  }, [])

  return { agents, enabled, loading, error, reload, enableAgent, disableAgent }
}
