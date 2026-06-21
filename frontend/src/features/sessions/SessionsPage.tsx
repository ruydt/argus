import { useMemo, useState } from 'react'
import {
  Check,
  Copy,
  Inbox,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalTitle,
} from '@/components/shared/Modal'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/format'
import { AgentLogo, agentMeta } from '@/agents/catalog'
import type { LayoutOutletContext, SessionSummary } from '@/types'
import { effectiveTag, projectName } from './utils'

function SessionMeta({ session, tag }: { session: SessionSummary; tag?: string }) {
  const project = session.cwd ? projectName(session.cwd) : ''
  // The default tag IS the folder name, so suppress the duplicate project label
  // unless the user set a distinct explicit tag.
  const showProject = project && project !== tag
  return (
    <div className="flex shrink-0 items-center gap-4 text-[0.8rem]">
      {tag && (
        <span className="max-w-[140px] truncate rounded bg-[#863bff]/15 px-2 py-0.5 text-[0.7rem] font-medium text-[#863bff]">
          {tag}
        </span>
      )}
      {showProject && (
        <span className="hidden max-w-[220px] truncate text-muted-foreground/80 sm:inline">
          {project}
        </span>
      )}
      <span className="tabular-nums text-muted-foreground/60">
        {relativeTime(new Date(session.lastTimeMs).toISOString())}
      </span>
    </div>
  )
}

const ROW_CLASS =
  '-mx-3 flex items-center gap-3 border-b border-border/50 px-3 py-3.5 transition-colors duration-150 hover:bg-foreground/[0.03]'

type RowMenuActions = {
  onSelect: (id: string) => void
  onTogglePin: (id: string) => void
  onSetTag: (id: string, tag: string) => void
  onRemoveTag: (id: string) => void
  onDelete: (id: string) => void
  notify: (message: string, tone?: 'success' | 'error') => void
}

function SessionRowMenu({
  id,
  tag,
  pinned,
  actions,
}: {
  id: string
  tag?: string
  pinned: boolean
  actions: RowMenuActions
}) {
  const { onSelect, onTogglePin, onSetTag, onRemoveTag, onDelete, notify } = actions
  const [menuOpen, setMenuOpen] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  const openTagEditor = () => {
    setTagDraft(tag ?? '')
    setMenuOpen(false)
    setTagOpen(true)
  }

  const saveTag = () => {
    onSetTag(id, tagDraft)
    setTagOpen(false)
  }

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Session options"
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity',
              'hover:bg-foreground/[0.08] hover:text-foreground',
              'opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100'
            )}
          >
            <MoreVertical className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-44 p-1">
          <div className="flex flex-col">
            <Button
              variant="ghost"
              size="sm"
              className="menu-item justify-start"
              onClick={() => {
                setMenuOpen(false)
                onSelect(id)
              }}
            >
              <Check className="size-4" />
              Select
            </Button>

            <div className="mx-auto my-1 h-px w-[85%] bg-border" />

            <Button
              variant="ghost"
              size="sm"
              className="menu-item justify-start"
              onClick={() => {
                onTogglePin(id)
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
                notify('Session ID copied')
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
                  onRemoveTag(id)
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
                onDelete(id)
              }}
            >
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

function SessionRow({
  session,
  tag,
  pinned,
  selectMode,
  selected,
  onToggleSelect,
  menuActions,
}: {
  session: SessionSummary
  tag?: string
  pinned: boolean
  selectMode: boolean
  selected: boolean
  onToggleSelect: (id: string) => void
  menuActions: RowMenuActions
}) {
  // Display falls back to the working folder; the menu keeps acting on the
  // explicit tag so "Remove tag" reverts to the default rather than blanking it.
  // Explicit tags get a leading "#" to mark them apart from the folder default.
  const displayTag = effectiveTag(tag, session.cwd)
  const tagLabel = displayTag ? (tag ? `#${displayTag}` : displayTag) : undefined
  if (selectMode) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        title={session.sessionId}
        onClick={() => onToggleSelect(session.sessionId)}
        className={cn(ROW_CLASS, 'w-full text-left', selected && 'bg-foreground/[0.04]')}
      >
        <span
          className={cn(
            'flex size-[18px] shrink-0 items-center justify-center rounded border transition-colors',
            selected
              ? 'border-[#863bff] bg-[#863bff] text-white'
              : 'border-foreground/25 bg-transparent'
          )}
        >
          {selected && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className="flex size-4 shrink-0 items-center justify-center">
          <AgentLogo id={session.sample?.agent || 'unknown'} size={14} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.9rem] text-foreground">
          {session.sessionId}
        </span>
        <SessionMeta session={session} tag={tagLabel} />
      </button>
    )
  }

  return (
    <div className={cn(ROW_CLASS, 'group/row relative')}>
      <Link
        to={`/sessions/${encodeURIComponent(session.sessionId)}`}
        title={session.sessionId}
        className="flex min-w-0 flex-1 items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#863bff]/40"
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
          <AgentLogo id={session.sample?.agent || 'unknown'} size={14} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.9rem] text-foreground">
          {session.sessionId}
        </span>
        {/* Meta (project + time) fades out on hover so the 3-dot menu can sit in its place. */}
        <div className="transition-opacity duration-150 group-hover/row:opacity-0">
          <SessionMeta session={session} tag={tagLabel} />
        </div>
      </Link>
      <div className="absolute inset-y-0 right-1 flex items-center">
        <SessionRowMenu id={session.sessionId} tag={tag} pinned={pinned} actions={menuActions} />
      </div>
    </div>
  )
}

function RowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-3.5">
      <div className="h-3.5 w-1/2 animate-pulse rounded bg-foreground/[0.06]" />
      <div className="h-3 w-20 animate-pulse rounded bg-foreground/[0.05]" />
    </div>
  )
}

export function SessionsPage() {
  const {
    sessions,
    sessionsLoading: loading,
    sessionsError: error,
    sessionsHasMore: hasMore,
    loadMoreSessions: loadMore,
    removeSessions,
    sessionTags: tags,
    pinnedSessions: pinned,
    togglePinSession,
    setSessionTag,
    removeSessionTag,
    notify,
  } = useOutletContext<LayoutOutletContext>()
  const [query, setQuery] = useState('')
  const [agentFilter, setAgentFilter] = useState('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Distinct project names across all sessions — feeds the project filter dropdown.
  const projects = useMemo(() => {
    const set = new Set<string>()
    for (const s of sessions) {
      if (s.cwd) set.add(projectName(s.cwd))
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [sessions])

  // Distinct agent ids actually present in the sessions — feeds the agent filter
  // dropdown so every supported agent (not just Claude Code / Codex) is offered.
  const presentAgents = useMemo(() => {
    const set = new Set<string>()
    for (const s of sessions) {
      const id = s.sample?.agent
      if (id) set.add(id)
    }
    return Array.from(set).sort((a, b) => agentMeta(a).label.localeCompare(agentMeta(b).label))
  }, [sessions])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = sessions.filter((s) => {
      if (agentFilter !== 'all' && (s.sample?.agent || '') !== agentFilter) return false
      if (projectFilter !== 'all' && (!s.cwd || projectName(s.cwd) !== projectFilter)) return false
      if (!q) return true
      return (
        s.sessionId.toLowerCase().includes(q) ||
        (s.cwd && projectName(s.cwd).toLowerCase().includes(q)) ||
        (tags[s.sessionId] ?? '').toLowerCase().includes(q)
      )
    })
    // Pinned sessions float to the top; recency order is preserved within each group.
    return matched
      .map((s, i) => ({ s, i }))
      .sort((a, b) => {
        const pa = pinned.has(a.s.sessionId) ? 0 : 1
        const pb = pinned.has(b.s.sessionId) ? 0 : 1
        return pa - pb || a.i - b.i
      })
      .map((x) => x.s)
  }, [sessions, query, agentFilter, projectFilter, tags, pinned])

  const showInitialSkeleton = loading && sessions.length === 0
  const filtering = query.trim() !== '' || agentFilter !== 'all' || projectFilter !== 'all'
  const allSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.sessionId))

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(filtered.map((s) => s.sessionId)))

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const handleDelete = async () => {
    const ids = [...selected]
    if (ids.length === 0) return

    setDeleting(true)
    try {
      const res = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: ids }),
      })
      if (!res.ok) throw new Error(String(res.status))
      removeSessions(ids)
      setConfirmOpen(false)
      exitSelect()
      notify(`Deleted ${ids.length} session${ids.length === 1 ? '' : 's'}`)
    } catch {
      setConfirmOpen(false)
      notify('Delete failed', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const deleteOne = async (id: string) => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: [id] }),
      })
      if (!res.ok) throw new Error(String(res.status))
      removeSessions([id])
      notify('Deleted session')
    } catch {
      notify('Delete failed', 'error')
    }
  }

  const enterSelectWith = (id: string) => {
    setSelectMode(true)
    setSelected(new Set([id]))
  }

  const menuActions: RowMenuActions = {
    onSelect: enterSelectWith,
    onTogglePin: togglePinSession,
    onSetTag: setSessionTag,
    onRemoveTag: removeSessionTag,
    onDelete: deleteOne,
    notify,
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-5 pb-8 pt-10 sm:px-8 sm:pt-12">
        <header className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-[28px] font-semibold tracking-tight text-foreground">Sessions</h1>

          {selectMode ? (
            <div className="flex items-center gap-2">
              <span className="mr-1 text-[0.8rem] tabular-nums text-muted-foreground">
                {selected.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSelectAll}
                disabled={filtered.length === 0}
                className="h-9 rounded-lg text-[0.8rem]"
              >
                {allSelected ? 'Clear all' : 'Select all'}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={selected.size === 0 || deleting}
                className="h-9 rounded-lg text-[0.8rem]"
              >
                Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={exitSelect}
                disabled={deleting}
                className="h-9 rounded-lg text-[0.8rem]"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {projects.length > 0 && (
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger
                    aria-label="Filter by project"
                    className="h-9 w-[160px] rounded-lg border-foreground/[0.1] bg-foreground/[0.02] text-[0.8rem]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All projects</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project} value={project}>
                        {project}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger
                  aria-label="Filter by agent"
                  className="h-9 w-[150px] rounded-lg border-foreground/[0.1] bg-foreground/[0.02] text-[0.8rem]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents</SelectItem>
                  {presentAgents.map((id) => (
                    <SelectItem key={id} value={id}>
                      {agentMeta(id).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectMode(true)}
                disabled={sessions.length === 0}
                className="h-9 rounded-lg text-[0.8rem]"
              >
                Select sessions
              </Button>
            </div>
          )}
        </header>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sessions…"
            aria-label="Search sessions"
            className="h-12 rounded-xl border-foreground/[0.08] bg-foreground/[0.03] pl-11 text-[0.9rem]"
          />
        </div>

        {error && <p className="mb-2 text-[0.72rem] text-amber-600 dark:text-amber-500">{error}</p>}

        <div>
          {showInitialSkeleton ? (
            Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)
          ) : filtered.length === 0 ? (
            <Empty className="min-h-[300px] border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox className="size-5" />
                </EmptyMedia>
                <EmptyTitle>{filtering ? 'No matching sessions' : 'No sessions yet'}</EmptyTitle>
                <EmptyDescription>
                  {filtering
                    ? 'Try a different search or agent filter.'
                    : 'Start a coding session and it will appear here as events stream in.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            filtered.map((session) => (
              <SessionRow
                key={session.sessionId}
                session={session}
                tag={tags[session.sessionId]}
                pinned={pinned.has(session.sessionId)}
                selectMode={selectMode}
                selected={selected.has(session.sessionId)}
                onToggleSelect={toggleSelect}
                menuActions={menuActions}
              />
            ))
          )}
        </div>

        {!filtering && !selectMode && hasMore && filtered.length > 0 && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loading}
              className={cn(
                'rounded-lg border border-foreground/[0.1] px-4 py-1.5 text-[0.75rem] font-medium text-muted-foreground transition-colors',
                'hover:border-foreground/[0.16] hover:bg-foreground/[0.04] hover:text-foreground',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {loading ? 'Loading…' : 'Load older sessions'}
            </button>
          </div>
        )}
      </div>

      <Modal open={confirmOpen} onOpenChange={setConfirmOpen}>
        <ModalContent>
          <ModalTitle>
            Delete {selected.size === 1 ? 'session' : `${selected.size} sessions`}?
          </ModalTitle>
          <ModalDescription>
            This permanently removes the selected session{selected.size === 1 ? '' : 's'} and all of
            their events. This cannot be undone.
          </ModalDescription>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
