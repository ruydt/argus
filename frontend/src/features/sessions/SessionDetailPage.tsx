import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ChevronDown, Copy, Pencil, Pin, PinOff, Tag, Trash2, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalTitle,
} from '@/components/shared/Modal'
import { AgentLogo, agentMeta } from '@/agents/catalog'
import { useHistoricalEvents } from '@/features/events/hooks/useHistoricalEvents'
import { useLiveEvents } from '@/features/events/hooks/useLiveEvents'
import { mergeByKey, buildEventKey } from '@/features/events/eventKey'
import { EventRow } from '@/features/events/EventRow'
import type { LayoutOutletContext } from '@/types'
import { projectName } from './utils'

// Same option set as the sidebar / sessions-list ⋯ menu, triggered by the
// chevron next to the session id in the detail header.
function SessionHeaderMenu({
  sessionId,
  tag,
  pinned,
  onTogglePin,
  onSetTag,
  onRemoveTag,
  onDelete,
  notify,
}: {
  sessionId: string
  tag?: string
  pinned: boolean
  onTogglePin: (id: string) => void
  onSetTag: (id: string, tag: string) => void
  onRemoveTag: (id: string) => void
  onDelete: () => void
  notify: (message: string, tone?: 'success' | 'error') => void
}) {
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
    onSetTag(sessionId, tagDraft)
    setTagOpen(false)
  }

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Session options"
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground data-[state=open]:bg-foreground/[0.08] data-[state=open]:text-foreground"
          >
            <ChevronDown className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-44 p-1">
          <div className="flex flex-col">
            <Button
              variant="ghost"
              size="sm"
              className="menu-item justify-start"
              onClick={() => {
                onTogglePin(sessionId)
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
                void navigator.clipboard?.writeText(sessionId)
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
                  onRemoveTag(sessionId)
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
                onDelete()
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

export function SessionDetailPage() {
  const params = useParams<{ sessionId: string }>()
  const sessionId = params.sessionId ? decodeURIComponent(params.sessionId) : ''

  const ctx = useOutletContext<LayoutOutletContext>()
  const navigate = useNavigate()
  const tag = ctx.sessionTags[sessionId]
  const pinned = ctx.pinnedSessions.has(sessionId)
  const tagLabel = tag ? `#${tag}` : undefined

  const handleDelete = async () => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: [sessionId] }),
      })
      if (!res.ok) throw new Error(String(res.status))
      ctx.removeSessions([sessionId])
      ctx.notify('Deleted session')
      navigate('/')
    } catch {
      ctx.notify('Delete failed', 'error')
    }
  }

  const hist = useHistoricalEvents('', '', sessionId, true, '')
  const live = useLiveEvents(sessionId, { enabled: true })

  // Newest first, deduped across the historical backfill and the live stream.
  const events = useMemo(() => {
    const merged = mergeByKey(hist.events, live.events)
    return merged.slice().sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  }, [hist.events, live.events])

  const firstEvent = events[0]
  const agentId = firstEvent?.agent || ''

  // Viewing a session clears its sidebar "unread Stop" bold: record the newest
  // event time as seen. Re-runs as live events arrive so it stays current.
  const markSeenSession = ctx.markSeenSession
  const newestTimeMs = firstEvent ? new Date(firstEvent.time).getTime() : 0
  useEffect(() => {
    if (sessionId && newestTimeMs > 0) markSeenSession(sessionId, newestTimeMs)
  }, [sessionId, newestTimeMs, markSeenSession])
  const cwd = events.find((e) => e.cwd)?.cwd ?? ''
  const project = cwd ? projectName(cwd) : ''

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const autoLoad = hist.hasMore
  const loadMore = hist.loadMore

  useEffect(() => {
    if (!autoLoad) return
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore()
      },
      { root: scrollRef.current, rootMargin: '400px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [autoLoad, loadMore])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5 sm:px-5">
        {agentId && (
          <span
            className="agent-badge shrink-0"
            title={agentMeta(agentId).label}
            aria-label={agentMeta(agentId).label}
          >
            <AgentLogo id={agentId} size={17} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              title={sessionId}
              className="min-w-0 truncate text-[0.82rem] font-semibold text-foreground"
            >
              {sessionId}
            </span>
            {tagLabel && (
              <span className="shrink-0 rounded bg-[#863bff]/15 px-1.5 py-0.5 text-[0.62rem] font-medium text-[#863bff]">
                {tagLabel}
              </span>
            )}
            <SessionHeaderMenu
              sessionId={sessionId}
              tag={tag}
              pinned={pinned}
              onTogglePin={ctx.togglePinSession}
              onSetTag={ctx.setSessionTag}
              onRemoveTag={ctx.removeSessionTag}
              onDelete={handleDelete}
              notify={ctx.notify}
            />
          </div>
          <div className="flex items-center gap-1.5 text-[0.68rem] text-muted-foreground">
            {project && (
              <>
                <span className="truncate font-medium text-foreground/70">{project}</span>
                <span aria-hidden className="text-foreground/25">
                  ·
                </span>
              </>
            )}
            <span>{events.length} events</span>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
        {live.error && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription>{live.error}</AlertDescription>
          </Alert>
        )}

        {events.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
            {hist.loading ? 'Loading session…' : 'No events for this session yet.'}
          </div>
        ) : (
          <div className="mx-auto max-w-5xl">
            {events.map((event) => (
              <EventRow key={buildEventKey(event)} event={event} searchQuery="" />
            ))}
          </div>
        )}

        {autoLoad && (
          <div ref={sentinelRef} className="flex justify-center py-4 text-xs text-muted-foreground">
            {hist.loading ? 'Loading…' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
