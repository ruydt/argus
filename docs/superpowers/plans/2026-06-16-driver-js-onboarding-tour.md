# Driver.js Onboarding Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a driver.js onboarding tour to Argus — auto-triggers on first visit guiding users through hook setup, plus a manual per-page "Tour" button in the sidebar.

**Architecture:** A `useOnboarding` hook in `Layout.tsx` checks `localStorage` on mount and fires the first-visit cross-page flow; a steering-wheel "Tour" button in `Sidebar.tsx` triggers per-page mini-tours. Driver.js handles all overlay/popover rendering. `data-tour` attributes are the targeting API.

**Tech Stack:** driver.js v1.x, React 19, react-router-dom v7, TypeScript, Vitest + Testing Library.

---

## File map

| Action | File | Purpose |
|--------|------|---------|
| Create | `frontend/src/features/onboarding/driverConfig.ts` | Driver.js config factory with dark theme |
| Create | `frontend/src/features/onboarding/tourSteps.ts` | First-visit cross-page step builder |
| Create | `frontend/src/features/onboarding/pageTours.ts` | Per-page step map keyed by route |
| Create | `frontend/src/features/onboarding/useOnboarding.ts` | Hook: localStorage flag, tour trigger logic |
| Create | `frontend/src/features/onboarding/__tests__/useOnboarding.test.ts` | Hook unit tests |
| Modify | `frontend/src/index.css` | Argus dark theme overrides for driver.js popover |
| Modify | `frontend/src/main.tsx` | Import driver.js base CSS |
| Modify | `frontend/src/app/Sidebar.tsx` | Add `data-tour` attrs + Tour button + new props |
| Modify | `frontend/src/app/Layout.tsx` | Wire `useOnboarding`, pass props to Sidebar |
| Modify | `frontend/src/features/hooks-config/StructuredEditor.tsx` | Add `data-tour="preset-selector"` to SelectTrigger |
| Modify | `frontend/src/features/hooks-config/HooksConfigPage.tsx` | Add `data-tour="hooks-config-agent-tabs"` to TabsList |
| Modify | `frontend/src/features/events/EventsPage.tsx` | Add `data-tour="events-feed"` to feed container |
| Modify | `frontend/src/features/dashboard/DashboardPage.tsx` | Add `data-tour` to stats + chart containers |
| Modify | `frontend/src/features/projects/ProjectsPage.tsx` | Add `data-tour="projects-grid"` to card grid |
| Modify | `frontend/src/features/scripts/ScriptsPage.tsx` | Add `data-tour` to tabs + content area |
| Modify | `frontend/src/features/diagnostics/DiagnosticsPage.tsx` | Add `data-tour` to health + filesystem cards |

---

## Task 1: Install driver.js

**Files:**
- Modify: `frontend/package.json` (via pnpm)

- [ ] **Step 1: Install the package**

```bash
cd frontend && pnpm add driver.js
```

Expected output: `+ driver.js X.X.X` in the pnpm summary.

- [ ] **Step 2: Verify TypeScript types are included**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -5
```

Expected: no errors. driver.js v1 ships its own `.d.ts` so no `@types/` needed.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add driver.js for onboarding tour"
```

---

## Task 2: Driver.js dark theme CSS

**Files:**
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Import driver.js base CSS in main.tsx**

Open `frontend/src/main.tsx`. Add this import immediately after existing CSS imports (before React imports):

```tsx
import 'driver.js/dist/driver.css'
```

The full file after edit:

```tsx
import 'driver.js/dist/driver.css'
import './styles/app.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

*(Preserve existing import order — just add driver.js first.)*

- [ ] **Step 2: Add dark theme overrides to index.css**

Append to the bottom of `frontend/src/index.css`:

```css
/* ─── Driver.js tour popover — Argus dark theme ─────────────────────────── */
.argus-tour-popover.driver-popover {
  background-color: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  color: #e5e5e5;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.argus-tour-popover .driver-popover-title {
  color: #f0f0f0;
  font-size: 0.875rem;
  font-weight: 600;
}

.argus-tour-popover .driver-popover-description {
  color: #b0b0b0;
  font-size: 0.8rem;
  line-height: 1.5;
}

.argus-tour-popover .driver-popover-progress-text {
  color: #666;
  font-size: 0.75rem;
}

.argus-tour-popover .driver-popover-navigation-btns button {
  background-color: #a78bfa;
  border: none;
  border-radius: 6px;
  color: #111;
  font-size: 0.8rem;
  font-weight: 500;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.argus-tour-popover .driver-popover-navigation-btns button:hover {
  background-color: #c4b5fd;
}

.argus-tour-popover .driver-popover-navigation-btns .driver-popover-prev-btn {
  background-color: transparent;
  border: 1px solid #2a2a2a;
  color: #9a9a9a;
}

.argus-tour-popover .driver-popover-navigation-btns .driver-popover-prev-btn:hover {
  background-color: rgba(255, 255, 255, 0.05);
  color: #d4d4d4;
}

.argus-tour-popover .driver-popover-close-btn {
  color: #666;
  font-size: 1rem;
  line-height: 1;
}

.argus-tour-popover .driver-popover-close-btn:hover {
  color: #e5e5e5;
}

.driver-overlay {
  background: rgba(0, 0, 0, 0.72) !important;
}
```

- [ ] **Step 3: Verify dev server starts without CSS errors**

```bash
cd frontend && pnpm dev 2>&1 | head -20
```

Expected: Vite starts, no CSS parse errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/main.tsx frontend/src/index.css
git commit -m "feat(onboarding): import driver.js CSS + add Argus dark theme overrides"
```

---

## Task 3: Create driverConfig.ts

**Files:**
- Create: `frontend/src/features/onboarding/driverConfig.ts`

- [ ] **Step 1: Create the file**

```typescript
// frontend/src/features/onboarding/driverConfig.ts
import type { Config } from 'driver.js'

export function createDriverConfig(): Partial<Config> {
  return {
    animate: true,
    smoothScroll: true,
    overlayColor: '#000',
    overlayOpacity: 0.72,
    popoverClass: 'argus-tour-popover',
    showButtons: ['next', 'previous', 'close'],
    allowClose: true,
  }
}
```

- [ ] **Step 2: Verify TypeScript accepts it**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep onboarding
```

Expected: no output (no errors in the new file).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/onboarding/driverConfig.ts
git commit -m "feat(onboarding): add driver.js config factory"
```

---

## Task 4: Create tourSteps.ts (first-visit flow)

**Files:**
- Create: `frontend/src/features/onboarding/tourSteps.ts`

These steps drive the first-visit cross-page flow: Events → Hooks Config → preset select → save → done.

- [ ] **Step 1: Create the file**

```typescript
// frontend/src/features/onboarding/tourSteps.ts
import type { DriveStep } from 'driver.js'

type FirstVisitStepsOptions = {
  navigate: (path: string) => void
  getDriver: () => { moveNext: () => void; destroy: () => void } | null
  onComplete: () => void
}

export function buildFirstVisitSteps({
  navigate,
  getDriver,
  onComplete,
}: FirstVisitStepsOptions): DriveStep[] {
  return [
    {
      element: '[data-tour="sidebar-nav"]',
      popover: {
        title: 'Welcome to Argus',
        description:
          "Your hook control center for AI coding agents. Let's get you set up in 60 seconds.",
      },
    },
    {
      element: '[data-tour="hooks-config-link"]',
      popover: {
        title: 'Configure your hooks',
        description:
          'First, wire up your agent. Click <strong>Next</strong> to open Hooks Config.',
        onNextClick: () => {
          navigate('/hooks-config')
          // Poll until the preset selector renders (page is lazy-loaded)
          const interval = setInterval(() => {
            if (document.querySelector('[data-tour="preset-selector"]')) {
              clearInterval(interval)
              getDriver()?.moveNext()
            }
          }, 100)
          // Safety: stop polling after 8s
          setTimeout(() => clearInterval(interval), 8000)
        },
      },
    },
    {
      element: '[data-tour="preset-selector"]',
      popover: {
        title: 'Choose a preset',
        description:
          'Open this dropdown and select <strong>Baseline</strong> — it captures the most useful events. Then click Next.',
      },
    },
    {
      element: '[aria-label="Save hooks config"]',
      popover: {
        title: 'Save your config',
        description:
          'Click Save to write the hooks config to disk. Claude Code picks it up on the next session start.',
      },
    },
    {
      popover: {
        title: "You're all set!",
        description:
          'Go back to Claude Code and start coding. Hook events will appear here live as your agent runs.',
        doneBtnText: 'Go to Events',
        onNextClick: () => {
          onComplete()
          navigate('/')
          getDriver()?.destroy()
        },
      },
    },
  ]
}
```

- [ ] **Step 2: Verify types**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep tourSteps
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/onboarding/tourSteps.ts
git commit -m "feat(onboarding): add first-visit tour step builder"
```

---

## Task 5: Create pageTours.ts (per-page mini-tours)

**Files:**
- Create: `frontend/src/features/onboarding/pageTours.ts`

Note: some `data-tour` selectors below are added in Task 7. Steps reference them by name for clarity.

- [ ] **Step 1: Create the file**

```typescript
// frontend/src/features/onboarding/pageTours.ts
import type { DriveStep } from 'driver.js'

const eventsSteps: DriveStep[] = [
  {
    element: '[data-tour="events-feed"]',
    popover: {
      title: 'Live event feed',
      description:
        'Hook payloads from your agent stream here in real time. Each row is one hook event.',
    },
  },
  {
    element: '#event-filters',
    popover: {
      title: 'Filter events',
      description:
        'Filter by event type, session, project, or search text. Filters combine as AND.',
    },
  },
]

const dashboardSteps: DriveStep[] = [
  {
    element: '[data-tour="dashboard-stats"]',
    popover: {
      title: 'Summary stats',
      description: 'Token usage, session count, and event totals across your selected date range.',
    },
  },
  {
    element: '[data-tour="dashboard-chart"]',
    popover: {
      title: 'Token timeline',
      description: 'Daily input/output token consumption. Hover a bar to see the breakdown.',
    },
  },
  {
    element: '[data-tour="dashboard-export"]',
    popover: {
      title: 'CSV export',
      description: 'Download session stats as CSV for further analysis in a spreadsheet.',
    },
  },
]

const projectsSteps: DriveStep[] = [
  {
    element: '[data-tour="projects-grid"]',
    popover: {
      title: 'Projects',
      description:
        'Each card is a working directory your agent has run in. Click a card to see its sessions.',
    },
  },
]

const hooksConfigSteps: DriveStep[] = [
  {
    element: '[data-tour="hooks-config-agent-tabs"]',
    popover: {
      title: 'Agent tabs',
      description:
        'Separate hook configs for Claude Code and Codex. Changes to one do not affect the other.',
    },
  },
  {
    element: '[data-tour="preset-selector"]',
    popover: {
      title: 'Presets',
      description:
        'Quickly load a curated hook set. Baseline is a great starting point; Full captures everything.',
    },
  },
  {
    element: '[aria-label="Save hooks config"]',
    popover: {
      title: 'Save',
      description:
        'Writes the config to disk. Your agent picks up changes on the next session start.',
    },
  },
]

const scriptsSteps: DriveStep[] = [
  {
    element: '[data-tour="scripts-tabs"]',
    popover: {
      title: 'Community vs. My Collection',
      description:
        'Community: curated scripts from the registry. My Collection: your installed scripts, optionally backed up to a private GitHub gist.',
    },
  },
  {
    element: '[data-tour="scripts-content"]',
    popover: {
      title: 'Script cards',
      description:
        'Each card shows the script name, event it targets, and runtime. Click Install to add it to ~/.argus/hooks/.',
    },
  },
]

const diagnosticsSteps: DriveStep[] = [
  {
    element: '[data-tour="diagnostics-health"]',
    popover: {
      title: 'Health',
      description: 'Database path, total event count, and disk usage at a glance.',
    },
  },
  {
    element: '[data-tour="diagnostics-filesystem"]',
    popover: {
      title: 'File system',
      description:
        "Confirms argus can read your hooks config and transcript directories. Red here means hooks aren't being received.",
    },
  },
]

export const PAGE_TOURS: Record<string, DriveStep[]> = {
  '/': eventsSteps,
  '/dashboard': dashboardSteps,
  '/projects': projectsSteps,
  '/hooks-config': hooksConfigSteps,
  '/scripts': scriptsSteps,
  '/diagnostics': diagnosticsSteps,
}
```

- [ ] **Step 2: Verify types**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep pageTours
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/onboarding/pageTours.ts
git commit -m "feat(onboarding): add per-page tour step definitions"
```

---

## Task 6: Create useOnboarding hook (TDD)

**Files:**
- Create: `frontend/src/features/onboarding/useOnboarding.ts`
- Create: `frontend/src/features/onboarding/__tests__/useOnboarding.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/src/features/onboarding/__tests__/useOnboarding.test.ts
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock driver.js before importing the hook
const mockMoveNext = vi.fn()
const mockDestroy = vi.fn()
const mockDrive = vi.fn()
const mockDriver = vi.fn(() => ({
  drive: mockDrive,
  destroy: mockDestroy,
  moveNext: mockMoveNext,
}))

vi.mock('driver.js', () => ({ driver: mockDriver }))
vi.mock('../driverConfig', () => ({ createDriverConfig: () => ({}) }))
vi.mock('../tourSteps', () => ({
  buildFirstVisitSteps: ({ onComplete }: { onComplete: () => void; navigate: unknown; getDriver: unknown }) => [
    { popover: { title: 'Step 1', onNextClick: onComplete } },
  ],
}))
vi.mock('../pageTours', () => ({
  PAGE_TOURS: {
    '/': [{ popover: { title: 'Events step' } }],
    '/dashboard': [{ popover: { title: 'Dashboard step' } }],
  },
}))

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}

const navigateMock = vi.fn()
const forceSidebarOpenMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock)
  vi.clearAllMocks()
  vi.useFakeTimers()
  localStorageMock.getItem.mockReturnValue(null)
})

import { useOnboarding } from '../useOnboarding'

describe('useOnboarding', () => {
  it('starts first-visit tour on mount when flag not set', () => {
    localStorageMock.getItem.mockReturnValue(null)

    renderHook(() =>
      useOnboarding({ navigate: navigateMock, forceSidebarOpen: forceSidebarOpenMock })
    )

    act(() => {
      vi.advanceTimersByTime(900)
    })

    expect(forceSidebarOpenMock).toHaveBeenCalledTimes(1)
    expect(mockDriver).toHaveBeenCalledTimes(1)
    expect(mockDrive).toHaveBeenCalledTimes(1)
  })

  it('skips first-visit tour when flag is set', () => {
    localStorageMock.getItem.mockReturnValue('1')

    renderHook(() =>
      useOnboarding({ navigate: navigateMock, forceSidebarOpen: forceSidebarOpenMock })
    )

    act(() => {
      vi.advanceTimersByTime(900)
    })

    expect(forceSidebarOpenMock).not.toHaveBeenCalled()
    expect(mockDriver).not.toHaveBeenCalled()
  })

  it('markDone sets localStorage flag and clears isFirstVisitTourActive', () => {
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() =>
      useOnboarding({ navigate: navigateMock, forceSidebarOpen: forceSidebarOpenMock })
    )

    act(() => {
      vi.advanceTimersByTime(900)
    })

    expect(result.current.isFirstVisitTourActive).toBe(true)

    act(() => {
      result.current.markDone()
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith('argus_onboarding_done', '1')
    expect(result.current.isFirstVisitTourActive).toBe(false)
  })

  it('startPageTour drives for a known route', () => {
    localStorageMock.getItem.mockReturnValue('1')

    const { result } = renderHook(() =>
      useOnboarding({ navigate: navigateMock, forceSidebarOpen: forceSidebarOpenMock })
    )

    act(() => {
      result.current.startPageTour('/')
    })

    expect(mockDriver).toHaveBeenCalledTimes(1)
    expect(mockDrive).toHaveBeenCalledTimes(1)
  })

  it('startPageTour does nothing for an unknown route', () => {
    localStorageMock.getItem.mockReturnValue('1')

    const { result } = renderHook(() =>
      useOnboarding({ navigate: navigateMock, forceSidebarOpen: forceSidebarOpenMock })
    )

    act(() => {
      result.current.startPageTour('/unknown')
    })

    expect(mockDriver).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — expect failure**

```bash
cd frontend && npx vitest run src/features/onboarding/__tests__/useOnboarding.test.ts 2>&1 | tail -20
```

Expected: `Cannot find module '../useOnboarding'` or similar.

- [ ] **Step 3: Create useOnboarding.ts**

```typescript
// frontend/src/features/onboarding/useOnboarding.ts
import { useEffect, useRef, useState } from 'react'
import { driver } from 'driver.js'
import { createDriverConfig } from './driverConfig'
import { buildFirstVisitSteps } from './tourSteps'
import { PAGE_TOURS } from './pageTours'

const ONBOARDING_KEY = 'argus_onboarding_done'

type UseOnboardingOptions = {
  navigate: (path: string) => void
  forceSidebarOpen: () => void
}

type UseOnboardingReturn = {
  isFirstVisitTourActive: boolean
  startFirstVisitTour: () => void
  startPageTour: (route: string) => void
  markDone: () => void
}

export function useOnboarding({
  navigate,
  forceSidebarOpen,
}: UseOnboardingOptions): UseOnboardingReturn {
  const [isFirstVisitTourActive, setIsFirstVisitTourActive] = useState(false)
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)

  function markDone() {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setIsFirstVisitTourActive(false)
  }

  function startFirstVisitTour() {
    forceSidebarOpen()
    setIsFirstVisitTourActive(true)

    const steps = buildFirstVisitSteps({
      navigate,
      getDriver: () => driverRef.current,
      onComplete: markDone,
    })

    const d = driver({
      ...createDriverConfig(),
      showProgress: true,
      steps,
      onDestroyStarted: () => {
        markDone()
      },
    })

    driverRef.current = d
    d.drive()
  }

  function startPageTour(route: string) {
    const steps = PAGE_TOURS[route]
    if (!steps || steps.length === 0) return

    const d = driver({
      ...createDriverConfig(),
      showProgress: true,
      steps,
    })
    d.drive()
  }

  useEffect(() => {
    const done = localStorage.getItem(ONBOARDING_KEY)
    if (!done) {
      const timer = setTimeout(startFirstVisitTour, 800)
      return () => clearTimeout(timer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { isFirstVisitTourActive, startFirstVisitTour, startPageTour, markDone }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
cd frontend && npx vitest run src/features/onboarding/__tests__/useOnboarding.test.ts 2>&1 | tail -20
```

Expected: `5 tests passed`.

- [ ] **Step 5: Full test suite still passes**

```bash
cd frontend && npx vitest run 2>&1 | tail -10
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/onboarding/useOnboarding.ts \
        frontend/src/features/onboarding/__tests__/useOnboarding.test.ts
git commit -m "feat(onboarding): add useOnboarding hook with TDD"
```

---

## Task 7: Add data-tour attributes to Sidebar + HooksConfig components

**Files:**
- Modify: `frontend/src/app/Sidebar.tsx`
- Modify: `frontend/src/features/hooks-config/StructuredEditor.tsx`
- Modify: `frontend/src/features/hooks-config/HooksConfigPage.tsx`

These are the targets for the **first-visit** tour steps.

- [ ] **Step 1: Add data-tour to sidebar `<nav>` in Sidebar.tsx**

In `frontend/src/app/Sidebar.tsx`, find the `<nav>` element (around line 292):

```tsx
      <TooltipProvider delayDuration={100}>
        <nav className={cn('mt-1 flex flex-col gap-0.5')}>
```

Change to:

```tsx
      <TooltipProvider delayDuration={100}>
        <nav data-tour="sidebar-nav" className={cn('mt-1 flex flex-col gap-0.5')}>
```

- [ ] **Step 2: Add data-tour to the Hooks Config NavLink in Sidebar.tsx**

The `NAV_ITEMS` array at line ~108 defines nav items. The hooks-config item does not have a data attribute. We need to pass it through to the `NavLink`.

The `NavButton` component spreads `...rest` (which is `AnchorHTMLAttributes`) onto the `<NavLink>`. Add a `data-tour` prop to the hooks-config nav item by changing `renderNavButton` to support an optional `dataTour` attribute.

Replace the `NavItem` interface and `renderNavButton` logic. First, update the `NavItem` type (around line 51):

```tsx
interface NavItem {
  to: string
  label: string
  ariaLabel: string
  icon: LucideIcon
  end: boolean
  dataTour?: string
}
```

Update `NavButtonProps` (around line 59) to include the new field:

```tsx
type NavButtonProps = NavItem &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick' | 'className' | 'aria-label'> & {
    ref?: Ref<HTMLAnchorElement>
    onNavigate?: () => void
    desktopNavLabelClassName: string
    navButtonClassNameFn: (isActive: boolean) => string
  }
```

Update `NavButton` component to spread `data-tour` onto the `NavLink` (around line 67):

```tsx
function NavButton({
  to,
  label,
  ariaLabel,
  icon: Icon,
  end,
  ref,
  onNavigate,
  desktopNavLabelClassName,
  navButtonClassNameFn,
  dataTour,
  ...rest
}: NavButtonProps) {
  const match = useMatch({ path: to, end })
  const isActive = match !== null

  return (
    <Button asChild variant="ghost" className={navButtonClassNameFn(isActive)}>
      <NavLink
        ref={ref}
        to={to}
        end={end}
        aria-label={ariaLabel}
        data-tour={dataTour}
        onClick={() => onNavigate?.()}
        {...rest}
      >
        <span className="flex size-9 shrink-0 items-center justify-center">
          <Icon
            className={cn(
              'size-[15px] shrink-0 transition-colors duration-200',
              isActive ? 'text-[#e6e6e6]' : 'text-current'
            )}
          />
        </span>
        <span aria-hidden="true" className={desktopNavLabelClassName}>
          {label}
        </span>
      </NavLink>
    </Button>
  )
}
```

Add `dataTour` to the hooks-config entry in `NAV_ITEMS` (around line 108):

```tsx
const NAV_ITEMS: NavItem[] = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    ariaLabel: 'Overview Dashboard',
    icon: LayoutDashboard,
    end: false,
  },
  {
    to: '/',
    label: 'Events',
    ariaLabel: 'Terminal Events',
    icon: TerminalSquare,
    end: true,
  },
  {
    to: '/projects',
    label: 'Projects',
    ariaLabel: 'Projects',
    icon: FolderOpen,
    end: false,
  },
  {
    to: '/diagnostics',
    label: 'Diagnostics',
    ariaLabel: 'System Diagnostics',
    icon: Stethoscope,
    end: false,
  },
  {
    to: '/hooks-config',
    label: 'Hooks Config',
    ariaLabel: 'Hooks Configuration',
    icon: SlidersHorizontal,
    end: false,
    dataTour: 'hooks-config-link',
  },
  {
    to: '/scripts',
    label: 'Scripts',
    ariaLabel: 'Hook Scripts Library',
    icon: Files,
    end: false,
  },
]
```

- [ ] **Step 3: Add data-tour to preset SelectTrigger in StructuredEditor.tsx**

In `frontend/src/features/hooks-config/StructuredEditor.tsx`, find the `<SelectTrigger>` around line 207:

```tsx
        <Select value={selectedPreset} onValueChange={handleApplyPreset}>
          <SelectTrigger className="h-8 text-[13px] w-[160px]">
```

Change to:

```tsx
        <Select value={selectedPreset} onValueChange={handleApplyPreset}>
          <SelectTrigger data-tour="preset-selector" className="h-8 text-[13px] w-[160px]">
```

- [ ] **Step 4: Add data-tour to agent TabsList in HooksConfigPage.tsx**

In `frontend/src/features/hooks-config/HooksConfigPage.tsx`, find the agent `<TabsList>` around line 394:

```tsx
          <TabsList variant="line">
            <TabsTrigger value="claudecode">Claude Code</TabsTrigger>
            <TabsTrigger value="codex">Codex</TabsTrigger>
          </TabsList>
```

Change to:

```tsx
          <TabsList data-tour="hooks-config-agent-tabs" variant="line">
            <TabsTrigger value="claudecode">Claude Code</TabsTrigger>
            <TabsTrigger value="codex">Codex</TabsTrigger>
          </TabsList>
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "Sidebar|StructuredEditor|HooksConfig"
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/Sidebar.tsx \
        frontend/src/features/hooks-config/StructuredEditor.tsx \
        frontend/src/features/hooks-config/HooksConfigPage.tsx
git commit -m "feat(onboarding): add data-tour attributes to sidebar and hooks config"
```

---

## Task 8: Add data-tour attributes to page components

**Files:**
- Modify: `frontend/src/features/events/EventsPage.tsx`
- Modify: `frontend/src/features/dashboard/DashboardPage.tsx`
- Modify: `frontend/src/features/projects/ProjectsPage.tsx`
- Modify: `frontend/src/features/scripts/ScriptsPage.tsx`
- Modify: `frontend/src/features/diagnostics/DiagnosticsPage.tsx`

- [ ] **Step 1: EventsPage.tsx — add data-tour to feed container**

In `frontend/src/features/events/EventsPage.tsx`, find the outermost scrollable event list container (around `data-testid="events-panel-1"`). Wrap or add `data-tour="events-feed"` to that container:

Find:
```tsx
          data-testid="events-panel-1"
```

Change the full element opening tag that contains this attribute to also include `data-tour="events-feed"`:
```tsx
          data-testid="events-panel-1"
          data-tour="events-feed"
```

- [ ] **Step 2: DashboardPage.tsx — add data-tour to stats and chart**

Open `frontend/src/features/dashboard/DashboardPage.tsx`. Find the `<SummaryStats>` component render and its containing element. Add `data-tour="dashboard-stats"` to its wrapper div.

Find the `<SummaryStats` usage and wrap in a `<div data-tour="dashboard-stats">` if not already in one, or add the attribute to the closest wrapping div.

Find the `<TokenTimelineChart` or chart component usage, add `data-tour="dashboard-chart"` to its wrapper.

Find the CSV export button or its section, add `data-tour="dashboard-export"` to its wrapper.

Example pattern — find the stats section wrapper and add the attribute:
```tsx
<div data-tour="dashboard-stats" className="...existing classes...">
  <SummaryStats ... />
</div>
```

*(Read the file first to find exact element boundaries before editing.)*

- [ ] **Step 3: ProjectsPage.tsx — add data-tour to projects grid**

In `frontend/src/features/projects/ProjectsPage.tsx`, find the projects grid div (around line 101, `className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"`):

```tsx
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
```

There are multiple grid divs (loading skeleton + loaded). Add `data-tour="projects-grid"` only to the loaded one (the one that renders actual project cards, not the skeleton). Find the non-skeleton grid and add the attribute:

```tsx
          <div data-tour="projects-grid" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
```

- [ ] **Step 4: ScriptsPage.tsx — add data-tour to tabs and content area**

In `frontend/src/features/scripts/ScriptsPage.tsx`, find the `<TabsList>` (around line 91):

```tsx
        <Tabs value={tab} onValueChange={(v) => changeTab(v as Tab)}>
          <TabsList variant="line">
```

Change to:

```tsx
        <Tabs data-tour="scripts-tabs" value={tab} onValueChange={(v) => changeTab(v as Tab)}>
          <TabsList variant="line">
```

Then find the content area below the tabs and add `data-tour="scripts-content"` to its wrapper div.

- [ ] **Step 5: DiagnosticsPage.tsx — add data-tour to health and filesystem cards**

In `frontend/src/features/diagnostics/DiagnosticsPage.tsx`, find the first `<Card>` (health/storage card around line 208) and add `data-tour="diagnostics-health"`:

```tsx
        <Card data-tour="diagnostics-health">
```

Find the `<FileSystemCard` usage or the filesystem `<Card>` and add `data-tour="diagnostics-filesystem"`:

```tsx
        <Card data-tour="diagnostics-filesystem">
```

*(Read the file to confirm which Card is which before editing.)*

- [ ] **Step 6: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/events/EventsPage.tsx \
        frontend/src/features/dashboard/DashboardPage.tsx \
        frontend/src/features/projects/ProjectsPage.tsx \
        frontend/src/features/scripts/ScriptsPage.tsx \
        frontend/src/features/diagnostics/DiagnosticsPage.tsx
git commit -m "feat(onboarding): add data-tour attributes to page components"
```

---

## Task 9: Wire useOnboarding into Layout.tsx

**Files:**
- Modify: `frontend/src/app/Layout.tsx`

`Layout.tsx` is the right home for `useOnboarding` — it already owns sidebar state and has access to `navigate` from react-router.

- [ ] **Step 1: Import useOnboarding and useNavigate in Layout.tsx**

At the top of `frontend/src/app/Layout.tsx`, add these imports after existing imports:

```tsx
import { useNavigate } from 'react-router-dom'
import { useOnboarding } from '@/features/onboarding/useOnboarding'
import { PAGE_TOURS } from '@/features/onboarding/pageTours'
```

- [ ] **Step 2: Add useNavigate and useOnboarding inside Layout function**

Inside `export function Layout()`, after the existing hooks (after `const location = useLocation()`), add:

```tsx
  const navigate = useNavigate()

  const { isFirstVisitTourActive, startPageTour, markDone } = useOnboarding({
    navigate,
    forceSidebarOpen: () => dispatch({ type: 'SET_SIDEBAR_COLLAPSED', collapsed: false }),
  })
```

- [ ] **Step 3: Compute hasTourForRoute and pass to Sidebar**

After the `useOnboarding` call, add:

```tsx
  const hasTourForRoute = Boolean(PAGE_TOURS[location.pathname])
```

Then update both `<Sidebar>` usages in the JSX to pass the new props.

Desktop Sidebar (the `className="hidden md:flex"` one) — add three props:

```tsx
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => dispatch({ type: 'TOGGLE_SIDEBAR_COLLAPSED' })}
        mode="desktop"
        className="hidden md:flex"
        onStartTour={() => startPageTour(location.pathname)}
        hasTourForRoute={hasTourForRoute}
        isFirstVisitTourActive={isFirstVisitTourActive}
      />
```

Mobile Sidebar — add the same three props:

```tsx
      <Sidebar
        id={MOBILE_SIDEBAR_ID}
        collapsed={false}
        mode="mobile"
        open={mobileOpen}
        onNavigate={() => dispatch({ type: 'SET_MOBILE_DRAWER', key: null })}
        onClose={() => dispatch({ type: 'SET_MOBILE_DRAWER', key: null })}
        containerRef={mobileSidebarRef}
        className="fixed inset-y-0 left-0 z-50 flex w-[240px] max-w-[calc(100vw-2rem)] md:hidden"
        onStartTour={() => startPageTour(location.pathname)}
        hasTourForRoute={hasTourForRoute}
        isFirstVisitTourActive={isFirstVisitTourActive}
      />
```

- [ ] **Step 4: Verify TypeScript — expect SidebarProps errors (not yet updated)**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -i "sidebar\|onStartTour\|hasTour\|isFirst"
```

Expected: type errors for unknown props — these will be fixed in Task 10.

- [ ] **Step 5: Commit (will have TS errors — commit anyway, fixed next task)**

```bash
git add frontend/src/app/Layout.tsx
git commit -m "feat(onboarding): wire useOnboarding into Layout"
```

---

## Task 10: Add Tour button to Sidebar.tsx

**Files:**
- Modify: `frontend/src/app/Sidebar.tsx`

This task adds the three new props to `SidebarProps`, updates the `SidebarProps` interface, and adds the steering wheel Tour button in the `mt-auto` section above the divider.

- [ ] **Step 1: Update SidebarProps interface**

In `frontend/src/app/Sidebar.tsx`, find the `SidebarProps` interface (around line 39) and add three new optional props:

```tsx
interface SidebarProps {
  id?: string
  collapsed: boolean
  mode?: 'desktop' | 'mobile'
  open?: boolean
  onToggleCollapse?: () => void
  onNavigate?: () => void
  onClose?: () => void
  className?: string
  containerRef?: RefObject<HTMLElement | null>
  onStartTour?: () => void
  hasTourForRoute?: boolean
  isFirstVisitTourActive?: boolean
}
```

- [ ] **Step 2: Destructure new props in the Sidebar function**

Find the `export function Sidebar({` destructuring (around line 153) and add the three new props:

```tsx
export function Sidebar({
  id,
  collapsed,
  mode = 'desktop',
  open = false,
  onToggleCollapse,
  onNavigate,
  onClose,
  className,
  containerRef,
  onStartTour,
  hasTourForRoute = false,
  isFirstVisitTourActive = false,
}: SidebarProps) {
```

- [ ] **Step 3: Add steering wheel SVG component**

At the top of the file, after the `ArgusEye` component definition, add the `SteeringWheel` component:

```tsx
function SteeringWheel({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Outer ring */}
      <circle cx="12" cy="12" r="9" />
      {/* Hub */}
      <circle cx="12" cy="12" r="2.5" />
      {/* Spokes */}
      <line x1="12" y1="9.5" x2="12" y2="3" />
      <line x1="9.83" y1="10.17" x2="5.02" y2="18.38" />
      <line x1="14.17" y1="10.17" x2="18.98" y2="18.38" />
    </svg>
  )
}
```

- [ ] **Step 4: Add Tour button in the mt-auto section**

In the `mt-auto` section (around line 311), find:

```tsx
      <div className="mt-auto">
        <div className="sidebar-bottom-divider" />
```

Replace with:

```tsx
      <div className="mt-auto">
        {!isFirstVisitTourActive && (
          <TooltipProvider delayDuration={100}>
            <div className="mb-1">
              {showCollapsedTooltips ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!hasTourForRoute}
                      onClick={onStartTour}
                      className={cn(
                        'h-9 w-9 gap-0 border border-transparent text-[0.8rem] font-normal transition-colors duration-200',
                        'justify-center rounded-lg px-0',
                        hasTourForRoute
                          ? 'text-[#666] hover:bg-white/[0.06] hover:text-[#aaa]'
                          : 'cursor-not-allowed opacity-40'
                      )}
                      aria-label="Start page tour"
                    >
                      <SteeringWheel className="size-[15px] shrink-0" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>
                    Tour
                  </TooltipContent>
                </Tooltip>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!hasTourForRoute}
                  onClick={onStartTour}
                  className={cn(
                    'h-9 gap-0 border border-transparent text-[0.8rem] font-normal transition-colors duration-200',
                    collapsed ? 'w-9 justify-center rounded-lg px-0' : 'w-full justify-start rounded-lg px-0',
                    hasTourForRoute
                      ? 'text-[#666] hover:bg-white/[0.06] hover:text-[#aaa]'
                      : 'cursor-not-allowed opacity-40'
                  )}
                  aria-label="Start page tour"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center">
                    <SteeringWheel className="size-[15px] shrink-0" />
                  </span>
                  <span aria-hidden="true" className={desktopNavLabelClassName}>
                    Tour
                  </span>
                </Button>
              )}
            </div>
          </TooltipProvider>
        )}
        <div className="sidebar-bottom-divider" />
```

- [ ] **Step 5: Verify TypeScript — all errors resolved**

```bash
cd frontend && npx tsc --noEmit 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 6: Run full test suite**

```bash
cd frontend && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/Sidebar.tsx
git commit -m "feat(onboarding): add Tour button to Sidebar with steering wheel icon"
```

---

## Task 11: Smoke test the full flow

**No new files — manual verification.**

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && pnpm dev
```

- [ ] **Step 2: Test first-visit tour**

1. Open `http://localhost:5173` in a browser
2. Open DevTools → Application → Local Storage → delete `argus_onboarding_done` if present
3. Refresh the page
4. Confirm: sidebar is forced open, tour popover appears on sidebar nav after ~800ms
5. Click Next through all steps, confirm navigation to `/hooks-config` on step 2
6. Confirm preset selector and Save button are highlighted correctly
7. On completion step, click "Go to Events" — confirm navigation back to `/` and tour ends
8. Refresh — confirm tour does NOT re-appear (localStorage flag set)

- [ ] **Step 3: Test per-page tour**

1. With `argus_onboarding_done` set (tour done), check the Tour button appears in sidebar
2. Navigate to `/dashboard` — Tour button should be enabled
3. Click Tour button — confirm dashboard mini-tour starts
4. Navigate to `/sessions` — confirm Tour button is disabled (no tour defined for that route)

- [ ] **Step 4: Test collapsed sidebar**

1. Collapse the sidebar
2. Confirm Tour button shows as icon-only with "Tour" tooltip on hover

- [ ] **Step 5: Build check**

```bash
cd frontend && pnpm build 2>&1 | tail -10
```

Expected: build succeeds, no warnings about driver.js.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(onboarding): driver.js onboarding tour complete"
```

---

## Self-review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Auto-trigger on first visit (localStorage flag) | Task 6 |
| Manual "Tour" button in sidebar | Task 10 |
| Sidebar forced open on first visit | Task 9 |
| First-visit flow: Events → Hooks Config → preset → save → done | Tasks 4, 7 |
| Cross-page navigation in tour (step 2 onNextClick + polling) | Task 4 |
| "You're all set" completion popover + navigate to Events | Task 4 |
| Per-page mini-tours (PAGE_TOURS map) | Task 5 |
| Steering wheel inline SVG | Task 10 |
| Collapsed: icon+tooltip / Expanded: icon+text | Task 10 |
| Disabled when no tour for route | Task 10 |
| Hidden during first-visit tour | Task 10 |
| Dark driver.js theme (argus-tour-popover CSS) | Task 2 |
| `#a78bfa` accent color | Task 2 |
| `argus_onboarding_done` localStorage key | Task 6 |
| `pnpm add driver.js` | Task 1 |
| data-tour on all page targets | Tasks 7, 8 |

All spec requirements covered.
