import { Zap, Lock, ChartColumn, Bot, ChartLine, Database } from 'lucide-react'
import { AnimateOnScroll } from '../components/AnimateOnScroll'

function LightningIcon() {
  return <Zap size={20} strokeWidth={2} />
}

function PadlockIcon() {
  return <Lock size={20} strokeWidth={2} />
}

function BarChartIcon() {
  return <ChartColumn size={20} strokeWidth={2} />
}

function RobotIcon() {
  return <Bot size={20} strokeWidth={2} />
}

function LineChartIcon() {
  return <ChartLine size={20} strokeWidth={2} />
}

function DbIcon() {
  return <Database size={20} strokeWidth={2} />
}

const CARDS = [
  {
    variant: 'v1',
    icon: <LightningIcon />,
    title: 'SSE real-time',
    desc: 'Server-sent events stream every agent action to your dashboard the instant it happens.',
  },
  {
    variant: 'v1',
    icon: <PadlockIcon />,
    title: 'Zero cloud',
    desc: 'Everything runs on localhost. No accounts, no API keys, no telemetry ever leaves your machine.',
  },
  {
    variant: 'v2',
    icon: <BarChartIcon />,
    title: 'Waterfall view',
    desc: 'See the full timeline of tool calls, durations, and tool sequences in one glance.',
  },
  {
    variant: 'v2',
    icon: <RobotIcon />,
    title: 'Multi-agent',
    desc: 'Track multiple concurrent agent sessions side-by-side with per-session filtering.',
  },
  {
    variant: 'v3',
    icon: <LineChartIcon />,
    title: 'Stats & costs',
    desc: 'Token usage, cost estimates, and tool-call frequency charts out of the box.',
  },
  {
    variant: 'v3',
    icon: <DbIcon />,
    title: 'Canonical model',
    desc: 'Unified event schema works across Claude Code, Codex, and future agent runtimes.',
  },
]

export function Features() {
  return (
    <section id="features" className="features section">
      <div className="container">
        <AnimateOnScroll>
          <p className="section-eyebrow">02 · Capabilities</p>
          <h2 className="section-title">Everything on the dashboard</h2>
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
