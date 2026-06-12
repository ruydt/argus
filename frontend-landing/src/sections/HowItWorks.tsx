import React from 'react'
import { Bot, Antenna, Cog, Database, Monitor, ArrowRight } from 'lucide-react'
import { AnimateOnScroll } from '../components/AnimateOnScroll'

function RobotIcon() {
  return <Bot size={20} strokeWidth={2} />
}

function AntennaIcon() {
  return <Antenna size={20} strokeWidth={2} />
}

function GearIcon() {
  return <Cog size={20} strokeWidth={2} />
}

function DatabaseIcon() {
  return <Database size={20} strokeWidth={2} />
}

function MonitorIcon() {
  return <Monitor size={20} strokeWidth={2} />
}

function PixelArrow() {
  return <ArrowRight className="flow-arrow" size={16} strokeWidth={2} />
}

const STEPS = [
  {
    icon: <RobotIcon />,
    label: 'AI AGENT',
    desc: 'Claude Code or Codex fires hooks',
  },
  {
    icon: <AntennaIcon />,
    label: 'POST HOOK',
    desc: 'curl POSTs JSON event to :10804',
  },
  {
    icon: <GearIcon />,
    label: 'NORMALIZE',
    desc: 'Unified event model applied',
  },
  {
    icon: <DatabaseIcon />,
    label: 'SQLITE',
    desc: 'Persisted locally, zero cloud',
  },
  {
    icon: <MonitorIcon />,
    label: 'DASHBOARD',
    desc: 'Real-time SSE stream to UI',
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="how-it-works">
      <div className="container">
        <AnimateOnScroll>
          <p className="section-eyebrow">01 · Signal chain</p>
          <h2 className="section-title">How it works</h2>
        </AnimateOnScroll>
        <AnimateOnScroll delay={100}>
          <div className="flow-row">
            {STEPS.map((step, i) => (
              <React.Fragment key={step.label}>
                <div className="flow-step">
                  <div className="flow-icon-box">{step.icon}</div>
                  <span className="flow-label">{step.label}</span>
                  <span className="flow-desc">{step.desc}</span>
                </div>
                {i < STEPS.length - 1 && <PixelArrow />}
              </React.Fragment>
            ))}
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
