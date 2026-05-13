import type { Session, SessionTreeNode } from '@/types/sessions'

export interface FlatRow {
  node: SessionTreeNode
  depth: number
  isRoot: boolean
  rootNode: SessionTreeNode
}

export function flattenTree(nodes: SessionTreeNode[], expanded: Set<string>): FlatRow[] {
  const rows: FlatRow[] = []

  function walk(list: SessionTreeNode[], depth: number, root: SessionTreeNode) {
    for (const node of list) {
      rows.push({ node, depth, isRoot: depth === 0, rootNode: root })
      if (expanded.has(node.session.session_id) && node.children.length > 0) {
        walk(node.children, depth + 1, depth === 0 ? node : root)
      }
    }
  }

  for (const root of nodes) {
    walk([root], 0, root)
  }

  return rows
}

export function isRunning(session: Session, now: number): boolean {
  const endedAt = session.ended_at ? new Date(session.ended_at).getTime() : NaN
  if (Number.isFinite(endedAt)) {
    return false
  }
  const lastSeen = new Date(session.last_seen_at).getTime()
  return Number.isFinite(lastSeen) && now - lastSeen < 10_000
}

export function sessionDurationMs(session: Session, now: number): number {
  const start = new Date(session.started_at).getTime()
  const endedAt = session.ended_at ? new Date(session.ended_at).getTime() : NaN
  const end = Number.isFinite(endedAt)
    ? endedAt
    : isRunning(session, now)
      ? now
      : new Date(session.last_seen_at).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 0
  }
  return Math.max(0, end - start)
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s'
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export function formatTimeAxis(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const m = Math.floor(totalSeconds / 60)
  const h = Math.floor(m / 60)
  if (h > 0) {
    const rem = m % 60
    return rem === 0 ? `${h}h` : `${h}h ${rem}m`
  }
  const s = totalSeconds % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

export function shortenCwd(cwd: string): string {
  return cwd.replace(/^\/Users\/[^/]+/, '~').replace(/^\/home\/[^/]+/, '~')
}

export function agentColor(agent: string): string {
  switch (agent) {
    case 'claudecode': return 'var(--brand)'
    case 'codex': return 'var(--dim)'
    default: return 'var(--agent)'
  }
}

export function barColor(agent: string, running: boolean): string {
  if (running) return '#16a34a'
  switch (agent) {
    case 'claudecode': return '#7c3aed'
    default: return '#1d4ed8'
  }
}
