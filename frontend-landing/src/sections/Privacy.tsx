import { AnimateOnScroll } from '../components/AnimateOnScroll'

function ShieldIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="2" y="0" width="4" height="1" fill="currentColor" />
      <rect x="1" y="1" width="6" height="1" fill="currentColor" />
      <rect x="0" y="2" width="8" height="3" fill="currentColor" />
      <rect x="1" y="5" width="6" height="1" fill="currentColor" />
      <rect x="2" y="6" width="4" height="1" fill="currentColor" />
      <rect x="3" y="7" width="2" height="1" fill="currentColor" />
    </svg>
  )
}

function HardDriveIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="0" y="1" width="8" height="6" fill="currentColor" />
      <rect x="1" y="2" width="6" height="4" fill="#160f0a" />
      <rect x="2" y="3" width="1" height="2" fill="currentColor" />
      <rect x="4" y="4" width="2" height="1" fill="currentColor" />
    </svg>
  )
}

function FileKeyIcon() {
  return (
    <svg viewBox="0 0 8 8" width="20" height="20" style={{ imageRendering: 'pixelated' }}>
      <rect x="1" y="0" width="5" height="1" fill="currentColor" />
      <rect x="0" y="1" width="1" height="6" fill="currentColor" />
      <rect x="6" y="1" width="1" height="3" fill="currentColor" />
      <rect x="7" y="2" width="1" height="2" fill="currentColor" />
      <rect x="1" y="7" width="6" height="1" fill="currentColor" />
      <rect x="3" y="3" width="3" height="1" fill="currentColor" />
      <rect x="3" y="5" width="2" height="1" fill="currentColor" />
      <rect x="4" y="4" width="1" height="2" fill="currentColor" />
    </svg>
  )
}

const CARDS = [
  {
    variant: 'v1',
    icon: <ShieldIcon />,
    title: 'NO TELEMETRY',
    desc: 'Zero analytics, zero tracking, zero phoning home. The binary never makes outbound connections.',
  },
  {
    variant: 'v2',
    icon: <HardDriveIcon />,
    title: 'LOCAL SQLITE',
    desc: 'All events land in a single SQLite file on your machine. No external database, no SaaS.',
  },
  {
    variant: 'v3',
    icon: <FileKeyIcon />,
    title: 'YOU CONTROL EXPORTS',
    desc: 'Export your event history anytime via the dashboard. Delete it anytime with rm.',
  },
]

export function Privacy() {
  return (
    <section id="privacy" className="privacy section">
      <div className="container">
        <AnimateOnScroll>
          <h2 className="section-title">PRIVACY BY DEFAULT</h2>
        </AnimateOnScroll>
        <div className="privacy-grid">
          {CARDS.map((card, i) => (
            <AnimateOnScroll key={card.title} delay={i * 80}>
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
