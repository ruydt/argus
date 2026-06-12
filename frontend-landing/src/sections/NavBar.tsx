import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { ArgusEye } from '../components/ArgusEye'

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
            <span className="navbar-wordmark-arg">argus</span>
            <span className="navbar-wordmark-us">_</span>
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
          {isHome ? <a href="#privacy">PRIVACY</a> : <Link to="/#privacy">PRIVACY</Link>}
        </div>
        <a
          href="https://github.com/duytrandt04-afk/argus"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-nav"
        >
          GitHub ↗
        </a>
      </div>
    </nav>
  )
}
