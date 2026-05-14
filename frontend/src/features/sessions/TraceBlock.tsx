import type { SessionTreeNode } from '@/types/sessions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDuration, formatTimeAxis, isRunning, sessionDurationMs, shortenCwd } from './utils'

interface TraceBlockProps {
  node: SessionTreeNode
  expanded: boolean
  selected: SessionTreeNode | null
  onSelect: (node: SessionTreeNode) => void
  onToggleExpand: (sessionId: string) => void
  now: number
}

const LABEL_WIDTH = 260

export function TraceBlock({ node, expanded, selected, onSelect, onToggleExpand, now }: TraceBlockProps) {
  const { session } = node
  const rootDuration = sessionDurationMs(session, now)
  const rootRunning = isRunning(session, now)
  const rootSelected = selected?.session.session_id === session.session_id
  const hasChildren = node.children.length > 0

  const isCC = session.agent === 'claudecode'
  const isGC = session.agent === 'geminicli'
  
  let badge = { label: 'CX', color: '#60a5fa', bg: '#0a1f3a', border: '#1d3a5a' }
  if (isCC) {
    badge = { label: 'CC', color: '#a78bfa', bg: '#2d1f5a', border: '#3d2c6b' }
  } else if (isGC) {
    badge = { label: 'GC', color: '#34d399', bg: '#064e3b', border: '#065f46' }
  }

  const rootBarBg = isCC
    ? 'linear-gradient(90deg, #581c87, #7c3aed)'
    : isGC
    ? 'linear-gradient(90deg, #065f46, #10b981)'
    : 'linear-gradient(90deg, #1e3a8a, #2563eb)'

  const ticks = rootDuration > 0 ? [0, 0.25, 0.5, 0.75, 1].map((pct) => formatTimeAxis(pct * rootDuration)) : []

  return (
    <div style={{ borderBottom: '2px solid #111' }}>
      {/* Root row */}
      <div
        data-testid="trace-root-row"
        style={{
          display: 'flex',
          background: rootSelected ? '#1a1428' : '#161616',
          borderLeft: rootSelected ? '2px solid #7c3aed' : undefined,
          borderBottom: '1px solid #1a1a1a',
          cursor: 'pointer',
        }}
        onClick={() => onSelect(node)}
      >
        {/* Left label */}
        <div style={{
          width: LABEL_WIDTH, flexShrink: 0, borderRight: '1px solid #1f1f1f',
          padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {hasChildren ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={expanded ? 'collapse' : 'expand'}
              onClick={(e) => { e.stopPropagation(); onToggleExpand(session.session_id) }}
              className="size-[10px] shrink-0 rounded-none p-0 text-[9px] text-[#555] hover:bg-transparent hover:text-[#888]"
            >
              {expanded ? '▼' : '▶'}
            </Button>
          ) : (
            <span style={{ color: '#333', fontSize: 9, width: 10, flexShrink: 0 }}>—</span>
          )}
          <Badge
            variant="outline"
            className="h-auto shrink-0 rounded-[3px] px-[5px] py-[1px] font-mono text-[8px] font-semibold"
            style={{ color: badge.color, background: badge.bg, borderColor: badge.border }}
          >
            {badge.label}
          </Badge>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, color: rootSelected ? '#c4b5fd' : '#ccc',
              fontFamily: '"SF Mono", "Fira Code", monospace',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {session.session_id.slice(0, 13)}
            </div>
            {session.cwd && (
              <div style={{ fontSize: 9, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                {shortenCwd(session.cwd)}
              </div>
            )}
            <div style={{ fontSize: 8, color: rootRunning ? '#4ade80' : '#555', marginTop: 1, fontFamily: '"SF Mono", "Fira Code", monospace' }}>
              {rootRunning ? `● ${formatDuration(rootDuration)}…` : formatDuration(rootDuration)}
            </div>
          </div>
          {rootRunning && (
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 4px #4ade80', flexShrink: 0 }} />
          )}
        </div>

        {/* Right: time axis + root bar */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {rootDuration > 0 && (
            <div style={{
              height: 18, background: '#0e0e0e', borderBottom: '1px solid #1a1a1a',
              display: 'flex', alignItems: 'center', padding: '0 8px', justifyContent: 'space-between', flexShrink: 0,
            }}>
              {ticks.map((tick, i) => (
                <span key={i} style={{ fontSize: 8, color: '#2e2e2e', fontFamily: '"SF Mono", "Fira Code", monospace' }}>{tick}</span>
              ))}
            </div>
          )}
          <div style={{ flex: 1, position: 'relative', minHeight: 28 }}>
            {[25, 50, 75].map((pct) => (
              <div key={pct} style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct}%`, width: 1, background: '#161616', pointerEvents: 'none' }} />
            ))}
            <div
              data-testid="trace-root-bar"
              style={{
                position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                left: 8, right: 8, height: 14,
                background: rootBarBg,
                borderRadius: 3,
                opacity: rootRunning ? 0.95 : 0.75,
                boxShadow: rootRunning ? '0 0 8px #7c3aed40' : undefined,
              }}
            />
          </div>
        </div>
      </div>

      {/* Child rows */}
      {expanded && node.children.map((child, idx) => {
        const childSelected = selected?.session.session_id === child.session.session_id
        const childRunning = isRunning(child.session, now)
        const childDuration = sessionDurationMs(child.session, now)
        const childStartMs = new Date(child.session.started_at).getTime() - new Date(session.started_at).getTime()
        const leftPct = rootDuration > 0 && Number.isFinite(childStartMs) ? Math.max(0, (childStartMs / rootDuration) * 100) : 0
        const widthPct = rootDuration > 0 && Number.isFinite(childStartMs) ? Math.min(100 - leftPct, (childDuration / rootDuration) * 100) : 0
        const subId = child.agent_id?.slice(0, 10) ?? child.session.session_id.slice(0, 10)

        return (
          <div
            key={child.session.session_id || child.agent_id || String(idx)}
            data-testid="trace-child-row"
            style={{
              display: 'flex',
              background: childSelected ? '#130e1f' : '#0f0f0f',
              borderLeft: childSelected ? '2px solid #7c3aed' : undefined,
              borderBottom: '1px solid #141414',
              cursor: 'pointer',
            }}
            onClick={() => onSelect(child)}
          >
            {/* Left label */}
            <div style={{
              width: LABEL_WIDTH, flexShrink: 0, borderRight: '1px solid #1a1a1a',
              padding: '5px 10px 5px 28px', display: 'flex', alignItems: 'center', gap: 5,
              position: 'relative',
            }}>
              <div style={{ position: 'absolute', left: 18, top: 0, bottom: 0, width: 1, background: '#252525' }} />
              <div style={{ position: 'absolute', left: 18, top: '50%', width: 6, height: 1, background: '#252525' }} />
              <Badge
                variant="outline"
                className="h-auto shrink-0 rounded-[2px] px-[4px] py-[1px] font-mono text-[7px] font-semibold"
                style={{ color: '#86efac', background: '#1a2a1a', borderColor: '#2a3a2a' }}
              >
                sub
              </Badge>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 9, color: childSelected ? '#c4b5fd' : '#888',
                  fontFamily: '"SF Mono", "Fira Code", monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {subId}
                </div>
                {child.session.cwd && (
                  <div style={{ fontSize: 8, color: '#444', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                    {shortenCwd(child.session.cwd)}
                  </div>
                )}
                <div style={{ fontSize: 8, color: childRunning ? '#4ade80' : '#555', marginTop: 1, fontFamily: '"SF Mono", "Fira Code", monospace' }}>
                  {childRunning ? `● ${formatDuration(childDuration)}…` : formatDuration(childDuration)}
                </div>
              </div>
              {childRunning && (
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 4px #4ade80', flexShrink: 0 }} />
              )}
            </div>

            {/* Right: bar */}
            <div style={{ flex: 1, position: 'relative', minHeight: 28 }}>
              {[25, 50, 75].map((pct) => (
                <div key={pct} style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct}%`, width: 1, background: '#161616', pointerEvents: 'none' }} />
              ))}
              {childRunning ? (
                <div
                  data-testid="trace-child-bar"
                  style={{
                    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                    left: `${leftPct}%`, right: 8, height: 10,
                    background: '#16a34a', borderRadius: 2, opacity: 0.85,
                  }}
                />
              ) : widthPct > 0 ? (
                <div
                  data-testid="trace-child-bar"
                  style={{
                    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                    left: `${leftPct}%`, width: `${widthPct}%`, height: 10,
                    background: '#4b5563', borderRadius: 2, opacity: 0.75,
                  }}
                />
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
