import { useEffect, useMemo, useState } from 'react'
import { useSessionTree } from './hooks/useSessionTree'
import { TraceBlock } from './TraceBlock'
import { SessionDetail } from './SessionDetail'
import type { SessionTreeNode } from '@/types/sessions'
import { isRunning } from './utils'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type TimeRangeOption = '24h' | '7d' | '30d' | 'all'

function sinceFromOption(opt: TimeRangeOption): string {
  const now = new Date()
  switch (opt) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    case 'all':
      return '2000-01-01T00:00:00Z'
  }
}

export function SessionsPage() {
  const [timeRangeOpt, setTimeRangeOpt] = useState<TimeRangeOption>('7d')
  const since = useMemo(() => sinceFromOption(timeRangeOpt), [timeRangeOpt])

  const { nodes, loading, sseConnected } = useSessionTree(since)
  const [selectedNode, setSelectedNode] = useState<SessionTreeNode | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const root of nodes) {
        if (!next.has(root.session.session_id)) next.add(root.session.session_id)
      }
      return next
    })
  }, [nodes])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const toggleExpand = (sessionId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  const activeCount = countActiveSessions(nodes, now)

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: '#0c0c0c',
      }}
    >
      <div
        style={{
          background: '#111',
          borderBottom: '1px solid var(--app-border)',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 10, color: '#ccc', fontWeight: 500 }}>Sessions</span>
        {activeCount > 0 && (
          <Badge
            variant="outline"
            className="h-auto rounded-[3px] px-[6px] py-[1px] text-[9px]"
            style={{ color: '#4ade80', background: '#0a1a0a', borderColor: '#166534' }}
          >
            {activeCount} active
          </Badge>
        )}
        {sseConnected && (
          <span
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#4ade80' }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                background: '#4ade80',
                borderRadius: '50%',
                display: 'inline-block',
              }}
            />
            live
          </span>
        )}
        <div style={{ flex: 1 }} />
        <Select value={timeRangeOpt} onValueChange={(v) => setTimeRangeOpt(v as TimeRangeOption)}>
          <SelectTrigger
            size="sm"
            className="h-auto border-[var(--app-border)] bg-[#191919] px-2 py-[3px] text-[10px] text-[#666] hover:bg-[#222]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24h</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#444',
              fontSize: 12,
            }}
          >
            Loading…
          </div>
        ) : nodes.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#444',
              fontSize: 12,
            }}
          >
            No sessions found. Start a Claude Code or Codex session.
          </div>
        ) : (
          nodes.map((node) => (
            <TraceBlock
              key={node.session.session_id}
              node={node}
              expanded={expanded.has(node.session.session_id)}
              selected={selectedNode}
              onSelect={setSelectedNode}
              onToggleExpand={toggleExpand}
              now={now}
            />
          ))
        )}
      </ScrollArea>

      <SessionDetail node={selectedNode} now={now} />
    </div>
  )
}

function countActiveSessions(nodes: SessionTreeNode[], now: number): number {
  let total = 0
  for (const node of nodes) {
    if (isRunning(node.session, now)) total += 1
    if (node.children.length > 0) total += countActiveSessions(node.children, now)
  }
  return total
}
