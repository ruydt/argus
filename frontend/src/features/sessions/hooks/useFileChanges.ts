import { useEffect, useState } from 'react'
import type { FileChangeGroup } from '@/types/sessions'

export function useFileChanges(sessionId: string | null) {
  const [groups, setGroups] = useState<FileChangeGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) {
      return
    }
    let cancelled = false
    Promise.resolve()
      .then(() => {
        if (!cancelled) {
          setGroups([])
          setLoading(true)
          setError(null)
        }
        return fetch(`/api/file-changes?session_id=${encodeURIComponent(sessionId)}`)
      })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        return res.json() as Promise<FileChangeGroup[]>
      })
      .then((data) => {
        if (!cancelled) setGroups(data ?? [])
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setGroups([])
          setError(err instanceof Error ? err.message : 'error')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  return {
    groups: sessionId ? groups : [],
    loading: sessionId ? loading : false,
    error: sessionId ? error : null,
  }
}
