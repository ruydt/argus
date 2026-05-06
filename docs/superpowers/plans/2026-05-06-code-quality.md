# Frontend Code Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `frontend/npm run check` pass with zero ESLint errors, Prettier integrated, and typed frontend data models shared from one source.

**Architecture:** Keep behavior unchanged. Add a shared `src/types.ts` for API/domain types, wire ESLint and Prettier together at the tooling layer, then remove each lint violation by tightening local component types and moving impure/time-dependent logic out of render. Verification stays command-driven because this frontend has no unit test harness yet.

**Tech Stack:** React 19, TypeScript 6, Vite 8, ESLint 10 flat config, Prettier, Recharts, shadcn/ui

---

## File Map

**Create:**
- `frontend/src/types.ts` — shared event, session usage, outlet context, and OpenAI usage response types
- `frontend/.prettierrc` — Prettier rules for the frontend package
- `frontend/.prettierignore` — excludes generated and build artifacts from formatting checks

**Modify:**
- `frontend/package.json` — add `typecheck`, `format`, `format:check`, and `check` scripts
- `frontend/package-lock.json` — record `prettier` and `eslint-config-prettier`
- `frontend/eslint.config.js` — add Prettier config and ignore generated shadcn files
- `frontend/src/agents/types.ts` — import shared `EventRecord` and `SessionUsage` from `src/types.ts`
- `frontend/src/hooks/useEvents.ts` — type fetch result and expose `error`
- `frontend/src/components/Layout.tsx` — type `sessionUsage` state and outlet context payload
- `frontend/src/pages/Events.tsx` — type outlet context, diff helpers, grouped sessions, and session usage fetch; move `Date.now()` out of render
- `frontend/src/components/events/AgentSession.tsx` — replace `any` props with shared types
- `frontend/src/pages/Usage.tsx` — replace `any` response handling, remove effect-time `setState`, and keep localStorage sync

---

## Task 1: Add Tooling for Typecheck + Prettier

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/eslint.config.js`
- Create: `frontend/.prettierrc`
- Create: `frontend/.prettierignore`

- [ ] **Step 1: Install Prettier integration**

Run:
```bash
cd frontend && npm install -D prettier eslint-config-prettier
```

Expected:
- `package.json` gains `prettier` and `eslint-config-prettier`
- `package-lock.json` updates

- [ ] **Step 2: Add package scripts**

Update `frontend/package.json` scripts to:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "typecheck": "tsc -b --noEmit",
  "lint": "eslint .",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "check": "npm run typecheck && npm run lint && npm run format:check",
  "preview": "vite preview"
}
```

- [ ] **Step 3: Add Prettier config files**

Create `frontend/.prettierrc`:

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

Create `frontend/.prettierignore`:

```text
dist/
node_modules/
src/components/ui/
```

- [ ] **Step 4: Update ESLint flat config**

Change `frontend/eslint.config.js` to:

```ts
import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src/components/ui/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      eslintConfigPrettier,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
])
```

- [ ] **Step 5: Verify tooling files**

Run:
```bash
cd frontend && npx prettier --check .prettierrc eslint.config.js package.json
cd frontend && rg -n "." .prettierignore
```

Expected:
- Config files pass Prettier validation
- `.prettierignore` contains expected ignore entries

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/eslint.config.js frontend/.prettierrc frontend/.prettierignore
git commit -m "chore: add frontend check tooling"
```

---

## Task 2: Centralize Shared Frontend Types

**Files:**
- Create: `frontend/src/types.ts`
- Modify: `frontend/src/agents/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

Add:

```ts
import type { Dispatch, SetStateAction } from 'react'

export interface CtxLine {
  num: number
  text: string
}

export interface EventRecord {
  time: string
  action: string
  path: string
  command?: string
  session?: string
  transcript_path?: string
  tool?: string
  hook_event_name?: string
  turn_id?: string
  tool_use_id?: string
  source?: string
  model?: string
  cwd?: string
  prompt?: string
  description?: string
  old_string?: string
  new_string?: string
  start_line?: number
  ctx_before?: CtxLine[]
  ctx_after?: CtxLine[]
}

export interface SessionUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  turns: number
}

export interface SessionGroup {
  sessionId: string
  transcriptPath: string
  events: EventRecord[]
}

export interface LayoutOutletContext {
  collapsedSessions: Set<string>
  setCollapsedSessions: Dispatch<SetStateAction<Set<string>>>
  sessionUsage: Record<string, SessionUsage>
  setSessionUsage: Dispatch<SetStateAction<Record<string, SessionUsage>>>
}

export interface EventsResponse {
  events?: EventRecord[]
}

export interface OpenAIBucketResult {
  num_model_requests?: number
  input_tokens?: number
  output_tokens?: number
  model?: string
  api_key_id?: string
}

export interface OpenAIBucket {
  start_time_iso: string
  results?: OpenAIBucketResult[]
}

export interface OpenAIUsageResponse {
  data?: OpenAIBucket[]
  error?: { message?: string }
}

export interface UsageDailyPoint {
  date: string
  tokens: number
  requests: number
  models: Record<string, number>
}

export interface UsageStats {
  reqs: number
  toks: number
  models: Record<string, number>
  keys: Record<string, number>
  daily: UsageDailyPoint[]
}

export interface TooltipState {
  text: string
  x: number
  y: number
}
```

- [ ] **Step 2: Remove duplicate local types from `src/agents/types.ts`**

Replace the top of `frontend/src/agents/types.ts` with:

```ts
import type { ComponentType } from 'react'
import type { EventRecord, SessionUsage } from '@/types'

export type { EventRecord, SessionUsage } from '@/types'

export type AgentId = 'claudecode' | 'codex'

export type UsageTooltipItem = {
  cls: string
  label: string
  tip: string
}

export type AgentConfig = {
  id: AgentId
  label: string
  badgeClass: string
  Logo: ComponentType<{ size?: number }>
  supportsSessionUsage: boolean
  matchesEvent: (event: EventRecord) => boolean
  buildUsageItems?: (
    usage: SessionUsage,
    formatTokens: (n: number) => string
  ) => UsageTooltipItem[]
}
```

- [ ] **Step 3: Verify type-only changes**

Run:
```bash
cd frontend && npx tsc --noEmit
```

Expected:
- TypeScript still fails overall because consumers are not updated yet
- No syntax/import errors in `src/types.ts` or `src/agents/types.ts`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types.ts frontend/src/agents/types.ts
git commit -m "refactor: centralize frontend shared types"
```

---

## Task 3: Type Event Hook and Layout Outlet Context

**Files:**
- Modify: `frontend/src/hooks/useEvents.ts`
- Modify: `frontend/src/components/Layout.tsx`

- [ ] **Step 1: Type `useEvents` and expose fetch error**

Change `frontend/src/hooks/useEvents.ts` to:

```ts
import { useEffect, useState } from 'react'
import type { EventRecord, EventsResponse } from '@/types'

export function useEvents() {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let timeoutId: number | null = null
    let controller: AbortController | null = null

    const fetchEvents = async () => {
      controller?.abort()
      controller = new AbortController()

      try {
        const res = await fetch('/api/events', { signal: controller.signal })
        if (!res.ok) {
          throw new Error(`Failed to fetch events: ${res.status}`)
        }

        const data = (await res.json()) as EventsResponse
        if (!active) return
        setEvents(data.events ?? [])
        setError(null)
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) return
        setError('Failed to fetch events')
      } finally {
        if (active) {
          timeoutId = window.setTimeout(() => {
            void fetchEvents()
          }, 1000)
        }
      }
    }

    void fetchEvents()

    return () => {
      active = false
      controller?.abort()
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [])

  return { events, error }
}
```

- [ ] **Step 2: Type `Layout` outlet context**

Update `frontend/src/components/Layout.tsx` imports and state:

```ts
import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LayoutOutletContext, SessionUsage } from '@/types'
import { Sidebar } from './Sidebar'
```

```ts
const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set())
const [sessionUsage, setSessionUsage] = useState<Record<string, SessionUsage>>({})
const [time, setTime] = useState(() => new Date().toLocaleTimeString())

const outletContext: LayoutOutletContext = {
  collapsedSessions,
  setCollapsedSessions,
  sessionUsage,
  setSessionUsage,
}
```

Render with:

```tsx
<Outlet context={outletContext} />
```

- [ ] **Step 3: Verify targeted lint fixes**

Run:
```bash
cd frontend && npx eslint src/hooks/useEvents.ts src/components/Layout.tsx
```

Expected:
- No `no-explicit-any`, `no-unused-vars`, or `no-empty` errors in these two files

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useEvents.ts frontend/src/components/Layout.tsx
git commit -m "refactor: type event hook and layout context"
```

---

## Task 4: Type Session Rendering and Events Page

**Files:**
- Modify: `frontend/src/pages/Events.tsx`
- Modify: `frontend/src/components/events/AgentSession.tsx`

- [ ] **Step 1: Replace `any` imports and outlet context usage**

At the top of `frontend/src/pages/Events.tsx`, change imports to:

```ts
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { agentForEvent } from '../agents'
import { AgentSession } from '../components/events/AgentSession'
import { useEvents } from '../hooks/useEvents'
import type {
  CtxLine,
  EventRecord,
  LayoutOutletContext,
  SessionGroup,
  SessionUsage,
  TooltipState,
} from '@/types'
```

And change state/context declarations to:

```ts
const [tooltip, setTooltip] = useState<TooltipState | null>(null)
const { collapsedSessions, setCollapsedSessions, sessionUsage, setSessionUsage } =
  useOutletContext<LayoutOutletContext>()
const fetchedUsage = useRef<Set<string>>(new Set())
const { events } = useEvents()
```

- [ ] **Step 2: Move time-range math out of render-time impurity**

Add state + effect above filtering logic:

```ts
const [nowMs, setNowMs] = useState(() => Date.now())

useEffect(() => {
  if (timeRange === 'custom') return

  setNowMs(Date.now())
  const interval = window.setInterval(() => {
    setNowMs(Date.now())
  }, 1000)

  return () => window.clearInterval(interval)
}, [timeRange])

const rangeStartMs = useMemo(() => {
  switch (timeRange) {
    case '5m':
      return nowMs - 5 * 60 * 1000
    case '15m':
      return nowMs - 15 * 60 * 1000
    case '1h':
      return nowMs - 60 * 60 * 1000
    case '6h':
      return nowMs - 6 * 60 * 60 * 1000
    case '24h':
      return nowMs - 24 * 60 * 60 * 1000
    case '7d':
      return nowMs - 7 * 24 * 60 * 60 * 1000
    case '30d':
      return nowMs - 30 * 24 * 60 * 60 * 1000
    default:
      return null
  }
}, [nowMs, timeRange])
```

Then remove `getRangeStartMs()` and use `rangeStartMs` inside `filtered`.

- [ ] **Step 3: Type session usage fetch and grouped sessions**

Replace local helpers in `Events.tsx` with:

```ts
const groupKey = (event: EventRecord) =>
  event.session || event.transcript_path || 'ungrouped'

const shortId = (value: string) => (value ? value.substring(0, 8) : 'unknown')
const fmtTokens = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
```

Update the usage effect:

```ts
useEffect(() => {
  const seen = new Map<string, string>()

  events.forEach(event => {
    const agent = agentForEvent(event)
    if (
      agent.supportsSessionUsage &&
      event.transcript_path &&
      event.session &&
      !seen.has(event.session)
    ) {
      seen.set(event.session, event.transcript_path)
    }
  })

  seen.forEach(async (path, key) => {
    if (fetchedUsage.current.has(key)) return

    fetchedUsage.current.add(key)

    try {
      const res = await fetch(`/api/session-usage?path=${encodeURIComponent(path)}`)
      if (!res.ok) {
        throw new Error(`Failed to fetch session usage: ${res.status}`)
      }

      const data = (await res.json()) as SessionUsage
      const hasAnyUsage =
        Number(data.input_tokens || 0) > 0 ||
        Number(data.output_tokens || 0) > 0 ||
        Number(data.cache_read_tokens || 0) > 0 ||
        Number(data.cache_creation_tokens || 0) > 0 ||
        Number(data.turns || 0) > 0

      if (!hasAnyUsage) {
        fetchedUsage.current.delete(key)
      }

      setSessionUsage(prev => ({ ...prev, [key]: data }))
    } catch {
      fetchedUsage.current.delete(key)
    }
  })
}, [events, setSessionUsage])
```

Build grouped sessions as `Map<string, SessionGroup>`:

```ts
const grouped = new Map<string, SessionGroup>()

filtered.forEach(event => {
  const key = groupKey(event)
  const existing = grouped.get(key)

  if (existing) {
    existing.events.push(event)
    return
  }

  grouped.set(key, {
    sessionId: key,
    transcriptPath: event.transcript_path ?? '',
    events: [event],
  })
})

const sessionList = Array.from(grouped.values()).map(session => {
  const sortedEvents = [...session.events].sort((a, b) =>
    sortOrder === 'newest'
      ? new Date(b.time).getTime() - new Date(a.time).getTime()
      : new Date(a.time).getTime() - new Date(b.time).getTime()
  )

  const lastTime = new Date(
    Math.max(...sortedEvents.map(event => new Date(event.time).getTime()))
  )

  return {
    session: {
      ...session,
      events: sortedEvents,
    },
    lastTime,
  }
})

sessionList.sort((a, b) =>
  sortOrder === 'newest'
    ? b.lastTime.getTime() - a.lastTime.getTime()
    : a.lastTime.getTime() - b.lastTime.getTime()
)
```

- [ ] **Step 4: Type diff helpers**

Use these signatures:

```ts
const renderDiffLines = (
  oldStr: string,
  newStr: string,
  startLine: number,
  ctxBefore: CtxLine[] = [],
  ctxAfter: CtxLine[] = [],
  patchText?: string
): ReactNode => {
```

```ts
const parseApplyPatch = (text: string, initialLine = 1) => {
  const out: Array<{ kind: 'ctx' | 'add' | 'del'; num: number; text: string }> = []
```

```ts
const highlight = (text: string, query: string): ReactNode => {
```

Inside JSX, remove all `any` casts in `ctxBefore.map`, `ctxAfter.map`, and grouped-session handling.

- [ ] **Step 5: Type `AgentSession` props**

Replace `frontend/src/components/events/AgentSession.tsx` prop type with:

```ts
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { AgentConfig } from '../../agents/types'
import type { Dispatch, SetStateAction } from 'react'
import type { CtxLine, SessionUsage, SessionGroup, TooltipState } from '@/types'

type AgentSessionProps = {
  session: SessionGroup
  lastTime: Date
  isCollapsed: boolean
  toggleSession: (id: string) => void
  searchQuery: string
  shortId: (value: string) => string
  highlight: (text: string, query: string) => ReactNode
  sessionUsage: Record<string, SessionUsage>
  fmtTokens: (value: number) => string
  setTooltip: Dispatch<SetStateAction<TooltipState | null>>
  renderDiffLines: (
    oldStr: string,
    newStr: string,
    startLine: number,
    ctxBefore: CtxLine[],
    ctxAfter: CtxLine[],
    patchText?: string
  ) => ReactNode
  renderPatchDiff: (text: string, startLine: number) => ReactNode
  agent: AgentConfig
}
```

Inside component, destructure `session`:

```ts
const { sessionId, transcriptPath, events } = session
const firstEvent = events[0]
```

Use `sessionId` instead of `keyId` for collapse toggles and session usage lookup.

- [ ] **Step 6: Update `Events.tsx` render call**

Render sessions with:

```tsx
sessionList.map(({ session, lastTime }) => {
  const agent = agentForEvent(session.events[0])
  return (
    <AgentSession
      key={session.sessionId}
      session={session}
      lastTime={lastTime}
      isCollapsed={collapsedSessions.has(session.sessionId)}
      toggleSession={toggleSession}
      searchQuery={searchQuery}
      shortId={shortId}
      highlight={highlight}
      sessionUsage={sessionUsage}
      fmtTokens={fmtTokens}
      setTooltip={setTooltip}
      renderDiffLines={renderDiffLines}
      renderPatchDiff={renderPatchDiff}
      agent={agent}
    />
  )
})
```

- [ ] **Step 7: Verify Events-related lint fixes**

Run:
```bash
cd frontend && npx eslint src/pages/Events.tsx src/components/events/AgentSession.tsx
```

Expected:
- No `no-explicit-any`
- No `react-hooks/purity`
- No `react-hooks/exhaustive-deps`

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/Events.tsx frontend/src/components/events/AgentSession.tsx
git commit -m "refactor: type session event rendering"
```

---

## Task 5: Type OpenAI Usage Page and Remove Effect-Based State Init

**Files:**
- Modify: `frontend/src/pages/Usage.tsx`

- [ ] **Step 1: Replace local `Stats` type and import shared types**

At the top of `frontend/src/pages/Usage.tsx`, use:

```ts
import { useEffect, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { OpenAIUsageResponse, UsageDailyPoint, UsageStats } from '@/types'
```

Then change state to:

```ts
const [apiKey, setApiKey] = useState(() => localStorage.getItem('openai_admin_key') ?? '')
const [timeRange, setTimeRange] = useState(
  () => Number(localStorage.getItem('openai_usage_range')) || 7
)
const [loading, setLoading] = useState(false)
const [error, setError] = useState('')
const [stats, setStats] = useState<UsageStats | null>(null)
```

Delete the `useEffect` that loads `openai_admin_key` on mount.

- [ ] **Step 2: Add typed helpers for usage responses**

Above `fetchUsage`, add:

```ts
const emptyUsageResponse: OpenAIUsageResponse = { data: [] }

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Failed to load usage'

const readUsageResponse = async (response: Response): Promise<OpenAIUsageResponse> => {
  if (!response.ok) return emptyUsageResponse

  try {
    return (await response.json()) as OpenAIUsageResponse
  } catch {
    return emptyUsageResponse
  }
}

const makeDailyPoint = (date: string): UsageDailyPoint => ({
  date,
  tokens: 0,
  requests: 0,
  models: {},
})
```

- [ ] **Step 3: Replace `any`-based fetch parsing**

Inside `fetchUsage`, replace the JSON parsing block with:

```ts
const compData = (await compRes.json()) as OpenAIUsageResponse
const [modData, keyData] = await Promise.all([
  readUsageResponse(modRes),
  readUsageResponse(keyRes),
])

let totalReqs = 0
let totalToks = 0
const modelsBreakdown: Record<string, number> = {}
const keysBreakdown: Record<string, number> = {}
const dailyMap = new Map<string, UsageDailyPoint>()

;(compData.data ?? []).forEach(bucket => {
  const date = bucket.start_time_iso.split('T')[0]
  const requestCount =
    bucket.results?.reduce(
      (sum, result) => sum + Number(result.num_model_requests || 0),
      0
    ) ?? 0
  const tokenCount =
    bucket.results?.reduce(
      (sum, result) =>
        sum + Number(result.input_tokens || 0) + Number(result.output_tokens || 0),
      0
    ) ?? 0

  totalReqs += requestCount
  totalToks += tokenCount
  dailyMap.set(date, {
    date,
    tokens: tokenCount,
    requests: requestCount,
    models: {},
  })
})

;(modData.data ?? []).forEach(bucket => {
  const date = bucket.start_time_iso.split('T')[0]
  const dayEntry = dailyMap.get(date) ?? makeDailyPoint(date)
  dailyMap.set(date, dayEntry)

  bucket.results?.forEach(result => {
    if (!result.model) return

    const count = Number(result.num_model_requests || 0)
    modelsBreakdown[result.model] = (modelsBreakdown[result.model] || 0) + count
    dayEntry.models[result.model] = (dayEntry.models[result.model] || 0) + count
  })
})

;(keyData.data ?? []).forEach(bucket => {
  bucket.results?.forEach(result => {
    if (!result.api_key_id) return

    keysBreakdown[result.api_key_id] =
      (keysBreakdown[result.api_key_id] || 0) +
      Number(result.input_tokens || 0) +
      Number(result.output_tokens || 0)
  })
})

const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
setStats({
  reqs: Number(totalReqs) || 0,
  toks: Number(totalToks) || 0,
  models: modelsBreakdown,
  keys: keysBreakdown,
  daily,
})
```

- [ ] **Step 4: Fix remaining catches**

In the `!compRes.ok` branch, change:

```ts
try {
  const d = (await compRes.json()) as OpenAIUsageResponse
  if (d.error?.message) errorMsg = d.error.message
} catch {
  errorMsg = `Backend returned ${compRes.status}: Please make sure to restart your Go backend!`
}
```

And change the outer catch to:

```ts
} catch (error: unknown) {
  setError(getErrorMessage(error))
} finally {
  setLoading(false)
}
```

- [ ] **Step 5: Verify Usage page lint fixes**

Run:
```bash
cd frontend && npx eslint src/pages/Usage.tsx
```

Expected:
- No `set-state-in-effect`
- No `no-explicit-any`
- No `no-unused-vars`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Usage.tsx
git commit -m "refactor: type usage page responses"
```

---

## Task 6: Run Full Checks, Format, and Build

**Files:**
- Modify: `frontend/**/*` files rewritten by Prettier, except `frontend/src/components/ui/**`

- [ ] **Step 1: Run Prettier write once after all code changes**

Run:
```bash
cd frontend && npm run format
```

Expected:
- Source files are rewritten to Prettier style
- `src/components/ui/**` stays untouched because it is ignored

- [ ] **Step 2: Run the full check script**

Run:
```bash
cd frontend && npm run check
```

Expected:
- `typecheck` exits 0
- `lint` exits 0
- `format:check` exits 0

- [ ] **Step 3: Run build verification**

Run:
```bash
cd frontend && npm run build
```

Expected:
- Production build exits 0

- [ ] **Step 4: Inspect for forbidden suppressions**

Run:
```bash
cd frontend && rg -n "// eslint-disable" src
```

Expected:
- No results

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "chore: finish frontend code quality cleanup"
```

---

## Spec Coverage Check

- Prettier install/config covered in Task 1.
- `check` script covered in Task 1 and verified in Task 6.
- Shared type definitions covered in Task 2, then consumed in Tasks 3-5.
- `no-explicit-any` fixes covered across Tasks 2-5.
- `no-unused-vars` and `no-empty` fixes covered in Tasks 3 and 5.
- `react-hooks/set-state-in-effect` fix covered in Task 5 by lazy state init.
- `react-hooks/purity` and `react-hooks/exhaustive-deps` fixes covered in Task 4.
- shadcn UI file ignore covered in Task 1.
- `npm run build` verification covered in Task 6.

## Plan Notes

- The spec says `OpenAIUsageResponse` can be inline in `Usage.tsx`, but success criteria say API response types belong in `src/types.ts`. This plan follows the stricter rule and centralizes the response types in `src/types.ts`.
- `SessionGroup` is used as a typed frontend grouping object in `Events.tsx` and `AgentSession.tsx`. Here `sessionId` stores the actual grouping key so the existing transcript-path fallback keeps working.
