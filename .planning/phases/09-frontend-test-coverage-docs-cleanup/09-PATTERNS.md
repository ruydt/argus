# Phase 09: frontend-test-coverage-docs-cleanup - Pattern Map

**Mapped:** 2026-05-31
**Files analyzed:** 11
**Analogs found:** 11 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx` | test | request-response | `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx` | exact |
| `frontend/tests/features/usage/UsagePage.test.tsx` | test | request-response | `frontend/tests/features/usage/UsagePage.test.tsx` | exact |
| `frontend/tests/features/version/VersionBadge.test.tsx` | test | request-response | `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx` + `frontend/src/features/version/VersionBadge.tsx` | role-match |
| `docs/superpowers/specs/2026-05-13-sessions-waterfall-redesign.md` | docs | file-I/O | `.planning/phases/08-session-file-changes-view/08-CONTEXT.md` | role-match |
| `docs/superpowers/specs/2026-05-14-project-scoped-session-traces.md` | docs | file-I/O | `.planning/phases/08-session-file-changes-view/08-CONTEXT.md` | role-match |
| `docs/superpowers/specs/2026-05-15-semantic-session-summaries.md` | docs | file-I/O | `.planning/phases/08-session-file-changes-view/08-CONTEXT.md` | role-match |
| `docs/superpowers/specs/2026-05-16-trace-panel-responsive-design.md` | docs | file-I/O | `.planning/phases/08-session-file-changes-view/08-CONTEXT.md` | role-match |
| `docs/superpowers/plans/2026-05-13-sessions-waterfall.md` | docs | file-I/O | `.planning/phases/08-session-file-changes-view/08-CONTEXT.md` | role-match |
| `docs/superpowers/plans/2026-05-13-sessions-waterfall-redesign.md` | docs | file-I/O | `.planning/phases/08-session-file-changes-view/08-CONTEXT.md` | role-match |
| `docs/superpowers/plans/2026-05-15-semantic-session-summaries-plan.md` | docs | file-I/O | `.planning/phases/08-session-file-changes-view/08-CONTEXT.md` | role-match |
| `docs/superpowers/plans/2026-05-16-trace-panel-responsive.md` | docs | file-I/O | `.planning/phases/08-session-file-changes-view/08-CONTEXT.md` | role-match |

## Pattern Assignments

### `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx` (test, request-response)

**Analog:** `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx`

**Imports pattern** (lines 1-5):
```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiagnosticsPage } from '@/features/diagnostics/DiagnosticsPage'
import type { Diagnostics } from '@/features/diagnostics/types'
```

**Fixture pattern** (lines 7-49):
```tsx
const healthyDiagnostics: Diagnostics = {
  version: { version: '1.1.0', commit: 'abc12345', buildDate: '2026-05-28' },
  health: { live: true, ready: true },
  storage: {
    dbPath: '/home/user/.hooker/hooker.db',
    dbSizeBytes: 1024000,
    totalEvents: 42,
    totalSessions: 5,
    latestEventAt: '2026-05-28T10:00:00Z',
  },
  agents: [
    {
      id: 'claudecode',
      label: 'Claude Code',
      eventCount: 30,
      lastSeenAt: '2026-05-28T09:55:00Z',
      degradedCount: 0,
      normalizerVersion: '1.0.0',
      hookConfigStatus: 'configured',
      status: 'healthy',
      warnings: [],
    },
  ],
  privacy: {
    ignoreFile: { path: '/home/user/.hooker/.ignore', status: 'loaded', activePatternCount: 3 },
    exportWarning: 'Exported data may contain prompts, diffs, file paths, and tool outputs.',
  },
  security: {
    remoteBind: { addr: '127.0.0.1:8765', status: 'loopback', allowRemote: false },
    cors: { totalOrigins: 1, localOrigins: 1, extraOrigins: 0 },
  },
}
```

**Render/router pattern** (lines 78-84):
```tsx
function renderPage() {
  return render(
    <MemoryRouter>
      <DiagnosticsPage />
    </MemoryRouter>
  )
}
```

**Global stubbing pattern** (lines 86-96):
```tsx
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn() },
    writable: true,
  })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => healthyDiagnostics })
  )
})
```

**Core state assertions** (lines 103-147):
```tsx
it('renders skeleton sections and heading during loading', () => {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
  renderPage()
  expect(screen.getByRole('heading', { name: 'Diagnostics' })).toBeInTheDocument()
  expect(screen.queryByText('Agent Connectivity')).not.toBeInTheDocument()
  expect(screen.queryByText('System Facts')).not.toBeInTheDocument()
})

it('renders retry panel when fetch fails', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
  )
  renderPage()
  expect(await screen.findByText('Failed to load diagnostics')).toBeInTheDocument()
  expect(screen.getByText('Could not reach /api/diagnostics')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /retry load/i })).toBeInTheDocument()
})

it('renders degraded and extra CORS badges in warning state', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => warningDiagnostics })
  )
  renderPage()
  expect(await screen.findByText('Degraded')).toBeInTheDocument()
  expect(screen.getByText(/extra origin/i)).toBeInTheDocument()
})
```

**Refresh/error handling pattern** (lines 175-205):
```tsx
let resolveRefresh!: (v: unknown) => void
const refreshPromise = new Promise((res) => {
  resolveRefresh = res
})
const fetchMock = vi
  .fn()
  .mockResolvedValueOnce({ ok: true, json: async () => healthyDiagnostics })
  .mockReturnValueOnce(refreshPromise)
vi.stubGlobal('fetch', fetchMock)

renderPage()
expect(await screen.findByText('Agent Connectivity')).toBeInTheDocument()

const refreshBtn = screen.getByRole('button', { name: /refresh diagnostics/i })
fireEvent.click(refreshBtn)

await waitFor(() => expect(refreshBtn).toBeDisabled())
expect(screen.getByText('Claude Code')).toBeInTheDocument()

resolveRefresh({ ok: true, json: async () => healthyDiagnostics })
await waitFor(() => expect(refreshBtn).not.toBeDisabled())
```

**Planner guidance:** Audit TEST-01 before editing. Existing coverage already proves loading, error, healthy, degraded, first-run, not-ready, and refresh. Add only missing user-visible assertions such as `aria-busy="true"` if the UI exposes them.

---

### `frontend/tests/features/usage/UsagePage.test.tsx` (test, request-response)

**Analog:** `frontend/tests/features/usage/UsagePage.test.tsx`

**Imports pattern** (lines 1-4):
```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UsagePage } from '@/features/usage/UsagePage'
```

**LocalStorage/fetch setup pattern** (lines 6-35):
```tsx
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', localStorageMock)
  localStorageMock.getItem.mockReturnValue(null)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
  )
})
```

**Render/router pattern** (lines 15-21):
```tsx
function renderUsagePage() {
  return render(
    <MemoryRouter>
      <UsagePage />
    </MemoryRouter>
  )
}
```

**Existing empty/control assertions** (lines 41-69):
```tsx
it('renders empty state when no API key is set', () => {
  renderUsagePage()
  expect(screen.getByText('Admin API Key Required')).toBeInTheDocument()
})

it('renders API key input field', () => {
  renderUsagePage()
  const input = screen.getByPlaceholderText('OpenAI Admin API Key...')
  expect(input).toBeInTheDocument()
})

it('renders Fetch button', () => {
  renderUsagePage()
  expect(screen.getByRole('button', { name: 'Fetch' })).toBeInTheDocument()
})
```

**Loading branch source contract** from `frontend/src/features/usage/UsagePanel.tsx` (lines 81-113):
```tsx
<Button
  onClick={fetchUsage}
  disabled={loading}
  variant="secondary"
  className="w-full sm:w-auto"
>
  {loading ? 'Loading...' : 'Fetch'}
</Button>

{!currentApiKey ? (
  <div className="flex h-[300px] items-center justify-center rounded-lg border border-border bg-card text-center text-muted-foreground">
    <div className="max-w-[400px]">
      <p className="mb-2 font-medium">Admin API Key Required</p>
      <p className="text-sm">
        Enter your {isOpenAI ? 'OpenAI' : 'Anthropic'} Admin API key to view usage statistics.
        This key is stored locally in your browser.
      </p>
    </div>
  </div>
) : loading && !stats ? (
  <div className="flex h-[300px] items-center justify-center rounded-lg border border-border bg-card">
    <div className="flex flex-col items-center gap-3 text-muted-foreground">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm font-medium animate-pulse">Loading usage data...</p>
    </div>
  </div>
) : stats ? (
```

**Populated branch source contract** from `frontend/src/features/usage/UsagePanel.tsx` (lines 115-119):
```tsx
) : stats ? (
  <div className="flex flex-col gap-6 fade-in duration-500">
    <UsageCharts stats={stats} />
    <UsageTables stats={stats} />
  </div>
) : null}
```

**Usage aggregation pattern** from `frontend/src/features/usage/hooks/useOpenAIUsage.ts` (lines 323-327 and 378-385):
```tsx
const [compData, modData, keyData] = await Promise.all([
  fetchPrimaryOpenAIUsagePages(start, end, headers),
  fetchOpenAIUsagePages(start, end, headers, 'model'),
  fetchOpenAIUsagePages(start, end, headers, 'api_key_id'),
])

const result: UsageStats = {
  reqs: Number(totalReqs) || 0,
  toks: Number(totalToks) || 0,
  models: modelsBreakdown,
  keys: keysBreakdown,
  daily,
}
```

**Visible populated assertions should target** `frontend/src/features/usage/UsageCharts.tsx` (lines 20-23, 80-83) and `UsageTables.tsx` (lines 22-24, 48-50):
```tsx
<CardTitle>Total Tokens ({stats.toks.toLocaleString()})</CardTitle>
<CardTitle>Total Requests ({stats.reqs.toLocaleString()})</CardTitle>
<CardTitle>Model Breakdown</CardTitle>
<CardTitle>API Key Breakdown</CardTitle>
```

**Planner guidance:** For loading, set `localStorageMock.getItem` to return `sk-test` for `openai_admin_key`, then stub `fetch` with a never-resolving promise. For populated, mock all three OpenAI fetches with non-empty `data` so charts and both breakdown tables render through the real hook.

---

### `frontend/tests/features/version/VersionBadge.test.tsx` (test, request-response)

**Analog:** `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx` for test structure, `frontend/src/features/version/VersionBadge.tsx` and `useVersion.ts` for behavior.

**Imports pattern to copy** from `DiagnosticsPage.test.tsx` (lines 1-4), adjusted to VersionBadge:
```tsx
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionBadge } from '@/features/version/VersionBadge'
```

**Component null/loaded contract** from `frontend/src/features/version/VersionBadge.tsx` (lines 3-17):
```tsx
export function VersionBadge() {
  const info = useVersion()
  if (!info) return null

  const short = info.commit !== 'none' ? info.commit.slice(0, 7) : null
  const label = short ? `v${info.version} (${short})` : `v${info.version}`

  return (
    <span
      className="whitespace-nowrap text-[0.66rem] font-medium leading-none text-[#444]"
      aria-label={`Application version: ${label}`}
    >
      {label}
    </span>
  )
}
```

**Fetch behavior contract** from `frontend/src/features/version/useVersion.ts` (lines 12-20):
```tsx
useEffect(() => {
  let mounted = true

  fetch('/api/version')
    .then((r) => (r.ok ? r.json() : null))
    .then((d: VersionInfo | null) => {
      if (mounted && d) setInfo(d)
    })
    .catch(() => {})
```

**Error/null fetch pattern** from `frontend/tests/features/sessions/useFileChanges.test.ts` (lines 62-83):
```tsx
it('exposes error state when fetch returns ok:false', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })
  )
  // assert error/null state after hook settles
})

it('exposes error state when fetch rejects', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')))
  // assert error/null state after hook settles
})
```

**Planner guidance:** New tests belong under `frontend/tests/features/version/VersionBadge.test.tsx`. Cover success with commit shortening and `commit: 'none'`, pending fetch empty DOM, rejected fetch empty DOM, and non-OK fetch empty DOM. Assert `aria-label="Application version: ..."` for success and absence of that label for null states.

---

### Docs cleanup files (docs, file-I/O)

**Analogs:** `.planning/phases/08-session-file-changes-view/08-CONTEXT.md`, `.planning/ROADMAP.md`, and the stale docs themselves.

**Superseding Phase 8 decision** from `.planning/phases/08-session-file-changes-view/08-CONTEXT.md` (lines 9-11, 18-20):
```markdown
Phase 8 replaces the existing `/sessions/:cwd/:sessionId` trace/timeline experience with a file-change browser for files created or modified during a session.

The trace tree, event timeline, and trace inspection panel are not part of the target experience for this phase.

- **D-01:** Replace the trace/timeline page entirely. Do not keep trace/timeline as a tab, secondary panel, or alternate route in Phase 8.
- **D-02:** `/sessions/:cwd/:sessionId` becomes the file-change browser page. It should not render `TraceTreeNode`, `EventTimeline`, or the current trace inspection timeline as the primary experience.
```

**Current roadmap state** from `.planning/ROADMAP.md` (lines 64-69):
```markdown
**Goal**: The session detail page shows files created or modified during the session with timestamps, pagination, and old/new line snippets instead of the trace/timeline UI

1. `/sessions/:cwd/:sessionId` no longer renders the trace tree, event timeline, or inspection timeline as the primary experience
```

**Stale spec evidence**:

`docs/superpowers/specs/2026-05-13-sessions-waterfall-redesign.md` (lines 21-24):
```markdown
## Design: Per-Trace Blocks (LangSmith-style)

Each root session is rendered as a self-contained **trace block** -- a full-width component that owns its label and its timeline.
```

`docs/superpowers/specs/2026-05-14-project-scoped-session-traces.md` (lines 12-18, 70-76):
```markdown
## Navigation Hierarchy

/sessions                        -> ProjectsListPage
/sessions/:encodedCwd            -> SessionListPage
/sessions/:encodedCwd/:sessionId -> TraceViewPage

### Fix `GET /api/traces`
```

`docs/superpowers/specs/2026-05-15-semantic-session-summaries.md` (lines 11-13, 21-23):
```markdown
Add LLM-generated semantic observations to session traces.

Summaries are generated automatically on session/turn end, stored in SQLite, and displayed as a parallel "Summary" tab alongside the existing trace tree in TraceViewPage.

- **UI placement:** Parallel "Summary" tab in TraceViewPage left panel; raw traces remain accessible
```

`docs/superpowers/specs/2026-05-16-trace-panel-responsive-design.md` (lines 17-22, 77-80):
```markdown
Use two responsive modes on the trace detail page:

- Desktop mode: keep current split layout with resizable trace and inspection panes
- Mobile / narrow mode: keep trace full-width and show inspection details in a right-side drawer overlay

## Non-Goals
- No redesign of trace data model
- No change to trace fetching API
```

**Stale plan evidence**:

`docs/superpowers/plans/2026-05-13-sessions-waterfall.md` (lines 5-9):
```markdown
**Goal:** Add a `/sessions` page with a LangSmith-style split-pane trace waterfall showing parent/child session trees in real time, with per-root Gantt bars and a bottom detail panel.

**Architecture:** Backend builds the session tree by cross-referencing `SubagentStart` events ... exposed via `GET /api/sessions/tree`.
```

`docs/superpowers/plans/2026-05-13-sessions-waterfall-redesign.md` (lines 5-9):
```markdown
**Goal:** Replace the buggy two-panel (SessionTree + SessionGantt) sessions page with LangSmith-style per-trace blocks that each own their label, time axis, and waterfall bars.

**Tech Stack:** React 18, TypeScript, Vitest, @testing-library/react, inline styles (no Tailwind in session components)
```

`docs/superpowers/plans/2026-05-15-semantic-session-summaries-plan.md` (lines 1-5, 24-25):
```markdown
# Implementation Plan: Semantic Session Summaries

**Spec:** `docs/superpowers/specs/2026-05-15-semantic-session-summaries.md`

| Frontend hook | `hooks/useTraces.ts:80-118` | -- | `useCallback + useState + useEffect + queueMicrotask` |
| Tabs UI | `TraceInspectionPanel.tsx:72-142` | -- | `<Tabs>/<TabsList>/<TabsTrigger>/<TabsContent>` |
```

`docs/superpowers/plans/2026-05-16-trace-panel-responsive.md` (lines 5-9, 13-17):
```markdown
**Goal:** Make the session trace inspection UI responsive by replacing the cramped narrow-width split panel with a mobile drawer overlay while preserving desktop split behavior.

### Task 1: Add failing responsive trace panel test
- Modify: `frontend/tests/features/sessions/project-session-traces.test.tsx`
```

**Planner guidance:** Delete these eight active stale docs unless a concrete authoritative reason is found during planning. Do not create a new archive directory. After deletion, run a targeted scan for stale active references:
```bash
rg -n "placeholder|stub|trace|timeline|waterfall|TODO|TBD|not implemented|semantic" docs/superpowers/specs docs/superpowers/plans
```

## Shared Patterns

### Test Configuration

**Source:** `frontend/vite.config.ts` (lines 22-28)
**Apply to:** All frontend test files
```ts
test: {
  environment: 'jsdom',
  setupFiles: './src/test/setup.ts',
  css: true,
  include: ['tests/**/*.{test,spec}.{ts,tsx}'],
  unstubGlobals: true,
},
```

### Testing Library Setup

**Source:** `frontend/src/test/setup.ts` (lines 1-4, 27-34)
**Apply to:** All frontend test files
```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  setMatchMediaMatches(false)
  matchMediaMock.mockClear()
})

afterEach(() => {
  cleanup()
})
```

### Test Organization and Naming

**Source:** `.planning/codebase/TESTING.md` (lines 23-31)
**Apply to:** New VersionBadge test and modified suites
```markdown
- Frontend tests are in a dedicated `frontend/tests/` tree by feature.
- Frontend: `*.test.ts` / `*.test.tsx`.
```

### Import Order and Formatting

**Source:** `.planning/codebase/CONVENTIONS.md` (lines 28-47)
**Apply to:** All touched TS/TSX tests
```markdown
- Frontend uses Prettier: no semicolons, single quotes, tabWidth 2, trailingComma "es5".
- External packages first.
- Internal aliased imports next.
- Frontend alias `@` points to `frontend/src`.
```

### Async UI Assertions

**Source:** `.planning/codebase/TESTING.md` (lines 55-68, 115-121)
**Apply to:** DiagnosticsPage, UsagePage, VersionBadge
```tsx
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }))

renderHook(() => useEvents())
await waitFor(() => expect(latestES.url).toBe('/api/events/stream?session=sess-1'))
```

### Browser Globals

**Source:** `frontend/tests/features/usage/UsagePage.test.tsx` (lines 23-35)
**Apply to:** UsagePage and VersionBadge fetch/localStorage branches
```tsx
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', localStorageMock)
  localStorageMock.getItem.mockReturnValue(null)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
  )
})
```

## No Analog Found

None. Every Phase 09 target has a close in-repo analog:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| None | - | - | Existing diagnostics, usage, hook, version, and Phase 8 docs patterns cover the planned work. |

## Metadata

**Analog search scope:** `frontend/tests/features`, `frontend/src/features/diagnostics`, `frontend/src/features/usage`, `frontend/src/features/version`, `.planning/codebase`, `.planning/phases/08-session-file-changes-view`, `docs/superpowers/specs`, `docs/superpowers/plans`
**Files scanned:** 22
**Pattern extraction date:** 2026-05-31
