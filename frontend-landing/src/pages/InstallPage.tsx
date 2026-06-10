import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { AnimateOnScroll } from '../components/AnimateOnScroll'
import { Footer } from '../sections/Footer'
import { NavBar } from '../sections/NavBar'

type CodeBlockProps = {
  lang: string
  code: string
  filename?: string
}

function CodeBlock({ lang, code, filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{filename ?? lang}</span>
        <button
          className={`code-copy-btn${copied ? ' copied' : ''}`}
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

type StepProps = {
  num: string
  title: string
  children: React.ReactNode
}

function Step({ num, title, children }: StepProps) {
  return (
    <AnimateOnScroll className="install-step">
      <div className="install-step-header">
        <span className="install-step-num">{num}</span>
        <h3 className="install-step-title">{title}</h3>
      </div>
      <div className="install-step-body">{children}</div>
    </AnimateOnScroll>
  )
}

const CLONE_CODE = `git clone https://github.com/duytrandt04-afk/argus
cd argus
make build-local`

const RUN_CODE = `~/.argus/bin/argus`

const RUN_OUTPUT = `argus version -> 0.1.0
hook endpoint  -> POST http://127.0.0.1:10804/api/hook
events SSE     -> GET  http://127.0.0.1:10804/api/events/stream
db             -> ~/.argus/argus.db`

const CLAUDECODE_HOOKS = `{
  "hooks": {
    "PreToolUse": [{
      "hooks": [{
        "type": "command",
        "command": "curl -s -X POST http://127.0.0.1:10804/api/hook -H 'Content-Type: application/json' -d @-"
      }]
    }],
    "PostToolUse": [{
      "hooks": [{
        "type": "command",
        "command": "curl -s -X POST http://127.0.0.1:10804/api/hook -H 'Content-Type: application/json' -d @-"
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "curl -s -X POST http://127.0.0.1:10804/api/hook -H 'Content-Type: application/json' -d @-"
      }]
    }]
  }
}`

const CODEX_HOOKS = `# In your Codex settings or AGENTS.md:
ARGUS_URL=http://127.0.0.1:10804/api/hook

# Add to codex hooks config:
{
  "postToolUse": "curl -s -X POST $ARGUS_URL -H 'Content-Type: application/json' -d @-"
}`

const VERIFY_CODE = `# Check the hook endpoint is live
curl http://127.0.0.1:10804/api/hook

# Send a test event manually
echo '{"type":"Stop","session_id":"test"}' \
  | curl -s -X POST http://127.0.0.1:10804/api/hook \
    -H 'Content-Type: application/json' -d @-`

export function InstallPage() {
  return (
    <>
      <NavBar />
      <main>
        {/* Hero */}
        <section className="page-hero">
          <div className="container">
            <AnimateOnScroll>
              <p className="section-eyebrow">▸ SETUP</p>
              <h1 className="page-hero-title">INSTALL GUIDE</h1>
              <p className="page-hero-sub">
                First event in under 10 minutes. No accounts. No API keys. No cloud.
              </p>
            </AnimateOnScroll>

            <AnimateOnScroll delay={100}>
              <div className="requirements-bar">
                <span className="req-label">REQUIREMENTS</span>
                <span className="req-item"><span className="t-ok">●</span> Go 1.25+</span>
                <span className="req-item"><span className="t-ok">●</span> Node.js 18+</span>
                <span className="req-item"><span className="t-ok">●</span> pnpm 10.x</span>
                <span className="req-item"><span className="t-ok">●</span> curl</span>
                <span className="req-item"><span className="t-ok">●</span> macOS / Linux / WSL</span>
              </div>
            </AnimateOnScroll>
          </div>
        </section>

        {/* Steps */}
        <section className="section">
          <div className="container install-steps">

            <Step num="01" title="CLONE & BUILD">
              <p className="step-desc">
                Clone the repo and run <code>make build-local</code>. This compiles the frontend, embeds the React SPA into the Go binary, and places <code>argus</code> in <code>~/.argus/bin/</code>.
              </p>
              <CodeBlock lang="bash" code={CLONE_CODE} />
            </Step>

            <Step num="02" title="START THE SERVER">
              <p className="step-desc">
                Run the binary. It starts the hook endpoint and serves the dashboard on <code>:10804</code>.
              </p>
              <CodeBlock lang="bash" code={RUN_CODE} />
              <p className="step-desc" style={{ marginTop: '12px' }}>Expected output:</p>
              <CodeBlock lang="text" code={RUN_OUTPUT} filename="stdout" />
            </Step>

            <Step num="03" title="CONFIGURE AGENT HOOKS">
              <p className="step-desc">
                Add the hook commands to your agent config. Argus accepts any JSON payload via <code>POST /api/hook</code> — it auto-detects the agent from the transcript path.
              </p>
              <div className="tabs" style={{ marginBottom: '0' }}>
                <span className="tab-label">Claude Code</span>
              </div>
              <CodeBlock lang="json" filename="~/.claude/settings.json" code={CLAUDECODE_HOOKS} />
              <div className="tabs" style={{ marginTop: '24px', marginBottom: '0' }}>
                <span className="tab-label">Codex</span>
              </div>
              <CodeBlock lang="bash" filename="codex hooks" code={CODEX_HOOKS} />
            </Step>

            <Step num="04" title="OPEN THE DASHBOARD">
              <p className="step-desc">
                Open <strong style={{ color: 'var(--accent)' }}>http://localhost:10804</strong> in your browser. Start an agent session — events should appear within milliseconds of the first tool call.
              </p>
              <div className="terminal-window" style={{ marginTop: '16px' }}>
                <div className="terminal-chrome">
                  <span className="terminal-dot red" />
                  <span className="terminal-dot amber" />
                  <span className="terminal-dot green" />
                  <span className="terminal-title">localhost:10804 — events</span>
                </div>
                <div className="terminal-body">
                  <div><span className="t-ok">✓</span> <span className="t-cmd">SSE stream connected</span></div>
                  <div><span className="t-dim">── waiting for events ──</span></div>
                  <div>&nbsp;</div>
                  <div><span className="t-accent">▸</span> <span className="t-cmd">PreToolUse</span>  <span className="t-sub">Bash</span></div>
                  <div><span className="t-accent">▸</span> <span className="t-cmd">PostToolUse</span> <span className="t-sub">Bash</span> <span className="t-path">exit:0</span></div>
                  <div><span className="t-accent">▸</span> <span className="t-cmd">PostToolUse</span> <span className="t-sub">Write</span> <span className="t-path">src/App.tsx</span></div>
                  <div><span className="t-ok">✓</span> <span className="t-cmd">Stop</span> <span className="t-dim">agent finished</span></div>
                </div>
              </div>
            </Step>

            <Step num="05" title="VERIFY (OPTIONAL)">
              <p className="step-desc">
                Test the endpoint directly with curl to confirm argus is accepting payloads before running a full agent session.
              </p>
              <CodeBlock lang="bash" code={VERIFY_CODE} />
            </Step>

          </div>
        </section>

        {/* Troubleshooting */}
        <section className="section alt-bg">
          <div className="container">
            <AnimateOnScroll>
              <p className="section-eyebrow">▸ TROUBLESHOOTING</p>
              <h2 className="section-title">COMMON ISSUES</h2>
            </AnimateOnScroll>
            <div className="trouble-grid">
              {TROUBLE_ITEMS.map((item, i) => (
                <AnimateOnScroll key={item.problem} delay={i * 60}>
                  <div className="trouble-card">
                    <h4 className="trouble-problem">{item.problem}</h4>
                    <p className="trouble-fix">{item.fix}</p>
                  </div>
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="section">
          <div className="container" style={{ textAlign: 'center' }}>
            <AnimateOnScroll>
              <h2 className="section-title">EXPLORE THE DASHBOARD</h2>
              <p style={{ fontFamily: 'var(--font-vt)', fontSize: '20px', color: 'var(--text-muted)', marginTop: '12px', marginBottom: '32px' }}>
                See what the dashboard can show you once events start flowing.
              </p>
              <div className="hero-ctas" style={{ justifyContent: 'center' }}>
                <a href="/features" className="btn-primary">▶ VIEW FEATURES</a>
                <a
                  href="https://github.com/duytrandt04-afk/argus"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                >
                  ◈ GITHUB
                </a>
              </div>
            </AnimateOnScroll>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

const TROUBLE_ITEMS = [
  {
    problem: 'Port 10804 already in use',
    fix: 'Set ADDR=:9000 (or any free port) before running argus. Update the curl commands in your hook config to match.',
  },
  {
    problem: 'make build-local fails — pnpm not found',
    fix: 'Install pnpm with: npm install -g pnpm@10. Then re-run make build-local.',
  },
  {
    problem: 'Events not appearing in the dashboard',
    fix: 'Confirm argus is running and the curl in your hook config points to the correct port. Send a test payload manually (step 5).',
  },
  {
    problem: 'go: command not found',
    fix: 'Install Go 1.25+ from go.dev/dl. Make sure GOPATH/bin is in your PATH.',
  },
  {
    problem: 'Dashboard shows blank / no SSE connection',
    fix: 'Hard-refresh the browser (Cmd+Shift+R). If on WSL, ensure localhost resolves to 127.0.0.1 in your browser.',
  },
  {
    problem: 'Binary not found after make build-local',
    fix: 'Check ~/.argus/bin is in your PATH. Add: export PATH="$HOME/.argus/bin:$PATH" to your shell profile.',
  },
]
