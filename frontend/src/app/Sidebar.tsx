import { Fragment, useEffect, type RefObject } from 'react'
import {
  BarChart3,
  LayoutDashboard,
  PanelLeft,
  TerminalSquare,
  X,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface SidebarProps {
  id?: string
  collapsed: boolean
  mode?: 'desktop' | 'mobile'
  open?: boolean
  onToggleCollapse?: () => void
  onNavigate?: () => void
  onClose?: () => void
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
  id,
  collapsed,
  mode = 'desktop',
  open = false,
  onToggleCollapse,
  onNavigate,
  onClose,
  className,
  containerRef,
}: SidebarProps) {
  const location = useLocation()
  const showCollapsedTooltips = mode === 'desktop' && collapsed
  const isMobile = mode === 'mobile'
  const desktopLabelStateClassName = collapsed ? 'sidebar-label-closed' : 'sidebar-label-open'
  const desktopNavLabelClassName = cn(
    'sidebar-label-motion sidebar-label-nav',
    desktopLabelStateClassName
  )
  const isNavItemActive = (to: string, end: boolean) =>
    end ? location.pathname === to : location.pathname.startsWith(to)
  const navButtonClassName = (isActive: boolean) =>
    cn(
      'h-10 gap-0 border text-[0.8rem] font-normal text-[#cccccc]',
      collapsed ? 'w-10 justify-start rounded-xl px-0' : 'w-full justify-start rounded-lg px-0',
      isActive
        ? 'border-[rgba(71,255,156,0.18)] bg-[rgba(71,255,156,0.1)]'
        : 'border-transparent hover:border-[rgba(71,255,156,0.18)] hover:bg-[rgba(71,255,156,0.1)] hover:text-[#cccccc]'
    )
  const desktopToggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  const desktopHeaderClassName = cn(
    'h-10 w-full rounded-xl border border-transparent',
    collapsed ? 'flex items-center justify-center' : 'flex items-center justify-end'
  )
  const desktopToggleButtonClassName = cn(
    'h-10 gap-0 border border-transparent text-[0.8rem] font-normal text-[#cccccc] shadow-none hover:bg-white/[0.05] hover:text-[#cccccc]',
    collapsed
      ? 'size-10 self-center justify-center rounded-xl px-0'
      : 'size-10 justify-center rounded-lg px-0'
  )

  const renderNavButton = ({ to, label, ariaLabel, icon: Icon, end }: NavItem) => {
    const isActive = isNavItemActive(to, end)

    return (
      <Button asChild variant="ghost" className={navButtonClassName(isActive)}>
        <NavLink to={to} end={end} aria-label={ariaLabel} onClick={() => onNavigate?.()}>
          <span className="flex size-10 shrink-0 items-center justify-center">
            <Icon className="size-4 shrink-0" />
          </span>
          <span aria-hidden="true" className={desktopNavLabelClassName}>
            {label}
          </span>
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
      id={id}
      ref={containerRef}
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden border-r border-[#333] bg-[#0c0c0c] transition-all duration-300 shell-motion',
        collapsed ? 'px-2 py-4' : 'px-4 py-4',
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
      {isMobile ? (
        <div className="flex min-h-14 items-center rounded-xl border border-[#333] bg-[rgba(255,255,255,0.02)] px-3 py-3">
          <div className="flex w-full items-center justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => onClose?.()}
              aria-label="Close sidebar"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className={desktopHeaderClassName}>
          <Button
            type="button"
            variant="ghost"
            className={desktopToggleButtonClassName}
            onClick={() => onToggleCollapse?.()}
            aria-label={desktopToggleLabel}
            title={collapsed ? desktopToggleLabel : undefined}
          >
            <PanelLeft className="size-4 shrink-0" />
          </Button>
        </div>
      )}
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
