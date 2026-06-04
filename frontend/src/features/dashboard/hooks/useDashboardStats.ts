import { useCallback, useEffect, useMemo, useState } from 'react'

export interface TimelineBucket {
  date: string
  count: number
}

export interface ActionCount {
  name: string
  value: number
}

export interface AgentTimelineBucket {
  date: string
  agent: string
  count: number
}

export interface TokenTimelineBucket {
  date: string
  input: number
  output: number
  cache_creation: number
  cache_read: number
}

export interface TokenTimelineAgentBucket {
  date: string
  agent: string
  total: number
}

export interface AgentModelUsage {
  provider: string
  agent: string
  model: string
  input: number
  output: number
  cache_creation: number
  cache_read: number
}

export interface DashboardSessionModelUsage {
  provider: string
  agent: string
  model: string
  input: number
  output: number
  cache_creation: number
  cache_read: number
  turns: number
}

export interface DashboardSessionUsage {
  session_id: string
  agent: string
  provider: string
  model: string
  started_at: string
  last_seen_at: string
  input: number
  output: number
  models: DashboardSessionModelUsage[]
}

export interface DashboardStats {
  total_sessions: number
  total_events: number
  total_input_tokens: number
  total_output_tokens: number
  timeline_granularity: 'hour' | 'day'
  timeline: TimelineBucket[]
  timeline_by_agent: AgentTimelineBucket[]
  token_timeline: TokenTimelineBucket[]
  token_timeline_by_agent: TokenTimelineAgentBucket[]
  top_actions: ActionCount[]
  agent_usage: AgentModelUsage[]
  session_usage: DashboardSessionUsage[]
}

const statsCache = new Map<string, DashboardStats>()

function normalizeDashboardStats(raw: Partial<DashboardStats>): DashboardStats {
  const agentUsage = Array.isArray(raw.agent_usage)
    ? raw.agent_usage.map((usage) => ({
        provider: usage.provider || providerForAgent(usage.agent),
        agent: usage.agent || 'unknown',
        model: usage.model || '',
        input: Number(usage.input || 0),
        output: Number(usage.output || 0),
        cache_creation: Number(usage.cache_creation || 0),
        cache_read: Number(usage.cache_read || 0),
      }))
    : []

  const sessionUsage = Array.isArray(raw.session_usage)
    ? raw.session_usage.map((session) => ({
        session_id: session.session_id || '',
        agent: session.agent || 'unknown',
        provider: session.provider || providerForAgent(session.agent),
        model: session.model || '',
        started_at: session.started_at || '',
        last_seen_at: session.last_seen_at || '',
        input: Number(session.input || 0),
        output: Number(session.output || 0),
        models: Array.isArray(session.models)
          ? session.models.map((model) => ({
              provider: model.provider || providerForAgent(model.agent || session.agent),
              agent: model.agent || session.agent || 'unknown',
              model: model.model || '',
              input: Number(model.input || 0),
              output: Number(model.output || 0),
              cache_creation: Number(model.cache_creation || 0),
              cache_read: Number(model.cache_read || 0),
              turns: Number(model.turns || 0),
            }))
          : [],
      }))
    : []

  const tokenTimeline = Array.isArray(raw.token_timeline)
    ? raw.token_timeline.map((b) => ({
        date: b.date || '',
        input: Number(b.input || 0),
        output: Number(b.output || 0),
        cache_creation: Number(b.cache_creation || 0),
        cache_read: Number(b.cache_read || 0),
      }))
    : []

  const tokenTimelineByAgent = Array.isArray(raw.token_timeline_by_agent)
    ? raw.token_timeline_by_agent.map((b) => ({
        date: b.date || '',
        agent: b.agent || 'unknown',
        total: Number(b.total || 0),
      }))
    : []

  return {
    total_sessions: Number(raw.total_sessions || 0),
    total_events: Number(raw.total_events || 0),
    total_input_tokens: Number(raw.total_input_tokens || 0),
    total_output_tokens: Number(raw.total_output_tokens || 0),
    timeline_granularity: raw.timeline_granularity === 'day' ? 'day' : 'hour',
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    token_timeline: tokenTimeline,
    token_timeline_by_agent: tokenTimelineByAgent,
    timeline_by_agent: Array.isArray(raw.timeline_by_agent)
      ? raw.timeline_by_agent.map((bucket) => ({
          date: bucket.date || '',
          agent: bucket.agent || 'unknown',
          count: Number(bucket.count || 0),
        }))
      : [],
    top_actions: Array.isArray(raw.top_actions) ? raw.top_actions : [],
    agent_usage: agentUsage,
    session_usage: sessionUsage,
  }
}

export function useDashboardStats(query: string = '') {
  const cacheKey = useMemo(() => query || 'all', [query])
  const [reloadKey, setReloadKey] = useState(0)
  const [snapshot, setSnapshot] = useState<{ cacheKey: string; stats: DashboardStats | null }>(
    () => ({
      cacheKey,
      stats: statsCache.get(cacheKey) ?? null,
    })
  )
  const [fetchingKey, setFetchingKey] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const stats = snapshot.cacheKey === cacheKey ? snapshot.stats : (statsCache.get(cacheKey) ?? null)
  const loading = !stats && fetchingKey === cacheKey

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1)
  }, [])

  useEffect(() => {
    let mounted = true
    const cached = statsCache.get(cacheKey) ?? null

    const fetchStats = async (showRefreshing = false) => {
      await Promise.resolve()
      if (!mounted) return
      setFetchingKey(cacheKey)
      if (showRefreshing && cached) {
        setRefreshing(true)
      }
      try {
        const params = query ? `?${query}` : ''
        const res = await fetch(`/api/dashboard/stats${params}`)
        if (res.ok) {
          const data = normalizeDashboardStats((await res.json()) as Partial<DashboardStats>)
          statsCache.set(cacheKey, data)
          if (mounted) {
            setSnapshot({ cacheKey, stats: data })
          }
        }
      } catch (err) {
        console.error('Failed to fetch dashboard stats', err)
      } finally {
        if (mounted) {
          setFetchingKey(null)
          setRefreshing(false)
        }
      }
    }

    fetchStats(reloadKey > 0)
    return () => {
      mounted = false
    }
  }, [cacheKey, query, reloadKey])

  return { stats, loading, refreshing, reload }
}

function providerForAgent(agent?: string) {
  switch (agent) {
    case 'codex':
      return 'openai'
    case 'claudecode':
      return 'anthropic'
    default:
      return agent || 'unknown'
  }
}
