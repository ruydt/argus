import { AnimateOnScroll } from '../components/AnimateOnScroll'

function LightningIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="4" y="0" width="2" height="1" fill="currentColor" />
      <rect x="3" y="1" width="2" height="1" fill="currentColor" />
      <rect x="2" y="2" width="4" height="1" fill="currentColor" />
      <rect x="1" y="3" width="6" height="1" fill="currentColor" />
      <rect x="2" y="4" width="4" height="1" fill="currentColor" />
      <rect x="3" y="5" width="2" height="1" fill="currentColor" />
      <rect x="2" y="6" width="2" height="1" fill="currentColor" />
      <rect x="1" y="7" width="2" height="1" fill="currentColor" />
    </svg>
  )
}

function PadlockIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="2" y="0" width="4" height="1" fill="currentColor" />
      <rect x="1" y="1" width="1" height="3" fill="currentColor" />
      <rect x="6" y="1" width="1" height="3" fill="currentColor" />
      <rect x="0" y="4" width="8" height="4" fill="currentColor" />
      <rect x="3" y="5" width="2" height="1" fill="#160f0a" />
      <rect x="3" y="6" width="2" height="1" fill="#160f0a" />
    </svg>
  )
}

function BarChartIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="0" y="7" width="8" height="1" fill="currentColor" />
      <rect x="1" y="4" width="1" height="3" fill="currentColor" />
      <rect x="3" y="2" width="1" height="5" fill="currentColor" />
      <rect x="5" y="5" width="1" height="2" fill="currentColor" />
      <rect x="6" y="3" width="1" height="4" fill="currentColor" />
    </svg>
  )
}

function RobotIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="2" y="1" width="4" height="3" fill="currentColor" />
      <rect x="2" y="2" width="1" height="1" fill="#160f0a" />
      <rect x="5" y="2" width="1" height="1" fill="#160f0a" />
      <rect x="2" y="3" width="4" height="1" fill="#160f0a" />
      <rect x="1" y="4" width="6" height="2" fill="currentColor" />
      <rect x="2" y="7" width="1" height="1" fill="currentColor" />
      <rect x="5" y="7" width="1" height="1" fill="currentColor" />
    </svg>
  )
}

function LineChartIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="0" y="7" width="1" height="1" fill="currentColor" />
      <rect x="0" y="0" width="1" height="8" fill="currentColor" />
      <rect x="1" y="6" width="1" height="1" fill="currentColor" />
      <rect x="2" y="5" width="1" height="1" fill="currentColor" />
      <rect x="3" y="3" width="1" height="1" fill="currentColor" />
      <rect x="4" y="4" width="1" height="1" fill="currentColor" />
      <rect x="5" y="2" width="1" height="1" fill="currentColor" />
      <rect x="6" y="1" width="1" height="1" fill="currentColor" />
    </svg>
  )
}

function DbIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="1" y="0" width="6" height="2" fill="currentColor" />
      <rect x="0" y="1" width="1" height="1" fill="currentColor" />
      <rect x="7" y="1" width="1" height="1" fill="currentColor" />
      <rect x="0" y="2" width="1" height="2" fill="currentColor" />
      <rect x="7" y="2" width="1" height="2" fill="currentColor" />
      <rect x="1" y="3" width="6" height="1" fill="currentColor" />
      <rect x="0" y="4" width="1" height="2" fill="currentColor" />
      <rect x="7" y="4" width="1" height="2" fill="currentColor" />
      <rect x="1" y="6" width="6" height="2" fill="currentColor" />
      <rect x="0" y="7" width="1" height="1" fill="currentColor" />
      <rect x="7" y="7" width="1" height="1" fill="currentColor" />
    </svg>
  )
}

const CARDS = [
  {
    variant: 'v1',
    icon: <LightningIcon />,
    title: 'SSE REAL-TIME',
    desc: 'Server-sent events stream every agent action to your dashboard the instant it happens.',
  },
  {
    variant: 'v1',
    icon: <PadlockIcon />,
    title: 'ZERO CLOUD',
    desc: 'Everything runs on localhost. No accounts, no API keys, no telemetry ever leaves your machine.',
  },
  {
    variant: 'v2',
    icon: <BarChartIcon />,
    title: 'WATERFALL VIEW',
    desc: 'See the full timeline of tool calls, durations, and tool sequences in one glance.',
  },
  {
    variant: 'v2',
    icon: <RobotIcon />,
    title: 'MULTI-AGENT',
    desc: 'Track multiple concurrent agent sessions side-by-side with per-session filtering.',
  },
  {
    variant: 'v3',
    icon: <LineChartIcon />,
    title: 'STATS & COSTS',
    desc: 'Token usage, cost estimates, and tool-call frequency charts out of the box.',
  },
  {
    variant: 'v3',
    icon: <DbIcon />,
    title: 'CANONICAL MODEL',
    desc: 'Unified event schema works across Claude Code, Codex, and future agent runtimes.',
  },
]

export function Features() {
  return (
    <section id="features" className="features section">
      <div className="container">
        <AnimateOnScroll>
          <p className="section-eyebrow">▸ CAPABILITIES</p>
          <h2 className="section-title">FEATURES</h2>
        </AnimateOnScroll>
        <div className="features-grid">
          {CARDS.map((card, i) => (
            <AnimateOnScroll key={card.title} delay={i * 60}>
              <div className={`feature-card ${card.variant}`}>
                <div className="feature-icon">{card.icon}</div>
                <h3>{card.title}</h3>
                <p>{card.desc}</p>
              </div>
            </AnimateOnScroll>
          ))}
        </div>
      </div>
    </section>
  )
}
