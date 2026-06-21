import { useEffect, useReducer, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import { CheckCircle2, PanelLeft, XCircle } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import type { LayoutOutletContext } from '@/types'
import { useOnboarding } from '@/features/onboarding/useOnboarding'
import { useSessions } from '@/features/sessions/useSessions'
import { useSessionMeta } from '@/features/sessions/useSessionMeta'
import { Sidebar } from './Sidebar'

const COLLAPSED_SESSIONS_STORAGE_KEY = 'events_collapsed_sessions'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'events_sidebar_collapsed'
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
const MOBILE_SIDEBAR_ID = 'mobile-sidebar'
const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'

type LayoutState = {
  mobileDrawerLocationKey: string | null
  sidebarCollapsed: boolean
  collapsedSessions: Set<string>
  searchQuery: string
  isDesktopViewport: boolean
}

type LayoutAction =
  | { type: 'SET_MOBILE_DRAWER'; key: string | null }
  | { type: 'TOGGLE_SIDEBAR_COLLAPSED' }
  | { type: 'SET_SIDEBAR_COLLAPSED'; collapsed: boolean }
  | { type: 'SET_COLLAPSED_SESSIONS'; sessions: Set<string> }
  | { type: 'SET_SEARCH_QUERY'; query: string }
  | { type: 'SET_DESKTOP_VIEWPORT'; isDesktop: boolean }

function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case 'SET_MOBILE_DRAWER':
      return { ...state, mobileDrawerLocationKey: action.key }
    case 'TOGGLE_SIDEBAR_COLLAPSED':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed }
    case 'SET_SIDEBAR_COLLAPSED':
      return { ...state, sidebarCollapsed: action.collapsed }
    case 'SET_COLLAPSED_SESSIONS':
      return { ...state, collapsedSessions: action.sessions }
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.query }
    case 'SET_DESKTOP_VIEWPORT':
      return {
        ...state,
        isDesktopViewport: action.isDesktop,
        mobileDrawerLocationKey: action.isDesktop ? null : state.mobileDrawerLocationKey,
      }
  }
}

function loadSidebarCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
    return raw !== null ? JSON.parse(raw) : true
  } catch {
    return true
  }
}

function loadCollapsedSessions(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_SESSIONS_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? new Set(parsed.filter((value): value is string => typeof value === 'string'))
      : new Set()
  } catch {
    return new Set()
  }
}

export function Layout() {
  const [state, dispatch] = useReducer(layoutReducer, undefined, () => ({
    mobileDrawerLocationKey: null,
    sidebarCollapsed: loadSidebarCollapsed(),
    collapsedSessions: loadCollapsedSessions(),
    searchQuery: '',
    isDesktopViewport: window.matchMedia(DESKTOP_MEDIA_QUERY).matches,
  }))
  const {
    mobileDrawerLocationKey,
    sidebarCollapsed,
    collapsedSessions,
    searchQuery,
    isDesktopViewport,
  } = state
  const location = useLocation()
  const navigate = useNavigate()

  // First-visit onboarding tour (driver.js). The hook self-starts on first
  // load; no per-page tour entry point remains, so its return value is unused.
  useOnboarding({
    navigate,
    forceSidebarOpen: () => dispatch({ type: 'SET_SIDEBAR_COLLAPSED', collapsed: false }),
  })

  const mobileToggleRef = useRef<HTMLButtonElement | null>(null)
  const mobileSidebarRef = useRef<HTMLElement | null>(null)
  const shellContentRef = useRef<HTMLDivElement | null>(null)
  const lastFocusedElementRef = useRef<HTMLElement | null>(null)
  const [isLive, setIsLive] = useState(false)
  const mobileOpen = !isDesktopViewport && mobileDrawerLocationKey === location.key

  // Recents data is owned here so the desktop sidebar, the mobile sidebar, and
  // the Recents page all share one fetch + one SSE connection.
  const sessionsState = useSessions()
  const sessionMeta = useSessionMeta()

  const [toast, setToast] = useState<{
    id: number
    message: string
    tone: 'success' | 'error'
  } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const toastIdRef = useRef(0)

  const notify = (message: string, tone: 'success' | 'error' = 'success') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastIdRef.current += 1
    setToast({ id: toastIdRef.current, message, tone })
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }

  const deleteSession = async (id: string) => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: [id] }),
      })
      if (!res.ok) throw new Error(String(res.status))
      sessionsState.removeSessions([id])
      notify('Session deleted')

      // If the user is currently viewing the session they just deleted, move
      // them to the most recently updated remaining session (or the Recents
      // landing if none are left).
      const match = location.pathname.match(/^\/sessions\/(.+)$/)
      const viewing = match ? decodeURIComponent(match[1]) : null
      if (viewing === id) {
        const next = sessionsState.sessions.find((s) => s.sessionId !== id)
        navigate(next ? `/sessions/${encodeURIComponent(next.sessionId)}` : '/')
      }
    } catch {
      notify('Delete failed', 'error')
    }
  }

  const setCollapsedSessions = (update: SetStateAction<Set<string>>) =>
    dispatch({
      type: 'SET_COLLAPSED_SESSIONS',
      sessions: typeof update === 'function' ? update(collapsedSessions) : update,
    })
  const setSearchQuery = (update: SetStateAction<string>) =>
    dispatch({
      type: 'SET_SEARCH_QUERY',
      query: typeof update === 'function' ? update(searchQuery) : update,
    })

  const outletContext: LayoutOutletContext = {
    collapsedSessions,
    setCollapsedSessions,
    searchQuery,
    setSearchQuery,
    isLive,
    setIsLive,
    sessions: sessionsState.sessions,
    sessionsLoading: sessionsState.loading,
    sessionsError: sessionsState.error,
    sessionsHasMore: sessionsState.hasMore,
    loadMoreSessions: sessionsState.loadMore,
    refreshSessions: sessionsState.refresh,
    removeSessions: sessionsState.removeSessions,
    sessionTags: sessionMeta.tags,
    pinnedSessions: sessionMeta.pinned,
    seenStops: sessionMeta.seen,
    togglePinSession: sessionMeta.togglePin,
    setSessionTag: sessionMeta.setTag,
    removeSessionTag: sessionMeta.removeTag,
    markSeenSession: sessionMeta.markSeen,
    notify,
  }

  useEffect(() => {
    if (!location.pathname.startsWith('/events')) {
      queueMicrotask(() => dispatch({ type: 'SET_SEARCH_QUERY', query: '' }))
    }
  }, [location])

  useEffect(() => {
    localStorage.setItem(
      COLLAPSED_SESSIONS_STORAGE_KEY,
      JSON.stringify(Array.from(collapsedSessions))
    )
  }, [collapsedSessions])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, JSON.stringify(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY)
    const handleViewportChange = (event: MediaQueryListEvent) => {
      dispatch({ type: 'SET_DESKTOP_VIEWPORT', isDesktop: event.matches })
    }

    mediaQuery.addEventListener('change', handleViewportChange)
    return () => mediaQuery.removeEventListener('change', handleViewportChange)
  }, [])

  useEffect(() => {
    const shellContent = shellContentRef.current
    if (!shellContent) return

    if (mobileOpen) {
      const fallbackToggle = mobileToggleRef.current
      lastFocusedElementRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      shellContent.setAttribute('inert', '')

      const focusFrame = requestAnimationFrame(() => {
        const focusableElements = Array.from(
          mobileSidebarRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []
        )
        focusableElements[0]?.focus()
      })

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          dispatch({ type: 'SET_MOBILE_DRAWER', key: null })
          return
        }

        if (event.key !== 'Tab') {
          return
        }

        const sidebar = mobileSidebarRef.current
        if (!sidebar) return

        const focusableElements = Array.from(
          sidebar.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        )
        if (focusableElements.length === 0) {
          event.preventDefault()
          sidebar.focus()
          return
        }

        const firstFocusable = focusableElements[0]
        const lastFocusable = focusableElements[focusableElements.length - 1]
        const activeElement = document.activeElement

        if (event.shiftKey) {
          if (activeElement === firstFocusable || !sidebar.contains(activeElement)) {
            event.preventDefault()
            lastFocusable.focus()
          }

          return
        }

        if (activeElement === lastFocusable || !sidebar.contains(activeElement)) {
          event.preventDefault()
          firstFocusable.focus()
        }
      }

      document.addEventListener('keydown', handleKeyDown)

      return () => {
        cancelAnimationFrame(focusFrame)
        document.removeEventListener('keydown', handleKeyDown)
        shellContent.removeAttribute('inert')

        const focusTarget = lastFocusedElementRef.current
        if (focusTarget && document.contains(focusTarget)) {
          focusTarget.focus()
          return
        }

        fallbackToggle?.focus()
      }
    }

    shellContent.removeAttribute('inert')
  }, [mobileOpen])

  return (
    <div
      className={cn(
        'relative flex h-dvh min-h-0 flex-col overflow-hidden bg-background md:grid md:h-screen md:transition-[grid-template-columns] md:duration-[280ms] md:ease-[cubic-bezier(0.22,1,0.36,1)] shell-motion',
        sidebarCollapsed
          ? 'md:grid-cols-[56px_minmax(0,1fr)]'
          : 'md:grid-cols-[240px_minmax(0,1fr)]'
      )}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => dispatch({ type: 'TOGGLE_SIDEBAR_COLLAPSED' })}
        mode="desktop"
        className="hidden md:flex"
        sessions={sessionsState.sessions}
        onDeleteSession={deleteSession}
        pinnedIds={sessionMeta.pinned}
        tags={sessionMeta.tags}
        seen={sessionMeta.seen}
        onTogglePin={sessionMeta.togglePin}
        onSetTag={sessionMeta.setTag}
        onRemoveTag={sessionMeta.removeTag}
      />

      <button
        type="button"
        className={cn(
          'fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 md:hidden shell-fade',
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        tabIndex={mobileOpen ? 0 : -1}
        aria-label="Close sidebar"
        onClick={() => dispatch({ type: 'SET_MOBILE_DRAWER', key: null })}
      />

      <Sidebar
        id={MOBILE_SIDEBAR_ID}
        collapsed={false}
        mode="mobile"
        open={mobileOpen}
        onNavigate={() => dispatch({ type: 'SET_MOBILE_DRAWER', key: null })}
        onClose={() => dispatch({ type: 'SET_MOBILE_DRAWER', key: null })}
        containerRef={mobileSidebarRef}
        className="fixed inset-y-0 left-0 z-50 flex w-[240px] max-w-[calc(100vw-2rem)] md:hidden"
        sessions={sessionsState.sessions}
        onDeleteSession={deleteSession}
        pinnedIds={sessionMeta.pinned}
        tags={sessionMeta.tags}
        seen={sessionMeta.seen}
        onTogglePin={sessionMeta.togglePin}
        onSetTag={sessionMeta.setTag}
        onRemoveTag={sessionMeta.removeTag}
      />

      <div
        ref={shellContentRef}
        aria-hidden={mobileOpen ? true : undefined}
        className="relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <Button
          ref={mobileToggleRef}
          variant="ghost"
          size="icon-lg"
          className="absolute left-2 top-2 z-10 md:hidden text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]"
          onClick={() => dispatch({ type: 'SET_MOBILE_DRAWER', key: location.key })}
          aria-label="Open sidebar"
          aria-controls={MOBILE_SIDEBAR_ID}
          aria-expanded={mobileOpen}
        >
          <PanelLeft className="size-4" />
        </Button>
        <RouteErrorBoundary>
          <Outlet context={outletContext} />
        </RouteErrorBoundary>
      </div>

      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed right-4 top-4 z-[100] flex animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground shadow-lg">
            {toast.tone === 'error' ? (
              <XCircle className="size-4 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            )}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}
