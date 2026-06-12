# SearchableSelect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shared searchable select (shadcn Combobox pattern) adopted by the hooks-config simulator command picker.

**Architecture:** New CLI-generated `command` primitive (cmdk) composed with the existing `popover` primitive inside a new `SearchableSelect` shared component (Popover trigger styled like a select, CommandInput filter, CommandItems with check mark). `SimulatorTab` swaps its command `Select` for `SearchableSelect`; all other selects stay plain.

**Tech Stack:** React 19, cmdk via shadcn, Radix Popover, Vitest + Testing Library + user-event.

**Spec:** `docs/superpowers/specs/2026-06-11-searchable-select-design.md`

**Repo rules:** prettier no-semi single-quote 100w; never hand-edit `src/components/ui/`; stage ONLY listed files (repo may have unrelated changes); commits on `main` consented, Claude trailer required.

**jsdom notes (apply in BOTH test files):** Radix Popover + cmdk need stubs jsdom lacks. Put in `beforeEach`:

```ts
window.HTMLElement.prototype.scrollIntoView = () => {}
window.HTMLElement.prototype.hasPointerCapture = () => false
window.HTMLElement.prototype.setPointerCapture = () => {}
window.HTMLElement.prototype.releasePointerCapture = () => {}
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)
```

---

### Task 1: `command` primitive + `SearchableSelect` shared component

**Files:**
- Create: `frontend/src/components/ui/command.tsx` (shadcn CLI only)
- Create: `frontend/src/components/shared/SearchableSelect.tsx`
- Test: `frontend/tests/components/shared/SearchableSelect.test.tsx` (new directory ok)

- [ ] **Step 1: Add shadcn command primitive**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx shadcn@latest add command`
Expected: creates `src/components/ui/command.tsx`, adds `cmdk` to package.json + pnpm-lock.yaml. Known CLI bug in this repo: it may write into a literal `@/` directory — if so, move the file to `src/components/ui/command.tsx` and delete the spurious `@/` tree. If the CLI asks about a `dialog` dependency component, accept it (command.tsx imports Dialog for CommandDialog; if `dialog.tsx` gets created it ships in the same commit).

- [ ] **Step 2: Write the failing test**

Create `frontend/tests/components/shared/SearchableSelect.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchableSelect } from '@/components/shared/SearchableSelect'

const OPTIONS = [
  { label: 'alpha one', value: 'a1' },
  { label: 'beta two', value: 'b2' },
  { label: 'gamma three', value: 'g3' },
]

function setupStubs() {
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.setPointerCapture = () => {}
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
}

describe('SearchableSelect', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    setupStubs()
  })

  it('shows placeholder, opens with all options, selects and closes', async () => {
    const onValueChange = vi.fn()
    render(
      <SearchableSelect
        value=""
        onValueChange={onValueChange}
        options={OPTIONS}
        placeholder="Pick one"
        ariaLabel="Pick one"
      />
    )
    const user = userEvent.setup()

    const trigger = screen.getByRole('combobox', { name: /pick one/i })
    expect(trigger).toHaveTextContent('Pick one')

    await user.click(trigger)
    expect(await screen.findByText('alpha one')).toBeInTheDocument()
    expect(screen.getByText('beta two')).toBeInTheDocument()
    expect(screen.getByText('gamma three')).toBeInTheDocument()

    await user.click(screen.getByText('beta two'))
    expect(onValueChange).toHaveBeenCalledWith('b2')
    await waitFor(() => {
      expect(screen.queryByText('alpha one')).not.toBeInTheDocument()
    })
  })

  it('filters options by search text and shows empty state', async () => {
    render(
      <SearchableSelect
        value="a1"
        onValueChange={vi.fn()}
        options={OPTIONS}
        placeholder="Pick one"
        ariaLabel="Pick one"
        emptyText="Nothing found"
      />
    )
    const user = userEvent.setup()

    const trigger = screen.getByRole('combobox', { name: /pick one/i })
    expect(trigger).toHaveTextContent('alpha one')

    await user.click(trigger)
    const input = await screen.findByPlaceholderText('Search…')

    await user.type(input, 'beta')
    await waitFor(() => {
      expect(screen.queryByText('alpha one')).not.toBeInTheDocument()
    })
    expect(screen.getByText('beta two')).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'zzzz')
    expect(await screen.findByText('Nothing found')).toBeInTheDocument()
  })

  it('renders disabled trigger', () => {
    render(
      <SearchableSelect
        value=""
        onValueChange={vi.fn()}
        options={OPTIONS}
        placeholder="Pick one"
        ariaLabel="Pick one"
        disabled
      />
    )
    expect(screen.getByRole('combobox', { name: /pick one/i })).toBeDisabled()
  })
})
```

- [ ] **Step 3: Run test to verify failure**

Run: `cd frontend && npx vitest run tests/components/shared/SearchableSelect.test.tsx`
Expected: FAIL — module `@/components/shared/SearchableSelect` not found.

- [ ] **Step 4: Implement the component**

Create `frontend/src/components/shared/SearchableSelect.tsx`:

```tsx
import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type SearchableSelectOption = { label: string; value: string }

type SearchableSelectProps = {
  value: string
  onValueChange: (v: string) => void
  options: SearchableSelectOption[]
  placeholder: string
  ariaLabel: string
  disabled?: boolean
  emptyText?: string
  className?: string
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  disabled = false,
  emptyText = 'No results.',
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((opt) => opt.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn('justify-between font-normal', className)}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onValueChange(opt.value)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn('size-4', opt.value === value ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

Note: `CommandItem value={opt.label}` — cmdk filters on this string. Labels in our use are unique; if a duplicate label ever occurs the first match wins, acceptable.

- [ ] **Step 5: Run test to verify pass**

Run: `cd frontend && npx vitest run tests/components/shared/SearchableSelect.test.tsx`
Expected: 3 PASS.

- [ ] **Step 6: Full check**

Run: `cd frontend && npx prettier --write src/components/shared/SearchableSelect.tsx tests/components/shared/SearchableSelect.test.tsx && npx tsc --noEmit && npx vitest run`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ui/command.tsx frontend/src/components/shared/SearchableSelect.tsx frontend/tests/components/shared/SearchableSelect.test.tsx frontend/package.json frontend/pnpm-lock.yaml
# also add frontend/src/components/ui/dialog.tsx IF the shadcn CLI created it
git commit -m "feat: add SearchableSelect shared component on cmdk command primitive

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Adopt in simulator command picker

**Files:**
- Modify: `frontend/src/features/hooks-config/SimulatorTab.tsx`
- Modify: `frontend/tests/features/hooks-config/SimulatorTab.test.tsx`

- [ ] **Step 1: Update the tests (failing first)**

In `frontend/tests/features/hooks-config/SimulatorTab.test.tsx`:

a) Add the ResizeObserver stub to the existing `beforeEach` jsdom stubs (scrollIntoView/pointer-capture stubs already exist there):

```ts
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
```

(If `vi.unstubAllGlobals()` runs in the same `beforeEach`, add the ResizeObserver stub AFTER it.)

b) Append a third test verifying search filtering inside the command picker:

```tsx
  it('filters script options via search input', async () => {
    stubDiagnosticsFetch()
    renderTab('claudecode')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('combobox', { name: /hook command/i }))
    const search = await screen.findByPlaceholderText('Search…')
    await user.type(search, 'notify')

    await waitFor(() => {
      expect(screen.queryByText('script: stop.js')).not.toBeInTheDocument()
    })
    expect(screen.getByText('script: notify.sh')).toBeInTheDocument()
  })
```

The two existing tests should keep their assertions; the combobox role + name and option-text queries remain valid with SearchableSelect. The dropdown also still contains a `Custom command…` entry — selection mechanics unchanged.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd frontend && npx vitest run tests/features/hooks-config/SimulatorTab.test.tsx`
Expected: new test FAILS — no `Search…` input exists (still radix Select).

- [ ] **Step 3: Swap the command Select for SearchableSelect**

In `frontend/src/features/hooks-config/SimulatorTab.tsx`:

a) Add import (shared components group, after the CopyIconButton import):

```ts
import { SearchableSelect } from '@/components/shared/SearchableSelect'
```

b) Build the options list with the trailing custom entry — directly after the `commandOptions` IIFE:

```ts
  const commandSelectOptions = [
    ...commandOptions.map(({ label, value }) => ({ label, value })),
    { label: 'Custom command…', value: CUSTOM_VALUE },
  ]
```

c) Replace the entire second `Select` block (command picker — `<Select value={commandValue} ...>` through its `</Select>`) with:

```tsx
        <SearchableSelect
          value={commandValue}
          onValueChange={handleCommandValueChange}
          options={commandSelectOptions}
          placeholder="Select hook command"
          ariaLabel="Select hook command"
          disabled={!eventType}
          className="flex-1"
        />
```

d) The event-type `Select` stays. If `SelectItem`/other select imports become partially unused, trim ONLY the now-unused names from the `@/components/ui/select` import (the event-type select still needs `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` — likely nothing to trim; verify with tsc).

- [ ] **Step 4: Run tests to verify pass**

Run: `cd frontend && npx vitest run tests/features/hooks-config/`
Expected: all PASS (3 SimulatorTab tests incl. new filter test).

- [ ] **Step 5: Full check**

Run: `cd frontend && npx prettier --write src/features/hooks-config/SimulatorTab.tsx tests/features/hooks-config/SimulatorTab.test.tsx && npx tsc --noEmit && npx vitest run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/hooks-config/SimulatorTab.tsx frontend/tests/features/hooks-config/SimulatorTab.test.tsx
git commit -m "feat: searchable command picker in hooks simulator

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
