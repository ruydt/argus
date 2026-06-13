import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Dispatch, SetStateAction } from 'react'
import type { EventRecord } from '@/types/events'
import type { Project } from '@/types/sessions'
import { usePollingInterval } from '@/hooks/usePollingInterval'

function readStr(key: string, fallback: string): string {
  try {
    return sessionStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function eventMatchesFilters(
  e: EventRecord,
  actionFilter: string,
  agentFilter: string,
  projectFilter: string,
  sessionFilter: string,
  q: string
): boolean {
  if (actionFilter !== 'all' && e.action !== actionFilter) return false
  if (agentFilter !== 'all' && e.agent !== agentFilter) return false
  if (projectFilter !== 'all' && e.cwd !== projectFilter && !e.cwd?.startsWith(projectFilter + '/'))
    return false
  if (sessionFilter && e.session !== sessionFilter) return false
  if (q) {
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
}

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

  const [actionFilter, setActionFilter] = useState(() => readStr('events_action_filter', 'all'))
  const [agentFilter, setAgentFilter] = useState(() => readStr('events_agent_filter', 'all'))
  const [sortOrder, setSortOrder] = useState(() => readStr('events_sort_order', 'newest'))

  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(searchQuery)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearchQuery(searchQuery), 150)
    return () => window.clearTimeout(t)
  }, [searchQuery])

  const [projectFilter, setProjectFilter] = useState(() => readStr('events_project_filter', 'all'))

  const computedAgents = useMemo(() => {
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
    return () => window.clearTimeout(timeout)
  }, [refreshProjects])

  usePollingInterval(() => void refreshProjects(), 15_000, isLive)

  useEffect(() => {
    sessionStorage.setItem('events_action_filter', actionFilter)
  }, [actionFilter])
  useEffect(() => {
    sessionStorage.setItem('events_agent_filter', agentFilter)
  }, [agentFilter])
  useEffect(() => {
    sessionStorage.setItem('events_sort_order', sortOrder)
  }, [sortOrder])
  useEffect(() => {
    sessionStorage.setItem('events_project_filter', projectFilter)
  }, [projectFilter])

  // Cache holding the previous filter inputs and result. Written via useEffect
  // (after render) so the ref is always from the last completed render cycle.
  // Read inside useMemo to detect append-only SSE updates — this is a
  // deliberate "previous render" cache pattern. The eslint-disable block covers
  // the intentional ref access; all other ref accesses in this file are normal.
  const prevFilterRef = useRef<{
    events: EventRecord[]
    filtered: EventRecord[]
    signature: string
  } | null>(null)

  /* eslint-disable react-hooks/refs */
  const filteredEvents = useMemo(() => {
    const q = debouncedSearchQuery.toLowerCase()
    const signature = [actionFilter, agentFilter, projectFilter, sessionFilter, q].join(' ')
    const prev = prevFilterRef.current

    // The live stream appends events to the end of a fresh array, preserving
    // item identities. When the previous events are an untouched prefix and
    // the filters haven't changed, only the appended slice needs filtering.
    const prevLen = prev?.events.length ?? 0
    const isAppendOnly =
      prev !== null &&
      prev.signature === signature &&
      events.length >= prevLen &&
      (prevLen === 0 ||
        (events[0] === prev.events[0] && events[prevLen - 1] === prev.events[prevLen - 1]))

    let filtered: EventRecord[]
    if (isAppendOnly) {
      const appended: EventRecord[] = []
      for (let i = prevLen; i < events.length; i++) {
        if (
          eventMatchesFilters(events[i], actionFilter, agentFilter, projectFilter, sessionFilter, q)
        ) {
          appended.push(events[i])
        }
      }
      filtered = appended.length > 0 ? [...prev.filtered, ...appended] : prev.filtered
    } else {
      filtered = events.filter((e) =>
        eventMatchesFilters(e, actionFilter, agentFilter, projectFilter, sessionFilter, q)
      )
    }

    return filtered
  }, [events, actionFilter, agentFilter, projectFilter, debouncedSearchQuery, sessionFilter])

  useEffect(() => {
    const q = debouncedSearchQuery.toLowerCase()
    const signature = [actionFilter, agentFilter, projectFilter, sessionFilter, q].join(' ')
    prevFilterRef.current = { events, filtered: filteredEvents, signature }
  }, [
    events,
    filteredEvents,
    actionFilter,
    agentFilter,
    projectFilter,
    debouncedSearchQuery,
    sessionFilter,
  ])

  return {
    actionFilter,
    setActionFilter,
    agentFilter,
    setAgentFilter,
    availableAgents: computedAgents,
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
  /* eslint-enable react-hooks/refs */
}
