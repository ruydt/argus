# Frontend Folder Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead frontend shim files and unused Vite template assets, and move the dashboard route component into `src/features/dashboard` so route pages follow the same feature-local layout as the rest of the app.

**Architecture:** Keep the dashboard UI unchanged and limit the change to file movement, route rewiring, and deletion of unused compatibility shims. Use the existing dashboard render test as the forcing function for the page rename, then verify the final tree with TypeScript and Vitest so `@/types` keeps resolving through `src/types/index.ts`.

**Tech Stack:** React 19, TypeScript 6, Vite 8, React Router 7, Vitest 4, Testing Library, pnpm 10.

---

## File Map

### Create
- `frontend/src/features/dashboard/DashboardPage.tsx` - feature-local route component replacing `src/pages/Dashboard.tsx`

### Modify
- `frontend/src/App.tsx` - update the lazy dashboard import path and exported component name
- `frontend/tests/features/dashboard/DashboardPage.test.tsx` - import the new file and renamed component

### Delete
- `frontend/src/pages/Dashboard.tsx` - legacy route component location
- `frontend/src/pages/` - remove the now-empty directory
- `frontend/src/components/Layout.tsx` - dead re-export shim
- `frontend/src/components/Sidebar.tsx` - dead re-export shim
- `frontend/src/types.ts` - dead re-export shim for `@/types`
- `frontend/src/App.css` - unused Vite starter stylesheet
- `frontend/src/assets/react.svg` - unused Vite starter asset
- `frontend/src/assets/vite.svg` - unused Vite starter asset

### Verify
- `frontend/src/types/index.ts` - remains the `@/types` export surface after shim removal
- `frontend/src/app/Layout.tsx` - existing `@/types` import should compile unchanged

---

## Task 1: Move Dashboard Into The Feature Folder

**Files:**
- Create: `frontend/src/features/dashboard/DashboardPage.tsx`
- Modify: `frontend/tests/features/dashboard/DashboardPage.test.tsx`

- [ ] **Step 1: Update the dashboard render test to import the new page file and name**

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from '@/features/dashboard/DashboardPage'

// Mock recharts to avoid canvas/SVG rendering issues in jsdom
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="recharts-container">{children}</div>
    ),
  }
})

const minimalStats = {
  total_sessions: 12,
  total_events: 240,
  total_input_tokens: 5000,
  total_output_tokens: 2500,
  timeline_granularity: 'day' as const,
  timeline: [],
  timeline_by_agent: [],
  token_timeline: [],
  token_timeline_by_agent: [],
  top_actions: [],
  agent_usage: [],
  session_usage: [],
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => minimalStats,
    })
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('DashboardPage', () => {
  it('renders skeleton loading state while fetching stats', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))

    renderDashboard()

    expect(screen.getByText('Summary')).toBeInTheDocument()
    expect(screen.queryByText('Sessions')).not.toBeInTheDocument()
  })

  it('renders stat cards after stats load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => minimalStats,
      })
    )

    renderDashboard()

    expect(await screen.findByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('Events')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('240')).toBeInTheDocument()
  })

  it('renders tab navigation after stats load', async () => {
    renderDashboard()

    expect(await screen.findByText('Token usage')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    expect(screen.getByText('API key usage')).toBeInTheDocument()
  })

  it('renders page heading regardless of loading state', () => {
    renderDashboard()
    expect(screen.getByText('Summary')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the targeted test and confirm it fails because the new file does not exist yet**

Run: `cd frontend && pnpm vitest run tests/features/dashboard/DashboardPage.test.tsx`

Expected: FAIL with a module resolution error for `@/features/dashboard/DashboardPage`.

- [ ] **Step 3: Create the feature-local page component with the renamed export**

```tsx
import { useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ActivityPanel } from '@/features/dashboard/ActivityPanel'
import { DashboardSkeleton } from '@/features/dashboard/DashboardSkeleton'
import { SummaryStats } from '@/features/dashboard/SummaryStats'
import { TokenUsagePanel } from '@/features/dashboard/TokenUsagePanel'
import {
  presetToDateRange,
  rangeToDashboardQuery,
  rangeToUsageRange,
  type DashboardRangePreset,
} from '@/features/dashboard/date-range'
import { DashboardDateRangePicker } from '@/features/dashboard/date-range-picker'
import { UsagePanel } from '@/features/usage/UsagePanel'
import { useDashboardStats } from '@/features/dashboard/hooks/useDashboardStats'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const [preset, setPreset] = useState<DashboardRangePreset>('14d')
  const [range, setRange] = useState<DateRange>(() => presetToDateRange('14d'))
  const [view, setView] = useState<'activity' | 'tokens' | 'api-usage'>('tokens')
  const query = rangeToDashboardQuery(range)
  const usageRange = rangeToUsageRange(range)
  const { stats, loading, refreshing, reload } = useDashboardStats(query)

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[22px] font-semibold text-foreground">Summary</h1>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <DashboardDateRangePicker
              value={range}
              preset={preset}
              onPresetChange={(nextPreset) => {
                if (nextPreset === 'custom') return
                setPreset(nextPreset)
                setRange(presetToDateRange(nextPreset))
              }}
              onRangeChange={(nextRange) => {
                setPreset('custom')
                setRange(nextRange)
              }}
            />
            <Button
              variant="outline"
              size="icon-sm"
              onClick={reload}
              disabled={refreshing}
              aria-label="Reload dashboard"
            >
              <RefreshCw data-icon="inline-start" className={cn(refreshing && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {loading || !stats ? (
          <DashboardSkeleton />
        ) : (
          <>
            <SummaryStats stats={stats} />
            <Tabs
              value={view}
              onValueChange={(value) => setView(value as 'activity' | 'tokens' | 'api-usage')}
            >
              <TabsList variant="line" className="w-full flex-wrap justify-start sm:w-auto">
                <TabsTrigger value="tokens">Token usage</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="api-usage">API key usage</TabsTrigger>
              </TabsList>
              <TabsContent value="tokens">
                <TokenUsagePanel stats={stats} query={query} />
              </TabsContent>
              <TabsContent value="activity">
                <ActivityPanel stats={stats} query={query} />
              </TabsContent>
              <TabsContent value="api-usage">
                <UsagePanel title="" dashboardRange={usageRange} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the targeted dashboard test again**

Run: `cd frontend && pnpm vitest run tests/features/dashboard/DashboardPage.test.tsx`

Expected: PASS. All four `DashboardPage` tests pass.

- [ ] **Step 5: Commit the page move foundation**

```bash
git add frontend/src/features/dashboard/DashboardPage.tsx frontend/tests/features/dashboard/DashboardPage.test.tsx
git commit -m "refactor(frontend): move dashboard page into feature folder"
```

---

## Task 2: Rewire The Dashboard Route And Remove The Legacy Page File

**Files:**
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/pages/Dashboard.tsx`
- Delete: `frontend/src/pages/`

- [ ] **Step 1: Remove the old page file before updating the router import**

```bash
rm frontend/src/pages/Dashboard.tsx
rmdir frontend/src/pages
```

- [ ] **Step 2: Run typecheck and confirm the router is still pointing at the deleted file**

Run: `cd frontend && pnpm run typecheck`

Expected: FAIL with a `Cannot find module './pages/Dashboard'` error from `src/App.tsx`.

- [ ] **Step 3: Update the lazy import in `src/App.tsx` to the new feature-local page**

```tsx
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './app/Layout'

const DashboardPage = lazy(() =>
  import('./features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  }))
)
const Events = lazy(() =>
  import('./features/events/EventsPage').then((module) => ({ default: module.EventsPage }))
)
const Usage = lazy(() =>
  import('./features/usage/UsagePage').then((module) => ({ default: module.UsagePage }))
)
const ProjectsPage = lazy(() =>
  import('./features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))
)
const SessionList = lazy(() =>
  import('./features/sessions/SessionListPage').then((m) => ({ default: m.SessionListPage }))
)
const SessionFileChanges = lazy(() =>
  import('./features/sessions/SessionFileChangesPage').then((m) => ({
    default: m.SessionFileChangesPage,
  }))
)
const Diagnostics = lazy(() =>
  import('./features/diagnostics/DiagnosticsPage').then((m) => ({ default: m.DiagnosticsPage }))
)
const HooksConfig = lazy(() =>
  import('./features/hooks-config/HooksConfigPage').then((m) => ({ default: m.HooksConfigPage }))
)

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route
            index
            element={
              <Suspense fallback={null}>
                <Events />
              </Suspense>
            }
          />
          <Route
            path="dashboard"
            element={
              <Suspense fallback={null}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="usage"
            element={
              <Suspense fallback={null}>
                <Usage />
              </Suspense>
            }
          />
          <Route
            path="projects"
            element={
              <Suspense fallback={null}>
                <ProjectsPage />
              </Suspense>
            }
          />
          <Route path="sessions" element={<Navigate to="/projects" replace />} />
          <Route
            path="sessions/:encodedCwd"
            element={
              <Suspense fallback={null}>
                <SessionList />
              </Suspense>
            }
          />
          <Route
            path="sessions/:encodedCwd/:sessionId"
            element={
              <Suspense fallback={null}>
                <SessionFileChanges />
              </Suspense>
            }
          />
          <Route
            path="diagnostics"
            element={
              <Suspense fallback={null}>
                <Diagnostics />
              </Suspense>
            }
          />
          <Route
            path="hooks-config"
            element={
              <Suspense fallback={null}>
                <HooksConfig />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 4: Re-run typecheck and the targeted dashboard test**

Run: `cd frontend && pnpm run typecheck && pnpm vitest run tests/features/dashboard/DashboardPage.test.tsx`

Expected: PASS. TypeScript resolves `DashboardPage`, and the dashboard render test still passes.

- [ ] **Step 5: Commit the route rewiring**

```bash
git add frontend/src/App.tsx frontend/src/features/dashboard/DashboardPage.tsx frontend/tests/features/dashboard/DashboardPage.test.tsx
git commit -m "refactor(frontend): rewire dashboard route to feature page"
```

---

## Task 3: Delete Dead Shims And Vite Template Assets

**Files:**
- Delete: `frontend/src/components/Layout.tsx`
- Delete: `frontend/src/components/Sidebar.tsx`
- Delete: `frontend/src/types.ts`
- Delete: `frontend/src/App.css`
- Delete: `frontend/src/assets/react.svg`
- Delete: `frontend/src/assets/vite.svg`
- Verify: `frontend/src/types/index.ts`
- Verify: `frontend/src/app/Layout.tsx`

- [ ] **Step 1: Confirm the cleanup targets still exist before deleting them**

Run: `cd frontend && rg --files src | rg '^(src/components/Layout.tsx|src/components/Sidebar.tsx|src/types.ts|src/App.css|src/assets/react.svg|src/assets/vite.svg)$'`

Expected:

```text
src/App.css
src/assets/react.svg
src/assets/vite.svg
src/components/Layout.tsx
src/components/Sidebar.tsx
src/types.ts
```

- [ ] **Step 2: Delete the dead shim files and unused starter assets**

```bash
rm frontend/src/components/Layout.tsx
rm frontend/src/components/Sidebar.tsx
rm frontend/src/types.ts
rm frontend/src/App.css
rm frontend/src/assets/react.svg
rm frontend/src/assets/vite.svg
```

- [ ] **Step 3: Verify there are no lingering references and the frontend still compiles and tests cleanly**

Run:

```bash
cd frontend
if rg -n "components/Layout|components/Sidebar|src/types.ts|react.svg|vite.svg|App.css" src tests; then
  echo "unexpected cleanup reference remains"
  exit 1
fi
pnpm run typecheck
pnpm vitest run
```

Expected: `rg` prints no matches, `pnpm run typecheck` passes, and the full Vitest suite passes.

- [ ] **Step 4: Commit the cleanup**

```bash
git add -u frontend/src
git commit -m "refactor(frontend): remove dead shims and starter assets"
```

---

## Self-Review

- Spec coverage: dead shims, unused assets, dashboard file move, caller updates, and empty `src/pages/` removal all map to Tasks 1 through 3.
- Placeholder scan: no deferred implementation notes remain.
- Type consistency: the route component is renamed to `DashboardPage` everywhere it is imported or rendered, and `@/types` continues to resolve through `src/types/index.ts`.
