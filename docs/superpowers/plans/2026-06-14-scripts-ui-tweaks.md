# Scripts UI Tweaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slim Community rows to filename/author/hook/Source/Install, and move Test into the My Collection ⋯ menu where it deep-links the hooks-config simulator with the script's event + file preselected.

**Architecture:** Frontend-only. Strip `CommunityRow`. Add a pure `simulatorPath` helper + a Test item in `CollectionRow`'s ⋯; `CollectionTab` navigates with it. `HooksConfigPage` reads `view`/`event`/`script` query params on mount; `SimulatorTab` preselects the script once its `~/.argus/hooks` list loads.

**Tech Stack:** React 19 + TS + Vite, react-router-dom, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-14-scripts-ui-tweaks-design.md`
**Branch:** continue on `feat/community-script-sharing`.

> **Typecheck note:** root tsconfig is solution-style — `tsc --noEmit` is a NO-OP. Use `npx tsc -b --noEmit`.

---

## File Structure

- Modify: `src/features/scripts/community/CommunityRow.tsx` — strip to filename/author/hook/Source/Install.
- Modify: `src/features/scripts/community/CommunityTab.tsx` — stop passing `simulate`.
- Create: `src/features/scripts/collection/simulatorLink.ts` — `simulatorPath(entry)` helper.
- Modify: `src/features/scripts/collection/CollectionRow.tsx` — add `onTest` + Test in ⋯.
- Modify: `src/features/scripts/collection/CollectionTab.tsx` — `useNavigate` → Test.
- Modify: `src/features/hooks-config/HooksConfigPage.tsx` — read deep-link params, thread `initialScript`.
- Modify: `src/features/hooks-config/SimulatorTab.tsx` — `initialScript` preselect.
- Tests under `tests/features/scripts/**` + `tests/features/hooks-config/**`.

---

## Task 1: Community rows — strip down

**Files:**
- Modify: `frontend/src/features/scripts/community/CommunityRow.tsx`
- Modify: `frontend/src/features/scripts/community/CommunityTab.tsx`
- Test: `frontend/tests/features/scripts/community/CommunityTab.test.tsx` (update)

- [ ] **Step 1: Rewrite `CommunityRow.tsx` ENTIRELY**

```tsx
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CommunityScript } from '@/types'

type CommunityRowProps = {
  script: CommunityScript
  index: number
  busy: boolean
  onInstall: (id: string) => void
  getBody: (id: string) => Promise<string>
}

function filenameOf(script: CommunityScript): string {
  return script.source.split('/').pop() ?? script.id
}

export function CommunityRow({ script, index, busy, onInstall, getBody }: CommunityRowProps) {
  const [body, setBody] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  async function toggleSource() {
    if (body !== null) {
      setBody(null)
      return
    }
    setWorking(true)
    try {
      setBody(await getBody(script.id))
    } catch {
      setBody('// failed to load source')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="border-b border-white/[0.06] px-3 py-3 hover:bg-white/[0.02]">
      <div className="flex items-center gap-4">
        <span className="w-6 shrink-0 text-right text-[0.72rem] tabular-nums text-[#555]">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <span className="truncate font-mono text-sm text-[#e5e5e5]">{filenameOf(script)}</span>
        </div>
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <Badge variant="outline" className="border-amber-600/40 text-amber-500">
            by {script.author}
          </Badge>
          {script.event ? <Badge variant="outline">{script.event}</Badge> : null}
          {!script.runtime_available ? (
            <Badge variant="outline" className="border-amber-600/40 text-amber-500">
              needs {script.runtime}
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" disabled={busy || working} onClick={toggleSource}>
            Source
          </Button>
          {!script.installed ? (
            <Button size="sm" disabled={busy || working} onClick={() => onInstall(script.id)}>
              Install
            </Button>
          ) : (
            <Badge variant="secondary" className="px-2.5 py-1">
              Installed
            </Badge>
          )}
        </div>
      </div>
      {body !== null ? (
        <pre className="mt-2 max-h-[40vh] overflow-auto rounded-md bg-black/40 p-3 text-[0.72rem] text-[#bbb]">
          {body}
        </pre>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Update `CommunityTab.tsx` — drop `simulate`**

Change the hook destructure (remove `simulate`):
```tsx
  const { scripts, loading, error, install, getBody } = useCommunity()
```
And the `<CommunityRow .../>` render — remove the `simulate={simulate}` prop line so it reads:
```tsx
            <CommunityRow
              key={`${s.author}/${s.id}`}
              script={s}
              index={i + 1}
              busy={busy}
              onInstall={(id) => run(() => install(id))}
              getBody={getBody}
            />
```

- [ ] **Step 3: Update the Community test**

Replace `frontend/tests/features/scripts/community/CommunityTab.test.tsx` ENTIRELY with (asserts filenames, NO Test button, NO purpose/title):

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CommunityTab } from '@/features/scripts/community/CommunityTab'

beforeEach(() => {
  class IO {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', IO as unknown as typeof IntersectionObserver)
})
afterEach(() => vi.restoreAllMocks())

function makeScripts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    author: 'alice',
    title: `Script ${i}`,
    purpose: 'a purpose line',
    event: 'PreToolUse',
    runtime: 'node',
    tier: 'community',
    sha256: 'x',
    source: `scripts/alice/s${i}.js`,
    installed: false,
    runtime_available: true,
  }))
}

describe('CommunityTab', () => {
  it('renders filenames (not titles/purpose) and no Test button', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => makeScripts(3) }))
    render(<CommunityTab query="" />)
    await waitFor(() => expect(screen.getByText('s0.js')).toBeInTheDocument())
    expect(screen.getByText('by alice')).toBeInTheDocument()
    expect(screen.getByText('PreToolUse')).toBeInTheDocument()
    expect(screen.queryByText('Script 0')).not.toBeInTheDocument()
    expect(screen.queryByText('a purpose line')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^test$/i })).not.toBeInTheDocument()
  })

  it('renders only the first 50 of a large list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => makeScripts(120) }))
    render(<CommunityTab query="" />)
    await waitFor(() => expect(screen.getByText('s0.js')).toBeInTheDocument())
    expect(screen.getByText('s49.js')).toBeInTheDocument()
    expect(screen.queryByText('s50.js')).not.toBeInTheDocument()
  })

  it('search filters the whole list (finds a script past the first 50)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => makeScripts(120) }))
    render(<CommunityTab query="s99" />)
    await waitFor(() => expect(screen.getByText('s99.js')).toBeInTheDocument())
  })
})
```

- [ ] **Step 4: Verify**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/scripts/community/ && npx tsc -b --noEmit`
Expected: tests PASS, `tsc -b` clean. Then `npx prettier --write` the changed files.

- [ ] **Step 5: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/scripts/community/CommunityRow.tsx frontend/src/features/scripts/community/CommunityTab.tsx frontend/tests/features/scripts/community/CommunityTab.test.tsx
git commit -m "feat(community): slim rows to filename/author/hook/Source/Install"
```

---

## Task 2: My Collection — Test in ⋯ → navigate

**Files:**
- Create: `frontend/src/features/scripts/collection/simulatorLink.ts`
- Test: `frontend/tests/features/scripts/collection/simulatorLink.test.ts`
- Modify: `frontend/src/features/scripts/collection/CollectionRow.tsx`
- Modify: `frontend/src/features/scripts/collection/CollectionTab.tsx`
- Modify: `frontend/tests/features/scripts/collection/CollectionTab.test.tsx`

- [ ] **Step 1: Write the failing helper test**

`frontend/tests/features/scripts/collection/simulatorLink.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { simulatorPath } from '@/features/scripts/collection/simulatorLink'

describe('simulatorPath', () => {
  it('includes view, script, and event when event is present', () => {
    const p = simulatorPath({
      id: 'a',
      filename: 'a.js',
      title: 'A',
      event: 'Stop',
      local: true,
      gist: false,
    })
    expect(p).toBe('/hooks-config?view=simulator&script=a.js&event=Stop')
  })

  it('omits event when absent', () => {
    const p = simulatorPath({ id: 'b', filename: 'b.js', title: 'B', local: true, gist: false })
    expect(p).toBe('/hooks-config?view=simulator&script=b.js')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/scripts/collection/simulatorLink.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement the helper**

`frontend/src/features/scripts/collection/simulatorLink.ts`:

```ts
import type { CollectionEntry } from '@/types'

// simulatorPath builds the hooks-config deep link that opens the simulator with
// this script's hook event + file preselected.
export function simulatorPath(entry: CollectionEntry): string {
  const params = new URLSearchParams({ view: 'simulator', script: entry.filename })
  if (entry.event) params.set('event', entry.event)
  return `/hooks-config?${params.toString()}`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/scripts/collection/simulatorLink.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add Test to `CollectionRow.tsx`**

Add an `onTest` prop and a Test menu item (shown for local entries, first in the ⋯ menu). Change the props type to add:
```tsx
  onTest: (entry: CollectionEntry) => void
```
Add `onTest` to the destructured params. Inside the `<PopoverContent>`'s `<div className="flex flex-col">`, add as the FIRST child (before the Save-to-gist item):
```tsx
              {entry.local ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onTest(entry)}
                >
                  Test
                </Button>
              ) : null}
```

- [ ] **Step 6: Wire `CollectionTab.tsx` → navigate**

In `frontend/src/features/scripts/collection/CollectionTab.tsx`:
1. Add imports:
```tsx
import { useNavigate } from 'react-router-dom'

import { simulatorPath } from './simulatorLink'
```
2. Inside the component, add the navigate hook + handler (place near the other handlers):
```tsx
  const navigate = useNavigate()

  function testInSimulator(entry: CollectionEntry) {
    navigate(simulatorPath(entry))
  }
```
3. Pass `onTest` to `<CollectionRow ... />`:
```tsx
              onTest={testInSimulator}
```
(`CollectionEntry` is already imported in this file; if not, add `import type { CollectionEntry } from '@/types'`.)

- [ ] **Step 7: Update the CollectionTab test (now needs a Router)**

`CollectionTab` uses `useNavigate`, which requires a Router. Replace `frontend/tests/features/scripts/collection/CollectionTab.test.tsx` ENTIRELY with:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CollectionTab } from '@/features/scripts/collection/CollectionTab'

afterEach(() => vi.restoreAllMocks())

const view = {
  authenticated: true,
  entries: [{ id: 'a', filename: 'a.js', title: 'Alpha', local: true, gist: false }],
}

function renderTab(query = '') {
  return render(
    <MemoryRouter>
      <CollectionTab query={query} />
    </MemoryRouter>
  )
}

describe('CollectionTab', () => {
  it('shows entries and the Upload & share control when authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    renderTab()
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /upload & share/i })).toBeInTheDocument()
  })

  it('does not render a Publish button on rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    renderTab()
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 8: Verify**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/scripts/collection/ && npx tsc -b --noEmit`
Expected: PASS, clean. Then prettier the changed files.

- [ ] **Step 9: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/scripts/collection/ frontend/tests/features/scripts/collection/
git commit -m "feat(collection): Test in ⋯ menu deep-links the simulator"
```

---

## Task 3: Hooks-config deep link + SimulatorTab preselect

**Files:**
- Modify: `frontend/src/features/hooks-config/SimulatorTab.tsx`
- Modify: `frontend/src/features/hooks-config/HooksConfigPage.tsx`
- Test: `frontend/tests/features/hooks-config/SimulatorTab.preselect.test.tsx` (new)

- [ ] **Step 1: Add `initialScript` preselect to `SimulatorTab.tsx`**

Change the React import to include `useRef`:
```tsx
import { useEffect, useRef, useState } from 'react'
```
Add `initialScript?: string` to `SimulatorTabProps`:
```tsx
export type SimulatorTabProps = {
  agent: AgentKey
  config: HooksConfig | null
  initialScript?: string
  // ...existing fields...
```
Add `initialScript` to the destructured params. After the existing `useEffect` that loads `hookScripts`, add a one-shot preselect effect:
```tsx
  const preselectApplied = useRef(false)
  useEffect(() => {
    if (preselectApplied.current) return
    if (!initialScript || hookScripts.length === 0) return
    const match = hookScripts.find((h) => h.name === initialScript)
    if (!match) return
    preselectApplied.current = true
    onCommandValueChange(composeScriptCommand(match, agent))
  }, [initialScript, hookScripts, agent, onCommandValueChange])
```

- [ ] **Step 2: Thread `initialScript` + read params in `HooksConfigPage.tsx`**

1. Change the React import to include `useRef`:
```tsx
import { useEffect, useRef, useState } from 'react'
```
2. Add the router import near the top:
```tsx
import { useSearchParams } from 'react-router-dom'
```
3. Add `initialScript?: string` to `SimulatorCacheProps`:
```tsx
type SimulatorCacheProps = {
  eventType: string
  // ...existing fields...
  applying: boolean
  initialScript?: string
}
```
4. In `AgentTabContent`, pass it to `SimulatorTab`:
```tsx
        <SimulatorTab
          agent={agent}
          config={config}
          initialScript={sim.initialScript}
          eventType={sim.eventType}
          // ...rest unchanged...
```
5. In `HooksConfigPage`, add the deep-link state + one-shot effect (place after the `viewMode` state):
```tsx
  const [searchParams] = useSearchParams()
  const [initialScript, setInitialScript] = useState<string | undefined>(undefined)
  const deepLinkApplied = useRef(false)
  useEffect(() => {
    if (deepLinkApplied.current) return
    deepLinkApplied.current = true
    if (searchParams.get('view') === 'simulator') setViewMode('simulator')
    const ev = searchParams.get('event')
    if (ev) setSimEventType(ev)
    const sc = searchParams.get('script')
    if (sc) setInitialScript(sc)
  }, [searchParams])
```
6. Add `initialScript` to the `simProps` object (the one passed as `sim={simProps}`):
```tsx
    initialScript,
```

- [ ] **Step 3: Write the SimulatorTab preselect test**

`frontend/tests/features/hooks-config/SimulatorTab.preselect.test.tsx`:

```tsx
import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SimulatorTab } from '@/features/hooks-config/SimulatorTab'

afterEach(() => vi.restoreAllMocks())

function noop() {}

const baseProps = {
  agent: 'codex' as const,
  config: null,
  eventType: 'Stop',
  onEventTypeChange: noop,
  commandValue: '',
  payloadJSON: '{}',
  onPayloadJSONChange: noop,
  customCommandText: '',
  onCustomCommandTextChange: noop,
  onApply: async () => {},
  applying: false,
}

describe('SimulatorTab initialScript', () => {
  it('preselects the command for the matching local script once loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          fileSystem: { hooks: [{ name: 'cost-warn.js', path: '/h/cost-warn.js' }] },
        }),
      })
    )
    const onCommandValueChange = vi.fn()
    render(
      <SimulatorTab
        {...baseProps}
        initialScript="cost-warn.js"
        onCommandValueChange={onCommandValueChange}
      />
    )
    await waitFor(() =>
      expect(onCommandValueChange).toHaveBeenCalledWith('node "/h/cost-warn.js"')
    )
  })
})
```
(Codex agent → no `CLAUDECODE=1` prefix, so the expected command is `node "/h/cost-warn.js"`.)

- [ ] **Step 4: Verify**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/hooks-config/ && npx tsc -b --noEmit`
Expected: the preselect test PASSES; existing hooks-config tests still pass; `tsc -b` clean. Then prettier the changed files.

- [ ] **Step 5: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/hooks-config/SimulatorTab.tsx frontend/src/features/hooks-config/HooksConfigPage.tsx frontend/tests/features/hooks-config/SimulatorTab.preselect.test.tsx
git commit -m "feat(hooks-config): deep-link the simulator with preselected event + script"
```

---

## Final verification (after all tasks)

```bash
cd /Users/duytran/GitHub/argus/frontend && npx tsc -b --noEmit && npx vitest run && npx prettier --check src/features/scripts src/features/hooks-config
```
All must pass before finishing the branch (superpowers:finishing-a-development-branch).

**Manual smoke:** Community rows show `filename.js` / `by author` / hook badge / Source / Install only.
In My Collection, a local row's ⋯ shows **Test** → lands on `/hooks-config` simulator with the event
dropdown + script dropdown already filled.
```
