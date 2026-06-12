import { AnimateOnScroll } from '../components/AnimateOnScroll'

const PROBLEMS = [
  {
    num: '01',
    text: 'Hook configs are hand-edited JSON — one typo and the guardrail silently never fires.',
  },
  {
    num: '02',
    text: 'The only way to test a hook is to wait for a live agent to trip it. There is no debugger.',
  },
  {
    num: '03',
    text: 'Good guardrail scripts exist — scattered across a thousand gists, unmaintained, untested.',
  },
  {
    num: '04',
    text: 'Agents run for hours unobserved. You find out what they did from the git diff, after the fact.',
  },
]

export function WhyBlock() {
  return (
    <section className="why section">
      <div className="container">
        <AnimateOnScroll>
          <p className="section-eyebrow">Why this exists</p>
        </AnimateOnScroll>
        <div className="why-grid">
          <AnimateOnScroll>
            <ul className="why-problems">
              {PROBLEMS.map((p) => (
                <li key={p.num}>
                  <span className="why-num">{p.num}</span>
                  <span className="why-text">{p.text}</span>
                </li>
              ))}
            </ul>
          </AnimateOnScroll>
          <AnimateOnScroll delay={150}>
            <p className="why-thesis">
              Hooks are the control plane of coding agents. The control plane deserves an{' '}
              <span className="accent">instrument</span>.
            </p>
          </AnimateOnScroll>
        </div>
      </div>
    </section>
  )
}
