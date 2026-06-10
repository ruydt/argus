import { AnimateOnScroll } from '../components/AnimateOnScroll'
import { Footer } from '../sections/Footer'
import { NavBar } from '../sections/NavBar'

function EventsFeedPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">events — live feed</span>
      </div>
      <div className="terminal-body">
        <div><span className="t-dim">12:34:01</span> <span className="t-accent">▸</span> <span className="t-cmd">PreToolUse</span> <span className="t-sub">Bash</span></div>
        <div className="t-dim" style={{ paddingLeft: '12px' }}>  cmd: npm run test</div>
        <div><span className="t-dim">12:34:02</span> <span className="t-accent">▸</span> <span className="t-cmd">PostToolUse</span> <span className="t-sub">Bash</span></div>
        <div className="t-dim" style={{ paddingLeft: '12px' }}>  exit: 0  duration: 1.2s</div>
        <div><span className="t-dim">12:34:03</span> <span className="t-accent">▸</span> <span className="t-cmd">PostToolUse</span> <span className="t-sub">Write</span> <span className="t-path">src/App.tsx</span></div>
        <div><span className="t-dim">12:34:05</span> <span className="t-accent">▸</span> <span className="t-cmd">PostToolUse</span> <span className="t-sub">Edit</span> <span className="t-path">src/index.css</span></div>
        <div><span className="t-dim">12:34:09</span> <span className="t-ok">✓</span> <span className="t-cmd">Stop</span> <span className="t-dim">agent finished</span></div>
        <div>&nbsp;</div>
        <div><span className="t-dim">$</span> <span className="terminal-cursor" /></div>
      </div>
    </div>
  )
}

function SessionsPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">sessions — waterfall</span>
      </div>
      <div className="terminal-body">
        <div><span className="t-path">~/projects/argus</span> <span className="t-ok">● running</span></div>
        <div className="t-dim" style={{ paddingLeft: '4px' }}>├─ <span className="t-cmd">Bash</span>         <span style={{ color: 'var(--accent)' }}>████████</span><span className="t-dim">░░░░</span> 800ms</div>
        <div className="t-dim" style={{ paddingLeft: '4px' }}>├─ <span className="t-cmd">Read</span>         <span style={{ color: 'var(--accent)' }}>███</span><span className="t-dim">░░░░░░░</span> 300ms</div>
        <div className="t-dim" style={{ paddingLeft: '4px' }}>├─ <span className="t-cmd">Edit</span>         <span style={{ color: 'var(--accent)' }}>████</span><span className="t-dim">░░░░░░</span> 400ms</div>
        <div className="t-dim" style={{ paddingLeft: '4px' }}>└─ <span className="t-cmd">Write</span>        <span style={{ color: 'var(--accent)' }}>██</span><span className="t-dim">░░░░░░░░</span> 200ms</div>
        <div>&nbsp;</div>
        <div><span className="t-path">~/projects/api</span> <span className="t-dim">● 2m ago</span></div>
        <div className="t-dim" style={{ paddingLeft: '4px' }}>└─ <span className="t-dim">14 tool calls · 12.4k tokens</span></div>
      </div>
    </div>
  )
}

function DashboardPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">dashboard — stats</span>
      </div>
      <div className="terminal-body">
        <div><span className="t-dim">today</span></div>
        <div><span className="t-cmd">input tokens</span>    <span className="t-accent">142,831</span></div>
        <div><span className="t-cmd">output tokens</span>   <span className="t-accent"> 18,440</span></div>
        <div><span className="t-cmd">tool calls</span>      <span className="t-accent">    214</span></div>
        <div><span className="t-cmd">sessions</span>        <span className="t-accent">      7</span></div>
        <div>&nbsp;</div>
        <div><span className="t-dim">cost estimate</span></div>
        <div><span className="t-ok">$0.84</span> <span className="t-dim">claude-sonnet-4</span></div>
        <div><span className="t-ok">$0.12</span> <span className="t-dim">codex</span></div>
      </div>
    </div>
  )
}

function HooksConfigPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">hooks — config &amp; simulator</span>
      </div>
      <div className="terminal-body">
        <div><span className="t-accent">▸</span> <span className="t-cmd">PreToolUse</span>   <span className="t-ok">✓ active</span></div>
        <div><span className="t-accent">▸</span> <span className="t-cmd">PostToolUse</span>  <span className="t-ok">✓ active</span></div>
        <div><span className="t-accent">▸</span> <span className="t-cmd">Stop</span>         <span className="t-ok">✓ active</span></div>
        <div><span className="t-accent">▸</span> <span className="t-cmd">Notification</span> <span className="t-dim">○ inactive</span></div>
        <div>&nbsp;</div>
        <div><span className="t-dim">── simulate ──</span></div>
        <div><span className="t-sub">payload</span> <span className="t-cmd">PostToolUse/Write</span></div>
        <div><span className="t-ok">200</span> <span className="t-dim">event accepted · 12ms</span></div>
      </div>
    </div>
  )
}

type FeatureDetail = {
  eyebrow: string
  title: string
  desc: string
  bullets: string[]
  panel: React.ReactNode
  flip?: boolean
}

const FEATURES: FeatureDetail[] = [
  {
    eyebrow: '▸ LIVE EVENT FEED',
    title: 'EVERY TOOL CALL,\nIN REAL TIME',
    desc: 'Argus streams every agent action to your browser the instant it fires. No polling. No refresh.',
    bullets: [
      'SSE stream — sub-100ms latency from hook to browser',
      'Filter by tool type, agent, project, or time range',
      'Expand any event to inspect the raw payload',
      'Persisted search and filter state across navigation',
      'Permission events (allow / deny) tracked separately',
    ],
    panel: <EventsFeedPanel />,
  },
  {
    eyebrow: '▸ SESSION WATERFALL',
    title: 'SEE THE FULL\nTIMELINE AT A GLANCE',
    desc: 'Group events into sessions and visualise tool-call sequences as a waterfall. Instantly spot bottlenecks.',
    bullets: [
      'Auto-groups events by working directory + agent',
      'Gantt-style waterfall shows tool durations side-by-side',
      'File-change drawer lists every modified path per session',
      'Multi-agent sessions tracked independently',
      'Session state persists across page reloads',
    ],
    panel: <SessionsPanel />,
    flip: true,
  },
  {
    eyebrow: '▸ DASHBOARD & COSTS',
    title: 'TOKEN USAGE\n& COST ESTIMATES',
    desc: 'Know exactly what your agents are spending — per session, per day, per model.',
    bullets: [
      'Input / output / cache token breakdown per session',
      'Cost estimates for Claude and Codex models',
      'Daily and weekly aggregates on the dashboard',
      'Charts powered by Recharts — no cloud analytics',
      'All math runs locally — no external pricing API',
    ],
    panel: <DashboardPanel />,
  },
  {
    eyebrow: '▸ HOOKS CONFIG & SIMULATOR',
    title: 'CONFIGURE &\nTEST YOUR HOOKS',
    desc: 'Manage your hook configuration and fire test payloads directly from the dashboard — no curl required.',
    bullets: [
      'View and edit hook config for Claude Code and Codex',
      'Built-in payload simulator for every hook event type',
      'Verify your hook endpoint responds correctly',
      'One-click copy of the curl command for any hook',
      'Structured JSON editor with live validation',
    ],
    panel: <HooksConfigPanel />,
    flip: true,
  },
]

export function FeaturesPage() {
  return (
    <>
      <NavBar />
      <main>
        {/* Hero */}
        <section className="page-hero">
          <div className="container">
            <AnimateOnScroll>
              <p className="section-eyebrow">▸ CAPABILITIES</p>
              <h1 className="page-hero-title">FEATURES</h1>
              <p className="page-hero-sub">
                Everything you need to observe, debug, and understand your AI coding agents — running entirely on localhost.
              </p>
            </AnimateOnScroll>
          </div>
        </section>

        {/* Feature rows */}
        {FEATURES.map((f, i) => (
          <section key={f.eyebrow} className={`feature-row section${i % 2 === 1 ? ' alt-bg' : ''}`}>
            <div className="container">
              <div className={`feature-row-inner${f.flip ? ' flip' : ''}`}>
                <AnimateOnScroll className="feature-row-copy">
                  <p className="section-eyebrow">{f.eyebrow}</p>
                  <h2 className="feature-row-title">
                    {f.title.split('\n').map((line, j) => (
                      <span key={j}>{line}{j === 0 ? <br /> : null}</span>
                    ))}
                  </h2>
                  <p className="feature-row-desc">{f.desc}</p>
                  <ul className="feature-row-bullets">
                    {f.bullets.map((b) => (
                      <li key={b}><span className="t-accent">▸</span> {b}</li>
                    ))}
                  </ul>
                </AnimateOnScroll>
                <AnimateOnScroll delay={120}>
                  {f.panel}
                </AnimateOnScroll>
              </div>
            </div>
          </section>
        ))}

        {/* CTA */}
        <section className="section">
          <div className="container" style={{ textAlign: 'center' }}>
            <AnimateOnScroll>
              <h2 className="section-title">READY TO START?</h2>
              <p style={{ fontFamily: 'var(--font-vt)', fontSize: '20px', color: 'var(--text-muted)', marginTop: '12px', marginBottom: '32px' }}>
                Clone, build, and have your first event in under 10 minutes.
              </p>
              <div className="hero-ctas" style={{ justifyContent: 'center' }}>
                <a href="/install" className="btn-primary">▶ INSTALL GUIDE</a>
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
