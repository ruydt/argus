import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { AnimateOnScroll } from '../components/AnimateOnScroll'

const INSTALL_CMD = 'git clone https://github.com/duytrandt04-afk/argus && make build-local'

function TerminalWindow() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">argus — bash</span>
      </div>
      <div className="terminal-body">
        <div><span className="t-path">~/argus</span> <span className="t-dim">$</span> <span className="t-cmd">argus</span></div>
        <div><span className="t-ok">✓</span> <span className="t-cmd">SQLite initialized</span> <span className="t-path">~/.argus/argus.db</span></div>
        <div><span className="t-ok">✓</span> <span className="t-cmd">SSE stream ready</span> <span className="t-sub">:10804</span></div>
        <div><span className="t-ok">✓</span> <span className="t-cmd">Dashboard serving</span> <span className="t-sub">:10804</span></div>
        <div>&nbsp;</div>
        <div><span className="t-dim">── waiting for events ──</span></div>
        <div>&nbsp;</div>
        <div><span className="t-accent">▸</span> <span className="t-cmd">PostToolUse</span> <span className="t-sub">Write</span> <span className="t-path">src/index.css</span></div>
        <div><span className="t-accent">▸</span> <span className="t-cmd">PostToolUse</span> <span className="t-sub">Edit</span> <span className="t-path">src/App.tsx</span></div>
        <div><span className="t-accent">▸</span> <span className="t-cmd">Stop</span> <span className="t-ok">agent finished</span></div>
        <div>&nbsp;</div>
        <div><span className="t-dim">$</span> <span className="terminal-cursor" /></div>
      </div>
    </div>
  )
}

export function Hero() {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(INSTALL_CMD)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="hero">
      <div className="hero-inner">
        <AnimateOnScroll className="hero-copy">
          <div className="hero-badge">★ OPEN SOURCE · LOCAL-FIRST · ZERO CLOUD ★</div>

          <h1>
            FULL VISIBILITY<br />
            INTO YOUR<br />
            <span className="accent">AI AGENTS</span>
          </h1>

          <p className="hero-sub">
            Argus captures every hook event from Claude Code and Codex,
            normalizes them into a unified event model, and streams to a
            real-time dashboard. No cloud, no telemetry, your data stays local.
          </p>

          <div className="hero-actions">
            <div className="hero-ctas">
              <a
                href="https://github.com/duytrandt04-afk/argus"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                ▶ VIEW ON GITHUB
              </a>
              <a
                href="https://github.com/duytrandt04-afk/argus/tree/main/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                ◈ READ DOCS
              </a>
            </div>

            <div className="hero-snippet">
              <code>{INSTALL_CMD}</code>
              <button
                onClick={handleCopy}
                className={copied ? 'copied' : ''}
                aria-label={copied ? 'Copied' : 'Copy install command'}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll delay={200}>
          <TerminalWindow />
        </AnimateOnScroll>
      </div>
    </section>
  )
}
