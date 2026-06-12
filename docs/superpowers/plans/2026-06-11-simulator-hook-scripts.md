# Simulator Hook-Script Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simulator tab's command dropdown also offers scripts from `~/.argus/hooks`, composed into runnable commands (`CLAUDECODE=1 node <path>` on the Claude Code tab).

**Architecture:** Frontend-only. `SimulatorTab` fetches `GET /api/diagnostics` once on mount and reads `fileSystem.hooks` (existing endpoint; lists files with name + absolute path). Script entries are merged into the existing deduped `commandOptions` builder so the Select stays a single options array with unique values.

**Tech Stack:** React 19, Vitest + Testing Library + user-event (already installed).

**Spec:** `docs/superpowers/specs/2026-06-11-simulator-hook-scripts-design.md`

**Repo rules:** prettier + `npx tsc --noEmit` + `npx vitest run` before done; stage ONLY listed files; commits to `main` consented, trailer required.

---

### Task 1: Script options in simulator command Select

**Files:**
- Modify: `frontend/src/features/hooks-config/SimulatorTab.tsx`
- Create: `frontend/tests/features/hooks-config/SimulatorTab.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/tests/features/hooks-config/SimulatorTab.test.tsx`. Radix Select interaction: use `userEvent` like the existing `HooksConfigPage.test.tsx` does.

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SimulatorTab } from '@/features/hooks-config/SimulatorTab'
import type { AgentKey } from '@/features/hooks-config/types'

const HOOKS = [
  { name: 'README.md', path: '/Users/dev/.argus/hooks/README.md' },
  { name: 'stop.js', path: '/Users/dev/.argus/hooks/stop.js' },
  { name: 'notify.sh', path: '/Users/dev/.argus/hooks/notify.sh' },
]

function stubDiagnosticsFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/diagnostics')) {
        return new Response(JSON.stringify({ fileSystem: { hooks: HOOKS } }), { status: 200 })
      }
      return new Response('{}', { status: 200 })
    })
  )
}

function renderTab(agent: AgentKey, onCommandValueChange = vi.fn()) {
  render(
    <SimulatorTab
      agent={agent}
      config={{ hooks: {} }}
      eventType="PreToolUse"
      onEventTypeChange={vi.fn()}
      commandValue=""
      onCommandValueChange={onCommandValueChange}
      payloadJSON="{}"
      onPayloadJSONChange={vi.fn()}
      customCommandText=""
      onCustomCommandTextChange={vi.fn()}
      onApply={vi.fn()}
      applying={false}
    />
  )
  return onCommandValueChange
}

describe('SimulatorTab script options', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('lists hook scripts and composes CLAUDECODE command for claudecode agent', async () => {
    stubDiagnosticsFetch()
    const onChange = renderTab('claudecode')
    const user = userEvent.setup()

    const commandTrigger = await screen.findByRole('combobox', { name: /hook command/i })
    await user.click(commandTrigger)

    expect(await screen.findByText('script: stop.js')).toBeInTheDocument()
    expect(screen.getByText('script: notify.sh')).toBeInTheDocument()
    expect(screen.queryByText(/README/)).not.toBeInTheDocument()

    await user.click(screen.getByText('script: stop.js'))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('CLAUDECODE=1 node /Users/dev/.argus/hooks/stop.js')
    })
  })

  it('composes bare command for codex agent and sh for .sh scripts', async () => {
    stubDiagnosticsFetch()
    const onChange = renderTab('codex')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('combobox', { name: /hook command/i }))
    await user.click(await screen.findByText('script: notify.sh'))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('sh /Users/dev/.argus/hooks/notify.sh')
    })
  })
})
```

Accessibility note: the command SelectTrigger has no accessible name today (`<SelectValue placeholder="Select hook command" />` gives placeholder text, not a name). Add `aria-label="Select hook command"` to that `SelectTrigger` in the implementation step so `getByRole('combobox', { name: /hook command/i })` resolves; the event-type trigger stays unnamed, so the query targets only the command select. If `findByRole` with name still fails before implementation, the red state is simply "no such combobox/option" — acceptable.

CodeMirror in jsdom: `EventsPage`-style tests already render pages containing CodeMirror; if `SimulatorTab` errors on CodeMirror internals in jsdom, mock it at the top of the test file:

```tsx
vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value }: { value: string }) => <pre>{value}</pre>,
}))
```

(Include this mock from the start — it is the known-stable way these tests run.)

- [ ] **Step 2: Run test to verify failure**

Run: `cd frontend && npx vitest run tests/features/hooks-config/SimulatorTab.test.tsx`
Expected: FAIL — combobox with that name not found (aria-label not yet added) or `script: stop.js` option absent.

- [ ] **Step 3: Implement in SimulatorTab.tsx**

a) Extend imports: add `useEffect` to the react import.

b) Add a module-level type + composer near `truncate` (top of file, after `CUSTOM_VALUE`):

```ts
type HookScript = { name: string; path: string }

const SCRIPT_RUNNERS: Record<string, string> = {
  '.js': 'node',
  '.sh': 'sh',
  '.py': 'python3',
}

function scriptExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i === -1 ? '' : name.slice(i)
}

function composeScriptCommand(script: HookScript, agent: AgentKey): string {
  const runner = SCRIPT_RUNNERS[scriptExtension(script.name)]
  const base = `${runner} ${script.path}`
  return agent === 'claudecode' ? `CLAUDECODE=1 ${base}` : base
}
```

(`AgentKey` is already imported in the file.)

c) Inside the component, add state + fetch (after the existing `useState` lines):

```ts
  const [hookScripts, setHookScripts] = useState<HookScript[]>([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/diagnostics')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { fileSystem?: { hooks?: HookScript[] } } | null) => {
        if (cancelled || !data?.fileSystem?.hooks) return
        setHookScripts(
          data.fileSystem.hooks.filter((h) => scriptExtension(h.name) in SCRIPT_RUNNERS)
        )
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
```

d) Merge scripts into the existing `commandOptions` IIFE — after the `groups.forEach` block, before `return opts`:

```ts
    hookScripts.forEach((script) => {
      const command = composeScriptCommand(script, agent)
      if (seen.has(command)) return
      seen.add(command)
      opts.push({ label: `script: ${script.name}`, value: command })
    })
```

e) Add the accessible name to the command SelectTrigger (the second Select in the JSX):

```tsx
        <Select value={commandValue} onValueChange={handleCommandValueChange} disabled={!eventType}>
          <SelectTrigger className="flex-1" aria-label="Select hook command">
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd frontend && npx vitest run tests/features/hooks-config/`
Expected: all PASS including the 2 new tests.

- [ ] **Step 5: Full frontend verification**

Run: `cd frontend && npx prettier --write src/features/hooks-config/SimulatorTab.tsx tests/features/hooks-config/SimulatorTab.test.tsx && npx tsc --noEmit && npx vitest run`
Expected: formatted, no type errors, full suite green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/hooks-config/SimulatorTab.tsx frontend/tests/features/hooks-config/SimulatorTab.test.tsx
git commit -m "feat: offer ~/.argus/hooks scripts in simulator command picker

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
