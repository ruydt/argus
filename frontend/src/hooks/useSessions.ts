import { useEffect, useState } from 'react'

export interface SessionUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  turns: number
}

export interface Session {
  session_id: string
  agent: string
  model: string
  source: string
  cwd: string
  transcript_path: string
  started_at: string
  last_seen_at: string
  usage: SessionUsage
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const fetchSessions = async () => {
      try {
        const res = await fetch('/api/sessions')
        if (res.ok) {
          const data = await res.json()
          if (mounted) {
            setSessions(data)
            setLoading(false)
          }
        }
      } catch (err) {
        console.error('Failed to fetch sessions', err)
      }
    }

    fetchSessions()
    const interval = setInterval(fetchSessions, 5000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return { sessions, loading }
}
