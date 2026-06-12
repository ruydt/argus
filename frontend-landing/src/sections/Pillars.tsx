import { Link } from 'react-router-dom'

import { AnimateOnScroll } from '../components/AnimateOnScroll'

const PILLARS = [
  {
    eyebrow: '01 · Manage',
    title: 'Hook management',
    body: 'One-click presets wire Claude Code or Codex hooks from the dashboard. Every argus-managed entry is tagged, additive, and reversible — no JSON surgery, no orphaned config.',
    link: { label: 'See how presets work', href: '/features' },
  },
  {
    eyebrow: '02 · Test',
    title: 'Hook simulator',
    body: 'Fire a realistic synthetic payload at any hook command and read stdout, stderr, exit code, and duration — before a live agent ever runs it. The missing debugger for the hook ecosystem.',
    link: { label: 'Tour the simulator', href: '/features' },
  },
  {
    eyebrow: '03 · Ship',
    title: 'Script collection',
    body: 'Battle-tested, zero-dependency guardrails, free for everyone: dangerous-command blocker, secrets protection, branch guard, auto-format with lint feedback, prompt-injection scanner.',
    link: {
      label: 'Browse the scripts',
      href: 'https://github.com/duytrandt04-afk/argus/tree/main/my-custom-hook-scripts',
      external: true,
    },
  },
]

export function Pillars() {
  return (
    <section className="pillars section">
      <div className="container">
        <AnimateOnScroll>
          <p className="section-eyebrow">The three duties</p>
          <h2 className="section-title">
            Manage. <span className="accent">Test.</span> Ship.
          </h2>
        </AnimateOnScroll>
        <div className="pillars-grid">
          {PILLARS.map((p, i) => (
            <AnimateOnScroll key={p.title} delay={i * 80}>
              <div className="pillar">
                <p className="section-eyebrow">{p.eyebrow}</p>
                <h3 className="pillar-title">{p.title}</h3>
                <p className="pillar-body">{p.body}</p>
                {p.link.external ? (
                  <a
                    className="pillar-link"
                    href={p.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {p.link.label} →
                  </a>
                ) : (
                  <Link className="pillar-link" to={p.link.href}>
                    {p.link.label} →
                  </Link>
                )}
              </div>
            </AnimateOnScroll>
          ))}
        </div>
      </div>
    </section>
  )
}
