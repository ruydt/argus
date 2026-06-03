import { Fragment, useEffect, type AnchorHTMLAttributes, type Ref, type RefObject } from 'react'
import {
  FishingHook,
  GitFork,
  LayoutDashboard,
  PanelLeft,
  Stethoscope,
  TerminalSquare,
  Webhook,
  X,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, useMatch } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { VersionBadge } from '@/features/version/VersionBadge'
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

type NavButtonProps = NavItem &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick' | 'className' | 'aria-label'> & {
    ref?: Ref<HTMLAnchorElement>
    onNavigate?: () => void
    desktopNavLabelClassName: string
    navButtonClassNameFn: (isActive: boolean) => string
  }

function NavButton({
  to,
  label,
  ariaLabel,
  icon: Icon,
  end,
  ref,
  onNavigate,
  desktopNavLabelClassName,
  navButtonClassNameFn,
  ...rest
}: NavButtonProps) {
  const match = useMatch({ path: to, end })
  const isActive = match !== null

  return (
    <Button asChild variant="ghost" className={navButtonClassNameFn(isActive)}>
      <NavLink
        ref={ref}
        to={to}
        end={end}
        aria-label={ariaLabel}
        onClick={() => onNavigate?.()}
        {...rest}
      >
        <span className="flex size-9 shrink-0 items-center justify-center">
          <Icon
            className={cn(
              'size-[15px] shrink-0 transition-colors duration-200',
              isActive ? 'text-[#e6e6e6]' : 'text-current'
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

const NAV_ITEMS: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    ariaLabel: 'Overview Dashboard',
    icon: LayoutDashboard,
    end: false,
  },
  {
    to: '/',
    label: 'Events',
    ariaLabel: 'Terminal Events',
    icon: TerminalSquare,
    end: true,
  },
  {
    to: '/projects',
    label: 'Projects',
    ariaLabel: 'Projects',
    icon: GitFork,
    end: false,
  },
  {
    to: '/diagnostics',
    label: 'Diagnostics',
    ariaLabel: 'System Diagnostics',
    icon: Stethoscope,
    end: false,
  },
  {
    to: '/hooks-config',
    label: 'Hooks Config',
    ariaLabel: 'Hooks Configuration',
    icon: Webhook,
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
  const showCollapsedTooltips = mode === 'desktop' && collapsed
  const isMobile = mode === 'mobile'
  const desktopLabelStateClassName = collapsed ? 'sidebar-label-closed' : 'sidebar-label-open'
  const desktopNavLabelClassName = cn(
    'sidebar-label-motion sidebar-label-nav',
    desktopLabelStateClassName
  )
  const navButtonClassName = (isActive: boolean) =>
    cn(
      'sidebar-nav-item h-9 gap-0 border text-[0.8rem] font-normal transition-all duration-200',
      collapsed ? 'w-9 justify-start rounded-lg px-0' : 'w-full justify-start rounded-lg px-0',
      isActive
        ? 'sidebar-nav-active border-[rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.09)] text-[#e6e6e6]'
        : 'border-transparent text-[#9a9a9a] hover:border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#d4d4d4]'
    )

  const desktopToggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  const desktopToggleButtonClassName = cn(
    'h-9 gap-0 border border-transparent text-[0.8rem] font-normal text-[#666] shadow-none transition-colors duration-200 hover:bg-white/[0.06] hover:text-[#aaa]',
    collapsed ? 'size-9 justify-center rounded-lg px-0' : 'size-9 justify-center rounded-lg px-0'
  )

  const renderNavButton = (item: NavItem) => (
    <NavButton
      {...item}
      onNavigate={onNavigate}
      desktopNavLabelClassName={desktopNavLabelClassName}
      navButtonClassNameFn={navButtonClassName}
    />
  )

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
        'sidebar-root flex h-full shrink-0 flex-col overflow-hidden transition-all duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] shell-motion',
        'px-2 py-3',
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
        <div className="flex min-h-12 items-center p-2">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-6 items-center justify-center">
                <FishingHook className="size-3.5 text-[#9a9a9a]" />
              </div>
              <span className="text-[0.78rem] font-semibold tracking-[0.04em] text-[#ccc]">
                hooker
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
            collapsed ? 'justify-center px-0' : 'justify-between pl-[6px] pr-[4px]'
          )}
        >
          {/* Logo + name — hidden when collapsed */}
          <div
            className={cn(
              'flex items-center gap-2',
              collapsed ? 'pointer-events-none w-0 overflow-hidden opacity-0' : 'opacity-100'
            )}
            style={{
              transition: 'opacity 180ms ease',
            }}
          >
            <div className="flex size-6 shrink-0 items-center justify-center">
              <FishingHook className="size-3.5 text-[#9a9a9a]" />
            </div>
            <span className="sidebar-label-motion sidebar-label-open whitespace-nowrap text-[0.78rem] font-semibold tracking-[0.04em] text-[#ccc]">
              hooker
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
        <nav className={cn('mt-1 flex flex-col gap-0.5')}>
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

      {/* Bottom divider line + version badge */}
      <div className="mt-auto">
        <div className="sidebar-bottom-divider" />
        {!collapsed && (
          <div className="flex items-center px-2 pt-2 pb-1">
            <VersionBadge />
          </div>
        )}
      </div>
    </aside>
  )
}
