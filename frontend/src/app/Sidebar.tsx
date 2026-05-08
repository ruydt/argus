import { Fragment, useEffect, type RefObject } from 'react'
import { BarChart3, LayoutDashboard, TerminalSquare, type LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface SidebarProps {
  collapsed: boolean
  mode?: 'desktop' | 'mobile'
  open?: boolean
  onNavigate?: () => void
  className?: string
  containerRef?: RefObject<HTMLElement | null>
}

interface NavItem {
  to: string
  label: string
  ariaLabel: string
  icon: LucideIcon
  end: boolean
}

const NAV_ITEMS: NavItem[] = [
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
]

export function Sidebar({
  collapsed,
  mode = 'desktop',
  open = false,
  onNavigate,
  className,
  containerRef,
}: SidebarProps) {
  const location = useLocation()
  const showCollapsedTooltips = mode === 'desktop' && collapsed
  const isMobile = mode === 'mobile'
  const isNavItemActive = (to: string, end: boolean) =>
    end ? location.pathname === to : location.pathname.startsWith(to)
  const navButtonClassName = (isActive: boolean) =>
    cn(
      'h-auto border text-[0.8rem] font-normal text-[#cccccc]',
      collapsed
        ? 'size-10 justify-center rounded-xl px-0'
        : 'w-full justify-start rounded-lg px-3 py-[11px]',
      isActive
        ? 'border-[rgba(71,255,156,0.18)] bg-[rgba(71,255,156,0.1)]'
        : 'border-transparent hover:border-[rgba(71,255,156,0.18)] hover:bg-[rgba(71,255,156,0.1)] hover:text-[#cccccc]'
    )

  const renderNavButton = ({ to, label, ariaLabel, icon: Icon, end }: NavItem) => {
    const isActive = isNavItemActive(to, end)

    return (
      <Button asChild variant="ghost" className={navButtonClassName(isActive)}>
        <NavLink to={to} end={end} aria-label={ariaLabel} onClick={() => onNavigate?.()}>
          <Icon className="size-4 shrink-0" />
          {collapsed ? <span className="sr-only">{ariaLabel}</span> : <span>{label}</span>}
        </NavLink>
      </Button>
    )
  }

  useEffect(() => {
    const container = containerRef?.current
    if (!container || !isMobile) return

    if (open) {
      container.removeAttribute('inert')
      return
    }

    container.setAttribute('inert', '')
    return () => container.removeAttribute('inert')
  }, [containerRef, isMobile, open])

  return (
    <aside
      ref={containerRef}
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden border-r border-[#333] bg-[#0c0c0c] transition-all duration-300 shell-motion',
        collapsed ? 'px-2 py-4' : 'px-4 py-5',
        isMobile && [
          'shadow-2xl transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full',
          open ? 'pointer-events-auto' : 'pointer-events-none',
        ],
        className
      )}
      aria-hidden={isMobile ? !open : undefined}
      aria-label={isMobile ? 'Primary navigation' : undefined}
      aria-modal={isMobile ? true : undefined}
      role={isMobile ? 'dialog' : undefined}
      tabIndex={isMobile ? -1 : undefined}
    >
      <div
        className={cn(
          'flex min-h-14 items-center border border-[#333] bg-[rgba(255,255,255,0.02)]',
          collapsed ? 'w-full justify-center rounded-xl px-0' : 'rounded-xl px-3 py-3'
        )}
      >
        {collapsed ? (
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-white">AM</span>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-[0.68rem] uppercase tracking-[0.22em] text-[#8f8f8f]">Agent</span>
            <span className="text-sm font-semibold uppercase tracking-[0.12em] text-white">
              Monitor
            </span>
          </div>
        )}
      </div>
      <TooltipProvider delayDuration={100}>
        <nav className={cn('mt-5 flex flex-col gap-2', showCollapsedTooltips && 'items-center')}>
          {NAV_ITEMS.map((item) => {
            const button = renderNavButton(item)

            return showCollapsedTooltips ? (
              <Tooltip key={item.to}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  {item.ariaLabel}
                </TooltipContent>
              </Tooltip>
            ) : (
              <Fragment key={item.to}>{button}</Fragment>
            )
          })}
        </nav>
      </TooltipProvider>
    </aside>
  )
}
