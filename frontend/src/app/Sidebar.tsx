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
      'sidebar-nav-item h-9 gap-0 border text-[0.8rem] font-normal transition-all duration-200',
      collapsed ? 'w-9 justify-start rounded-lg px-0' : 'w-full justify-start rounded-lg px-0',
      isActive
        ? 'sidebar-nav-active border-[rgba(139,92,246,0.25)] bg-[rgba(139,92,246,0.12)] text-[#e2e0ff]'
        : 'border-transparent text-[#9a9a9a] hover:border-[rgba(139,92,246,0.15)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#d4d4d4]'
    )

  const desktopToggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  const desktopToggleButtonClassName = cn(
    'h-9 gap-0 border border-transparent text-[0.8rem] font-normal text-[#666] shadow-none transition-colors duration-200 hover:bg-white/[0.06] hover:text-[#aaa]',
    collapsed
      ? 'size-9 self-center justify-center rounded-lg px-0'
      : 'size-9 justify-center rounded-lg px-0'
  )

  const renderNavButton = ({ to, label, ariaLabel, icon: Icon, end }: NavItem) => {
    const isActive = isNavItemActive(to, end)

    return (
      <Button asChild variant="ghost" className={navButtonClassName(isActive)}>
        <NavLink to={to} end={end} aria-label={ariaLabel} onClick={() => onNavigate?.()}>
          <span className="flex size-9 shrink-0 items-center justify-center">
            <Icon
              className={cn(
                'size-[15px] shrink-0 transition-colors duration-200',
                isActive ? 'text-[#a78bfa]' : 'text-current'
              )}
            />
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
        'sidebar-root flex h-full shrink-0 flex-col overflow-hidden transition-all duration-300 shell-motion',
        collapsed ? 'px-2 py-3' : 'px-3 py-3',
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
      {/* Header: logo + app name + toggle — all in one row */}
      {isMobile ? (
        <div className="flex min-h-12 items-center px-2 py-2">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-6 items-center justify-center rounded-md bg-[rgba(139,92,246,0.2)]">
                <TerminalSquare className="size-3.5 text-[#a78bfa]" />
              </div>
              <span className="text-[0.78rem] font-semibold tracking-[0.04em] text-[#ccc]">
                agent-monitor
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="shrink-0 text-[#666] hover:text-[#ccc]"
              onClick={() => onClose?.()}
              aria-label="Close sidebar"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'mb-1 flex h-9 w-full items-center',
            collapsed ? 'justify-center px-0' : 'justify-between px-1'
          )}
        >
          {/* Logo + name — hidden when collapsed */}
          <div
            className={cn(
              'flex items-center gap-2',
              collapsed ? 'pointer-events-none w-0 overflow-hidden opacity-0' : 'opacity-100'
            )}
            style={{ transition: 'opacity 180ms ease, width 240ms cubic-bezier(0.22,1,0.36,1)' }}
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[rgba(139,92,246,0.2)]">
              <TerminalSquare className="size-3.5 text-[#a78bfa]" />
            </div>
            <span className="sidebar-label-motion sidebar-label-open whitespace-nowrap text-[0.78rem] font-semibold tracking-[0.04em] text-[#ccc]">
              agent-monitor
            </span>
          </div>

          {/* Toggle button */}
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
        <nav className={cn('mt-1 flex flex-col gap-0.5', showCollapsedTooltips && 'items-center')}>
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

      {/* Bottom divider line */}
      <div className="mt-auto">
        <div className="sidebar-bottom-divider" />
      </div>
    </aside>
  )
}
