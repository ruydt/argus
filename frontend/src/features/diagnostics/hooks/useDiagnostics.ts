import { useCallback, useEffect, useRef, useState } from 'react'
import type { Diagnostics } from '../types'

// Module-level cache: persists across React navigations within the same browser session.
// No TTL on the frontend — the backend 30s TTL governs data freshness.
// Cleared on full page reload (module re-evaluation) or by _resetDiagnosticsCache() in tests.
let diagnosticsCache: Diagnostics | null = null
let diagnosticsCachedAt: Date | null = null

/** Test-only: reset module-level cache between test runs. Do not call in production code. */
export function _resetDiagnosticsCache(): void {
  diagnosticsCache = null
  diagnosticsCachedAt = null
}

export function useDiagnostics(): {
  data: Diagnostics | null
  loading: boolean
  refreshing: boolean
  error: string | null
  lastUpdatedAt: Date | null
  reload: () => void
} {
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<Diagnostics | null>(() => diagnosticsCache)
  const [loading, setLoading] = useState(diagnosticsCache === null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(() => diagnosticsCachedAt)
  const hasDataRef = useRef(diagnosticsCache !== null)

  const reload = useCallback(() => {
    if (hasDataRef.current) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let mounted = true

    // Cache hit: reloadKey===0 means this is a navigation mount, not an explicit refresh.
    // Skip fetch and hydrate from module cache.
    if (reloadKey === 0 && diagnosticsCache !== null) {
      return
    }
    fetch('/api/diagnostics')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json: Diagnostics) => {
        if (!mounted) return
        diagnosticsCache = json
        diagnosticsCachedAt = new Date()
        setData(json)
        hasDataRef.current = true
        setLastUpdatedAt(diagnosticsCachedAt)
      })
      .catch((err: unknown) => {
        if (!mounted) return
        const msg = err instanceof Error ? err.message : 'Could not reach /api/diagnostics'
        setError(msg)
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      mounted = false
    }
  }, [reloadKey])

  return { data, loading, refreshing, error, lastUpdatedAt, reload }
}
