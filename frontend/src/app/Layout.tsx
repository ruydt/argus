import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import { PanelLeft } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSessions } from '@/hooks/useSessions'
import type { LayoutOutletContext } from '@/types'
import { useOnboarding } from '@/features/onboarding/useOnboarding'
import { PAGE_TOURS } from '@/features/onboarding/pageTours'
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

  const { isFirstVisitTourActive, startPageTour } = useOnboarding({
    navigate,
    forceSidebarOpen: () => dispatch({ type: 'SET_SIDEBAR_COLLAPSED', collapsed: false }),
  })

  const hasTourForRoute = Boolean(PAGE_TOURS[location.pathname])

  const mobileToggleRef = useRef<HTMLButtonElement | null>(null)
  const mobileSidebarRef = useRef<HTMLElement | null>(null)
  const shellContentRef = useRef<HTMLDivElement | null>(null)
  const lastFocusedElementRef = useRef<HTMLElement | null>(null)
  const [isLive, setIsLive] = useState(false)
  const { sessions, refresh: refreshSessionUsage } = useSessions({ enabled: isLive })
  const mobileOpen = !isDesktopViewport && mobileDrawerLocationKey === location.key
  const sessionUsage = useMemo(
    () =>
      sessions.reduce<Record<string, (typeof sessions)[number]['usage']>>((acc, session) => {
        acc[session.session_id] = session.usage
        return acc
      }, {}),
    [sessions]
  )

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
    sessionUsage,
    searchQuery,
    setSearchQuery,
    isLive,
    setIsLive,
    refreshSessionUsage,
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
        onStartTour={() => startPageTour(location.pathname)}
        hasTourForRoute={hasTourForRoute}
        isFirstVisitTourActive={isFirstVisitTourActive}
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
        onStartTour={() => startPageTour(location.pathname)}
        hasTourForRoute={hasTourForRoute}
        isFirstVisitTourActive={isFirstVisitTourActive}
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
        <Outlet context={outletContext} />
      </div>
    </div>
  )
}
