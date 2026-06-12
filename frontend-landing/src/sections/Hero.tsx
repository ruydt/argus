import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

const INSTALL_CMD = 'git clone https://github.com/duytrandt04-afk/argus && make build-local'

function TerminalWindow() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">argus · event feed</span>
        <span className="terminal-live">rec</span>
      </div>
      <div className="terminal-body">
        <div className="feed-row">
          <span className="t-time">14:02:09</span> <span className="t-ok">✓</span>{' '}
          <span className="t-cmd">SQLite ready</span>{' '}
          <span className="t-path">~/.argus/argus.db</span>
        </div>
        <div className="feed-row">
          <span className="t-time">14:02:09</span> <span className="t-ok">✓</span>{' '}
          <span className="t-cmd">SSE stream open</span> <span className="t-sub">:10804</span>
        </div>
        <div className="feed-row">
          <span className="t-time">14:02:09</span> <span className="t-ok">✓</span>{' '}
          <span className="t-cmd">Dashboard serving</span> <span className="t-sub">:10804</span>
        </div>
        <div className="feed-row">&nbsp;</div>
        <div className="feed-row">
          <span className="t-time">14:02:11</span> <span className="t-accent">▸</span>{' '}
          <span className="t-cmd">SessionStart</span>{' '}
          <span className="t-path">claude-code · ~/work/api</span>
        </div>
        <div className="feed-row">
          <span className="t-time">14:02:14</span> <span className="t-accent">▸</span>{' '}
          <span className="t-cmd">PreToolUse</span> <span className="t-sub">Bash</span>{' '}
          <span className="t-path">go test ./...</span>
        </div>
        <div className="feed-row">
          <span className="t-time">14:02:21</span> <span className="t-accent">▸</span>{' '}
          <span className="t-cmd">PostToolUse</span> <span className="t-sub">Bash</span>{' '}
          <span className="t-ok">exit 0 · 6.8s</span>
        </div>
        <div className="feed-row">
          <span className="t-time">14:02:24</span> <span className="t-accent">▸</span>{' '}
          <span className="t-cmd">PostToolUse</span> <span className="t-sub">Edit</span>{' '}
          <span className="t-path">internal/handler/hook.go</span>
        </div>
        <div className="feed-row">
          <span className="t-time">14:02:30</span> <span className="t-accent">▸</span>{' '}
          <span className="t-cmd">Stop</span>{' '}
          <span className="t-ok">agent finished · 4 tools · 19s</span>
        </div>
        <div className="feed-row">&nbsp;</div>
        <div className="feed-row">
          <span className="t-dim">watching</span> <span className="terminal-cursor" />
        </div>
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
        <div className="hero-copy">
          <div className="hero-badge">Open source · local-first · zero cloud</div>

          <h1>
            The watchman whose
            <br />
            eyes never all <span className="accent">close.</span>
          </h1>

          <p className="hero-sub">
            Argus is the hook control center for Claude Code and Codex — manage configs with
            one-click presets, test any hook in the simulator before an agent fires it, ship
            guardrails from the free script collection. No cloud. Your machine, your SQLite file.
          </p>

          <div className="hero-actions">
            <div className="hero-ctas">
              <a
                href="https://github.com/duytrandt04-afk/argus"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                View on GitHub →
              </a>
              <a
                href="https://github.com/duytrandt04-afk/argus/tree/main/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                Read docs
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
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        <div className="hero-panel">
          <TerminalWindow />
        </div>
      </div>
    </section>
  )
}
