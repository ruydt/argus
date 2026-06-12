import { Shield, HardDrive, FileKey } from 'lucide-react'
import { AnimateOnScroll } from '../components/AnimateOnScroll'

function ShieldIcon() {
  return <Shield size={20} strokeWidth={2} />
}

function HardDriveIcon() {
  return <HardDrive size={20} strokeWidth={2} />
}

function FileKeyIcon() {
  return <FileKey size={20} strokeWidth={2} />
}

const CARDS = [
  {
    variant: 'v1',
    icon: <ShieldIcon />,
    title: 'No telemetry',
    desc: 'Zero analytics, zero tracking, zero phoning home. The binary never makes outbound connections.',
  },
  {
    variant: 'v2',
    icon: <HardDriveIcon />,
    title: 'Local SQLite',
    desc: 'All events land in a single SQLite file on your machine. No external database, no SaaS.',
  },
  {
    variant: 'v3',
    icon: <FileKeyIcon />,
    title: 'You control exports',
    desc: 'Export your event history anytime via the dashboard. Delete it anytime with rm.',
  },
]

export function Privacy() {
  return (
    <section id="privacy" className="privacy section">
      <div className="container">
        <AnimateOnScroll>
          <p className="section-eyebrow">04 · Data handling</p>
          <h2 className="section-title">Private by default</h2>
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
