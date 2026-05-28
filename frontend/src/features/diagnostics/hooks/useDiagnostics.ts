import { useCallback, useEffect, useRef, useState } from 'react'
import type { Diagnostics } from '../types'

export function useDiagnostics(): {
  data: Diagnostics | null
  loading: boolean
  refreshing: boolean
  error: string | null
  lastUpdatedAt: Date | null
  reload: () => void
} {
  const [reloadKey, setReloadKey] = useState(0)
  const [data, setData] = useState<Diagnostics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const hasDataRef = useRef(false)

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let mounted = true
    const isRefresh = reloadKey > 0 && hasDataRef.current
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    fetch('/api/diagnostics')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((json: Diagnostics) => {
        if (!mounted) return
        setData(json)
        hasDataRef.current = true
        setLastUpdatedAt(new Date())
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
