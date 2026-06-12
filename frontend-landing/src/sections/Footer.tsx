import { ArgusEye } from '../components/ArgusEye'

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-logo">
          <span
            style={{
              display: 'inline-flex',
              width: 18,
              height: 18,
              color: 'var(--accent)',
            }}
          >
            <ArgusEye />
          </span>
          <span>
            <span style={{ color: 'var(--text-primary)' }}>argus</span>
            <span style={{ color: 'var(--text-muted)' }}>_</span>
          </span>
        </div>
        <div className="footer-meta">
          watching since the bronze age · MIT license · no telemetry
        </div>
      </div>
    </footer>
  )
}
