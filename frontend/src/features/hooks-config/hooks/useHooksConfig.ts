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

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    mountedRef.current = true

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

  const normalizeConfig = useCallback((c: HooksConfig): HooksConfig => ({ hooks: c.hooks ?? {} }), [])

  const setConfig = useCallback((c: HooksConfig) => {
    const normalized = normalizeConfig(c)
    setConfigState(normalized)
    setDraftJSONState(JSON.stringify(normalized, null, 2))
  }, [normalizeConfig])

  const setDraftJSON = useCallback((json: string) => {
    setDraftJSONState(json)
    try {
      const parsed = JSON.parse(json) as HooksConfig
      setConfigState(normalizeConfig(parsed))
    } catch {
      // keep stale config; draftJSON is the live edit buffer
    }
  }, [normalizeConfig])

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
      const saved = normalizeConfig((await res.json()) as HooksConfig)
      const json = JSON.stringify(saved, null, 2)
      setConfigState(saved)
      setDraftJSONState(json)
      setSavedJSON(json)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [agent, draftJSON, normalizeConfig])

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
