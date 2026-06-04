import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@/types/sessions'

export type { Session }

export function useSessions({ enabled = true }: { enabled?: boolean } = {}) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions')
      if (res.ok && mountedRef.current) {
        const data = await res.json()
        setSessions(data)
        setLoading(false)
      }
    } catch (err) {
      console.error('Failed to fetch sessions', err)
    }
  }, [])

  useEffect(() => {
    refresh()
    if (!enabled) return
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [enabled, refresh])

  return { sessions, loading, refresh }
}
