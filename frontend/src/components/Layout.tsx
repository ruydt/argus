import { useEffect, useState } from 'react'
import { PanelLeft } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LayoutOutletContext, SessionUsage } from '@/types'
import { Sidebar } from './Sidebar'

export function Layout() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  )
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set())
  const [sessionUsage, setSessionUsage] = useState<Record<string, SessionUsage>>({})
  const [time, setTime] = useState(() => new Date().toLocaleTimeString())

  const outletContext: LayoutOutletContext = {
    collapsedSessions,
    setCollapsedSessions,
    sessionUsage,
    setSessionUsage,
  }

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', collapsed.toString())
  }, [collapsed])

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      className={cn(
        'grid h-screen transition-[grid-template-columns] duration-300',
        collapsed ? 'grid-cols-[72px_1fr]' : 'grid-cols-[250px_1fr]'
      )}
    >
      <Sidebar collapsed={collapsed} />
      <div className="flex flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[#333] bg-[#0c0c0c] px-4 py-2.5 text-[0.75rem] text-[#8f8f8f]">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="size-9 rounded-lg border border-[#333] p-0 text-[#cccccc] hover:bg-white/5 hover:text-[#cccccc]"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <PanelLeft className="size-4" />
            </Button>
            <div className="flex flex-col leading-none">
              <span className="text-[0.65rem] uppercase tracking-[0.18em] text-[#666]">Agent</span>
              <span className="pt-1 text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-[#cccccc]">
                Monitor
              </span>
            </div>
          </div>
          <span className="tabular-nums text-[#666]">{time}</span>
        </header>
        <Outlet context={outletContext} />
      </div>
    </div>
  )
}
