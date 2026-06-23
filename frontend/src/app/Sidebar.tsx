import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import {
  PanelLeft,
  Webhook,
  ChevronDown,
  ChevronRight,
  Copy,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Store,
  Stethoscope,
  Tag,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, useMatch } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalTitle,
} from '@/components/shared/Modal'
import { VersionBadge } from '@/features/version/VersionBadge'
import { AgentLogo } from '@/agents/catalog'
import { effectiveTag, isUnreadStop } from '@/features/sessions/utils'
import { cn } from '@/lib/utils'
import type { SessionSummary } from '@/types'
import { ThemeToggle } from './ThemeToggle'

// Argus mark — flat cyclops: round violet body on two legs with a single round eye.
// Same geometry as favicon.svg. Solid fill, no outline — reads on any background.
function ArgusLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <path
        d="M 205 320 L 205 385 C 205 400, 195 405, 180 405 L 225 405 C 232 405, 232 400, 232 385 L 232 320 Z"
        fill="#8B5DF6"
      />
      <path
        d="M 307 320 L 307 385 C 307 400, 317 405, 332 405 L 287 405 C 280 405, 280 400, 280 385 L 280 320 Z"
        fill="#8B5DF6"
      />
      <circle cx="256" cy="220" r="140" fill="#8B5DF6" />
      <circle cx="256" cy="220" r="70" fill="#FFFFFF" />
      <circle cx="256" cy="220" r="45" fill="#181B31" />
      <circle cx="274" cy="202" r="11" fill="#FFFFFF" />
    </svg>
  )
}

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
  sessions?: SessionSummary[]
  onDeleteSession?: (id: string) => void
  pinnedIds?: Set<string>
  tags?: Record<string, string>
  seen?: Record<string, number>
  onTogglePin?: (id: string) => void
  onSetTag?: (id: string, tag: string) => void
  onRemoveTag?: (id: string) => void
}

type SessionActions = {
  onNavigate?: () => void
  onDeleteSession?: (id: string) => void
  onTogglePin?: (id: string) => void
  onSetTag?: (id: string, tag: string) => void
  onRemoveTag?: (id: string) => void
}

// Fade the right edge of long session ids — same treatment as the Recents page.
const SIDEBAR_FADE_MASK = '[mask-image:linear-gradient(to_right,black_80%,transparent)]'

function SidebarSessionItem({
  session,
  tag,
  pinned,
  unread,
  actions,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  session: SessionSummary
  tag?: string
  pinned: boolean
  unread: boolean
  actions: SessionActions
  dragging: boolean
  onDragStart: (id: string) => void
  onDragEnd: () => void
}) {
  const { onNavigate, onDeleteSession, onTogglePin, onSetTag, onRemoveTag } = actions
  const id = session.sessionId
  // Badge defaults to the working folder; menu actions still use the explicit tag.
  // Explicit user tags get a leading "#" to set them apart from the folder default.
  const displayTag = effectiveTag(tag, session.cwd)
  const tagLabel = displayTag ? (tag ? `#${displayTag}` : displayTag) : undefined

  const selected = useMatch('/sessions/:sessionId')?.params.sessionId === id

  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const [tagDraft, setTagDraft] = useState('')

  const openTagEditor = () => {
    setTagDraft(tag ?? '')
    setMenuOpen(false)
    setTagOpen(true)
  }

  const saveTag = () => {
    onSetTag?.(id, tagDraft)
    setTagOpen(false)
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', id)
        onDragStart(id)
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group/item flex cursor-pointer items-center rounded-md transition-colors duration-150',
        dragging && 'cursor-grabbing opacity-40',
        selected
          ? 'bg-foreground/[0.07]'
          : menuOpen
            ? 'bg-foreground/[0.05]'
            : 'hover:bg-foreground/[0.05]'
      )}
    >
      <NavLink
        draggable={false}
        to={`/sessions/${encodeURIComponent(id)}`}
        title={id}
        onClick={() => onNavigate?.()}
        className={({ isActive }) =>
          cn(
            'min-w-0 flex-1 rounded-md py-1.5 pl-2 pr-1 transition-colors duration-150',
            isActive ? 'text-foreground' : 'text-muted-foreground group-hover/item:text-foreground'
          )
        }
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="flex shrink-0 items-center justify-center">
            <AgentLogo id={session.sample?.agent || 'unknown'} size={11} />
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 overflow-hidden whitespace-nowrap text-[0.72rem]',
              // Bold + brighten when the session's last event is an unseen Stop.
              unread && 'font-semibold text-foreground',
              SIDEBAR_FADE_MASK
            )}
          >
            {id}
          </span>
        </span>
      </NavLink>

      {/* Right slot: tag and the ⋯ button both collapse their width when not in
          use, so the badge sits flush at rest and the id ends right at (touches,
          never under) the dots on hover. The button stays mounted (width/opacity,
          not display) so Radix keeps a stable anchor — a display:none trigger on
          close makes the closing content flash at the top-left corner. */}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <div className="mr-1 flex h-6 shrink-0 items-center">
          {tagLabel && (
            <span
              className={cn(
                'pointer-events-none overflow-hidden truncate rounded bg-[#863bff]/15 py-0.5 text-[0.58rem] font-medium text-[#863bff] transition-all duration-200 ease-out',
                menuOpen
                  ? 'max-w-0 px-0 opacity-0'
                  : 'max-w-[80px] px-1.5 opacity-100 group-hover/item:max-w-0 group-hover/item:px-0 group-hover/item:opacity-0'
              )}
            >
              {tagLabel}
            </span>
          )}
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Session options"
              className={cn(
                'flex h-6 w-0 shrink-0 items-center justify-center overflow-hidden rounded text-muted-foreground opacity-0 transition-all duration-200 ease-out',
                'hover:bg-foreground/[0.12] hover:text-foreground',
                'group-hover/item:w-6 group-hover/item:opacity-100 focus-visible:w-6 focus-visible:opacity-100 data-[state=open]:w-6 data-[state=open]:opacity-100'
              )}
            >
              <MoreVertical className="size-3.5 shrink-0" />
            </button>
          </PopoverTrigger>
        </div>
        <PopoverContent side="right" align="start" sideOffset={6} className="w-44 p-1">
          <div className="flex flex-col">
            <Button
              variant="ghost"
              size="sm"
              className="menu-item justify-start"
              onClick={() => {
                onTogglePin?.(id)
                setMenuOpen(false)
              }}
            >
              {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              {pinned ? 'Unpin' : 'Pin'}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="menu-item justify-start"
              onClick={openTagEditor}
            >
              {tag ? <Pencil className="size-4" /> : <Tag className="size-4" />}
              {tag ? 'Edit tag' : 'Tag'}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="menu-item justify-start"
              onClick={() => {
                void navigator.clipboard?.writeText(id)
                setMenuOpen(false)
              }}
            >
              <Copy className="size-4" />
              Copy ID
            </Button>

            <div className="mx-auto my-1 h-px w-[85%] bg-border" />

            {tag && (
              <Button
                variant="ghost"
                size="sm"
                className="danger-action justify-start"
                onClick={() => {
                  onRemoveTag?.(id)
                  setMenuOpen(false)
                }}
              >
                <X className="size-4" />
                Remove tag
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="danger-action justify-start"
              onClick={() => {
                setMenuOpen(false)
                setConfirmOpen(true)
              }}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Modal open={tagOpen} onOpenChange={setTagOpen}>
        <ModalContent>
          <ModalTitle>{tag ? 'Edit tag' : 'Tag session'}</ModalTitle>
          <ModalDescription>Add a short label to group and track this session.</ModalDescription>
          <Input
            autoFocus
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTag()
            }}
            placeholder="e.g. bug, demo, client-x"
            maxLength={24}
            className="mt-4 h-10"
          />
          <ModalFooter>
            <Button variant="ghost" onClick={() => setTagOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveTag}>Save</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal open={confirmOpen} onOpenChange={setConfirmOpen}>
        <ModalContent>
          <ModalTitle>Delete session?</ModalTitle>
          <ModalDescription>
            This permanently removes this session and all of its events. This cannot be undone.
          </ModalDescription>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false)
                onDeleteSession?.(id)
              }}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}

const RECENTS_OPEN_STORAGE_KEY = 'sidebar_recents_open'
const PINNED_OPEN_STORAGE_KEY = 'sidebar_pinned_open'

function loadOpenState(key: string): boolean {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? JSON.parse(raw) : true
  } catch {
    return true
  }
}

// Height collapse for the Pinned body via the grid-rows 0fr→1fr trick.
// animateOnMount: start collapsed and slide open on the next frame so the section
// animates only when it first appears mid-drag. The transition is disabled once
// that open completes — so pin-via-menu (mounts open) and manual header toggles
// are instant, never animated.
// forceAnimate: parent-driven flag that re-enables the transition for a one-off
// close (e.g. dragging the last pinned item out) — symmetric to the open slide.
// onCollapsed fires when a collapse transition finishes so the parent can unmount.
function PinnedCollapse({
  expanded,
  animateOnMount,
  forceAnimate = false,
  onCollapsed,
  children,
}: {
  expanded: boolean
  animateOnMount: boolean
  forceAnimate?: boolean
  onCollapsed?: () => void
  children: ReactNode
}) {
  const [ready, setReady] = useState(!animateOnMount)
  const [animating, setAnimating] = useState(animateOnMount)

  useEffect(() => {
    if (ready) return
    const raf = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(raf)
  }, [ready])

  const open = ready && expanded

  return (
    <div
      onTransitionEnd={() => {
        setAnimating(false)
        if (!open) onCollapsed?.()
      }}
      className={cn(
        'grid',
        (animating || forceAnimate) && 'transition-[grid-template-rows] duration-200 ease-out',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  )
}

function SidebarSessions({
  sessions,
  tags,
  pinnedIds,
  seen,
  actions,
}: {
  sessions: SessionSummary[]
  tags: Record<string, string>
  pinnedIds: Set<string>
  seen: Record<string, number>
  actions: SessionActions
}) {
  const [open, setOpen] = useState(() => loadOpenState(RECENTS_OPEN_STORAGE_KEY))
  const [pinnedOpen, setPinnedOpen] = useState(() => loadOpenState(PINNED_OPEN_STORAGE_KEY))
  // Drag-to-pin: the session id being dragged, plus which drop zone the cursor is over.
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overZone, setOverZone] = useState<'pinned' | 'recent' | null>(null)
  // When the last pinned item is dragged out, keep the section mounted with a
  // snapshot of its contents so it can animate closed (mirrors the open slide)
  // before unmounting.
  const [closingList, setClosingList] = useState<SessionSummary[] | null>(null)
  // Only render as many recents as fit the available height — no scroll. The rest
  // live behind "View all". Measured live so it adapts to viewport / pinned count.
  const recentsRef = useRef<HTMLDivElement>(null)
  const [recentsFit, setRecentsFit] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(RECENTS_OPEN_STORAGE_KEY, JSON.stringify(open))
    } catch {
      /* storage unavailable */
    }
  }, [open])

  useEffect(() => {
    try {
      localStorage.setItem(PINNED_OPEN_STORAGE_KEY, JSON.stringify(pinnedOpen))
    } catch {
      /* storage unavailable */
    }
  }, [pinnedOpen])

  // ~28px per row (NavLink py-1.5 + 0.72rem line + 1px gap). Conservative so a
  // partial row is dropped rather than clipped.
  const RECENT_ROW_PX = 28
  useLayoutEffect(() => {
    const el = recentsRef.current
    if (!el) return
    const measure = () => setRecentsFit(Math.max(1, Math.floor(el.clientHeight / RECENT_ROW_PX)))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])

  const pinnedList = sessions.filter((s) => pinnedIds.has(s.sessionId))
  const recentList = sessions.filter((s) => !pinnedIds.has(s.sessionId))
  const visibleRecents = recentsFit > 0 ? recentList.slice(0, recentsFit) : recentList

  const draggingPinned = draggingId !== null && pinnedIds.has(draggingId)
  const closing = closingList !== null
  // Show the Pinned section when something is pinned, while dragging a recent
  // item so an empty drop target appears for the very first pin, or while the
  // section is animating closed after the last pin was removed.
  const showPinned = pinnedList.length > 0 || (draggingId !== null && !draggingPinned) || closing
  // While dragging toward an empty Pinned section, force it open so the drop zone
  // is visible. Force it collapsed while closing so the transition plays.
  const pinnedExpanded =
    !closing && (pinnedOpen || (pinnedList.length === 0 && draggingId !== null))

  const resetDrag = () => {
    setDraggingId(null)
    setOverZone(null)
  }

  const dropTo = (target: 'pinned' | 'recent') => {
    if (draggingId !== null) {
      const isPinned = pinnedIds.has(draggingId)
      if (target === 'pinned' && !isPinned) actions.onTogglePin?.(draggingId)
      if (target === 'recent' && isPinned) {
        // Snapshot the section before unpinning the last item so it can animate
        // closed (same slide as dragging the first pin opens it).
        if (pinnedList.length === 1) setClosingList(pinnedList)
        actions.onTogglePin?.(draggingId)
      }
    }
    resetDrag()
  }

  const renderItem = (session: SessionSummary) => (
    <SidebarSessionItem
      key={session.sessionId}
      session={session}
      tag={tags[session.sessionId]}
      pinned={pinnedIds.has(session.sessionId)}
      unread={isUnreadStop(session, seen)}
      actions={actions}
      dragging={draggingId === session.sessionId}
      onDragStart={(id) => {
        // Defer: inserting the Pinned drop zone synchronously during dragstart
        // mutates the DOM and Chrome cancels the native drag. Let dragstart finish first.
        setTimeout(() => setDraggingId(id), 0)
      }}
      onDragEnd={resetDrag}
    />
  )

  return (
    <div className={cn('mt-6 flex min-h-0 flex-col', (open || showPinned) && 'flex-1')}>
      {showPinned && (
        <div
          onDragOver={(e) => {
            if (draggingId !== null) {
              e.preventDefault()
              setOverZone('pinned')
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            dropTo('pinned')
          }}
          className={cn(
            'group/pinned mb-3 rounded-md transition-colors',
            overZone === 'pinned' &&
              !draggingPinned &&
              'bg-[#863bff]/[0.06] ring-1 ring-[#863bff]/30'
          )}
        >
          <button
            type="button"
            onClick={(e) => {
              setPinnedOpen((v) => !v)
              // Drop focus on a real pointer click so the chevron (revealed via
              // group-focus-within) fades out once the cursor leaves. Keyboard
              // activation (detail === 0) keeps focus for visibility.
              if (e.detail > 0) e.currentTarget.blur()
            }}
            aria-expanded={pinnedExpanded}
            aria-label={pinnedExpanded ? 'Collapse pinned' : 'Expand pinned'}
            className="group/pinhead mb-1 inline-flex items-center gap-1 pl-2 text-[0.7rem] font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            Pinned
            <ChevronDown
              className={cn(
                'size-3 opacity-0 transition-[transform,opacity] duration-200 group-hover/pinned:opacity-100 group-focus-within/pinhead:opacity-100',
                pinnedExpanded ? 'rotate-0' : '-rotate-90'
              )}
            />
          </button>
          <PinnedCollapse
            expanded={pinnedExpanded}
            animateOnMount={pinnedList.length === 0 && draggingId !== null}
            forceAnimate={closing}
            onCollapsed={() => setClosingList(null)}
          >
            {pinnedList.length === 0 ? (
              closing ? (
                <div className="flex flex-col gap-px">{closingList.map(renderItem)}</div>
              ) : (
                <p className="px-2 py-2 text-[0.7rem] text-muted-foreground/40">Drag here to pin</p>
              )
            ) : (
              <div className="flex flex-col gap-px">{pinnedList.map(renderItem)}</div>
            )}
          </PinnedCollapse>
        </div>
      )}

      <div className={cn('group/recents flex min-h-0 flex-col', open && 'flex-1')}>
        <div className="group/rechead mb-1 flex items-center justify-between gap-2 pl-2 pr-1">
          <button
            type="button"
            onClick={(e) => {
              setOpen((v) => !v)
              // Drop focus on pointer click so the chevron + "View all" (shown
              // via group-focus-within) fade once the cursor leaves.
              if (e.detail > 0) e.currentTarget.blur()
            }}
            aria-expanded={open}
            aria-label={open ? 'Collapse recents' : 'Expand recents'}
            className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
          >
            Recents
            <ChevronDown
              className={cn(
                'size-3 opacity-0 transition-[transform,opacity] duration-200 group-hover/recents:opacity-100 group-focus-within/rechead:opacity-100',
                open ? 'rotate-0' : '-rotate-90'
              )}
            />
          </button>
          <NavLink
            to="/"
            end
            onClick={(e) => {
              actions.onNavigate?.()
              // Already on "/"? The link stays mounted and focused — blur on a
              // pointer click so it fades when the cursor leaves.
              if (e.detail > 0) e.currentTarget.blur()
            }}
            className="inline-flex shrink-0 items-center gap-0.5 rounded text-[0.7rem] font-medium text-muted-foreground/70 opacity-0 transition-[color,opacity] hover:text-foreground group-hover/recents:opacity-100 group-focus-within/rechead:opacity-100"
          >
            View all
            <ChevronRight className="size-3" />
          </NavLink>
        </div>

        {open && (
          <div
            ref={recentsRef}
            onDragOver={(e) => {
              if (draggingId !== null) {
                e.preventDefault()
                setOverZone('recent')
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              dropTo('recent')
            }}
            className={cn(
              '-mr-1 min-h-0 flex-1 overflow-hidden rounded-md pr-1 transition-colors',
              overZone === 'recent' &&
                draggingPinned &&
                'bg-[#863bff]/[0.06] ring-1 ring-[#863bff]/30'
            )}
          >
            {recentList.length === 0 ? (
              <p className="px-2 py-1 text-[0.7rem] text-muted-foreground/60">
                {pinnedList.length > 0 ? 'All sessions pinned' : 'No sessions yet'}
              </p>
            ) : (
              <div className="flex flex-col gap-px">{visibleRecents.map(renderItem)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

interface NavItem {
  to: string
  label: string
  ariaLabel: string
  icon: LucideIcon
  end: boolean
  dataTour?: string
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
  dataTour,
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
        data-tour={dataTour}
        {...rest}
      >
        <span className="flex size-7 shrink-0 items-center justify-center">
          <Icon
            className={cn(
              'size-[15px] shrink-0 transition-colors duration-200',
              isActive ? 'text-foreground' : 'text-current'
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
    to: '/diagnostics',
    label: 'Diagnostics',
    ariaLabel: 'System Diagnostics',
    icon: Stethoscope,
    end: false,
  },
  {
    to: '/hooks',
    label: 'Hooks',
    ariaLabel: 'Hooks Configuration',
    icon: Webhook,
    end: false,
    dataTour: 'hooks-config-link',
  },
  {
    to: '/marketplace',
    label: 'Marketplace',
    ariaLabel: 'Hook Script Marketplace',
    icon: Store,
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
  sessions = [],
  onDeleteSession,
  pinnedIds,
  tags,
  seen,
  onTogglePin,
  onSetTag,
  onRemoveTag,
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
      'sidebar-nav-item h-7 gap-0 border text-[0.72rem] font-normal transition-all duration-200',
      collapsed ? 'w-full justify-center rounded-lg px-0' : 'w-full justify-start rounded-lg px-0',
      isActive
        ? 'sidebar-nav-active border-foreground/[0.12] bg-foreground/[0.07] text-foreground hover:bg-foreground/[0.07]!'
        : 'border-transparent text-muted-foreground hover:border-foreground/[0.08] hover:bg-foreground/[0.05] hover:text-foreground'
    )

  const desktopToggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar'
  const desktopToggleButtonClassName = cn(
    'h-9 gap-0 border border-transparent text-[0.72rem] font-normal text-muted-foreground shadow-none transition-colors duration-200 hover:bg-foreground/[0.06] hover:text-muted-foreground',
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
                <ArgusLogo className="size-5 text-foreground" />
              </div>
              <span className="text-[0.78rem] font-semibold tracking-[0.04em] text-foreground">
                argus
              </span>
            </div>
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
              <ArgusLogo className="size-5 text-foreground" />
            </div>
            <span className="sidebar-label-motion sidebar-label-open whitespace-nowrap text-[0.78rem] font-semibold tracking-[0.04em] text-foreground">
              argus
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
        <nav className={cn('mt-1 flex flex-col gap-px')} data-tour="sidebar-nav">
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

        {/* Sessions — pinned + recents list, expanded sidebar only (no room when collapsed) */}
        {!collapsed && (
          <SidebarSessions
            sessions={sessions}
            tags={tags ?? {}}
            pinnedIds={pinnedIds ?? new Set<string>()}
            seen={seen ?? {}}
            actions={{
              onNavigate,
              onDeleteSession,
              onTogglePin,
              onSetTag,
              onRemoveTag,
            }}
          />
        )}

        {/* Bottom divider line + version badge */}
        <div className="mt-auto">
          <div className="mb-0.5">
            <ThemeToggle
              collapsed={collapsed}
              showCollapsedTooltips={showCollapsedTooltips}
              desktopNavLabelClassName={desktopNavLabelClassName}
            />
          </div>
          <div className="sidebar-bottom-divider sidebar-bottom-divider--full" />
          {!collapsed && (
            <div className="flex items-center px-2 pt-2 pb-1">
              <VersionBadge />
            </div>
          )}
        </div>
      </TooltipProvider>
    </aside>
  )
}
