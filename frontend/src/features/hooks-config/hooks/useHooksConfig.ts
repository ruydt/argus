import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentKey, HooksConfig, HooksConfigState } from '../types'

export function useHooksConfig(agent: AgentKey): HooksConfigState {
  const [config, setConfigState] = useState<HooksConfig | null>(null)
  const [draftJSON, setDraftJSONState] = useState<string>('')
  const [savedJSON, setSavedJSON] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const mountedRef = useRef(true)

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    setError(null)

    fetch(`/api/hooks-config?agent=${agent}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<HooksConfig>
      })
      .then((data) => {
        if (!mountedRef.current) return
        const json = JSON.stringify(data, null, 2)
        setConfigState(data)
        setDraftJSONState(json)
        setSavedJSON(json)
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return
        setError(err instanceof Error ? err.message : 'Failed to load hooks config')
      })
      .finally(() => {
        if (!mountedRef.current) return
        setLoading(false)
      })

    return () => {
      mountedRef.current = false
    }
  }, [agent, reloadKey])

  const setConfig = useCallback((c: HooksConfig) => {
    setConfigState(c)
    setDraftJSONState(JSON.stringify(c, null, 2))
  }, [])

  const setDraftJSON = useCallback((json: string) => {
    setDraftJSONState(json)
    try {
      const parsed = JSON.parse(json) as HooksConfig
      setConfigState(parsed)
    } catch {
      // keep stale config; draftJSON is the live edit buffer
    }
  }, [])

  const save = useCallback(async () => {
    setSaveError(null)
    setSaving(true)
    try {
      const parsed = JSON.parse(draftJSON) as HooksConfig
      const res = await fetch(`/api/hooks-config?agent=${agent}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text.trim() || `HTTP ${res.status}`)
      }
      const saved = (await res.json()) as HooksConfig
      const json = JSON.stringify(saved, null, 2)
      setConfigState(saved)
      setDraftJSONState(json)
      setSavedJSON(json)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [agent, draftJSON])

  return {
    config,
    draftJSON,
    loading,
    saving,
    error,
    saveError,
    isDirty: draftJSON !== savedJSON,
    setDraftJSON,
    setConfig,
    save,
    reload,
  }
}
