import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Dispatch, SetStateAction } from 'react'
import type { EventRecord } from '@/types/events'
import type { Project } from '@/types/sessions'

export function useEventFilters(
  events: EventRecord[],
  searchQuery: string,
  setSearchQuery: Dispatch<SetStateAction<string>>,
  sessionFilterOverride = '',
  timeRange: string,
  setTimeRange: Dispatch<SetStateAction<string>>,
  customStart: string,
  setCustomStart: Dispatch<SetStateAction<string>>,
  customEnd: string,
  setCustomEnd: Dispatch<SetStateAction<string>>,
  isLive = true
) {
  const [searchParams] = useSearchParams()
  const sessionFilter = sessionFilterOverride || searchParams.get('session') || ''

  const [actionFilter, setActionFilter] = useState('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('newest')

  const [projectFilter, setProjectFilter] = useState('all')

  const availableAgents = useMemo(() => {
    const agents = new Set<string>()
    for (const e of events) {
      if (e.agent) agents.add(e.agent)
    }
    return Array.from(agents).sort()
  }, [events])

  const [availableProjects, setAvailableProjects] = useState<string[]>([])
  const projectsMountedRef = useRef(true)

  useEffect(() => {
    projectsMountedRef.current = true
    return () => {
      projectsMountedRef.current = false
    }
  }, [])

  const refreshProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      if (!res.ok || !projectsMountedRef.current) return
      const data = (await res.json()) as { projects?: Project[] }
      if (projectsMountedRef.current)
        setAvailableProjects((data.projects ?? []).map((p) => p.cwd).filter(Boolean))
    } catch {
      // non-fatal — dropdown stays with last known list
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshProjects()
    }, 0)
    const interval = isLive
      ? window.setInterval(() => {
          void refreshProjects()
        }, 15_000)
      : null
    return () => {
      window.clearTimeout(timeout)
      if (interval !== null) window.clearInterval(interval)
    }
  }, [isLive, refreshProjects])

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (actionFilter !== 'all' && e.action !== actionFilter) return false

      if (agentFilter !== 'all' && e.agent !== agentFilter) return false

      if (
        projectFilter !== 'all' &&
        e.cwd !== projectFilter &&
        !e.cwd?.startsWith(projectFilter + '/')
      )
        return false

      if (sessionFilter && e.session !== sessionFilter) return false

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (
          !e.path?.toLowerCase().includes(q) &&
          !e.session?.toLowerCase().includes(q) &&
          !e.command?.toLowerCase().includes(q) &&
          !e.prompt?.toLowerCase().includes(q) &&
          !e.notification_message?.toLowerCase().includes(q) &&
          !e.error_message?.toLowerCase().includes(q) &&
          !e.response?.toLowerCase().includes(q) &&
          !e.task_title?.toLowerCase().includes(q) &&
          !e.subagent_type?.toLowerCase().includes(q) &&
          !e.trigger?.toLowerCase().includes(q) &&
          !e.tool_result_stdout?.toLowerCase().includes(q) &&
          !e.tool_result_stderr?.toLowerCase().includes(q)
        )
          return false
      }
      return true
    })
  }, [events, actionFilter, agentFilter, projectFilter, searchQuery, sessionFilter])

  return {
    actionFilter,
    setActionFilter,
    agentFilter,
    setAgentFilter,
    availableAgents,
    projectFilter,
    setProjectFilter,
    availableProjects,
    searchQuery,
    setSearchQuery,
    sortOrder,
    setSortOrder,
    timeRange,
    setTimeRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    filteredEvents,
    sessionFilter,
    refreshProjects,
  }
}
