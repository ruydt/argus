# Pixel Art Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all existing sections/styles with an approved pixel art design using Press Start 2P + VT323 fonts, keeping useAnimateOnScroll untouched and all 15 tests passing.

**Architecture:** Full visual rewrite — index.html gets Bunny CDN fonts, index.css gets new design tokens + pixel-art system CSS, each section component gets rewritten with pixel SVG icons and new markup while preserving test-required class names and element roles.

**Tech Stack:** React 19, TypeScript, motion/react, lucide-react, Vite, Vitest + Testing Library

---

## Test Contracts to Preserve

Hero tests expect:
- `h1` element exists
- `<a>` with accessible name matching `/view on github/i` pointing to `https://github.com/duytrandt04-afk/hooker`
- Text node `git clone https://github.com/duytrandt04-afk/hooker && make build` visible in DOM
- `<button>` with accessible name matching `/copy/i`
- After click, `copyBtn.closest('.hero-snippet')?.querySelector('.copied')` must be truthy → button must be inside `.hero-snippet`, button gets class `copied` when copied

QuickInstall tests expect:
- Default renders text matching `/git clone/i`
- Button with name `/configure hooks/i` → clicking shows text matching `/PostToolUse/i`
- Button with name `/open dashboard/i` → clicking shows text matching `/localhost:5173/i`
- Clone tab button has class `active` by default
- Clicked tab button gets class `active`

---

## File Map

| File | Action |
|------|--------|
| `index.html` | Replace Google/Geist fonts with Bunny CDN press-start-2p + vt323 |
| `src/index.css` | Full rewrite: pixel design tokens, reset, layout, animation helpers |
| `src/sections/NavBar.tsx` | Rewrite: pixel hook SVG logo, nav links, GITHUB button, scroll class |
| `src/sections/Hero.tsx` | Rewrite: split layout + terminal panel; preserve test-required DOM structure |
| `src/sections/HowItWorks.tsx` | Rewrite: pixel flow icons, step boxes, arrows |
| `src/sections/Features.tsx` | Rewrite: 6 pixel icon cards, 3 color variants |
| `src/sections/QuickInstall.tsx` | Rewrite: pixel tabs, code block; preserve tab `active` class logic |
| `src/sections/Privacy.tsx` | Rewrite: 3 pixel icon cards |
| `src/sections/Footer.tsx` | Rewrite: hook logo + wordmark, MIT line |
| `src/components/AnimateOnScroll.tsx` | No change needed |
| `src/hooks/useAnimateOnScroll.ts` | **DO NOT TOUCH** |

---

## Task 1: Update index.html — swap fonts to Bunny CDN

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace font link**

Open `index.html`. Replace the existing `<link>` tags for `fonts.bunny.net` (geist-sans/geist-mono) with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>hooker — Local-first AI agent monitoring</title>
    <meta name="description" content="hooker captures every hook event from Claude Code and Codex, normalizes them into a unified event model, and streams to a real-time dashboard. No cloud. No telemetry. Your data stays local." />
    <link rel="preconnect" href="https://fonts.bunny.net" />
    <link href="https://fonts.bunny.net/css?family=press-start-2p:400;vt323:400&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Run tests to confirm nothing broken**

```bash
cd /home/leeduy0403/emruy/frontend-landing && pnpm test
```
Expected: 15 passed

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: swap fonts to Bunny CDN press-start-2p + vt323"
```

---

## Task 2: Rewrite index.css — pixel design system

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Replace entire file**

Write `src/index.css` with this full content:

```css
/* ============================================================
   TOKENS
   ============================================================ */
:root {
  --bg-base:     #0e0b08;
  --bg-surface:  #09060504;
  --bg-card:     #160f0a;
  --border:      #2a1a12;
  --border-deep: #1a0f0a;
  --accent:      #da7756;
  --accent-mid:  #c4845a;
  --accent-soft: #e8b89a;
  --shadow:      #7c2d12;
  --text-primary:#f5ede0;
  --text-muted:  #a16246;
  --text-dim:    #6b3d28;
  --text-ghost:  #3d2418;
  --text-cmd:    #e8d5c4;
  --text-sub:    #c4845a;
  --text-path:   #a16246;
  --text-ok:     #5dbea3;
  --font-pixel:  'Press Start 2P', monospace;
  --font-vt:     'VT323', monospace;
  --max-width:   1200px;
}

/* ============================================================
   RESET
   ============================================================ */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  scroll-behavior: smooth;
  font-size: 16px;
}

body {
  background-color: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-vt);
  line-height: 1.6;
  -webkit-font-smoothing: none;
  image-rendering: pixelated;
}

a { color: inherit; text-decoration: none; }

/* ============================================================
   SCROLL ANIMATION (useAnimateOnScroll hook contract)
   ============================================================ */
.animate-on-scroll {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 0.5s ease-out, transform 0.5s ease-out;
}
.animate-on-scroll.visible {
  opacity: 1;
  transform: translateY(0);
}
@media (prefers-reduced-motion: reduce) {
  .animate-on-scroll { opacity: 1; transform: none; transition: none; }
}

/* ============================================================
   LAYOUT
   ============================================================ */
.container {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 24px;
}

.section { padding: 80px 0; }

.alt-bg { background-color: var(--bg-surface); }

/* ============================================================
   NAVBAR
   ============================================================ */
.navbar {
  position: sticky;
  top: 0;
  z-index: 100;
  height: 52px;
  background: var(--bg-base);
  border-bottom: 2px solid transparent;
  transition: border-color 0.2s;
}
.navbar.scrolled {
  border-bottom: 2px solid var(--accent);
  box-shadow: 0 2px 0 rgba(218,119,86,.18);
}
.navbar-inner {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 24px;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 32px;
}
.navbar-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-pixel);
  font-size: 11px;
  color: var(--text-primary);
  flex-shrink: 0;
}
.navbar-wordmark-hook { color: var(--text-primary); }
.navbar-wordmark-er   { color: var(--accent); }
.navbar-links {
  display: flex;
  gap: 24px;
  margin: 0 auto;
}
.navbar-links a {
  font-family: var(--font-pixel);
  font-size: 6px;
  color: rgba(218,119,86,.65);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  transition: color 0.15s;
}
.navbar-links a:hover { color: var(--accent); }
.btn-nav {
  font-family: var(--font-pixel);
  font-size: 7px;
  background: var(--accent);
  color: var(--bg-base);
  border: none;
  padding: 8px 14px;
  cursor: pointer;
  box-shadow: 3px 3px 0 var(--shadow);
  text-transform: uppercase;
  flex-shrink: 0;
  display: inline-block;
  transition: transform 0.1s, box-shadow 0.1s;
}
.btn-nav:hover {
  transform: translate(-1px,-1px);
  box-shadow: 4px 4px 0 var(--shadow);
}

/* ============================================================
   HERO
   ============================================================ */
.hero {
  padding: 80px 0 64px;
  position: relative;
  overflow: hidden;
}
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle, var(--border) 1px, transparent 1px);
  background-size: 24px 24px;
  opacity: 0.4;
  pointer-events: none;
}
.hero-inner {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 24px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: start;
}
.hero-copy { display: flex; flex-direction: column; gap: 24px; }
.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-pixel);
  font-size: 6px;
  color: var(--accent);
  border: 2px solid var(--accent);
  padding: 6px 12px;
  box-shadow: 3px 3px 0 var(--shadow);
  width: fit-content;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.hero h1 {
  font-family: var(--font-pixel);
  font-size: 18px;
  line-height: 1.8;
  color: var(--text-primary);
  text-transform: uppercase;
}
.hero h1 .accent {
  color: var(--accent);
  text-shadow: 0 0 20px rgba(218,119,86,.5), 2px 2px 0 var(--shadow);
}
.hero-sub {
  font-family: var(--font-vt);
  font-size: 19px;
  color: var(--text-muted);
  line-height: 1.5;
}
.hero-actions { display: flex; flex-direction: column; gap: 16px; }
.hero-ctas { display: flex; gap: 12px; flex-wrap: wrap; }
.btn-primary {
  font-family: var(--font-pixel);
  font-size: 7px;
  background: var(--accent);
  color: var(--bg-base);
  border: 2px solid var(--accent);
  padding: 10px 18px;
  cursor: pointer;
  box-shadow: 3px 3px 0 var(--shadow);
  text-decoration: none;
  display: inline-block;
  transition: transform 0.1s, box-shadow 0.1s;
  text-transform: uppercase;
}
.btn-primary:hover {
  transform: translate(-1px,-1px);
  box-shadow: 4px 4px 0 var(--shadow);
}
.btn-secondary {
  font-family: var(--font-pixel);
  font-size: 7px;
  background: transparent;
  color: var(--accent);
  border: 2px solid var(--accent);
  padding: 10px 18px;
  cursor: pointer;
  box-shadow: 3px 3px 0 var(--shadow);
  text-decoration: none;
  display: inline-block;
  transition: transform 0.1s, box-shadow 0.1s;
  text-transform: uppercase;
}
.btn-secondary:hover {
  transform: translate(-1px,-1px);
  box-shadow: 4px 4px 0 var(--shadow);
}
.hero-snippet {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  border: 2px solid var(--border);
  padding: 10px 14px;
  box-shadow: 3px 3px 0 var(--border-deep);
}
.hero-snippet code {
  font-family: var(--font-vt);
  font-size: 17px;
  color: var(--text-cmd);
  flex: 1;
}
.hero-snippet button {
  background: transparent;
  border: 2px solid var(--border);
  color: var(--text-muted);
  padding: 4px 8px;
  cursor: pointer;
  font-family: var(--font-pixel);
  font-size: 6px;
  transition: border-color 0.15s, color 0.15s;
}
.hero-snippet button:hover,
.hero-snippet button.copied {
  border-color: var(--text-ok);
  color: var(--text-ok);
}

/* Terminal window */
.terminal-window {
  background: var(--bg-card);
  border: 2px solid var(--border);
  box-shadow: 4px 4px 0 var(--shadow);
}
.terminal-chrome {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 2px solid var(--border);
  background: var(--border-deep);
}
.terminal-dot {
  width: 8px;
  height: 8px;
  border: 1px solid var(--border);
}
.terminal-dot.red   { background: #c0392b; }
.terminal-dot.amber { background: #e67e22; }
.terminal-dot.green { background: var(--text-ok); }
.terminal-title {
  font-family: var(--font-vt);
  font-size: 14px;
  color: var(--text-muted);
  margin-left: 8px;
}
.terminal-body {
  padding: 16px;
  font-family: var(--font-vt);
  font-size: 16px;
  line-height: 1.6;
  min-height: 280px;
}
.t-cmd   { color: var(--text-cmd); }
.t-sub   { color: var(--text-sub); }
.t-path  { color: var(--text-path); }
.t-ok    { color: var(--text-ok); }
.t-dim   { color: var(--text-ghost); }
.t-accent{ color: var(--accent); }
.terminal-cursor {
  display: inline-block;
  width: 8px;
  height: 1em;
  background: var(--accent);
  vertical-align: text-bottom;
  animation: blink 1s step-end infinite;
}
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

/* ============================================================
   STATS BAR
   ============================================================ */
.stats-bar {
  border-top: 2px solid var(--border-deep);
  border-bottom: 2px solid var(--border-deep);
  padding: 24px 0;
}
.stats-grid {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 24px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.stat-item { display: flex; flex-direction: column; gap: 6px; align-items: center; }
.stat-value {
  font-family: var(--font-pixel);
  font-size: 14px;
  color: var(--accent);
}
.stat-label {
  font-family: var(--font-pixel);
  font-size: 6px;
  color: var(--text-muted);
  text-transform: uppercase;
  text-align: center;
  line-height: 1.6;
}

/* ============================================================
   HOW IT WORKS
   ============================================================ */
.how-it-works { padding: 80px 0; background: var(--bg-surface); }
.section-eyebrow {
  font-family: var(--font-pixel);
  font-size: 7px;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 16px;
}
.section-title {
  font-family: var(--font-pixel);
  font-size: 14px;
  color: var(--text-primary);
  text-transform: uppercase;
  line-height: 1.8;
  margin-bottom: 48px;
}
.flow-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  flex-wrap: wrap;
}
.flow-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 140px;
}
.flow-icon-box {
  width: 46px;
  height: 46px;
  border: 2px solid var(--accent);
  box-shadow: 3px 3px 0 var(--shadow);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
}
.flow-icon-box svg { image-rendering: pixelated; }
.flow-label {
  font-family: var(--font-pixel);
  font-size: 6px;
  color: var(--text-primary);
  text-transform: uppercase;
  text-align: center;
}
.flow-desc {
  font-family: var(--font-vt);
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.4;
}
.flow-arrow {
  padding: 0 8px;
  flex-shrink: 0;
  margin-top: -24px;
}

/* ============================================================
   FEATURES
   ============================================================ */
.features { padding: 80px 0; }
.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-top: 48px;
}
.feature-card {
  background: var(--bg-card);
  padding: 22px;
  border: 2px solid var(--border);
  box-shadow: 3px 3px 0 #06040304;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.feature-card.v1 { border-color: var(--accent); }
.feature-card.v2 { border-color: var(--accent-soft); }
.feature-card.v3 { border-color: var(--accent-mid); }
.feature-icon {
  width: 36px;
  height: 36px;
  border: 2px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
}
.feature-card.v1 .feature-icon { border-color: var(--accent); }
.feature-card.v2 .feature-icon { border-color: var(--accent-soft); }
.feature-card.v3 .feature-icon { border-color: var(--accent-mid); }
.feature-card.v1 .feature-icon svg { fill: var(--accent); }
.feature-card.v2 .feature-icon svg { fill: var(--accent-soft); }
.feature-card.v3 .feature-icon svg { fill: var(--accent-mid); }
.feature-card h3 {
  font-family: var(--font-pixel);
  font-size: 7px;
  color: var(--text-primary);
  text-transform: uppercase;
  line-height: 1.8;
}
.feature-card p {
  font-family: var(--font-vt);
  font-size: 15px;
  color: #4a2515;
  line-height: 1.5;
}

/* ============================================================
   QUICK INSTALL
   ============================================================ */
.quick-install { padding: 80px 0; background: var(--bg-surface); }
.quick-install-header { margin-bottom: 36px; }
.tabs {
  display: flex;
  gap: 0;
  margin-bottom: 0;
  border-bottom: 2px solid var(--border);
}
.tab-btn {
  font-family: var(--font-pixel);
  font-size: 6px;
  background: transparent;
  color: var(--text-muted);
  border: 2px solid var(--border);
  border-bottom: none;
  padding: 10px 16px;
  cursor: pointer;
  text-transform: uppercase;
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -2px;
}
.tab-btn:hover { color: var(--accent); border-color: var(--accent); }
.tab-btn.active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--bg-card);
}
.code-block {
  border: 2px solid var(--accent);
  box-shadow: 4px 4px 0 var(--shadow);
  background: var(--bg-card);
}
.code-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-bottom: 2px solid var(--border);
  background: var(--border-deep);
}
.code-block-lang {
  font-family: var(--font-pixel);
  font-size: 6px;
  color: var(--text-muted);
  text-transform: uppercase;
}
.code-copy-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-pixel);
  font-size: 6px;
  background: transparent;
  color: var(--text-muted);
  border: 2px solid var(--border);
  padding: 4px 10px;
  cursor: pointer;
  text-transform: uppercase;
  transition: color 0.15s, border-color 0.15s;
}
.code-copy-btn:hover,
.code-copy-btn.copied { color: var(--text-ok); border-color: var(--text-ok); }
.code-block pre {
  padding: 16px;
  overflow-x: auto;
}
.code-block code {
  font-family: var(--font-vt);
  font-size: 17px;
  color: var(--text-cmd);
  white-space: pre;
}

/* ============================================================
   PRIVACY
   ============================================================ */
.privacy { padding: 80px 0; }
.privacy-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-top: 48px;
}

/* ============================================================
   FOOTER
   ============================================================ */
.footer {
  border-top: 2px solid var(--border);
  padding: 24px 0;
}
.footer-inner {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.footer-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-pixel);
  font-size: 11px;
}
.footer-meta {
  font-family: var(--font-vt);
  font-size: 14px;
  color: var(--text-ghost);
}

/* ============================================================
   RESPONSIVE
   ============================================================ */
@media (max-width: 900px) {
  .hero-inner { grid-template-columns: 1fr; }
  .terminal-window { display: none; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .features-grid { grid-template-columns: 1fr; }
  .privacy-grid { grid-template-columns: 1fr; }
  .flow-row { flex-direction: column; align-items: center; }
  .flow-arrow { transform: rotate(90deg); }
}
```

- [ ] **Step 2: Run tests to confirm still passing**

```bash
cd /home/leeduy0403/emruy/frontend-landing && pnpm test
```
Expected: 15 passed

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: rewrite CSS with pixel art design system"
```

---

## Task 3: Rewrite NavBar.tsx

**Files:**
- Modify: `src/sections/NavBar.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
import { useMotionValueEvent, useScroll } from 'motion/react'
import { useState } from 'react'

function HookSVG() {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" style={{ imageRendering: 'pixelated' }}>
      {/* Top curve */}
      <rect x="3" y="0" width="5" height="1" fill="#da7756" />
      <rect x="2" y="1" width="1" height="1" fill="#da7756" />
      <rect x="8" y="1" width="1" height="1" fill="#da7756" />
      <rect x="1" y="2" width="2" height="1" fill="#da7756" />
      <rect x="9" y="2" width="2" height="1" fill="#da7756" />
      <rect x="2" y="3" width="1" height="1" fill="#da7756" />
      <rect x="9" y="3" width="1" height="1" fill="#da7756" />
      <rect x="3" y="4" width="6" height="1" fill="#da7756" />
      {/* Shaft */}
      <rect x="9" y="5" width="1" height="1" fill="#da7756" />
      <rect x="9" y="6" width="1" height="1" fill="#da7756" />
      <rect x="9" y="7" width="1" height="1" fill="#da7756" />
      <rect x="9" y="8" width="1" height="1" fill="#da7756" />
      {/* Bottom curl */}
      <rect x="8" y="8" width="1" height="1" fill="#da7756" />
      <rect x="5" y="9" width="4" height="1" fill="#da7756" />
      <rect x="4" y="10" width="1" height="1" fill="#da7756" />
      <rect x="3" y="11" width="2" height="1" fill="#da7756" />
      <rect x="2" y="12" width="1" height="1" fill="#da7756" />
      <rect x="4" y="12" width="1" height="1" fill="#da7756" />
      <rect x="3" y="13" width="1" height="1" fill="#da7756" />
    </svg>
  )
}

export function NavBar() {
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)

  useMotionValueEvent(scrollY, 'change', (v) => {
    setScrolled(v > 20)
  })

  return (
    <nav className={`navbar${scrolled ? ' scrolled' : ''}`}>
      <div className="navbar-inner">
        <a href="#" className="navbar-logo">
          <HookSVG />
          <span>
            <span className="navbar-wordmark-hook">HOOK</span>
            <span className="navbar-wordmark-er">ER</span>
          </span>
        </a>
        <div className="navbar-links">
          <a href="#how-it-works">HOW IT WORKS</a>
          <a href="#features">FEATURES</a>
          <a href="#install">INSTALL</a>
          <a href="#privacy">PRIVACY</a>
        </div>
        <a
          href="https://github.com/duytrandt04-afk/hooker"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-nav"
        >
          GITHUB ▸
        </a>
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
cd /home/leeduy0403/emruy/frontend-landing && pnpm test
```
Expected: 15 passed

- [ ] **Step 3: Commit**

```bash
git add src/sections/NavBar.tsx
git commit -m "feat: pixel art NavBar with hook SVG logo"
```

---

## Task 4: Rewrite Hero.tsx — split layout + terminal

**Files:**
- Modify: `src/sections/Hero.tsx`

Critical test contracts:
- `h1` element must exist
- `<a>` with name `/view on github/i` → `href="https://github.com/duytrandt04-afk/hooker"`
- Text `git clone https://github.com/duytrandt04-afk/hooker && make build` in DOM
- `<button>` with accessible name `/copy/i`
- Button must be inside `.hero-snippet`; after click, button gets class `copied`

- [ ] **Step 1: Rewrite the file**

```tsx
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { AnimateOnScroll } from '../components/AnimateOnScroll'

const INSTALL_CMD = 'git clone https://github.com/duytrandt04-afk/hooker && make build'

function HookSVG() {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" style={{ imageRendering: 'pixelated' }}>
      <rect x="3" y="0" width="5" height="1" fill="#da7756" />
      <rect x="2" y="1" width="1" height="1" fill="#da7756" />
      <rect x="8" y="1" width="1" height="1" fill="#da7756" />
      <rect x="1" y="2" width="2" height="1" fill="#da7756" />
      <rect x="9" y="2" width="2" height="1" fill="#da7756" />
      <rect x="2" y="3" width="1" height="1" fill="#da7756" />
      <rect x="9" y="3" width="1" height="1" fill="#da7756" />
      <rect x="3" y="4" width="6" height="1" fill="#da7756" />
      <rect x="9" y="5" width="1" height="1" fill="#da7756" />
      <rect x="9" y="6" width="1" height="1" fill="#da7756" />
      <rect x="9" y="7" width="1" height="1" fill="#da7756" />
      <rect x="9" y="8" width="1" height="1" fill="#da7756" />
      <rect x="8" y="8" width="1" height="1" fill="#da7756" />
      <rect x="5" y="9" width="4" height="1" fill="#da7756" />
      <rect x="4" y="10" width="1" height="1" fill="#da7756" />
      <rect x="3" y="11" width="2" height="1" fill="#da7756" />
      <rect x="2" y="12" width="1" height="1" fill="#da7756" />
      <rect x="4" y="12" width="1" height="1" fill="#da7756" />
      <rect x="3" y="13" width="1" height="1" fill="#da7756" />
    </svg>
  )
}

function TerminalWindow() {
  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <span className="terminal-dot red" />
        <span className="terminal-dot amber" />
        <span className="terminal-dot green" />
        <span className="terminal-title">hooker-monitor — bash</span>
      </div>
      <div className="terminal-body">
        <div><span className="t-path">~/hooker</span> <span className="t-dim">$</span> <span className="t-cmd">hooker-monitor</span></div>
        <div><span className="t-ok">✓</span> <span className="t-cmd">SQLite initialized</span> <span className="t-path">~/.hooker/events.db</span></div>
        <div><span className="t-ok">✓</span> <span className="t-cmd">SSE stream ready</span> <span className="t-sub">:8765</span></div>
        <div><span className="t-ok">✓</span> <span className="t-cmd">Dashboard serving</span> <span className="t-sub">:5173</span></div>
        <div>&nbsp;</div>
        <div><span className="t-dim">── waiting for events ──</span></div>
        <div>&nbsp;</div>
        <div><span className="t-accent">▸</span> <span className="t-cmd">PostToolUse</span> <span className="t-sub">Write</span> <span className="t-path">src/index.css</span></div>
        <div><span className="t-accent">▸</span> <span className="t-cmd">PostToolUse</span> <span className="t-sub">Edit</span> <span className="t-path">src/App.tsx</span></div>
        <div><span className="t-accent">▸</span> <span className="t-cmd">Stop</span> <span className="t-ok">agent finished</span></div>
        <div>&nbsp;</div>
        <div><span className="t-dim">$</span> <span className="terminal-cursor" /></div>
      </div>
    </div>
  )
}

export function Hero() {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(INSTALL_CMD)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="hero">
      <div className="hero-inner">
        <AnimateOnScroll className="hero-copy">
          <div className="hero-badge">★ OPEN SOURCE · LOCAL-FIRST · ZERO CLOUD ★</div>

          <h1>
            FULL VISIBILITY<br />
            INTO YOUR<br />
            <span className="accent">AI AGENTS</span>
          </h1>

          <p className="hero-sub">
            hooker captures every hook event from Claude Code and Codex,
            normalizes them into a unified event model, and streams to a
            real-time dashboard. No cloud, no telemetry, your data stays local.
          </p>

          <div className="hero-actions">
            <div className="hero-ctas">
              <a
                href="https://github.com/duytrandt04-afk/hooker"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                ▶ VIEW ON GITHUB
              </a>
              <a
                href="https://github.com/duytrandt04-afk/hooker/tree/main/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                ◈ READ DOCS
              </a>
            </div>

            <div className="hero-snippet">
              <code>{INSTALL_CMD}</code>
              <button
                onClick={handleCopy}
                className={copied ? 'copied' : ''}
                aria-label={copied ? 'Copied' : 'Copy install command'}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
          </div>
        </AnimateOnScroll>

        <AnimateOnScroll delay={200}>
          <TerminalWindow />
        </AnimateOnScroll>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
cd /home/leeduy0403/emruy/frontend-landing && pnpm test
```
Expected: 15 passed

- [ ] **Step 3: Commit**

```bash
git add src/sections/Hero.tsx
git commit -m "feat: pixel art Hero with terminal panel"
```

---

## Task 5: Rewrite HowItWorks.tsx — pixel flow icons

**Files:**
- Modify: `src/sections/HowItWorks.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
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
  { icon: <RobotIcon />,   label: 'AI AGENT',  desc: 'Claude Code or Codex fires hooks' },
  { icon: <AntennaIcon />, label: 'POST HOOK', desc: 'curl POSTs JSON event to :8765' },
  { icon: <GearIcon />,    label: 'NORMALIZE', desc: 'Unified event model applied' },
  { icon: <DatabaseIcon />,label: 'SQLITE',    desc: 'Persisted locally, zero cloud' },
  { icon: <MonitorIcon />, label: 'DASHBOARD', desc: 'Real-time SSE stream to UI' },
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
              <>
                <div key={step.label} className="flow-step">
                  <div className="flow-icon-box">{step.icon}</div>
                  <span className="flow-label">{step.label}</span>
                  <span className="flow-desc">{step.desc}</span>
                </div>
                {i < STEPS.length - 1 && <PixelArrow key={`arrow-${i}`} />}
              </>
            ))}
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
cd /home/leeduy0403/emruy/frontend-landing && pnpm test
```
Expected: 15 passed

- [ ] **Step 3: Commit**

```bash
git add src/sections/HowItWorks.tsx
git commit -m "feat: pixel art HowItWorks flow diagram"
```

---

## Task 6: Rewrite Features.tsx — pixel icon cards

**Files:**
- Modify: `src/sections/Features.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
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
```

- [ ] **Step 2: Run tests**

```bash
cd /home/leeduy0403/emruy/frontend-landing && pnpm test
```
Expected: 15 passed

- [ ] **Step 3: Commit**

```bash
git add src/sections/Features.tsx
git commit -m "feat: pixel art Features section with 6 icon cards"
```

---

## Task 7: Rewrite QuickInstall.tsx — pixel tabs

**Files:**
- Modify: `src/sections/QuickInstall.tsx`

Critical test contracts:
- Default renders text matching `/git clone/i`
- Button name `/configure hooks/i` → click shows `/PostToolUse/i`
- Button name `/open dashboard/i` → click shows `/localhost:5173/i`
- Clone tab button has class `active` by default
- Clicked tab gets class `active`

The existing QuickInstall logic already satisfies these — we keep the same Tab type, TAB_CONTENT keys/labels/code, and `active` class logic. Only the visual markup changes.

- [ ] **Step 1: Rewrite the file**

```tsx
import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { AnimateOnScroll } from '../components/AnimateOnScroll'

type Tab = 'clone' | 'hooks' | 'dashboard'

type CodeBlockProps = {
  lang: string
  code: string
}

function CodeBlock({ lang, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-lang">{lang}</span>
        <button
          className={`code-copy-btn${copied ? ' copied' : ''}`}
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy code'}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'COPIED' : 'COPY'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

const CLONE_CODE = `git clone https://github.com/duytrandt04-afk/hooker
cd hooker
make build
~/.local/bin/hooker-monitor`

const HOOKS_CODE = `# Add to ~/.claude/settings.json (Claude Code)
{
  "hooks": {
    "PostToolUse": [{
      "hooks": [{
        "type": "command",
        "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-"
      }]
    }]
  }
}`

const DASHBOARD_CODE = `# Open in your browser after starting hooker-monitor
http://localhost:5173

# Verify the hook endpoint is live
curl http://127.0.0.1:8765/api/hook`

const TAB_CONTENT: Record<Tab, { label: string; lang: string; code: string }> = {
  clone:     { label: 'Clone & Build',    lang: 'bash', code: CLONE_CODE },
  hooks:     { label: 'Configure Hooks',  lang: 'json', code: HOOKS_CODE },
  dashboard: { label: 'Open Dashboard',   lang: 'bash', code: DASHBOARD_CODE },
}

export function QuickInstall() {
  const [active, setActive] = useState<Tab>('clone')
  const { lang, code } = TAB_CONTENT[active]

  return (
    <section id="install" className="quick-install">
      <div className="container">
        <AnimateOnScroll className="quick-install-header">
          <h2 className="section-title">UP AND RUNNING IN MINUTES</h2>
          <p style={{ fontFamily: 'var(--font-vt)', fontSize: '19px', color: 'var(--text-muted)' }}>
            No accounts, no API keys. Clone, build, configure one hook line, and you&apos;re live.
          </p>
        </AnimateOnScroll>

        <AnimateOnScroll delay={100}>
          <div className="tabs">
            {(Object.keys(TAB_CONTENT) as Tab[]).map((key) => (
              <button
                key={key}
                className={`tab-btn${active === key ? ' active' : ''}`}
                onClick={() => setActive(key)}
              >
                {TAB_CONTENT[key].label}
              </button>
            ))}
          </div>
          <CodeBlock lang={lang} code={code} />
        </AnimateOnScroll>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
cd /home/leeduy0403/emruy/frontend-landing && pnpm test
```
Expected: 15 passed

- [ ] **Step 3: Commit**

```bash
git add src/sections/QuickInstall.tsx
git commit -m "feat: pixel art QuickInstall with tabbed code blocks"
```

---

## Task 8: Rewrite Privacy.tsx — pixel cards + Stats Bar

**Files:**
- Modify: `src/sections/Privacy.tsx`

Also add the StatsBar section here as a standalone export, since it fits between Hero and HowItWorks in App.tsx.

- [ ] **Step 1: Rewrite Privacy.tsx**

```tsx
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
```

- [ ] **Step 2: Run tests**

```bash
cd /home/leeduy0403/emruy/frontend-landing && pnpm test
```
Expected: 15 passed

- [ ] **Step 3: Commit**

```bash
git add src/sections/Privacy.tsx
git commit -m "feat: pixel art Privacy section"
```

---

## Task 9: Rewrite Footer.tsx + add StatsBar + update App.tsx

**Files:**
- Modify: `src/sections/Footer.tsx`
- Create: `src/sections/StatsBar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Rewrite Footer.tsx**

```tsx
function HookSVG() {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" style={{ imageRendering: 'pixelated' }}>
      <rect x="3" y="0" width="5" height="1" fill="#da7756" />
      <rect x="2" y="1" width="1" height="1" fill="#da7756" />
      <rect x="8" y="1" width="1" height="1" fill="#da7756" />
      <rect x="1" y="2" width="2" height="1" fill="#da7756" />
      <rect x="9" y="2" width="2" height="1" fill="#da7756" />
      <rect x="2" y="3" width="1" height="1" fill="#da7756" />
      <rect x="9" y="3" width="1" height="1" fill="#da7756" />
      <rect x="3" y="4" width="6" height="1" fill="#da7756" />
      <rect x="9" y="5" width="1" height="1" fill="#da7756" />
      <rect x="9" y="6" width="1" height="1" fill="#da7756" />
      <rect x="9" y="7" width="1" height="1" fill="#da7756" />
      <rect x="9" y="8" width="1" height="1" fill="#da7756" />
      <rect x="8" y="8" width="1" height="1" fill="#da7756" />
      <rect x="5" y="9" width="4" height="1" fill="#da7756" />
      <rect x="4" y="10" width="1" height="1" fill="#da7756" />
      <rect x="3" y="11" width="2" height="1" fill="#da7756" />
      <rect x="2" y="12" width="1" height="1" fill="#da7756" />
      <rect x="4" y="12" width="1" height="1" fill="#da7756" />
      <rect x="3" y="13" width="1" height="1" fill="#da7756" />
    </svg>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-logo">
          <HookSVG />
          <span>
            <span style={{ color: 'var(--text-primary)' }}>HOOK</span>
            <span style={{ color: 'var(--accent)' }}>ER</span>
          </span>
        </div>
        <div className="footer-meta">MIT LICENSE · LOCAL-FIRST · NO TELEMETRY</div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 2: Create StatsBar.tsx**

```tsx
export function StatsBar() {
  return (
    <div className="stats-bar">
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-value">0ms</span>
          <span className="stat-label">CLOUD LATENCY</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">100%</span>
          <span className="stat-label">LOCAL STORAGE</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">SQLite</span>
          <span className="stat-label">NO EXTERNAL DEPS</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">SSE</span>
          <span className="stat-label">REAL-TIME STREAM</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update App.tsx to include StatsBar**

```tsx
import { Features } from './sections/Features'
import { Footer } from './sections/Footer'
import { Hero } from './sections/Hero'
import { HowItWorks } from './sections/HowItWorks'
import { NavBar } from './sections/NavBar'
import { Privacy } from './sections/Privacy'
import { QuickInstall } from './sections/QuickInstall'
import { StatsBar } from './sections/StatsBar'

export function App() {
  return (
    <>
      <NavBar />
      <main>
        <Hero />
        <StatsBar />
        <HowItWorks />
        <Features />
        <QuickInstall />
        <Privacy />
      </main>
      <Footer />
    </>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd /home/leeduy0403/emruy/frontend-landing && pnpm test
```
Expected: 15 passed

- [ ] **Step 5: Run build**

```bash
cd /home/leeduy0403/emruy/frontend-landing && pnpm build
```
Expected: build succeeds with no TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/sections/Footer.tsx src/sections/StatsBar.tsx src/App.tsx
git commit -m "feat: pixel art Footer, StatsBar, and updated App layout"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
cd /home/leeduy0403/emruy/frontend-landing && pnpm test
```
Expected: 15 passed across 3 test files

- [ ] **Run production build**

```bash
cd /home/leeduy0403/emruy/frontend-landing && pnpm build
```
Expected: `dist/` generated, no TS errors, no Vite errors

---

## Self-Review

**Spec coverage:**
- ✅ Bunny CDN fonts (press-start-2p + vt323) — Task 1
- ✅ Design tokens (all CSS vars) — Task 2
- ✅ NavBar: hook SVG, wordmark, nav links, GITHUB button, scroll class — Task 3
- ✅ Hero: split layout, badge, h1 with accent span, sub, CTAs, snippet, terminal — Task 4
- ✅ Stats Bar (4 cols) — Task 9
- ✅ HowItWorks: eyebrow, 5-step flow with pixel icons and arrows — Task 5
- ✅ Features: 6 cards, 3 variants, pixel icons — Task 6
- ✅ QuickInstall: pixel tabs, code block, `active` class logic preserved — Task 7
- ✅ Privacy: 3 cards (Shield, HardDrive, FileKey) — Task 8
- ✅ Footer: hook logo + MIT line — Task 9
- ✅ All test contracts preserved: Hero h1, GitHub link, install snippet, copy button in `.hero-snippet`, `.copied` class; QuickInstall tab switching, `active` class
- ✅ useAnimateOnScroll hook not modified
- ✅ AnimateOnScroll component not modified

**Type consistency:** HookSVG duplicated across NavBar, Hero, Footer — this is intentional (each file self-contained per spec, no cross-file shared component was requested). SVG rect attributes are string literals throughout.

**Placeholder scan:** No TBDs. All code blocks are complete. No "similar to Task N" shortcuts.
