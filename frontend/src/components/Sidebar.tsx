import {
  BarChart3,
  LayoutDashboard,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SidebarProps {
  collapsed: boolean
}

interface NavItem {
  to: string
  label: string
  ariaLabel: string
  icon: LucideIcon
  end: boolean
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    to: '/',
    label: 'Events',
    ariaLabel: 'Terminal Events',
    icon: TerminalSquare,
    end: true,
  },
  {
    to: '/dashboard',
    label: 'Dashboard',
    ariaLabel: 'Overview Dashboard',
    icon: LayoutDashboard,
    end: false,
  },
  {
    to: '/usage',
    label: 'Usage',
    ariaLabel: 'API Usage Tracker',
    icon: BarChart3,
    end: false,
  },
] as const

export function Sidebar({ collapsed }: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden border-r border-[#333] bg-[#0c0c0c] transition-all duration-300',
        collapsed ? 'w-[4.5rem] px-2 py-4' : 'w-64 px-4 py-5'
      )}
    >
      <div className={cn('flex flex-col', collapsed ? 'items-center gap-4' : 'gap-5')}>
        <div
          className={cn(
            'flex min-h-14 items-center border border-[#333] bg-[rgba(255,255,255,0.02)]',
            collapsed ? 'w-full justify-center rounded-xl px-0' : 'rounded-xl px-3 py-3'
          )}
        >
          {collapsed ? (
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-white">
              AM
            </span>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-[0.68rem] uppercase tracking-[0.22em] text-[#8f8f8f]">
                Agent
              </span>
              <span className="text-sm font-semibold uppercase tracking-[0.12em] text-white">
                Monitor
              </span>
            </div>
          )}
        </div>
      </div>
      <nav className={cn('mt-5 flex flex-col gap-2', collapsed && 'items-center')}>
        {NAV_ITEMS.map(({ to, label, ariaLabel, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            {({ isActive }) => (
              <Button
                variant="ghost"
                aria-label={ariaLabel}
                className={cn(
                  'h-auto border border-transparent text-[#cccccc] text-[0.8rem] font-normal',
                  collapsed
                    ? 'size-10 justify-center rounded-xl px-0'
                    : 'w-full justify-start rounded-lg px-3 py-[11px]',
                  'hover:bg-[rgba(71,255,156,0.1)] hover:border-[rgba(71,255,156,0.18)] hover:text-[#cccccc]',
                  isActive && 'bg-[rgba(71,255,156,0.1)] border-[rgba(71,255,156,0.18)]'
                )}
              >
                <Icon className="size-4 shrink-0" />
                {collapsed ? <span className="sr-only">{ariaLabel}</span> : <span>{label}</span>}
              </Button>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
