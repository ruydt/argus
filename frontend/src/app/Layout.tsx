import { useEffect, useMemo, useRef, useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSessions } from '@/hooks/useSessions'
import type { LayoutOutletContext } from '@/types'
import { Sidebar } from './Sidebar'

const COLLAPSED_SESSIONS_STORAGE_KEY = 'events_collapsed_sessions'
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
const MOBILE_SIDEBAR_ID = 'mobile-sidebar'
const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'

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
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  )
  const [mobileDrawerLocationKey, setMobileDrawerLocationKey] = useState<string | null>(null)
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(loadCollapsedSessions)
  const [time, setTime] = useState(() => new Date().toLocaleTimeString())
  const location = useLocation()
  const [isDesktopViewport, setIsDesktopViewport] = useState(
    () => window.matchMedia(DESKTOP_MEDIA_QUERY).matches
  )
  const mobileToggleRef = useRef<HTMLButtonElement | null>(null)
  const mobileSidebarRef = useRef<HTMLElement | null>(null)
  const shellContentRef = useRef<HTMLDivElement | null>(null)
  const lastFocusedElementRef = useRef<HTMLElement | null>(null)
  const { sessions } = useSessions()
  const mobileOpen = !isDesktopViewport && mobileDrawerLocationKey === location.key
  const sessionUsage = useMemo(
    () =>
      sessions.reduce<Record<string, (typeof sessions)[number]['usage']>>((acc, session) => {
        acc[session.session_id] = session.usage
        return acc
      }, {}),
    [sessions]
  )

  const outletContext: LayoutOutletContext = {
    collapsedSessions,
    setCollapsedSessions,
    sessionUsage,
  }

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', collapsed.toString())
  }, [collapsed])

  useEffect(() => {
    localStorage.setItem(
      COLLAPSED_SESSIONS_STORAGE_KEY,
      JSON.stringify(Array.from(collapsedSessions))
    )
  }, [collapsedSessions])

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY)
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setMobileDrawerLocationKey(null)
      }

      setIsDesktopViewport(event.matches)
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
          setMobileDrawerLocationKey(null)
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
        collapsed ? 'md:grid-cols-[56px_minmax(0,1fr)]' : 'md:grid-cols-[240px_minmax(0,1fr)]'
      )}
    >
      <Sidebar
        collapsed={collapsed}
        mode="desktop"
        onToggleCollapse={() => setCollapsed((current) => !current)}
        className="hidden md:flex"
      />

      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 transition-opacity duration-300 md:hidden shell-fade',
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setMobileDrawerLocationKey(null)}
      />

      <Sidebar
        id={MOBILE_SIDEBAR_ID}
        collapsed={false}
        mode="mobile"
        open={mobileOpen}
        onNavigate={() => setMobileDrawerLocationKey(null)}
        onClose={() => setMobileDrawerLocationKey(null)}
        containerRef={mobileSidebarRef}
        className="fixed inset-y-0 left-0 z-50 flex w-[240px] max-w-[calc(100vw-2rem)] md:hidden"
      />

      <div
        ref={shellContentRef}
        aria-hidden={mobileOpen ? true : undefined}
        className="relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#222] bg-[#0c0c0c] px-3 py-2 text-[0.75rem] text-muted-foreground sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              ref={mobileToggleRef}
              variant="ghost"
              size="icon-lg"
              className="md:hidden text-[#666] hover:text-[#ccc] hover:bg-white/[0.05]"
              onClick={() => setMobileDrawerLocationKey(location.key)}
              aria-label="Open sidebar"
              aria-controls={MOBILE_SIDEBAR_ID}
              aria-expanded={mobileOpen}
            >
              <PanelLeft className="size-4" />
            </Button>
            <span className="hidden text-[0.65rem] font-medium tracking-[0.08em] text-[#555] md:inline">
              agent-monitor
            </span>
          </div>
          <span className="tabular-nums text-[#555]">{time}</span>
        </header>
        <Outlet context={outletContext} />
      </div>
    </div>
  )
}
