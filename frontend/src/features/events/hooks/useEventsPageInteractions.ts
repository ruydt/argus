import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useSearchParams } from 'react-router-dom'
import { buildEventKey } from '@/features/events/eventKey'
import type { EventRecord } from '@/types'

type PendingEventLink = {
  sessionId: string
  eventKey: string
}

type EventLinkState = {
  pendingEventLink: PendingEventLink | null
  highlightedEventKey: string | null
}

type PanelDragState = {
  splitView: boolean
  panel2Sessions: Set<string>
  panel2EventKeys: Set<string>
  isDragging: boolean
  dragOverPanel: 1 | 2 | null
  edgeZoneHover: boolean
}

type PanelDragAction =
  | { type: 'ADD_TO_PANEL2'; data: string }
  | { type: 'REMOVE_FROM_PANEL2'; data: string }
  | { type: 'CLEAR_PANEL2' }
  | { type: 'ENABLE_SPLIT' }
  | { type: 'DISABLE_SPLIT' }
  | { type: 'SET_DRAG_OVER'; panel: 1 | 2 | null }
  | { type: 'SET_DRAGGING'; isDragging: boolean }
  | { type: 'SET_EDGE_HOVER'; hover: boolean }

const initialPanelDragState: PanelDragState = {
  splitView: false,
  panel2Sessions: new Set(),
  panel2EventKeys: new Set(),
  isDragging: false,
  dragOverPanel: null,
  edgeZoneHover: false,
}

function isPanel2Empty(panel2Sessions: Set<string>, panel2EventKeys: Set<string>) {
  return panel2Sessions.size === 0 && panel2EventKeys.size === 0
}

function panelDragReducer(state: PanelDragState, action: PanelDragAction): PanelDragState {
  switch (action.type) {
    case 'ADD_TO_PANEL2': {
      if (action.data.startsWith('session:')) {
        const id = action.data.slice('session:'.length)
        return { ...state, panel2Sessions: new Set([...state.panel2Sessions, id]) }
      }
      return { ...state, panel2EventKeys: new Set([...state.panel2EventKeys, action.data]) }
    }
    case 'REMOVE_FROM_PANEL2': {
      if (action.data.startsWith('session:')) {
        const id = action.data.slice('session:'.length)
        const next = new Set(state.panel2Sessions)
        next.delete(id)
        if (isPanel2Empty(next, state.panel2EventKeys)) {
          return {
            ...state,
            splitView: false,
            panel2Sessions: new Set(),
            panel2EventKeys: new Set(),
          }
        }
        return { ...state, panel2Sessions: next }
      }
      const next = new Set(state.panel2EventKeys)
      next.delete(action.data)
      if (isPanel2Empty(state.panel2Sessions, next)) {
        return { ...state, splitView: false, panel2Sessions: new Set(), panel2EventKeys: new Set() }
      }
      return { ...state, panel2EventKeys: next }
    }
    case 'CLEAR_PANEL2':
      return { ...state, panel2Sessions: new Set(), panel2EventKeys: new Set() }
    case 'ENABLE_SPLIT':
      return { ...state, splitView: true }
    case 'DISABLE_SPLIT':
      return { ...state, splitView: false, panel2Sessions: new Set(), panel2EventKeys: new Set() }
    case 'SET_DRAG_OVER':
      return { ...state, dragOverPanel: action.panel }
    case 'SET_DRAGGING':
      return {
        ...state,
        isDragging: action.isDragging,
        edgeZoneHover: action.isDragging ? state.edgeZoneHover : false,
      }
    case 'SET_EDGE_HOVER':
      return { ...state, edgeZoneHover: action.hover }
  }
}

function getSessionId(event: Pick<EventRecord, 'session' | 'transcript_path'>) {
  return event.session || event.transcript_path || 'ungrouped'
}

function getTopSessionId(events: EventRecord[], sortOrder: string) {
  const sessions = new Map<string, { lastTime: number; firstIndex: number }>()

  events.forEach((event, index) => {
    const sessionId = getSessionId(event)
    const eventTime = new Date(event.time).getTime()
    const timestamp = Number.isFinite(eventTime) ? eventTime : 0
    const existing = sessions.get(sessionId)

    if (!existing) {
      sessions.set(sessionId, { lastTime: timestamp, firstIndex: index })
      return
    }

    sessions.set(sessionId, {
      lastTime: Math.max(existing.lastTime, timestamp),
      firstIndex: existing.firstIndex,
    })
  })

  const sortedSessions = Array.from(sessions.entries()).sort((a, b) => {
    const timeDelta =
      sortOrder === 'newest' ? b[1].lastTime - a[1].lastTime : a[1].lastTime - b[1].lastTime

    if (timeDelta !== 0) return timeDelta
    return a[1].firstIndex - b[1].firstIndex
  })

  return sortedSessions[0]?.[0] ?? null
}

type UseEventLinkStateOptions = {
  setCollapsedSessions: Dispatch<SetStateAction<Set<string>>>
}

export function useEventLinkState({ setCollapsedSessions }: UseEventLinkStateOptions) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [eventLink, setEventLink] = useState<EventLinkState>({
    pendingEventLink: null,
    highlightedEventKey: null,
  })

  const urlSession = searchParams.get('session') ?? ''
  const sessionFilterOverride = eventLink.pendingEventLink?.sessionId || urlSession

  const applyDeepLink = useCallback(
    (sessionId: string, eventKey: string, nextParams: URLSearchParams) => {
      setEventLink({ pendingEventLink: { sessionId, eventKey }, highlightedEventKey: eventKey })
      setCollapsedSessions((prev) => {
        if (!prev.has(sessionId)) return prev
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
      setSearchParams(nextParams, { replace: true })
    },
    [setCollapsedSessions, setSearchParams]
  )

  useEffect(() => {
    const sessionId = searchParams.get('session') ?? ''
    const eventKey = searchParams.get('event') ?? ''
    if (!sessionId || !eventKey) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('session')
    nextParams.delete('event')
    queueMicrotask(() => applyDeepLink(sessionId, eventKey, nextParams))
  }, [applyDeepLink, searchParams])

  const clearLink = useCallback(
    () => setEventLink((prev) => ({ ...prev, pendingEventLink: null })),
    []
  )

  const toggleSession = useCallback(
    (id: string) => {
      setCollapsedSessions((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [setCollapsedSessions]
  )

  return {
    clearLink,
    eventLink,
    sessionFilterOverride,
    setSearchParams,
    toggleSession,
    urlSession,
  }
}

type UseSplitViewInteractionsOptions = {
  filteredEvents: EventRecord[]
  sortOrder: string
}

export function useSplitViewInteractions({
  filteredEvents,
  sortOrder,
}: UseSplitViewInteractionsOptions) {
  const [panelDrag, dispatchPanelDrag] = useReducer(panelDragReducer, initialPanelDragState)
  const { splitView, panel2Sessions, panel2EventKeys, isDragging, dragOverPanel, edgeZoneHover } =
    panelDrag

  const panel1Events = useMemo(() => {
    if (!splitView) return filteredEvents
    return filteredEvents.filter(
      (event) =>
        !panel2Sessions.has(getSessionId(event)) && !panel2EventKeys.has(buildEventKey(event))
    )
  }, [filteredEvents, panel2EventKeys, panel2Sessions, splitView])

  const panel2Events = useMemo(
    () =>
      filteredEvents.filter(
        (event) =>
          panel2Sessions.has(getSessionId(event)) || panel2EventKeys.has(buildEventKey(event))
      ),
    [filteredEvents, panel2EventKeys, panel2Sessions]
  )

  useEffect(() => {
    const onStart = () => dispatchPanelDrag({ type: 'SET_DRAGGING', isDragging: true })
    const onEnd = () => dispatchPanelDrag({ type: 'SET_DRAGGING', isDragging: false })
    document.addEventListener('dragstart', onStart)
    document.addEventListener('dragend', onEnd)
    return () => {
      document.removeEventListener('dragstart', onStart)
      document.removeEventListener('dragend', onEnd)
    }
  }, [])

  const handleDropToPanel = useCallback(
    (targetPanel: 1 | 2) => (ev: React.DragEvent) => {
      ev.preventDefault()
      const data = ev.dataTransfer.getData('text/plain')
      if (!data) return
      if (targetPanel === 2) dispatchPanelDrag({ type: 'ADD_TO_PANEL2', data })
      else dispatchPanelDrag({ type: 'REMOVE_FROM_PANEL2', data })
      dispatchPanelDrag({ type: 'SET_DRAG_OVER', panel: null })
      dispatchPanelDrag({ type: 'SET_DRAGGING', isDragging: false })
    },
    []
  )

  const handleDropToEdge = useCallback(
    (ev: React.DragEvent) => {
      ev.preventDefault()
      const data = ev.dataTransfer.getData('text/plain')
      if (!data) return
      if (!splitView) dispatchPanelDrag({ type: 'CLEAR_PANEL2' })
      dispatchPanelDrag({ type: 'ENABLE_SPLIT' })
      dispatchPanelDrag({ type: 'ADD_TO_PANEL2', data })
      dispatchPanelDrag({ type: 'SET_DRAGGING', isDragging: false })
    },
    [splitView]
  )

  const handleDragOver = useCallback(
    (panel: 1 | 2) => (ev: React.DragEvent) => {
      ev.preventDefault()
      ev.dataTransfer.dropEffect = 'move'
      dispatchPanelDrag({ type: 'SET_DRAG_OVER', panel })
    },
    []
  )

  const handleDragLeave = useCallback((ev: React.DragEvent) => {
    if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
      dispatchPanelDrag({ type: 'SET_DRAG_OVER', panel: null })
    }
  }, [])

  const toggleSplitView = useCallback(() => {
    if (splitView) {
      dispatchPanelDrag({ type: 'DISABLE_SPLIT' })
      return
    }

    const topSessionId = getTopSessionId(filteredEvents, sortOrder)
    if (!topSessionId) return
    dispatchPanelDrag({ type: 'ENABLE_SPLIT' })
    dispatchPanelDrag({ type: 'ADD_TO_PANEL2', data: `session:${topSessionId}` })
  }, [filteredEvents, sortOrder, splitView])

  return {
    dragOverPanel,
    edgeZoneHover,
    handleDragLeave,
    handleDragOver,
    handleDropToEdge,
    handleDropToPanel,
    isDragging,
    panel1Events,
    panel2Events,
    setEdgeZoneHover: (hover: boolean) => dispatchPanelDrag({ type: 'SET_EDGE_HOVER', hover }),
    splitView,
    toggleSplitView,
  }
}
