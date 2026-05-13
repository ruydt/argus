import { useNavigate } from 'react-router-dom'
import type { SessionTreeNode } from '@/types/sessions'
import { formatDuration, isRunning, sessionDurationMs } from './utils'

interface Props {
  node: SessionTreeNode | null
  now: number
}

export function SessionDetail({ node, now }: Props) {
  const navigate = useNavigate()
  if (!node) return null

  const { session, agent_id } = node
  const running = isRunning(session, now)
  const duration = sessionDurationMs(session, now)

  const runningChildren = node.children.filter((c) => isRunning(c.session, now)).length
  const fields: { label: string; value: string }[] = [
    { label: 'Agent', value: session.agent || '—' },
    { label: 'Model', value: session.model || '—' },
    { label: 'Duration', value: running ? `${formatDuration(duration)} (running)` : formatDuration(duration) },
    { label: 'CWD', value: session.cwd || '—' },
    ...(node.children.length > 0
      ? [{
          label: 'Subagents',
          value: runningChildren > 0
            ? `${node.children.length} total, ${runningChildren} running`
            : String(node.children.length),
        }]
      : []),
    ...(agent_id ? [{ label: 'Agent ID', value: agent_id }] : []),
  ]

  return (
    <div style={{ height: 106, background: '#111', borderTop: '1px solid #2d1f4a', padding: '10px 14px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: '#c4b5fd', fontSize: 10, fontWeight: 500 }}>
          {session.session_id.slice(0, 16)}
        </span>
        <span style={{
          fontSize: 8,
          color: running ? '#4ade80' : '#555',
          background: running ? '#0a1a0a' : '#1a1a1a',
          border: `1px solid ${running ? '#166534' : '#333'}`,
          padding: '1px 5px',
          borderRadius: 3,
        }}>
          {running ? '● running' : '✓ done'}
        </span>
        <div style={{ flex: 1 }} />
        <button
          aria-label="view events"
          onClick={() => navigate(`/?session=${session.session_id}`)}
          style={{ fontSize: 9, color: 'var(--brand)', background: 'transparent', border: '1px solid #3d2c6b', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          view events →
        </button>
      </div>

      <div style={{ display: 'flex', gap: 20, overflow: 'hidden' }}>
        {fields.map(({ label, value }) => (
          <div key={label} style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 8, color: '#444', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 10, color: '#888', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
