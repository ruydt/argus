import { useEffect, useState } from 'react'

export interface TimelineBucket {
  date: string
  count: number
}

export interface ActionCount {
  name: string
  value: number
}

export interface AgentModelUsage {
  agent: string
  model: string
  input: number
  output: number
}

export interface DashboardStats {
  total_sessions: number
  total_events: number
  total_input_tokens: number
  total_output_tokens: number
  timeline: TimelineBucket[]
  top_actions: ActionCount[]
  agent_usage: AgentModelUsage[]
}

export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/dashboard/stats')
        if (res.ok) {
          const data = await res.json()
          if (mounted) {
            setStats(data)
            setLoading(false)
          }
        }
      } catch (err) {
        console.error('Failed to fetch dashboard stats', err)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 5000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return { stats, loading }
}
