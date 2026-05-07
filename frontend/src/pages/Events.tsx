import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { agentForEvent } from '../agents'
import { AgentSession } from '../components/events/AgentSession'
import { useEvents } from '../hooks/useEvents'
import type {
  CtxLine,
  EventRecord,
  LayoutOutletContext,
  SessionGroup,
  SessionUsage,
  TooltipState,
} from '@/types'

export function Events() {
  const [actionFilter, setActionFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortOrder, setSortOrder] = useState('newest')
  const [timeRange, setTimeRange] = useState('15m')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const { collapsedSessions, setCollapsedSessions, sessionUsage, setSessionUsage } =
    useOutletContext<LayoutOutletContext>()
  const fetchedUsage = useRef<Set<string>>(new Set())
  const { events } = useEvents()

  useEffect(() => {
    const seen = new Map<string, string>()
    events.forEach((event) => {
      const agent = agentForEvent(event)
      if (
        agent.supportsSessionUsage &&
        event.transcript_path &&
        event.session &&
        !seen.has(event.session)
      ) {
        seen.set(event.session, event.transcript_path)
      }
    })

    seen.forEach(async (path, key) => {
      if (fetchedUsage.current.has(key)) return

      fetchedUsage.current.add(key)

      try {
        const res = await fetch(`/api/session-usage?path=${encodeURIComponent(path)}`)
        if (!res.ok) {
          throw new Error(`Failed to fetch session usage: ${res.status}`)
        }

        const data = (await res.json()) as SessionUsage
        const hasAnyUsage =
          Number(data.input_tokens || 0) > 0 ||
          Number(data.output_tokens || 0) > 0 ||
          Number(data.cache_read_tokens || 0) > 0 ||
          Number(data.cache_creation_tokens || 0) > 0 ||
          Number(data.turns || 0) > 0

        if (!hasAnyUsage) {
          fetchedUsage.current.delete(key)
        }

        setSessionUsage((prev) => ({ ...prev, [key]: data }))
      } catch {
        fetchedUsage.current.delete(key)
      }
    })
  }, [events, setSessionUsage])

  const toggleSession = (sessionId: string) => {
    setCollapsedSessions((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  const groupKey = (event: EventRecord) => event.session || event.transcript_path || 'ungrouped'

  const shortId = (value: string) => (value ? value.substring(0, 8) : 'unknown')
  const fmtTokens = (value: number) =>
    value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)

  const extractPatchStartLine = (text: string) => {
    if (!text) return 0
    const m = text.match(/@@\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s*@@/)
    return m ? Number(m[1]) : 0
  }

  const renderDiffLines = (
    oldStr: string,
    newStr: string,
    startLine: number,
    ctxBefore: CtxLine[] = [],
    ctxAfter: CtxLine[] = [],
    patchText?: string
  ): ReactNode => {
    const oldLines = oldStr ? oldStr.split('\n') : []
    const newLines = newStr ? newStr.split('\n') : []
    const fallbackStart = extractPatchStartLine(patchText || '')
    const base = startLine > 0 ? startLine : fallbackStart > 0 ? fallbackStart : 1
    let oldLine = base
    let newLine = base
    return (
      <div className="diff-block">
        {ctxBefore.map((l) => (
          <div key={`ctx-b-${l.num}`} className="diff-line diff-ctx">
            <span className="diff-ln">{l.num}</span>
            <span className="diff-marker"> </span>
            <span className="diff-content">{l.text}</span>
          </div>
        ))}
        {oldLines.map((line, i) => {
          const n = oldLine++
          return (
            <div key={`rm-${i}`} className="diff-line diff-removed">
              <span className="diff-ln">{n}</span>
              <span className="diff-marker">-</span>
              <span className="diff-content">{line}</span>
            </div>
          )
        })}
        {newLines.map((line, i) => {
          const n = newLine++
          return (
            <div key={`add-${i}`} className="diff-line diff-added">
              <span className="diff-ln">{n}</span>
              <span className="diff-marker">+</span>
              <span className="diff-content">{line}</span>
            </div>
          )
        })}
        {ctxAfter.map((l) => (
          <div key={`ctx-a-${l.num}`} className="diff-line diff-ctx">
            <span className="diff-ln">{l.num}</span>
            <span className="diff-marker"> </span>
            <span className="diff-content">{l.text}</span>
          </div>
        ))}
      </div>
    )
  }

  const parseApplyPatch = (text: string, initialLine = 1) => {
    const lines = text.split('\n')
    const out: Array<{ kind: 'ctx' | 'add' | 'del'; num: number; text: string }> = []
    let oldLine = initialLine
    let newLine = initialLine
    let inPatch = false

    for (const line of lines) {
      if (line.startsWith('*** Begin Patch')) {
        inPatch = true
        continue
      }
      if (!inPatch) continue
      if (line.startsWith('*** End Patch')) break

      if (line.includes('@@')) {
        const m = line.match(/@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)/)
        if (m) {
          oldLine = Number(m[1])
          newLine = Number(m[2])
        }
        continue
      }
      if (line.startsWith('***')) continue

      const match = line.match(/^(\s*)([-+ ])(.*)$/)
      if (!match) continue
      const [, indent, marker, content] = match

      if (marker === '-') {
        out.push({ kind: 'del', num: oldLine, text: indent + content })
        oldLine++
      } else if (marker === '+') {
        out.push({ kind: 'add', num: newLine, text: indent + content })
        newLine++
      } else if (marker === ' ') {
        out.push({ kind: 'ctx', num: oldLine, text: indent + content })
        oldLine++
        newLine++
      }
    }
    return out
  }

  const renderPatchDiff = (text: string, startLine: number): ReactNode => {
    const rows = parseApplyPatch(text, startLine)
    if (rows.length === 0) return null
    return (
      <div className="diff-block">
        {rows.map((r, i) => (
          <div
            key={`p-${i}`}
            className={`diff-line ${r.kind === 'add' ? 'diff-added' : r.kind === 'del' ? 'diff-removed' : 'diff-ctx'}`}
          >
            <span className="diff-ln">{r.num}</span>
            <span className="diff-marker">
              {r.kind === 'add' ? '+' : r.kind === 'del' ? '-' : ' '}
            </span>
            <span className="diff-content">{r.text}</span>
          </div>
        ))}
      </div>
    )
  }

  const highlight = (text: string, query: string): ReactNode => {
    if (!query) return text
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')})`, 'gi'))
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? <mark key={i}>{part}</mark> : part
        )}
      </>
    )
  }

  const parseLocalDateTime = (s: string) => {
    if (!s) return NaN
    return new Date(s.replace(' ', 'T')).getTime()
  }

  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (timeRange === 'custom') return

    const updateNow = () => {
      setNowMs(Date.now())
    }
    const timeout = window.setTimeout(updateNow, 0)
    const interval = window.setInterval(updateNow, 1000)

    return () => {
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [timeRange])

  const rangeStartMs = useMemo(() => {
    switch (timeRange) {
      case '5m':
        return nowMs - 5 * 60 * 1000
      case '15m':
        return nowMs - 15 * 60 * 1000
      case '1h':
        return nowMs - 60 * 60 * 1000
      case '6h':
        return nowMs - 6 * 60 * 60 * 1000
      case '24h':
        return nowMs - 24 * 60 * 60 * 1000
      case '7d':
        return nowMs - 7 * 24 * 60 * 60 * 1000
      case '30d':
        return nowMs - 30 * 24 * 60 * 60 * 1000
      default:
        return null
    }
  }, [nowMs, timeRange])

  const filtered = events.filter((e) => {
    const eventTime = new Date(e.time).getTime()
    if (timeRange === 'custom') {
      const startMs = parseLocalDateTime(customStart)
      const endMs = parseLocalDateTime(customEnd)
      if (!Number.isNaN(startMs) && eventTime < startMs) return false
      if (!Number.isNaN(endMs) && eventTime > endMs) return false
    } else {
      if (rangeStartMs !== null && eventTime < rangeStartMs) return false
    }
    if (actionFilter !== 'all' && e.action !== actionFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (
        !e.path?.toLowerCase().includes(q) &&
        !e.session?.toLowerCase().includes(q) &&
        !e.command?.toLowerCase().includes(q) &&
        !e.prompt?.toLowerCase().includes(q) &&
        !e.notification_message?.toLowerCase().includes(q) &&
        !e.error_message?.toLowerCase().includes(q) &&
        !e.response?.toLowerCase().includes(q) &&
        !e.task_title?.toLowerCase().includes(q) &&
        !e.subagent_type?.toLowerCase().includes(q)
      )
        return false
    }
    return true
  })

  const grouped = new Map<string, SessionGroup>()

  filtered.forEach((event) => {
    const key = groupKey(event)
    const existing = grouped.get(key)

    if (existing) {
      existing.events.push(event)
      return
    }

    grouped.set(key, {
      sessionId: key,
      transcriptPath: event.transcript_path ?? '',
      events: [event],
    })
  })

  const sessionList = Array.from(grouped.values()).map((session) => {
    const sortedEvents = [...session.events].sort((a, b) =>
      sortOrder === 'newest'
        ? new Date(b.time).getTime() - new Date(a.time).getTime()
        : new Date(a.time).getTime() - new Date(b.time).getTime()
    )

    const lastTime = new Date(
      Math.max(...sortedEvents.map((event) => new Date(event.time).getTime()))
    )

    return {
      session: {
        ...session,
        events: sortedEvents,
      },
      lastTime,
    }
  })

  sessionList.sort((a, b) =>
    sortOrder === 'newest'
      ? b.lastTime.getTime() - a.lastTime.getTime()
      : a.lastTime.getTime() - b.lastTime.getTime()
  )

  return (
    <>
      {tooltip && (
        <div className="floating-tip" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          {tooltip.text.split('\n').map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      <div className="flex gap-5 items-center px-4 py-[10px] bg-[#111] border-b border-[#333] flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] uppercase text-[#666]">Action</span>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] w-[100px] focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
              <SelectGroup>
                <SelectItem value="all">ALL</SelectItem>
                <SelectItem value="EDIT">EDIT</SelectItem>
                <SelectItem value="BASH">BASH</SelectItem>
                <SelectItem value="SESSION">SESSION</SelectItem>
                <SelectItem value="STOP">STOP</SelectItem>
                <SelectItem value="PROMPT">PROMPT</SelectItem>
                <SelectItem value="AGENT">AGENT</SelectItem>
                <SelectItem value="TASK">TASK</SelectItem>
                <SelectItem value="NOTIFY">NOTIFY</SelectItem>
                <SelectItem value="COMPACT">COMPACT</SelectItem>
                <SelectItem value="FILE">FILE</SelectItem>
                <SelectItem value="CONFIG">CONFIG</SelectItem>
                <SelectItem value="WORKTREE">WORKTREE</SelectItem>
                <SelectItem value="PERMISSION">PERMISSION</SelectItem>
                <SelectItem value="CWD">CWD</SelectItem>
                <SelectItem value="BATCH">BATCH</SelectItem>
                <SelectItem value="INSTRUCT">INSTRUCT</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <span className="text-[0.7rem] uppercase text-[#666]">Search</span>
          <Input
            className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="Filter by path, prompt, or session ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] uppercase text-[#666]">Sort</span>
          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] w-[110px] focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
              <SelectGroup>
                <SelectItem value="newest">NEWEST</SelectItem>
                <SelectItem value="oldest">OLDEST</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[0.7rem] uppercase text-[#666]">Time</span>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] w-[160px] focus:ring-0 focus:ring-offset-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111] border-[#333] text-[#cccccc]">
              <SelectGroup>
                <SelectItem value="5m">Last 5 minutes</SelectItem>
                <SelectItem value="15m">Last 15 minutes</SelectItem>
                <SelectItem value="1h">Last 1 hour</SelectItem>
                <SelectItem value="6h">Last 6 hours</SelectItem>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {timeRange === 'custom' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[0.7rem] uppercase text-[#666]">Start</span>
              <Input
                className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 w-[160px]"
                placeholder="2026-05-05 10:00:00"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[0.7rem] uppercase text-[#666]">End</span>
              <Input
                className="h-auto py-1 px-2 text-[0.8rem] bg-black border-[#333] text-[#cccccc] placeholder:text-[#666] focus-visible:ring-0 w-[160px]"
                placeholder="2026-05-05 12:00:00"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-4 py-[10px] bg-[#111] border-b border-[#333] text-[0.75rem] uppercase tracking-[0.1em] text-[#666]">
          Session Events
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {sessionList.length === 0 ? (
            <div className="text-[#666] italic p-[10px]">No matching events.</div>
          ) : (
            sessionList.map(({ session, lastTime }) => {
              const agent = agentForEvent(session.events[0])
              return (
                <AgentSession
                  key={session.sessionId}
                  session={session}
                  lastTime={lastTime}
                  isCollapsed={collapsedSessions.has(session.sessionId)}
                  toggleSession={toggleSession}
                  searchQuery={searchQuery}
                  shortId={shortId}
                  highlight={highlight}
                  sessionUsage={sessionUsage}
                  fmtTokens={fmtTokens}
                  setTooltip={setTooltip}
                  renderDiffLines={renderDiffLines}
                  renderPatchDiff={renderPatchDiff}
                  agent={agent}
                />
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
