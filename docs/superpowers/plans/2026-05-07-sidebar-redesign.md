# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `emruy` sidebar into a cleaner, more polished navigation rail while keeping the existing font stack, color tokens, theme, and component primitives.

**Architecture:** Keep the change local to the layout shell. `Sidebar.tsx` owns the rail UI, route metadata, icon/tooltip behavior, and active-state polish. `Layout.tsx` keeps ownership of collapsed-state persistence and updates the grid from full-hide mode to icon-rail mode so the rest of the app stays untouched.

**Tech Stack:** React 19, TypeScript 6, React Router v7, shadcn `Button`/`Tooltip`/`Separator`, `lucide-react`, Tailwind CSS v4 utilities, existing CSS token system in `frontend/src/index.css`

---

## File Map

**Modify:**
- `frontend/src/components/Sidebar.tsx` — route metadata with icons, identity block, expanded/collapsed rail rendering, tooltip behavior, active/hover styling
- `frontend/src/components/Layout.tsx` — grid column widths, toggle button icon/label styling, preserved `localStorage` persistence

**Do not modify unless implementation proves strictly necessary:**
- `frontend/src/index.css` — leave token definitions alone; do not create a new visual system

**Verification only:**
- `frontend/package.json` — use existing `typecheck`, `lint`, `check`, and `build` scripts; do not add Vitest/Playwright in this task

**Constraint note:**
- This repo does not currently have a dedicated frontend test runner. For this narrow UI task, verification is compile/lint/build plus manual browser checks. Do not widen scope by introducing a new testing stack.

---

### Task 1: Reshape Sidebar Data And Identity Block

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Replace plain nav metadata with icon-backed metadata**

Update imports and route config so each nav item has an icon and accessible label.

```tsx
import {
  BarChart3,
  LayoutDashboard,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  {
    to: '/',
    label: 'Events',
    ariaLabel: 'Terminal Events',
    icon: TerminalSquare,
    end: true,
  },
  {
    to: '/dashboard',
    label: 'Dashboard',
    ariaLabel: 'Overview Dashboard',
    icon: LayoutDashboard,
    end: false,
  },
  {
    to: '/usage',
    label: 'Usage',
    ariaLabel: 'API Usage Tracker',
    icon: BarChart3,
    end: false,
  },
] as const
```

- [ ] **Step 2: Replace current title-only top row with identity block**

Keep `Agent Monitor` as primary identity, but present it with clearer hierarchy and tighter spacing.

```tsx
<div className={cn('flex flex-col', collapsed ? 'items-center gap-4' : 'gap-5')}>
  <div
    className={cn(
      'flex min-h-14 items-center border border-border/80 bg-card/30',
      collapsed
        ? 'w-full justify-center rounded-xl px-0'
        : 'rounded-xl px-3 py-3'
    )}
  >
    {collapsed ? (
      <span className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">
        AM
      </span>
    ) : (
      <div className="flex flex-col gap-1">
        <span className="text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">
          Agent
        </span>
        <span className="text-sm font-semibold uppercase tracking-[0.12em] text-foreground">
          Monitor
        </span>
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 3: Keep sidebar shell visible in both states**

Replace the `w-0 px-0` hide behavior with a stable rail container.

```tsx
return (
  <aside
    className={cn(
      'flex h-full flex-col overflow-hidden border-r border-border bg-background transition-all duration-300',
      collapsed ? 'px-2 py-4' : 'px-4 py-5'
    )}
  >
    {/* identity + nav */}
  </aside>
)
```

- [ ] **Step 4: Run typecheck after the metadata/identity changes**

Run: `npm run typecheck`

Expected: `tsc -b --noEmit` completes without TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: add sidebar identity block and nav metadata"
```

---

### Task 2: Implement Expanded Nav And Collapsed Icon Rail

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Switch nav buttons to `Button asChild` and unify active styling**

Use `useLocation()` to compute active state, then feed one button recipe into `Button asChild`.

```tsx
const location = useLocation()

const isNavItemActive = (to: string, end: boolean) =>
  end ? location.pathname === to : location.pathname.startsWith(to)

const navButtonClassName = (isActive: boolean, collapsed: boolean) =>
  cn(
    'h-auto border text-app-text transition-colors',
    collapsed
      ? 'size-10 justify-center rounded-xl px-0'
      : 'w-full justify-start rounded-xl px-3 py-2.5',
    isActive
      ? 'border-[rgba(71,255,156,0.18)] bg-[rgba(71,255,156,0.1)] text-foreground'
      : 'border-transparent text-app-text hover:border-[rgba(71,255,156,0.16)] hover:bg-[rgba(71,255,156,0.06)] hover:text-foreground'
  )
```

- [ ] **Step 2: Import local tooltip primitives and build one routed link fragment**

Import and use the existing tooltip components only for collapsed mode.

```tsx
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
```

```tsx
const renderNavButton = (
  to: string,
  end: boolean,
  label: string,
  ariaLabel: string,
  Icon: LucideIcon
) => {
  const isActive = isNavItemActive(to, end)

  return (
    <Button
      asChild
      variant="ghost"
      className={navButtonClassName(isActive, collapsed)}
    >
      <NavLink to={to} end={end} aria-label={ariaLabel}>
        <Icon data-icon={collapsed ? undefined : 'inline-start'} />
        {collapsed ? <span className="sr-only">{ariaLabel}</span> : <span>{label}</span>}
      </NavLink>
    </Button>
  )
}
```

- [ ] **Step 3: Render one nav tree and branch only for tooltip wrapping**

Use one map over `NAV_ITEMS`. Expanded state shows icon + label. Collapsed state shows icon-only button inside tooltip.

```tsx
<TooltipProvider delayDuration={100}>
  <nav className={cn('flex flex-col gap-2', collapsed && 'items-center')}>
    {NAV_ITEMS.map(({ to, label, ariaLabel, icon: Icon, end }) => {
      const button = renderNavButton(to, end, label, ariaLabel, Icon)

      return collapsed ? (
        <Tooltip key={to}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>
            {ariaLabel}
          </TooltipContent>
        </Tooltip>
      ) : (
        <div key={to}>{button}</div>
      )
    })}
  </nav>
</TooltipProvider>
```

- [ ] **Step 4: Run typecheck and lint**

Run: `npm run check`

Expected:
- `npm run typecheck` passes
- `npm run lint` passes
- `npm run format:check` passes

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: add collapsed icon rail for sidebar"
```

---

### Task 3: Update Layout Grid And Header Toggle

**Files:**
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Replace full-hide grid widths with expanded/collapsed rail widths**

Keep the rest of the layout intact, but change the column model.

```tsx
<div
  className={cn(
    'grid h-screen transition-[grid-template-columns] duration-300',
    collapsed
      ? 'grid-cols-[72px_minmax(0,1fr)]'
      : 'grid-cols-[264px_minmax(0,1fr)]'
  )}
>
```

- [ ] **Step 2: Replace text hamburger with icon button and accessible label**

Add a lucide icon and keep the existing toggle state.

```tsx
import { Menu } from 'lucide-react'
```

```tsx
<Button
  variant="ghost"
  size="icon-sm"
  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
  className="mr-3 border border-border bg-background text-foreground hover:bg-muted hover:text-foreground"
  onClick={() => setCollapsed((c) => !c)}
>
  <Menu />
</Button>
```

- [ ] **Step 3: Tighten header shell so it matches updated sidebar language**

Do not change content model; only align spacing/borders with the new rail.

```tsx
<header className="flex items-center justify-between border-b border-border bg-header px-4 py-2 text-[0.8rem] text-dim">
  <div className="flex items-center">
    {/* toggle button */}
    <span className="uppercase tracking-[0.12em] text-muted-foreground">
      agent-monitor
    </span>
  </div>
  <span>{time}</span>
</header>
```

- [ ] **Step 4: Run build after layout changes**

Run: `npm run build`

Expected:
- `tsc -b && vite build` completes
- Vite emits frontend bundle without TypeScript or JSX errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Layout.tsx
git commit -m "feat: update layout for sidebar icon rail"
```

---

### Task 4: Manual Browser Verification And Final Cleanup

**Files:**
- Verify only: `frontend/src/components/Sidebar.tsx`
- Verify only: `frontend/src/components/Layout.tsx`
- Verify only: `frontend/src/index.css`

- [ ] **Step 1: Start the frontend dev server**

Run: `npm run dev -- --host 127.0.0.1 --port 4173`

Expected: Vite prints a local URL such as `http://127.0.0.1:4173/`

- [ ] **Step 2: Verify expanded-state behavior on all three routes**

Check these pages with sidebar expanded:
- `/`
- `/dashboard`
- `/usage`

Expected:
- `Agent Monitor` top block is legible
- each item shows icon + label
- active route is obvious without relying on color alone
- header toggle matches sidebar styling

- [ ] **Step 3: Verify collapsed-state behavior on all three routes**

Toggle collapsed mode and re-check:
- `/`
- `/dashboard`
- `/usage`

Expected:
- sidebar remains visible as thin rail
- each route shows icon only
- hover reveals tooltip with full route label
- route changes still work
- page content does not jump or overlap

- [ ] **Step 4: Confirm no unintended theme drift**

Inspect the diff and verify:

```bash
git diff -- frontend/src/components/Sidebar.tsx frontend/src/components/Layout.tsx frontend/src/index.css
```

Expected:
- changes are limited to sidebar/layout shell
- `index.css` is unchanged, or only has minimal token-safe edits
- no new color palette or font system was introduced

- [ ] **Step 5: Run final verification suite**

Run: `npm run check && npm run build`

Expected:
- all existing validation scripts pass
- production build still succeeds

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/components/Layout.tsx
git commit -m "feat: redesign sidebar navigation rail"
```
