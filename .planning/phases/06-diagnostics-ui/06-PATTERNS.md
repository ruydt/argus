# Phase 6: Diagnostics UI - Pattern Map

**Mapped:** 2026-05-28
**Files analyzed:** 8 (5 new, 3 modified)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `frontend/src/features/diagnostics/types.ts` | type definitions | — | `frontend/src/types/sessions.ts` | exact |
| `frontend/src/features/diagnostics/hooks/useDiagnostics.ts` | hook | request-response | `frontend/src/features/dashboard/hooks/useDashboardStats.ts` | exact |
| `frontend/src/features/diagnostics/DiagnosticsPage.tsx` | page component | request-response | `frontend/src/pages/Dashboard.tsx` | exact |
| `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx` | test | — | `frontend/tests/features/dashboard/DashboardPage.test.tsx` | exact |
| `frontend/tests/features/diagnostics/DiagnosticsRoute.test.tsx` | test | — | `frontend/tests/features/usage/UsagePage.test.tsx` | role-match |
| `frontend/src/App.tsx` (modify) | route config | — | existing file — lazy route pattern at lines 5-22 | exact |
| `frontend/src/app/Sidebar.tsx` (modify) | nav config | — | existing file — NAV_ITEMS at lines 37-59 | exact |
| `frontend/tests/app/Sidebar.desktop.test.tsx` (modify) | test | — | existing file — lines 1-89 | exact |

---

## Pattern Assignments

### `frontend/src/features/diagnostics/types.ts` (type definitions)

**Analog:** `frontend/src/types/sessions.ts`

**Pattern** (lines 1-53): flat interface-per-domain-concept, named exports, no barrel, no default exports, optional fields use `?`, nullable pointers from Go map to `T | null`.

```typescript
// sessions.ts import style — none needed, pure type file
export interface Session {
  session_id: string
  agent: string
  ended_at?: string           // omitempty Go field → optional TypeScript field
  usage: SessionUsageType     // nested type reference
}
```

**Apply to `types.ts`:** Declare one `export interface` per Go struct. Map Go `*T` (pointer) to `T | null`. Map Go `string` with `omitempty` to `string?`. No imports required. No barrel `index.ts` in the feature directory.

---

### `frontend/src/features/diagnostics/hooks/useDiagnostics.ts` (hook, request-response)

**Analog:** `frontend/src/features/dashboard/hooks/useDashboardStats.ts`

**Imports pattern** (lines 1):
```typescript
import { useCallback, useEffect, useState } from 'react'
```
Note: `useMemo` and caching are NOT needed — diagnostics is a live snapshot with no cache (D-13).

**Core hook shape** (lines 161-217):
```typescript
export function useDashboardStats(query: string = '') {
  const [reloadKey, setReloadKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  // ...
  const reload = useCallback(() => {
    setReloadKey((key) => key + 1)
  }, [])

  useEffect(() => {
    let mounted = true
    // ...distinguish first load vs. refresh:
    if (showRefreshing && cached) setRefreshing(true)
    // fetch, set data, set error, finally clear flags
    return () => { mounted = false }
  }, [cacheKey, query, reloadKey])

  return { stats, loading, refreshing, reload }
}
```

**Key differences for `useDiagnostics`:**
- No `statsCache` map — no caching
- Add `error: string | null` state (dashboard swallows errors silently; diagnostics surfaces them per D-09)
- Add `lastUpdatedAt: Date | null` state (drives "Updated ..." timestamp per D-15)
- `loading` = true only when `data === null` (first fetch); `refreshing` = true when `reloadKey > 0 && data !== null`
- `setLastUpdatedAt(new Date())` on successful fetch
- `setError('Could not reach /api/diagnostics')` in catch
- Return shape: `{ data, loading, refreshing, error, lastUpdatedAt, reload }`

**Mounted guard pattern** (lines 180, 211-214): `let mounted = true` at top of effect, `if (!mounted) return` before every state setter, `return () => { mounted = false }` as cleanup.

---

### `frontend/src/features/diagnostics/DiagnosticsPage.tsx` (page component, request-response)

**Analog:** `frontend/src/pages/Dashboard.tsx`

**Imports pattern** (lines 1-19):
```typescript
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
// ... other shadcn primitives
import { cn } from '@/lib/utils'
```
Import order: React → lucide-react → shadcn UI (`@/components/ui/...`) → shared lib (`@/lib/utils`) → feature-local (`./hooks/useDiagnostics`, `./types`).

**Page shell pattern** (lines 30-31):
```tsx
<div className="flex-1 overflow-y-auto bg-background text-foreground">
  <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
```
Copy verbatim from Dashboard — same max-width constraint, same responsive padding.

**Page header row pattern** (lines 32-57):
```tsx
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
  <h1 className="text-[22px] font-semibold text-foreground">Diagnostics</h1>
  <div className="flex items-center gap-2">
    {/* timestamp span + RefreshCw Button */}
    <Button
      variant="outline"
      size="icon-sm"
      onClick={reload}
      disabled={refreshing}
      aria-label="Refresh diagnostics"
    >
      <RefreshCw data-icon="inline-start" className={cn(refreshing && 'animate-spin')} />
    </Button>
  </div>
</div>
```
Note `data-icon="inline-start"` on the icon — copy from Dashboard line 55, it is part of the icon sizing convention.

**Loading branch pattern** (lines 60-85):
```tsx
{loading || !stats ? (
  <DashboardSkeleton />
) : (
  <>
    {/* full page content */}
  </>
)}
```
For DiagnosticsPage: use `loading` only (not `loading || refreshing`) to avoid clearing content during refresh (D-14). Inline a `DiagnosticsSkeleton` section rather than extracting to a separate file (page is self-contained).

**Named export pattern** (line 21):
```tsx
export function Dashboard() { ... }
```
DiagnosticsPage must use `export function DiagnosticsPage()` — named export required for the lazy adapter in App.tsx.

**Two-column layout pattern** (from UI-SPEC, mirrors Dashboard tab content layout):
```tsx
<div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
  {/* left: agent table */}
  {/* right: stacked cards */}
</div>
```

**Summary tile row pattern** (4 responsive tiles):
```tsx
<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
  {/* 4× Card with p-4 */}
</div>
```

---

### `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx` (test)

**Analog:** `frontend/tests/features/dashboard/DashboardPage.test.tsx`

**Full test file structure** (lines 1-100):

**Imports pattern** (lines 1-4):
```typescript
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiagnosticsPage } from '@/features/diagnostics/DiagnosticsPage'
```

**Fixture pattern** (lines 17-30): define a `healthyDiagnostics` constant (minimal valid object matching `Diagnostics` interface) at the top of the file — outside `describe`. Use the exact fixture from RESEARCH.md §Code Examples.

**Render helper pattern** (lines 32-38):
```typescript
function renderDiagnosticsPage() {
  return render(
    <MemoryRouter>
      <DiagnosticsPage />
    </MemoryRouter>
  )
}
```

**Mock setup pattern** (lines 40-53) — stub per `beforeEach`, clear per `afterEach`:
```typescript
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => healthyDiagnostics,
    })
  )
})

afterEach(() => {
  vi.clearAllMocks()
})
```

**Loading state test pattern** (lines 56-69): stub `fetch` to return `new Promise(() => {})` inside the individual `it` to freeze loading state. Assert heading is present, assert content cards are absent.

**Loaded state test pattern** (lines 71-86): stub resolves with fixture data. Use `await screen.findByText(...)` for async content (waits for fetch + render).

**Error state test pattern**: stub `fetch` to return `{ ok: false }` or throw. Assert "Failed to load diagnostics" text present, assert "Retry Load" button present.

**Clipboard mock** (for copy button tests): `Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn() }, writable: true })` inside the specific `it` that triggers copy.

---

### `frontend/tests/features/diagnostics/DiagnosticsRoute.test.tsx` (test)

**Analog:** `frontend/tests/features/usage/UsagePage.test.tsx`

**Pattern** (lines 1-70): same `MemoryRouter` + component render approach. For route reachability, render the full `App` component (or just `DiagnosticsPage` directly in `MemoryRouter initialEntries={['/diagnostics']}`) and assert page heading is rendered.

**Imports pattern** (lines 1-5):
```typescript
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { DiagnosticsPage } from '@/features/diagnostics/DiagnosticsPage'
```

**fetch stub pattern** (lines 23-35): same `vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }))` in `beforeEach`.

**Route assertion**: `expect(screen.getByText('Diagnostics')).toBeInTheDocument()` — the `<h1>` is rendered in all states including loading.

---

### `frontend/src/App.tsx` (modify — route registration)

**Analog:** existing file, lines 5-22 and 37-77.

**Lazy import pattern** (lines 5-22):
```typescript
const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((module) => ({ default: module.Dashboard }))
)
const ProjectsPage = lazy(() =>
  import('./features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))
)
```
Add after line 22 (last existing lazy import):
```typescript
const DiagnosticsPage = lazy(() =>
  import('./features/diagnostics/DiagnosticsPage').then((m) => ({ default: m.DiagnosticsPage }))
)
```

**Route registration pattern** (lines 52-59):
```tsx
<Route
  path="projects"
  element={
    <Suspense fallback={null}>
      <ProjectsPage />
    </Suspense>
  }
/>
```
Add after the `projects` route (or after the last non-nested route) with `path="diagnostics"`.

---

### `frontend/src/app/Sidebar.tsx` (modify — NAV_ITEMS)

**Analog:** existing file, lines 1-10 (imports) and lines 37-59 (NAV_ITEMS).

**Icon import pattern** (lines 1-10):
```typescript
import {
  FishingHook,
  GitFork,
  LayoutDashboard,
  PanelLeft,
  TerminalSquare,
  X,
  type LucideIcon,
} from 'lucide-react'
```
Add `Stethoscope` to this import block.

**NAV_ITEMS entry pattern** (lines 37-59):
```typescript
const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', ariaLabel: 'Overview Dashboard', icon: LayoutDashboard, end: false },
  { to: '/',         label: 'Events',     ariaLabel: 'Terminal Events',     icon: TerminalSquare, end: true  },
  { to: '/projects', label: 'Projects',   ariaLabel: 'Projects',            icon: GitFork,        end: false },
]
```
Append after the `Projects` entry:
```typescript
{ to: '/diagnostics', label: 'Diagnostics', ariaLabel: 'System Diagnostics', icon: Stethoscope, end: false },
```
No changes to `renderNavButton`, tooltip logic, or `isNavItemActive` — the new entry inherits all behavior automatically.

---

### `frontend/tests/app/Sidebar.desktop.test.tsx` (modify — add nav assertion)

**Analog:** existing file, lines 1-89.

**Existing assertion pattern** (lines 40-57):
```typescript
expect(screen.getByText('Dashboard').closest('.sidebar-label-motion')).toHaveClass('sidebar-label-open')
expect(screen.getByRole('link', { name: /overview dashboard/i })).toBeInTheDocument()
```

**New assertion to add** — inside an existing `it` block or a new dedicated one:
```typescript
expect(screen.getByRole('link', { name: /system diagnostics/i })).toBeInTheDocument()
```
Use `ariaLabel: 'System Diagnostics'` (matches the NAV_ITEMS `ariaLabel` field, which becomes the `aria-label` on the `<NavLink>`). Do not assert an exact list of nav items — add a positive assertion only.

---

## Shared Patterns

### Manual Refresh Button
**Source:** `frontend/src/pages/Dashboard.tsx` lines 48-57
**Apply to:** `DiagnosticsPage.tsx` header row
```tsx
<Button
  variant="outline"
  size="icon-sm"
  onClick={reload}
  disabled={refreshing}
  aria-label="Reload dashboard"
>
  <RefreshCw data-icon="inline-start" className={cn(refreshing && 'animate-spin')} />
</Button>
```

### Loading vs. Refreshing State Branch
**Source:** `frontend/src/pages/Dashboard.tsx` line 60
**Apply to:** `DiagnosticsPage.tsx` content branch
```tsx
{loading || !stats ? <Skeleton... /> : <>{/* content */}</>}
```
For DiagnosticsPage: use `loading` alone (not `loading || refreshing`) to avoid skeleton flash during manual refresh (D-14).

### Mounted Guard in useEffect
**Source:** `frontend/src/features/dashboard/hooks/useDashboardStats.ts` lines 180, 211-214
**Apply to:** `useDiagnostics.ts`
```typescript
useEffect(() => {
  let mounted = true
  // ... fetch logic, guard every setState with: if (!mounted) return
  return () => { mounted = false }
}, [reloadKey])
```

### reloadKey Increment Trigger
**Source:** `frontend/src/features/dashboard/hooks/useDashboardStats.ts` lines 163, 175-177
**Apply to:** `useDiagnostics.ts`
```typescript
const [reloadKey, setReloadKey] = useState(0)
const reload = useCallback(() => setReloadKey((key) => key + 1), [])
```

### Page Shell Container
**Source:** `frontend/src/pages/Dashboard.tsx` lines 30-31 (also identical in `frontend/src/features/usage/UsagePage.tsx` lines 3-6)
**Apply to:** `DiagnosticsPage.tsx` outermost wrapper
```tsx
<div className="flex-1 overflow-y-auto bg-background text-foreground">
  <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
```

### vi.stubGlobal fetch Mock
**Source:** `frontend/tests/features/dashboard/DashboardPage.test.tsx` lines 40-53
**Apply to:** All diagnostics test files
```typescript
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => fixture }))
})
afterEach(() => {
  vi.clearAllMocks()
})
```
`vi.spyOn(Storage.prototype)` must NOT be used for fetch mocking — `unstubGlobals: true` in vite.config requires `vi.stubGlobal`.

### Lazy Route Adapter
**Source:** `frontend/src/App.tsx` lines 14-16
**Apply to:** new `DiagnosticsPage` import in App.tsx
```typescript
const ProjectsPage = lazy(() =>
  import('./features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))
)
```
The `.then((m) => ({ default: m.NamedExport }))` adapter is required because all page components are named exports.

---

## No Analog Found

None — all 8 files have close analogs in the codebase.

---

## Critical Anti-Patterns (from codebase observation)

| Risk | Wrong | Right | Source |
|------|-------|-------|--------|
| Skeleton during refresh | `loading \|\| refreshing` shows skeleton | `loading` only (data exists during refresh) | Dashboard line 60 + D-14 |
| Default export | `export default function DiagnosticsPage` | `export function DiagnosticsPage` | App.tsx lazy adapter pattern |
| Barrel in feature | `features/diagnostics/index.ts` | import from specific file | CLAUDE.md convention |
| Polling | `setInterval` or focus listener | none — manual reload only | D-13 |
| Badge variant | `<Badge variant="destructive">` | `<Badge className="border-[var(--destructive)] ...">` | UI-SPEC Badge contract |
| Clipboard in jsdom | no mock | `Object.defineProperty(navigator, 'clipboard', ...)` | RESEARCH.md Pitfall 4 |

---

## Metadata

**Analog search scope:** `frontend/src/`, `frontend/tests/`
**Files scanned:** 9 source files read
**Pattern extraction date:** 2026-05-28
