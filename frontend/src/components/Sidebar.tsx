import { NavLink } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SidebarProps {
  collapsed: boolean
}

const NAV_ITEMS = [
  { to: '/', label: 'Terminal Events', end: true },
  { to: '/usage', label: 'API Usage Tracker', end: false },
] as const

export function Sidebar({ collapsed }: SidebarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-5 overflow-hidden whitespace-nowrap transition-all duration-300',
        'bg-[#0c0c0c] border-r border-[#333]',
        collapsed ? 'w-0 px-0 py-5' : 'p-5'
      )}
    >
      <div className="flex items-center justify-between">
        <h1 className="m-0 text-[1rem] tracking-[0.08em] uppercase text-white font-bold">
          Agent Monitor
        </h1>
      </div>
      <nav className="flex flex-col gap-2">
        {NAV_ITEMS.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end}>
            {({ isActive }) => (
              <Button
                variant="ghost"
                className={cn(
                  'w-full justify-start text-[#cccccc] text-[0.8rem] font-normal',
                  'border border-transparent rounded-lg px-3 py-[11px] h-auto',
                  'hover:bg-[rgba(71,255,156,0.1)] hover:border-[rgba(71,255,156,0.18)] hover:text-[#cccccc]',
                  isActive && 'bg-[rgba(71,255,156,0.1)] border-[rgba(71,255,156,0.18)]'
                )}
              >
                {label}
              </Button>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
