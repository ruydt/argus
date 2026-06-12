import { Link } from 'react-router-dom'
import { WatchingEye } from '../components/WatchingEye'

const REPO = 'https://github.com/duytrandt04-afk/argus'

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <div className="footer-logo">
            <span
              style={{
                display: 'inline-flex',
                width: 18,
                height: 18,
                color: 'rgba(255, 255, 255, 0.9)',
              }}
            >
              <WatchingEye size={18} track={false} />
            </span>
            <span>
              <span style={{ color: 'var(--text-primary)' }}>Argus</span>
            </span>
          </div>
          <p className="footer-tag">The hook control center for AI coding agents.</p>
        </div>
        <div className="footer-col">
          <p className="footer-head">Project</p>
          <a href={REPO} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href={`${REPO}/releases`} target="_blank" rel="noopener noreferrer">
            Releases
          </a>
          <a
            href={`${REPO}/tree/main/my-custom-hook-scripts`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Script collection
          </a>
        </div>
        <div className="footer-col">
          <p className="footer-head">Docs</p>
          <a
            href={`${REPO}/blob/main/docs/quickstart.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Quickstart
          </a>
          <a href={`${REPO}/blob/main/docs/hooks.md`} target="_blank" rel="noopener noreferrer">
            Hooks guide
          </a>
          <a href={`${REPO}/blob/main/docs/privacy.md`} target="_blank" rel="noopener noreferrer">
            Privacy
          </a>
        </div>
        <div className="footer-col">
          <p className="footer-head">Site</p>
          <Link to="/features">Features</Link>
          <Link to="/install">Install</Link>
          <a href="/#privacy">Privacy by default</a>
        </div>
      </div>
      <div className="footer-inner">
        <div className="footer-meta">
          watching since the bronze age · MIT license · no telemetry
        </div>
      </div>
    </footer>
  )
}
