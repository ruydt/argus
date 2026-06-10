import React from 'react'
import { AnimateOnScroll } from '../components/AnimateOnScroll'

function RobotIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="2" y="1" width="4" height="3" fill="#da7756" />
      <rect x="2" y="2" width="1" height="1" fill="#0e0b08" />
      <rect x="5" y="2" width="1" height="1" fill="#0e0b08" />
      <rect x="2" y="3" width="4" height="1" fill="#0e0b08" />
      <rect x="1" y="4" width="6" height="2" fill="#da7756" />
      <rect x="2" y="7" width="1" height="1" fill="#da7756" />
      <rect x="5" y="7" width="1" height="1" fill="#da7756" />
    </svg>
  )
}

function AntennaIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="3" y="1" width="1" height="6" fill="#da7756" />
      <rect x="1" y="1" width="2" height="1" fill="#da7756" />
      <rect x="5" y="1" width="2" height="1" fill="#da7756" />
      <rect x="2" y="2" width="1" height="1" fill="#da7756" />
      <rect x="5" y="2" width="1" height="1" fill="#da7756" />
      <rect x="2" y="6" width="4" height="1" fill="#da7756" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="3" y="0" width="2" height="1" fill="#da7756" />
      <rect x="1" y="1" width="6" height="1" fill="#da7756" />
      <rect x="0" y="2" width="1" height="1" fill="#da7756" />
      <rect x="7" y="2" width="1" height="1" fill="#da7756" />
      <rect x="0" y="3" width="3" height="2" fill="#da7756" />
      <rect x="5" y="3" width="3" height="2" fill="#da7756" />
      <rect x="3" y="3" width="2" height="2" fill="#0e0b08" />
      <rect x="0" y="5" width="1" height="1" fill="#da7756" />
      <rect x="7" y="5" width="1" height="1" fill="#da7756" />
      <rect x="1" y="6" width="6" height="1" fill="#da7756" />
      <rect x="3" y="7" width="2" height="1" fill="#da7756" />
    </svg>
  )
}

function DatabaseIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="1" y="0" width="6" height="2" fill="#da7756" />
      <rect x="0" y="1" width="1" height="1" fill="#da7756" />
      <rect x="7" y="1" width="1" height="1" fill="#da7756" />
      <rect x="0" y="2" width="1" height="4" fill="#da7756" />
      <rect x="7" y="2" width="1" height="4" fill="#da7756" />
      <rect x="1" y="6" width="6" height="2" fill="#da7756" />
      <rect x="0" y="7" width="1" height="1" fill="#da7756" />
      <rect x="7" y="7" width="1" height="1" fill="#da7756" />
    </svg>
  )
}

function MonitorIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="0" y="0" width="8" height="5" fill="#da7756" />
      <rect x="1" y="1" width="6" height="3" fill="#0e0b08" />
      <rect x="2" y="2" width="4" height="1" fill="#da7756" />
      <rect x="3" y="5" width="2" height="1" fill="#da7756" />
      <rect x="2" y="6" width="4" height="1" fill="#da7756" />
    </svg>
  )
}

function PixelArrow() {
  return (
    <svg className="flow-arrow" viewBox="0 0 16 8" width="16" height="8" style={{ imageRendering: 'pixelated' }}>
      <rect x="0" y="3" width="10" height="2" fill="#2a1a12" />
      <rect x="10" y="2" width="2" height="4" fill="#2a1a12" />
      <rect x="12" y="1" width="2" height="6" fill="#2a1a12" />
      <rect x="14" y="0" width="2" height="8" fill="#2a1a12" />
    </svg>
  )
}

const STEPS = [
  { icon: <RobotIcon />,    label: 'AI AGENT',  desc: 'Claude Code or Codex fires hooks' },
  { icon: <AntennaIcon />,  label: 'POST HOOK', desc: 'curl POSTs JSON event to :10804' },
  { icon: <GearIcon />,     label: 'NORMALIZE', desc: 'Unified event model applied' },
  { icon: <DatabaseIcon />, label: 'SQLITE',    desc: 'Persisted locally, zero cloud' },
  { icon: <MonitorIcon />,  label: 'DASHBOARD', desc: 'Real-time SSE stream to UI' },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="how-it-works">
      <div className="container">
        <AnimateOnScroll>
          <p className="section-eyebrow">▸ ARCHITECTURE</p>
          <h2 className="section-title">HOW IT WORKS</h2>
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
