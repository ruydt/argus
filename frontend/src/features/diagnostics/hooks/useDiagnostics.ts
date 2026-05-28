import { useCallback, useEffect, useState } from 'react'
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

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let mounted = true
    const isRefresh = reloadKey > 0 && data !== null
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
        setLastUpdatedAt(new Date())
      })
      .catch(() => {
        if (!mounted) return
        setError('Could not reach /api/diagnostics')
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      mounted = false
    }
  }, [reloadKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, refreshing, error, lastUpdatedAt, reload }
}
