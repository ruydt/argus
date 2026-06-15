# Driver.js Onboarding Tour — Design Spec

**Date:** 2026-06-16
**Status:** Approved

---

## Overview

Add a driver.js-powered onboarding tour to the Argus SPA. Two modes:

1. **First-visit flow** — auto-triggers once, guides new users from Events → Hooks Config → apply baseline preset → save → completion → back to Events.
2. **Per-page mini-tours** — manually triggered via "Tour" button in sidebar; scoped to current page.

---

## Architecture

### New files

```
frontend/src/features/onboarding/
├── useOnboarding.ts     # hook: localStorage flag, tour trigger logic
├── tourSteps.ts         # first-visit cross-page step definitions
├── pageTours.ts         # per-page step map keyed by route
└── driverConfig.ts      # shared driver.js theme/config factory
```

### `useOnboarding` hook

Consumed by `Layout.tsx`. Exposes:

- `startFirstVisitTour()` — fires on mount when `argus_onboarding_done` absent from localStorage
- `startPageTour(route)` — fires when user clicks "Tour" button in sidebar
- `markDone()` — sets `argus_onboarding_done` in localStorage; called at end of first-visit tour

Driver.js instance created fresh per `start*` call — not a singleton (driver.js is stateful and doesn't support re-use cleanly).

### Mount behavior

`Layout` mounts → `useOnboarding` checks localStorage → flag absent → `startFirstVisitTour()`. Sidebar force-sets `sidebarCollapsed = false` before tour starts.

---

## First-visit flow

Steps target elements already in the DOM. Navigation between pages uses driver.js `onNextClick` async callbacks with `react-router navigate()`.

| # | Target | Title | Description |
|---|--------|-------|-------------|
| 1 | Sidebar nav | Welcome to Argus | "Your hook control center. Let's get you set up in 60 seconds." |
| 2 | Sidebar "Hooks Config" link | Configure your hooks | "Click here to wire up your agent hooks." (navigates to `/hooks-config` before next step) |
| 3 | Hooks Config preset selector | Choose a preset | "Select a preset to instantly configure hooks for your agent." |
| 4 | Baseline preset option | Baseline preset | "Baseline captures the most useful events — perfect starting point." |
| 5 | Apply Preset button | Apply it | "Hit Apply to load the baseline config." |
| 6 | Save button | Save your config | "Save to write the hooks config to disk." |
| 7 | Completion popover | You're all set! | "Go back to Claude Code and start coding. Events will appear here live." → `markDone()` → navigate to `/` |

---

## Per-page mini-tours

`pageTours.ts` exports a `PAGE_TOURS` map:

```ts
export const PAGE_TOURS: Record<string, DriverStep[]> = {
  '/':             eventsSteps,
  '/dashboard':    dashboardSteps,
  '/projects':     projectsSteps,
  '/hooks-config': hooksConfigSteps,
  '/scripts':      scriptsSteps,
  '/diagnostics':  diagnosticsSteps,
}
```

"Tour" button calls `startPageTour(location.pathname)`. No cross-page navigation — all steps target elements on the current page. Exact step content defined during implementation.

---

## Sidebar "Tour" button

Added inside the `mt-auto` section of `Sidebar.tsx`, above the `sidebar-bottom-divider` / version badge.

- **Collapsed sidebar:** steering wheel SVG icon only + tooltip "Tour" (right side, matches other nav tooltips)
- **Expanded sidebar:** steering wheel icon + text label "Tour"
- **No tour for current route:** button disabled (grayed, `opacity-50`, `cursor-not-allowed`)
- **First-visit tour in progress:** button hidden

Steering wheel: inline SVG (driver.js logo reference).

---

## Driver.js theming

Dark theme to match Argus design system (`#0c0c0c` background).

```ts
// driverConfig.ts
{
  animate: true,
  smoothScroll: true,
  overlayColor: '#000',
  overlayOpacity: 0.7,
  popoverClass: 'argus-tour-popover',
}
```

Custom CSS in `frontend/src/index.css`:

```css
.argus-tour-popover {
  --driver-popover-bg: #1a1a1a;
  --driver-text-color: #e5e5e5;
  --driver-popover-border: #2a2a2a;
  --driver-primary-color: #a78bfa; /* --sidebar-primary */
}
```

---

## localStorage

| Key | Value | Purpose |
|-----|-------|---------|
| `argus_onboarding_done` | `"1"` | Skip first-visit tour on subsequent loads |

---

## Dependencies

- `driver.js` — install via pnpm: `pnpm add driver.js`
- No backend changes required

---

## Out of scope

- Per-page step content (defined during implementation)
- Mobile-specific tour behavior (driver.js handles scroll/positioning)
- Tour reset UI (can re-trigger by clearing localStorage manually)
