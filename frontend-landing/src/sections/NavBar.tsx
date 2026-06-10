import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

function HookSVG() {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" style={{ imageRendering: 'pixelated' }}>
      {/* Top curve */}
      <rect x="3" y="0" width="5" height="1" fill="#da7756" />
      <rect x="2" y="1" width="1" height="1" fill="#da7756" />
      <rect x="8" y="1" width="1" height="1" fill="#da7756" />
      <rect x="1" y="2" width="2" height="1" fill="#da7756" />
      <rect x="9" y="2" width="2" height="1" fill="#da7756" />
      <rect x="2" y="3" width="1" height="1" fill="#da7756" />
      <rect x="9" y="3" width="1" height="1" fill="#da7756" />
      <rect x="3" y="4" width="6" height="1" fill="#da7756" />
      {/* Shaft */}
      <rect x="9" y="5" width="1" height="1" fill="#da7756" />
      <rect x="9" y="6" width="1" height="1" fill="#da7756" />
      <rect x="9" y="7" width="1" height="1" fill="#da7756" />
      <rect x="9" y="8" width="1" height="1" fill="#da7756" />
      {/* Bottom curl */}
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

export function NavBar() {
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const isHome = location.pathname === '/'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`navbar${scrolled ? ' scrolled' : ''}`}>
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo">
          <HookSVG />
          <span>
            <span className="navbar-wordmark-arg">ARG</span>
            <span className="navbar-wordmark-us">US</span>
          </span>
        </Link>
        <div className="navbar-links">
          {isHome ? (
            <a href="#how-it-works">HOW IT WORKS</a>
          ) : (
            <Link to="/#how-it-works">HOW IT WORKS</Link>
          )}
          <Link to="/features">FEATURES</Link>
          <Link to="/install">INSTALL</Link>
          {isHome ? (
            <a href="#privacy">PRIVACY</a>
          ) : (
            <Link to="/#privacy">PRIVACY</Link>
          )}
        </div>
        <a
          href="https://github.com/duytrandt04-afk/argus"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-nav"
        >
          GITHUB ▸
        </a>
      </div>
    </nav>
  )
}
