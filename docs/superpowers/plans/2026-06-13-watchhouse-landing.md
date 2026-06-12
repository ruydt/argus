# Watchhouse Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild getargus.org as "The Watchhouse" — editorial Instrument Serif voice layered over the existing instrument-panel design, per `docs/superpowers/specs/2026-06-13-watchhouse-landing-design.md`.

**Architecture:** All work in `frontend-landing/` (Vite + React 19 + plain CSS, zero new deps). Typography triad: Instrument Serif (display ≥24px) / Inter (body) / JetBrains Mono (instrument). New sections `Pillars`, `MythBlock`, `SurfaceTour` replace homepage `Features` + `HowItWorks`; the signal-chain row moves to `/features`. Existing test contracts (Hero, QuickInstall, useAnimateOnScroll) must pass unmodified.

**Tech Stack:** React 19, Vite 8, Vitest 4 + Testing Library, plain CSS (bunny.net fonts), Cloudflare Pages (auto-deploy on push to main).

**Binding design rules (from spec — violations are bugs):**
- Instrument Serif never below 24px, never bolded; exactly ONE italic word per headline.
- Full-strength `--accent` (#863bff) only on: nav/footer iris, primary CTA. `--accent-soft` (#a978ff) carries italic words, feed markers, hero glow.
- No cyan, no gradient text, no glassmorphism, no blinking/cursor-following motion.
- ONE eye mark (ArgusEye) in nav + footer + favicon only.
- Every "all-seeing" copy claim has a privacy clause in the same viewport.
- All animation gated behind `prefers-reduced-motion`.

**Verification loop for every task:** `cd frontend-landing && npx tsc -b --noEmit && npx vitest run` (and `pnpm build` at the end). Prettier: repo has `.prettierrc` (no semicolons, single quotes); run `npx prettier --write <files>` before each commit.

---

### Task 1: Fonts and design tokens

**Files:**
- Modify: `frontend-landing/index.html` (font link, line ~11)
- Modify: `frontend-landing/src/index.css` (`:root` block + body + comment header)

- [ ] **Step 1: Swap the font link in `index.html`**

Replace the existing bunny.net link with:

```html
<link href="https://fonts.bunny.net/css?family=instrument-serif:400,400i;inter:400,500,600;jetbrains-mono:400,500,600,700&display=swap" rel="stylesheet" />
```

- [ ] **Step 2: Replace the `:root` token block in `src/index.css`**

```css
:root {
  --bg-base: #0a0a0c;
  --bg-surface: #101014;
  --bg-card: #16161b;
  --bg-inset: #0d0d10;
  --border: #26262d;
  --border-deep: #1e1e24;
  --accent: #863bff;
  --accent-mid: #7434e0;
  --accent-soft: #a978ff;
  --glow: rgba(134, 59, 255, 0.07);
  --shadow: rgba(0, 0, 0, 0.45);
  --text-primary: #ededf0;
  --text-muted: #9c9ca6;
  --text-dim: #6e6e78;
  --text-ghost: #4b4b54;
  --text-cmd: #e8e8ee;
  --text-sub: #b4b4bd;
  --text-path: #84848e;
  --text-ok: #3ecf8e;
  --font-pixel: 'JetBrains Mono', ui-monospace, monospace; /* legacy var name — mono stack */
  --font-vt: 'Inter', system-ui, sans-serif; /* legacy var name — body stack */
  --font-serif: 'Instrument Serif', Georgia, serif;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --max-width: 1160px;
}
```

(Only `--bg-*`, `--border*`, `--glow`, `--text-primary/muted`, `--font-serif`, `--font-vt`/`--font-sans` change vs current; keep everything else byte-identical.)

- [ ] **Step 3: Update the file header comment**

Replace the top comment block of `index.css` with:

```css
/* ============================================================
   ARGUS — the watchhouse
   Editorial serif voice over instrument-panel hardware. Serif
   (Instrument Serif, display only, one italic word per headline)
   tells the story; mono panels prove the product. Full-strength
   violet only on the iris and the primary CTA; the soft tint
   carries italic words, feed markers, and the hero glow. Nothing
   blinks, nothing follows the cursor, one eye only.
   ============================================================ */
```

- [ ] **Step 4: Verify**

Run: `cd frontend-landing && npx tsc -b --noEmit && npx vitest run`
Expected: 0 type errors, 15 tests pass.

- [ ] **Step 5: Commit**

```bash
npx prettier --write index.html src/index.css
git add frontend-landing/index.html frontend-landing/src/index.css
git commit -m "feat(landing): watchhouse fonts and tokens"
```

---

### Task 2: Serif type system + hero restyle (CSS only)

**Files:**
- Modify: `frontend-landing/src/index.css` (hero block, section-header block, new utility classes)

- [ ] **Step 1: Restyle `.hero h1` to serif and add the italic-accent rule**

Replace the existing `.hero h1` and `.hero h1 .accent` rules with:

```css
.hero h1 {
  font-family: var(--font-serif);
  font-weight: 400;
  font-size: clamp(44px, 6vw, 84px);
  line-height: 1.06;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}
.hero h1 .accent {
  font-style: italic;
  color: var(--accent-soft);
}
```

- [ ] **Step 2: Restyle `.section-title` to serif and add `.section-title .accent`**

```css
.section-title {
  font-family: var(--font-serif);
  font-weight: 400;
  font-size: clamp(28px, 3.4vw, 40px);
  letter-spacing: -0.005em;
  color: var(--text-primary);
  line-height: 1.15;
  margin-bottom: 48px;
}
.section-title .accent {
  font-style: italic;
  color: var(--accent-soft);
}
```

- [ ] **Step 3: Add the breathing hero glow**

Add after the existing `.hero::before` (iris rings — keep it):

```css
/* one ambient violet atmosphere — the mesh gradient reduced to a whisper */
.hero::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 4%;
  width: 640px;
  height: 640px;
  transform: translateY(-50%);
  background: radial-gradient(circle at center, var(--glow) 0%, transparent 65%);
  pointer-events: none;
}
@media (prefers-reduced-motion: no-preference) {
  .hero::after {
    animation: breathe 12s ease-in-out infinite;
  }
}
@keyframes breathe {
  0%, 100% { opacity: 0.7; transform: translateY(-50%) scale(1); }
  50% { opacity: 1; transform: translateY(-50%) scale(1.06); }
}
```

- [ ] **Step 4: Sub copy stays Inter** — confirm `.hero-sub` already uses `var(--font-sans)`; bump `max-width: 52ch`.

- [ ] **Step 5: Verify** — `npx vitest run` (15 pass), then visual: `pnpm dev`, check hero serif renders, glow breathes, reduced-motion (macOS Settings or devtools emulation) freezes it.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/index.css
git add frontend-landing/src/index.css
git commit -m "feat(landing): serif type system and hero atmosphere"
```

---

### Task 3: Hero copy

**Files:**
- Modify: `frontend-landing/src/sections/Hero.tsx` (h1 + hero-sub only; feed panel, CTAs, snippet untouched)

- [ ] **Step 1: Confirm the existing Hero tests still define the contract**

Read `src/sections/__tests__/Hero.test.tsx`. Contract: h1 exists; link named /view on github/i with repo href; INSTALL_CMD exact text; copy button /copy/i; `.copied` class. The new copy below preserves all of it.

- [ ] **Step 2: Replace headline + sub in `Hero.tsx`**

```tsx
<h1>
  The watchman whose eyes
  <br />
  <span className="accent">never</span> all close.
</h1>

<p className="hero-sub">
  Argus is the hook control center for Claude Code and Codex — manage
  configs with one-click presets, test any hook in the simulator before an
  agent fires it, ship guardrails from the free script collection. No
  cloud. Your machine, your SQLite file.
</p>
```

- [ ] **Step 3: Run tests** — `npx vitest run src/sections/__tests__/Hero.test.tsx` → 5 pass.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/sections/Hero.tsx
git add frontend-landing/src/sections/Hero.tsx
git commit -m "feat(landing): watchman hero copy"
```

---

### Task 4: Pillars section (new component, TDD)

**Files:**
- Create: `frontend-landing/src/sections/Pillars.tsx`
- Create: `frontend-landing/src/sections/__tests__/Pillars.test.tsx`
- Modify: `frontend-landing/src/index.css` (append pillars block)
- Modify: `frontend-landing/src/App.tsx` (mount)

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Pillars } from '../Pillars'

describe('Pillars', () => {
  it('renders the three pillars', () => {
    render(<Pillars />)
    expect(screen.getByText('Hook management')).toBeInTheDocument()
    expect(screen.getByText('Hook simulator')).toBeInTheDocument()
    expect(screen.getByText('Script collection')).toBeInTheDocument()
  })

  it('links the script collection to GitHub', () => {
    render(<Pillars />)
    const link = screen.getByRole('link', { name: /browse the scripts/i })
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/duytrandt04-afk/argus/tree/main/my-custom-hook-scripts'
    )
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/sections/__tests__/Pillars.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement `Pillars.tsx`**

```tsx
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
                <a
                  className="pillar-link"
                  href={p.link.href}
                  {...(p.link.external
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                >
                  {p.link.label} →
                </a>
              </div>
            </AnimateOnScroll>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Append pillars CSS to `index.css`**

```css
/* ============================================================
   PILLARS — three duties, typography not cards
   ============================================================ */
.pillars-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 40px;
}
.pillar {
  border-left: 1px solid var(--border-deep);
  padding-left: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pillar-title {
  font-family: var(--font-serif);
  font-weight: 400;
  font-size: 28px;
  color: var(--text-primary);
  line-height: 1.2;
}
.pillar-body {
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
  line-height: 1.65;
}
.pillar-link {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-sub);
  margin-top: auto;
  transition: color 0.15s;
}
.pillar-link:hover {
  color: var(--text-primary);
}
@media (max-width: 900px) {
  .pillars-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Mount in `App.tsx`** — in `HomePage`, render `<Pillars />` directly after `<StatsBar />` (import `{ Pillars } from './sections/Pillars'`).

- [ ] **Step 6: Run tests** — `npx vitest run` → all pass including 2 new.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/sections/Pillars.tsx src/sections/__tests__/Pillars.test.tsx src/App.tsx src/index.css
git add frontend-landing/src/sections/Pillars.tsx frontend-landing/src/sections/__tests__/Pillars.test.tsx frontend-landing/src/App.tsx frontend-landing/src/index.css
git commit -m "feat(landing): three-pillars section"
```

---

### Task 5: Myth interlude (new component, TDD)

**Files:**
- Create: `frontend-landing/src/sections/MythBlock.tsx`
- Create: `frontend-landing/src/sections/__tests__/MythBlock.test.tsx`
- Modify: `frontend-landing/src/index.css` (append myth block)
- Modify: `frontend-landing/src/App.tsx` (mount)

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MythBlock } from '../MythBlock'

describe('MythBlock', () => {
  it('tells the Panoptes story', () => {
    render(<MythBlock />)
    expect(screen.getByText(/Argus Panoptes/)).toBeInTheDocument()
    expect(screen.getByText(/peacock/)).toBeInTheDocument()
  })

  it('pairs the myth with the privacy counterweight', () => {
    render(<MythBlock />)
    expect(screen.getByText(/stays on your machine/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure** — FAIL (module not found).

- [ ] **Step 3: Implement `MythBlock.tsx`**

```tsx
import { AnimateOnScroll } from '../components/AnimateOnScroll'

export function MythBlock() {
  return (
    <section className="myth">
      <div className="container">
        <AnimateOnScroll>
          <p className="section-eyebrow">The name</p>
          <p className="myth-text">
            In the old story, Hera set a watchman over what she valued most:
            Argus Panoptes, a giant with a hundred eyes. Sleep never took all
            of them at once — some part of him was always watching. When his
            watch ended, she set his eyes into the peacock&apos;s tail, where
            they outlived him. A watcher whose record outlasts the watch:
            more or less the job description.
          </p>
          <p className="myth-footnote">
            All of it stays on your machine. <code>~/.argus/argus.db</code>
          </p>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Append myth CSS**

```css
/* ============================================================
   MYTH INTERLUDE — typography only, no imagery
   ============================================================ */
.myth {
  padding: 96px 0;
  background: var(--bg-surface);
  border-top: 1px solid var(--border-deep);
}
.myth-text {
  font-family: var(--font-serif);
  font-weight: 400;
  font-size: clamp(24px, 2.4vw, 27px);
  line-height: 1.5;
  color: var(--text-primary);
  max-width: 30em;
}
.myth-footnote {
  margin-top: 28px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-dim);
}
.myth-footnote code {
  text-transform: none;
  letter-spacing: 0;
  color: var(--text-sub);
}
```

- [ ] **Step 5: Mount in `App.tsx`** — render `<MythBlock />` after `<Pillars />`.

- [ ] **Step 6: Run tests** — all pass.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/sections/MythBlock.tsx src/sections/__tests__/MythBlock.test.tsx src/App.tsx src/index.css
git add frontend-landing/src/sections/MythBlock.tsx frontend-landing/src/sections/__tests__/MythBlock.test.tsx frontend-landing/src/App.tsx frontend-landing/src/index.css
git commit -m "feat(landing): myth interlude"
```

---

### Task 6: Surface tour (new component, TDD) — replaces homepage Features + HowItWorks

**Files:**
- Create: `frontend-landing/src/sections/SurfaceTour.tsx`
- Create: `frontend-landing/src/sections/__tests__/SurfaceTour.test.tsx`
- Modify: `frontend-landing/src/index.css` (append tour block)
- Modify: `frontend-landing/src/App.tsx` (replace `<HowItWorks />` and `<Features />` with `<SurfaceTour />`)

The six panel mocks: reuse the four existing mock components from `pages/FeaturesPage.tsx` (`EventsFeedPanel`, `SessionsPanel`, `DashboardPanel`, `HooksConfigPanel`) by EXTRACTING them to a shared file, plus two new mocks (Projects, Diagnostics).

- [ ] **Step 1: Extract panel mocks to `src/components/PanelMocks.tsx`**

Move the four `function XxxPanel()` components verbatim out of `pages/FeaturesPage.tsx` into a new file `src/components/PanelMocks.tsx`, converting each to a named export (`export function EventsFeedPanel() {...}` etc.). Update `FeaturesPage.tsx` to `import { EventsFeedPanel, SessionsPanel, DashboardPanel, HooksConfigPanel } from '../components/PanelMocks'`. Then add two new mocks to the same file:

```tsx
export function ProjectsPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">projects</span>
      </div>
      <div className="terminal-body">
        <div>
          <span className="t-cmd">~/work/api</span>{' '}
          <span className="t-ok">● running</span>
        </div>
        <div>
          <span className="t-dim">42 sessions · 1.2k events · last seen 2m ago</span>
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="t-cmd">~/oss/argus</span>{' '}
          <span className="t-dim">○ idle</span>
        </div>
        <div>
          <span className="t-dim">17 sessions · 480 events · last seen 1h ago</span>
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="t-sub">search:</span> <span className="t-cmd">api</span>
          <span className="terminal-cursor" />
        </div>
      </div>
    </div>
  )
}

export function DiagnosticsPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">diagnostics</span>
      </div>
      <div className="terminal-body">
        <div>
          <span className="t-ok">✓</span> <span className="t-cmd">backend healthy</span>{' '}
          <span className="t-path">:10804</span>
        </div>
        <div>
          <span className="t-ok">✓</span> <span className="t-cmd">db</span>{' '}
          <span className="t-path">~/.argus/argus.db · 12.4 MB</span>
        </div>
        <div>
          <span className="t-ok">✓</span> <span className="t-cmd">hooks preset</span>{' '}
          <span className="t-sub">Medium (14/30)</span>
        </div>
        <div>
          <span className="t-ok">✓</span> <span className="t-cmd">~/.argus/hooks</span>{' '}
          <span className="t-path">6 scripts</span>
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="t-dim">log tail</span>
        </div>
        <div>
          <span className="t-path">hook-scripts.log · server.log · watcher.log</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SurfaceTour } from '../SurfaceTour'

describe('SurfaceTour', () => {
  it('renders six surface rows, hooks first', () => {
    render(<SurfaceTour />)
    const titles = screen.getAllByRole('heading', { level: 3 })
    expect(titles).toHaveLength(6)
    expect(titles[0]).toHaveTextContent(/hooks/i)
  })
})
```

- [ ] **Step 3: Run to verify failure** — FAIL.

- [ ] **Step 4: Implement `SurfaceTour.tsx`**

```tsx
import { AnimateOnScroll } from '../components/AnimateOnScroll'
import {
  DashboardPanel,
  DiagnosticsPanel,
  EventsFeedPanel,
  HooksConfigPanel,
  ProjectsPanel,
  SessionsPanel,
} from '../components/PanelMocks'

const SURFACES = [
  {
    eyebrow: 'Hooks',
    title: 'Manage and test hooks before agents run them',
    body: 'Presets, a structured editor, and the simulator — fire synthetic payloads at any hook command and read the result without waiting for a live session.',
    bullets: [
      'One-click presets, tagged and reversible',
      'Synthetic payloads for every event type',
      'stdout, stderr, exit code, duration',
    ],
    panel: <HooksConfigPanel />,
  },
  {
    eyebrow: 'Events',
    title: 'Every tool call, the moment it happens',
    body: 'A live feed of normalized events streamed over SSE — sub-100ms from hook to browser.',
    bullets: [
      'Filter by tool, agent, project, time',
      'Expand any event to the raw payload',
      'Permission allow/deny tracked separately',
    ],
    panel: <EventsFeedPanel />,
  },
  {
    eyebrow: 'Sessions',
    title: 'The whole session on one timeline',
    body: 'Tool calls grouped per session and drawn as a waterfall — durations, sequences, bottlenecks at a glance.',
    bullets: [
      'Auto-grouped by working directory + agent',
      'Gantt-style durations side by side',
      'File-change drawer per session',
    ],
    panel: <SessionsPanel />,
  },
  {
    eyebrow: 'Dashboard',
    title: 'Know what your agents spend',
    body: 'Token and cost roll-ups per session, per day, per model — computed locally, no pricing API.',
    bullets: [
      'Input / output / cache token breakdown',
      'Cost estimates for Claude and Codex',
      'Daily and weekly aggregates',
    ],
    panel: <DashboardPanel />,
  },
  {
    eyebrow: 'Projects',
    title: 'Every repo your agents touch',
    body: 'Project cards group sessions by working directory, searchable, with cascade delete when a project retires.',
    bullets: [
      'Session and event counts per project',
      'Client-side search',
      'Delete with full cascade',
    ],
    panel: <ProjectsPanel />,
  },
  {
    eyebrow: 'Diagnostics',
    title: 'The instrument checks itself',
    body: 'Health, storage, hook-script inventory, and log tails — the watcher proves it is awake.',
    bullets: [
      'Backend, DB, and preset status',
      '~/.argus file system inventory',
      'Reveal any file in Finder',
    ],
    panel: <DiagnosticsPanel />,
  },
]

export function SurfaceTour() {
  return (
    <section id="features" className="tour section">
      <div className="container">
        <AnimateOnScroll>
          <p className="section-eyebrow">The instruments</p>
          <h2 className="section-title">Six instruments, one panel.</h2>
        </AnimateOnScroll>
        {SURFACES.map((s, i) => (
          <AnimateOnScroll key={s.eyebrow}>
            <div className={`tour-row${i % 2 === 1 ? ' flip' : ''}`}>
              <div className="tour-copy">
                <p className="section-eyebrow">
                  {String(i + 1).padStart(2, '0')} · {s.eyebrow}
                </p>
                <h3 className="tour-title">{s.title}</h3>
                <p className="tour-body">{s.body}</p>
                <ul className="tour-bullets">
                  {s.bullets.map((b) => (
                    <li key={b}>
                      <span className="t-accent">▸</span> {b}
                    </li>
                  ))}
                </ul>
              </div>
              <div>{s.panel}</div>
            </div>
          </AnimateOnScroll>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Append tour CSS**

```css
/* ============================================================
   SURFACE TOUR — six instruments
   ============================================================ */
.tour-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 56px;
  align-items: center;
  padding: 48px 0;
  border-top: 1px solid var(--border-deep);
}
.tour-row.flip { direction: rtl; }
.tour-row.flip > * { direction: ltr; }
.tour-copy { display: flex; flex-direction: column; gap: 14px; }
.tour-title {
  font-family: var(--font-serif);
  font-weight: 400;
  font-size: 28px;
  line-height: 1.2;
  color: var(--text-primary);
}
.tour-body {
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--text-muted);
  line-height: 1.65;
}
.tour-bullets {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tour-bullets li {
  font-family: var(--font-sans);
  font-size: 14px;
  color: var(--text-sub);
  display: flex;
  gap: 10px;
  align-items: baseline;
}
@media (max-width: 900px) {
  .tour-row { grid-template-columns: 1fr; }
  .tour-row.flip { direction: ltr; }
}
```

- [ ] **Step 6: Rewire `App.tsx`** — in `HomePage`, remove `<HowItWorks />` and `<Features />` (and their imports), render `<SurfaceTour />` between `<MythBlock />` and `<QuickInstall />`. Do NOT delete `HowItWorks.tsx`/`Features.tsx` files yet (HowItWorks's flow row is reused in Task 8; Features.tsx is deleted in Task 8 cleanup).

- [ ] **Step 7: Run tests** — `npx vitest run` → all pass.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/components/PanelMocks.tsx src/sections/SurfaceTour.tsx src/sections/__tests__/SurfaceTour.test.tsx src/pages/FeaturesPage.tsx src/App.tsx src/index.css
git add -A frontend-landing/src
git commit -m "feat(landing): surface tour replaces homepage features grid"
```

---

### Task 7: Privacy, QuickInstall, Footer copy + serif heads

**Files:**
- Modify: `frontend-landing/src/sections/Privacy.tsx`
- Modify: `frontend-landing/src/sections/QuickInstall.tsx`
- Modify: `frontend-landing/src/sections/Footer.tsx`
- Modify: `frontend-landing/src/index.css` (privacy columns)

- [ ] **Step 1: Privacy — editorial columns instead of cards**

In `Privacy.tsx`, change the section head to:

```tsx
<h2 className="section-title">
  Private by <span className="accent">default</span>.
</h2>
```

Replace the card markup with pillar-style columns (reuse pillar classes; keep icons):

```tsx
<div className="pillars-grid">
  {CARDS.map((card, i) => (
    <AnimateOnScroll key={card.title} delay={i * 80}>
      <div className="pillar">
        <div className="feature-icon">{card.icon}</div>
        <h3 className="pillar-title">{card.title}</h3>
        <p className="pillar-body">{card.desc}</p>
      </div>
    </AnimateOnScroll>
  ))}
</div>
```

(`CARDS` data — titles/descs/icons — unchanged. The old `.privacy-grid` CSS block can be deleted.)

- [ ] **Step 2: QuickInstall** — section head only:

```tsx
<h2 className="section-title">Up and running in minutes</h2>
```

(No `.accent` here — italic budget already spent twice on this page is fine, but spec says one per headline, zero is allowed.)

- [ ] **Step 3: Footer** — change `.footer-meta` line to:

```tsx
<div className="footer-meta">watching since the bronze age · MIT license · no telemetry</div>
```

- [ ] **Step 4: Run tests** — QuickInstall tests still pass (tab labels and code untouched).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/sections/Privacy.tsx src/sections/QuickInstall.tsx src/sections/Footer.tsx src/index.css
git add frontend-landing/src/sections frontend-landing/src/index.css
git commit -m "feat(landing): privacy columns, serif heads, footer myth echo"
```

---

### Task 8: /features page — seven chapters

**Files:**
- Modify: `frontend-landing/src/pages/FeaturesPage.tsx` (chapter data + new Script-collection chapter + architecture row at bottom)
- Modify: `frontend-landing/src/sections/HowItWorks.tsx` (export the flow row for reuse)
- Delete: `frontend-landing/src/sections/Features.tsx` (no longer imported anywhere)
- Modify: `frontend-landing/src/index.css` (feature-row-title to serif)

- [ ] **Step 1: Restyle `.feature-row-title` and `.page-hero-title` to serif**

```css
.page-hero-title {
  font-family: var(--font-serif);
  font-weight: 400;
  font-size: clamp(36px, 4.4vw, 56px);
  letter-spacing: -0.005em;
  color: var(--text-primary);
  line-height: 1.1;
  margin-bottom: 16px;
  position: relative;
}
.feature-row-title {
  font-family: var(--font-serif);
  font-weight: 400;
  font-size: 30px;
  letter-spacing: -0.005em;
  color: var(--text-primary);
  line-height: 1.2;
}
```

- [ ] **Step 2: Reorder + extend the FEATURES array in `FeaturesPage.tsx`**

New chapter order with myth-noun eyebrows (panels imported from `PanelMocks.tsx`):

1. `eyebrow: '01 · The guard'` — existing hooks chapter (already first)
2. `eyebrow: '02 · The armory'` — NEW Script collection chapter:

```tsx
{
  eyebrow: '02 · The armory',
  title: 'A public collection\nof battle-tested guardrails',
  desc: 'Zero-dependency hook scripts, free for everyone — copy one file, wire it up, or test it in the simulator first. Works with Claude Code and Codex.',
  bullets: [
    'block-dangerous — denies rm -rf ~, curl | sh, force-push to main',
    'protect-secrets & protect-branch — secret files and protected branches stay untouchable',
    'format-lint — auto-format on edit, lint errors fed back to the agent',
    'scan-injection — warns when tool output smells like prompt injection',
    'notify-webhook & git-autostage — Slack/Discord/ntfy alerts, opt-in checkpoints',
  ],
  panel: <ScriptsPanel />,
  flip: true,
},
```

With a new `ScriptsPanel` added to `PanelMocks.tsx`:

```tsx
export function ScriptsPanel() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">my-custom-hook-scripts</span>
      </div>
      <div className="terminal-body">
        <div>
          <span className="t-path">$</span> <span className="t-cmd">ls ~/.argus/hooks</span>
        </div>
        <div>
          <span className="t-cmd">block-dangerous.js</span>{' '}
          <span className="t-cmd">protect-secrets.js</span>
        </div>
        <div>
          <span className="t-cmd">protect-branch.js</span>{' '}
          <span className="t-cmd">format-lint.js</span>
        </div>
        <div>
          <span className="t-cmd">scan-injection.js</span>{' '}
          <span className="t-cmd">notify-webhook.js</span>
        </div>
        <div>&nbsp;</div>
        <div>
          <span className="t-path">$</span>{' '}
          <span className="t-cmd">echo &apos;{'{"tool_input":{"command":"rm -rf ~"}}'}&apos; | node block-dangerous.js</span>
        </div>
        <div>
          <span className="t-accent">▸</span>{' '}
          <span className="t-sub">permissionDecision:</span> <span className="t-cmd">deny</span>
        </div>
      </div>
    </div>
  )
}
```

3–7: existing Events (`03 · The record`), Sessions (`04 · The timeline`), Dashboard (`05 · The ledger`), then NEW simple chapters for Projects (`06 · The grounds`, panel `<ProjectsPanel />`) and Diagnostics (`07 · The pulse`, panel `<DiagnosticsPanel />`):

```tsx
{
  eyebrow: '06 · The grounds',
  title: 'Every repo\nyour agents touch',
  desc: 'Project cards group sessions by working directory — searchable, with per-project stats and cascade delete.',
  bullets: [
    'Sessions and events rolled up per project',
    'Client-side search across project paths',
    'Delete a project with full data cascade',
    'Jump from project to its session list',
    'Last-activity timestamps at a glance',
  ],
  panel: <ProjectsPanel />,
},
{
  eyebrow: '07 · The pulse',
  title: 'The instrument\nchecks itself',
  desc: 'Diagnostics shows the watcher is awake: health, storage, hook inventory, and live log tails.',
  bullets: [
    'Backend health and version at a glance',
    'SQLite size and event counts',
    'Active hook preset detection (Baseline / Medium / Full)',
    '~/.argus file inventory with reveal-in-Finder',
    'Server, watcher, and hook-script log tails',
  ],
  panel: <DiagnosticsPanel />,
  flip: true,
},
```

Re-sequence existing chapters' eyebrows to match (`03`, `04`, `05`) and alternate `flip` so odd indexes flip.

- [ ] **Step 3: Move the signal chain to the bottom of FeaturesPage**

In `HowItWorks.tsx`, the component is no longer used on the homepage; import and render `<HowItWorks />` in `FeaturesPage.tsx` after the chapter rows, before the CTA section.

- [ ] **Step 4: Delete `src/sections/Features.tsx`** — `grep -rn "sections/Features'" src/` must return nothing first.

- [ ] **Step 5: Run tests + build** — `npx vitest run && npx tsc -b --noEmit` → pass.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/pages/FeaturesPage.tsx src/components/PanelMocks.tsx src/sections/HowItWorks.tsx src/index.css
git add -A frontend-landing/src
git commit -m "feat(landing): seven-chapter features page with armory and pulse"
```

---

### Task 9: Scroll-driven reveals + /install retype + final sweep

**Files:**
- Modify: `frontend-landing/src/index.css`

- [ ] **Step 1: Scroll-driven reveal enhancement (progressive)**

Append:

```css
/* Scroll-driven reveal where supported; IO fallback keeps .animate-on-scroll */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    .tour-row,
    .pillar {
      animation: rise linear both;
      animation-timeline: view();
      animation-range: entry 0% entry 40%;
    }
  }
}
@keyframes rise {
  from { opacity: 0.2; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: /install retype** — verify `.install-step-title`, `.page-hero-title`, `.section-title` (already serif from earlier tasks) render correctly on `/install`; change `.install-step-title` to:

```css
.install-step-title {
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.5;
}
```

(Step titles are below 24px → sans, not serif, per the binding rules.)

- [ ] **Step 3: Cliché sweep** — grep `src/` for: `backdrop-filter` (only navbar blur allowed), `linear-gradient` in text contexts, `cyan|#06B6D4`, more than one `::after` glow. Fix any hits.

- [ ] **Step 4: Full verify** — `npx tsc -b --noEmit && npx vitest run && pnpm build` → all green.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/index.css
git add frontend-landing/src/index.css
git commit -m "feat(landing): scroll reveals and install retype"
```

---

### Task 10: Visual QA + deploy

- [ ] **Step 1: Dev-server walkthrough** — `pnpm dev`; check all three routes at 1440px and 390px: serif sizes ≥24px everywhere, one italic word max per headline, violet count per viewport (iris + CTA), myth block reads well, panels alternate, reduced-motion freezes glow + reveals.

- [ ] **Step 2: Push** — `git push` → GitHub Actions deploys automatically.

- [ ] **Step 3: Live verify**

```bash
gh run watch $(gh run list --workflow=deploy-landing.yml --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
for p in / /features /install; do curl -s -o /dev/null -w "$p -> %{http_code}\n" https://getargus.org$p; done
```

Expected: run success, three 200s.

---

## Self-review notes

- Spec coverage: tokens/type (T1-2), hero (T2-3), pillars (T4), myth (T5), tour (T6), privacy/install/footer (T7, T9), features chapters + armory + architecture row (T8), motion (T2, T9), deploy (T10). Nav unchanged per spec — no task needed.
- Test contracts: Hero and QuickInstall tests untouched; new tests for Pillars, MythBlock, SurfaceTour.
- Type consistency: panel mock names (`EventsFeedPanel`, `SessionsPanel`, `DashboardPanel`, `HooksConfigPanel`, `ProjectsPanel`, `DiagnosticsPanel`, `ScriptsPanel`) consistent across T6 and T8.
