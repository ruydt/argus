function HookSVG() {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" style={{ imageRendering: 'pixelated' }}>
      <rect x="3" y="0" width="5" height="1" fill="#da7756" />
      <rect x="2" y="1" width="1" height="1" fill="#da7756" />
      <rect x="8" y="1" width="1" height="1" fill="#da7756" />
      <rect x="1" y="2" width="2" height="1" fill="#da7756" />
      <rect x="9" y="2" width="2" height="1" fill="#da7756" />
      <rect x="2" y="3" width="1" height="1" fill="#da7756" />
      <rect x="9" y="3" width="1" height="1" fill="#da7756" />
      <rect x="3" y="4" width="6" height="1" fill="#da7756" />
      <rect x="9" y="5" width="1" height="1" fill="#da7756" />
      <rect x="9" y="6" width="1" height="1" fill="#da7756" />
      <rect x="9" y="7" width="1" height="1" fill="#da7756" />
      <rect x="9" y="8" width="1" height="1" fill="#da7756" />
      <rect x="8" y="8" width="1" height="1" fill="#da7756" />
      <rect x="5" y="9" width="4" height="1" fill="#da7756" />
      <rect x="4" y="10" width="1" height="1" fill="#da7756" />
      <rect x="3" y="11" width="2" height="1" fill="#da7756" />
      <rect x="2" y="12" width="1" height="1" fill="#da7756" />
      <rect x="4" y="12" width="1" height="1" fill="#da7756" />
      <rect x="3" y="13" width="1" height="1" fill="#da7756" />
    </svg>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-logo">
          <HookSVG />
          <span>
            <span style={{ color: 'var(--text-primary)' }}>HOOK</span>
            <span style={{ color: 'var(--accent)' }}>ER</span>
          </span>
        </div>
        <div className="footer-meta">MIT LICENSE · LOCAL-FIRST · NO TELEMETRY</div>
      </div>
    </footer>
  )
}
