import { useEffect, useMemo, useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSessions } from '@/hooks/useSessions'
import type { LayoutOutletContext } from '@/types'
import { Sidebar } from './Sidebar'

const COLLAPSED_SESSIONS_STORAGE_KEY = 'events_collapsed_sessions'

function loadCollapsedSessions(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_SESSIONS_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((value): value is string => typeof value === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  )
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(loadCollapsedSessions)
  const [time, setTime] = useState(() => new Date().toLocaleTimeString())
  const { sessions } = useSessions()
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

  return (
    <div
      className={cn(
        'grid h-screen transition-[grid-template-columns] duration-300',
        collapsed ? 'grid-cols-[72px_minmax(0,1fr)]' : 'grid-cols-[264px_minmax(0,1fr)]'
      )}
    >
      <Sidebar collapsed={collapsed} />
      <div className="flex flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border bg-header px-4 py-2.5 text-[0.75rem] text-muted-foreground">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-lg"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <PanelLeft className="size-4" />
            </Button>
            <span className="text-[0.65rem] font-medium tracking-[0.08em] text-muted-foreground">
              agent-monitor
            </span>
          </div>
          <span className="tabular-nums text-muted-foreground">{time}</span>
        </header>
        <Outlet context={outletContext} />
      </div>
    </div>
  )
}
