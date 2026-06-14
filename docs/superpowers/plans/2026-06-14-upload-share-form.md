# Upload & Share Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-click Upload & share with a per-file metadata wizard (confirm/fill `@argus-meta` fields, prefilled from each script) plus a PR-description step; inject clean headers into the files and open the registry PR with that description as its body.

**Architecture:** Pure `argusMeta.ts` helpers (parse/build/inject/runtimeFromExt) drive a `Dialog` wizard `UploadShareForm`. `UploadShareDialog` reads the picked files then renders the wizard; on Share it injects headers and calls `publishFiles(files, description)`. Backend threads `description` into the PR body.

**Tech Stack:** React 19 + TS + Vite, shadcn `Dialog`/`Select`/`Input`, Vitest, Go.

**Spec:** `docs/superpowers/specs/2026-06-14-upload-share-form-design.md`
**Branch:** continue on `feat/community-script-sharing`.

> **Typecheck note:** root tsconfig is solution-style — use `npx tsc -b --noEmit` (plain `--noEmit` is a no-op).

---

## File Structure

- Modify: `backend/internal/github/repo_publish.go` — `PublishRegistry(..., description)` → PR body.
- Modify: `backend/internal/github/service.go` — `PublishToRegistry(..., description)`.
- Modify: `backend/internal/handler/registry_publish.go` — accept `description`.
- Modify: `backend/internal/github/repo_publish_test.go` — pass + assert description.
- Create: `frontend/src/features/scripts/community/argusMeta.ts` + test.
- Create: `frontend/src/features/scripts/collection/UploadShareForm.tsx` + test.
- Modify: `frontend/src/features/scripts/collection/UploadShareDialog.tsx` — open the form.
- Modify: `frontend/src/features/scripts/collection/useCollection.ts` — `publishFiles(files, description)`.

---

## Task 1: Backend — PR description → PR body

**Files:**
- Modify: `backend/internal/github/repo_publish.go`, `backend/internal/github/service.go`, `backend/internal/handler/registry_publish.go`
- Test: `backend/internal/github/repo_publish_test.go`

- [ ] **Step 1: Update the happy-path test to pass + assert a description**

In `backend/internal/github/repo_publish_test.go`, change the `/pulls` fake handler to assert the
request body carries the description, and update the `PublishRegistry` call. Replace the `pulls`
handler registration with:

```go
	mux.HandleFunc("/repos/argus-hooks/registry/pulls", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Body string `json:"body"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Body != "my description" {
			t.Errorf("PR body = %q, want %q", body.Body, "my description")
		}
		_, _ = w.Write([]byte(`{"html_url":"https://github.com/argus-hooks/registry/pull/1"}`))
	})
```

And update the happy-path call:

```go
	url, err := gc.PublishRegistry(context.Background(),
		[]github.PublishFile{{Name: "foo.js", Body: "console.log(1)\n"}}, "my description")
```

And the needs-scope call (description can be empty):

```go
	_, err := gc.PublishRegistry(context.Background(),
		[]github.PublishFile{{Name: "foo.js", Body: "x"}}, "")
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/duytran/GitHub/argus/backend && go test ./internal/github/ -run PublishRegistry`
Expected: FAIL — `PublishRegistry` takes 2 args, not 3.

- [ ] **Step 3: Add the `description` param + PR body**

In `backend/internal/github/repo_publish.go`, change the signature and the openPR payload:

```go
func (g *GistClient) PublishRegistry(ctx context.Context, files []PublishFile, description string) (string, error) {
```
and the pulls call:
```go
	if err := g.decode(ctx, http.MethodPost,
		fmt.Sprintf("/repos/%s/%s/pulls", registryOwner, registryRepo),
		map[string]string{
			"title": "Add scripts from " + login,
			"head":  login + ":" + branch,
			"base":  "main",
			"body":  description,
		}, &pr); err != nil {
		return "", err
	}
```

- [ ] **Step 4: Thread through service + handler**

In `backend/internal/github/service.go`:
```go
func (s *Service) PublishToRegistry(ctx context.Context, files []PublishFile, description string) (string, error) {
	gc, ok := s.gist()
	if !ok {
		return "", ErrNotAuthenticated
	}
	return gc.PublishRegistry(ctx, files, description)
}
```
In `backend/internal/handler/registry_publish.go`: add `Description` to the request struct and pass it:
```go
type publishRequest struct {
	Files []struct {
		Name string `json:"name"`
		Body string `json:"body"`
	} `json:"files"`
	Description string `json:"description"`
}
```
and the call:
```go
		url, err := svc.PublishToRegistry(r.Context(), files, req.Description)
```

- [ ] **Step 5: Run + full backend suite + lint**

Run: `cd /Users/duytran/GitHub/argus/backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: PublishRegistry tests PASS; full suite PASS; lint clean. (Fallback `/tmp/glci/golangci-lint`.)

- [ ] **Step 6: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add backend/internal/github/repo_publish.go backend/internal/github/service.go backend/internal/handler/registry_publish.go backend/internal/github/repo_publish_test.go
git commit -m "feat(registry): thread publish description into the PR body"
```

---

## Task 2: Frontend — `argusMeta` pure helpers

**Files:**
- Create: `frontend/src/features/scripts/community/argusMeta.ts`
- Test: `frontend/tests/features/scripts/community/argusMeta.test.ts`

- [ ] **Step 1: Write the failing test**

`frontend/tests/features/scripts/community/argusMeta.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  buildArgusMeta,
  injectMeta,
  parseArgusMeta,
  runtimeFromExt,
} from '@/features/scripts/community/argusMeta'

const FULL = [
  '// @argus-meta',
  '// title: Demo',
  '// event: PreToolUse',
  '// runtime: node',
  '// matcher: Bash',
  '// purpose: do a thing',
  '// @end',
  '',
  'console.log(1)',
  '',
].join('\n')

describe('runtimeFromExt', () => {
  it('maps extensions to runtimes', () => {
    expect(runtimeFromExt('a.js')).toBe('node')
    expect(runtimeFromExt('a.py')).toBe('python3')
    expect(runtimeFromExt('a.sh')).toBe('sh')
    expect(runtimeFromExt('a.txt')).toBe('node')
  })
})

describe('parseArgusMeta', () => {
  it('extracts all fields from a full header', () => {
    const m = parseArgusMeta(FULL)
    expect(m).toMatchObject({
      title: 'Demo',
      event: 'PreToolUse',
      runtime: 'node',
      matcher: 'Bash',
      purpose: 'do a thing',
    })
  })
  it('returns only what is present (partial header)', () => {
    const m = parseArgusMeta('// @argus-meta\n// title: Only\n// @end\n')
    expect(m.title).toBe('Only')
    expect(m.event).toBeUndefined()
  })
  it('returns empty when no header', () => {
    expect(parseArgusMeta('console.log(1)\n')).toEqual({})
  })
})

describe('injectMeta', () => {
  const meta = {
    title: 'T',
    event: 'Stop',
    runtime: 'node',
    matcher: '',
    purpose: '',
  }

  it('prepends a header to a headerless file', () => {
    const out = injectMeta('console.log(1)\n', meta)
    expect(out.startsWith('// @argus-meta')).toBe(true)
    expect(out).toContain('// title: T')
    expect(out).toContain('console.log(1)')
    expect(out.match(/\/\/ @argus-meta/g)?.length).toBe(1)
  })

  it('replaces an existing header (exactly one block remains)', () => {
    const out = injectMeta(FULL, meta)
    expect(out.match(/\/\/ @argus-meta/g)?.length).toBe(1)
    expect(out.match(/\/\/ @end/g)?.length).toBe(1)
    expect(out).toContain('// event: Stop')
    expect(out).not.toContain('// event: PreToolUse')
    expect(out).toContain('console.log(1)')
  })
})

describe('buildArgusMeta', () => {
  it('omits empty optional fields', () => {
    const h = buildArgusMeta({ title: 'T', event: 'Stop', runtime: 'sh', matcher: '', purpose: '' })
    expect(h).toContain('// title: T')
    expect(h).not.toContain('// matcher:')
    expect(h).not.toContain('// purpose:')
    expect(h).toContain('// @end')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/scripts/community/argusMeta.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Implement**

`frontend/src/features/scripts/community/argusMeta.ts`:

```ts
export type ArgusMeta = {
  title: string
  event: string
  runtime: string
  matcher: string
  purpose: string
}

export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'SubagentStop',
  'PermissionRequest',
  'Notification',
  'PreCompact',
]

export const RUNTIMES = ['node', 'python3', 'sh']

export function runtimeFromExt(filename: string): string {
  if (filename.endsWith('.py')) return 'python3'
  if (filename.endsWith('.sh')) return 'sh'
  return 'node'
}

const FIELD_KEYS: (keyof ArgusMeta)[] = ['title', 'event', 'runtime', 'matcher', 'purpose']
const META_START = '// @argus-meta'
const META_END = '// @end'

export function parseArgusMeta(body: string): Partial<ArgusMeta> {
  const start = body.indexOf(META_START)
  const end = body.indexOf(META_END)
  if (start === -1 || end === -1 || end < start) return {}
  const out: Partial<ArgusMeta> = {}
  for (const line of body.slice(start, end).split('\n')) {
    const m = line.match(/^\/\/\s*(\w+):\s*(.*)$/)
    if (!m) continue
    const key = m[1] as keyof ArgusMeta
    if (FIELD_KEYS.includes(key)) out[key] = m[2].trim()
  }
  return out
}

export function buildArgusMeta(m: ArgusMeta): string {
  const lines = [
    META_START,
    `// title: ${m.title}`,
    `// event: ${m.event}`,
    `// runtime: ${m.runtime}`,
  ]
  if (m.matcher) lines.push(`// matcher: ${m.matcher}`)
  if (m.purpose) lines.push(`// purpose: ${m.purpose}`)
  lines.push(META_END, '')
  return lines.join('\n')
}

function stripArgusMeta(body: string): string {
  const start = body.indexOf(META_START)
  if (start === -1) return body
  const endIdx = body.indexOf(META_END, start)
  if (endIdx === -1) return body
  const before = body.slice(0, start)
  const after = body.slice(endIdx + META_END.length).replace(/^\r?\n/, '')
  return before + after
}

export function injectMeta(body: string, m: ArgusMeta): string {
  return buildArgusMeta(m) + '\n' + stripArgusMeta(body).replace(/^\n+/, '')
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/scripts/community/argusMeta.test.ts && npx tsc -b --noEmit`
Expected: tests PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/scripts/community/argusMeta.ts frontend/tests/features/scripts/community/argusMeta.test.ts
git commit -m "feat(community): argusMeta parse/build/inject helpers"
```

---

## Task 3: Frontend — wizard form + wiring

**Files:**
- Create: `frontend/src/features/scripts/collection/UploadShareForm.tsx`
- Modify: `frontend/src/features/scripts/collection/UploadShareDialog.tsx`
- Modify: `frontend/src/features/scripts/collection/useCollection.ts`
- Test: `frontend/tests/features/scripts/collection/UploadShareForm.test.tsx`

- [ ] **Step 1: Widen `publishFiles` in `useCollection.ts`**

Change the `publishFiles` callback signature + body to take a description:

```ts
  const publishFiles = useCallback(
    async (files: { name: string; body: string }[], description: string): Promise<string> => {
      const resp = await fetch('/api/registry/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, description }),
      })
      if (resp.status === 401) throw new Error('unauthenticated')
      if (resp.status === 403) throw new Error('needs-scope')
      if (!resp.ok) throw new Error(`publish ${resp.status}`)
      const data: { pull_request_url: string } = await resp.json()
      return data.pull_request_url
    },
    []
  )
```

- [ ] **Step 2: Create `UploadShareForm.tsx`**

```tsx
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  type ArgusMeta,
  HOOK_EVENTS,
  RUNTIMES,
  injectMeta,
  parseArgusMeta,
  runtimeFromExt,
} from '../community/argusMeta'

type UploadFile = { name: string; body: string }

type UploadShareFormProps = {
  files: UploadFile[]
  onSubmit: (files: UploadFile[], description: string) => void
  onCancel: () => void
}

function initialMeta(f: UploadFile): ArgusMeta {
  const parsed = parseArgusMeta(f.body)
  return {
    title: parsed.title ?? '',
    event: parsed.event ?? '',
    runtime: parsed.runtime ?? runtimeFromExt(f.name),
    matcher: parsed.matcher ?? '',
    purpose: parsed.purpose ?? '',
  }
}

export function UploadShareForm({ files, onSubmit, onCancel }: UploadShareFormProps) {
  const [step, setStep] = useState(0)
  const [meta, setMeta] = useState<ArgusMeta[]>(() => files.map(initialMeta))
  const [description, setDescription] = useState('')

  const isDescriptionStep = step >= files.length
  const current = meta[step]

  function setField(field: keyof ArgusMeta, value: string) {
    setMeta((prev) => prev.map((m, i) => (i === step ? { ...m, [field]: value } : m)))
  }

  const requiredFilled = !!current && !!current.title && !!current.event && !!current.runtime

  function share() {
    const out = files.map((f, i) => ({ name: f.name, body: injectMeta(f.body, meta[i]) }))
    onSubmit(out, description)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-lg border border-white/15 bg-[#141414]">
        <DialogHeader>
          <DialogTitle>
            {isDescriptionStep
              ? 'Pull request description'
              : `File ${step + 1} of ${files.length} — ${files[step].name}`}
          </DialogTitle>
        </DialogHeader>

        {isDescriptionStep ? (
          <div className="space-y-3">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what these scripts do (optional)…"
              aria-label="Pull request description"
              className="h-32 w-full rounded-md border border-white/10 bg-[#0a0a0a] p-3 text-sm text-[#ddd]"
            />
            <div className="flex justify-between">
              <Button variant="outline" size="sm" onClick={() => setStep(files.length - 1)}>
                Back
              </Button>
              <Button size="sm" onClick={share}>
                Share
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <label className="block space-y-1">
              <span className="text-[0.72rem] text-[#999]">Title *</span>
              <Input
                value={current.title}
                onChange={(e) => setField('title', e.target.value)}
                placeholder="Short human title"
                aria-label="Title"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[0.72rem] text-[#999]">Event *</span>
              <Select value={current.event} onValueChange={(v) => setField('event', v)}>
                <SelectTrigger aria-label="Hook event">
                  <SelectValue placeholder="Select hook event" />
                </SelectTrigger>
                <SelectContent>
                  {HOOK_EVENTS.map((ev) => (
                    <SelectItem key={ev} value={ev}>
                      {ev}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1">
              <span className="text-[0.72rem] text-[#999]">Runtime *</span>
              <Select value={current.runtime} onValueChange={(v) => setField('runtime', v)}>
                <SelectTrigger aria-label="Runtime">
                  <SelectValue placeholder="Select runtime" />
                </SelectTrigger>
                <SelectContent>
                  {RUNTIMES.map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {rt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1">
              <span className="text-[0.72rem] text-[#999]">Matcher (optional)</span>
              <Input
                value={current.matcher}
                onChange={(e) => setField('matcher', e.target.value)}
                placeholder="e.g. Bash"
                aria-label="Matcher"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[0.72rem] text-[#999]">Purpose (optional)</span>
              <Input
                value={current.purpose}
                onChange={(e) => setField('purpose', e.target.value)}
                placeholder="One line describing what it does"
                aria-label="Purpose"
              />
            </label>
            <div className="flex justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={step === 0}
                onClick={() => setStep((s) => s - 1)}
              >
                Back
              </Button>
              <Button size="sm" disabled={!requiredFilled} onClick={() => setStep((s) => s + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Rewrite `UploadShareDialog.tsx` to open the form**

```tsx
import { useRef, useState, type ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'

import { UploadShareForm } from './UploadShareForm'

type UploadFile = { name: string; body: string }

type UploadShareDialogProps = {
  onPublish: (files: UploadFile[], description: string) => Promise<string>
  onNeedsLogin: () => void
  onResult: (notice: { text: string; href?: string }) => void
}

export function UploadShareDialog({ onPublish, onNeedsLogin, onResult }: UploadShareDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<UploadFile[] | null>(null)

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list || list.length === 0) return
    const files = await Promise.all(
      Array.from(list).map(async (f) => ({ name: f.name, body: await f.text() }))
    )
    if (inputRef.current) inputRef.current.value = ''
    setPending(files)
  }

  async function submit(files: UploadFile[], description: string) {
    setPending(null)
    setBusy(true)
    try {
      const url = await onPublish(files, description)
      onResult({ text: `Opened a pull request with ${files.length} file(s).`, href: url })
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'unauthenticated' || msg === 'needs-scope') {
        onResult({ text: 'Sign in with GitHub (sharing permission) to publish.' })
        onNeedsLogin()
      } else {
        onResult({ text: 'Upload failed. Try again.' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".js,.sh,.py"
        className="hidden"
        onChange={onPick}
        aria-label="Choose scripts to share"
      />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        Upload & share
      </Button>
      {pending ? (
        <UploadShareForm files={pending} onSubmit={submit} onCancel={() => setPending(null)} />
      ) : null}
    </>
  )
}
```

(`CollectionTab` already passes `onPublish={publishFiles}`; the widened 2-arg signature flows through unchanged.)

- [ ] **Step 4: Write the form test**

`frontend/tests/features/scripts/collection/UploadShareForm.test.tsx` (uses a file WITH a complete
header so the Select dropdowns are prefilled and don't need to be operated in jsdom):

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { UploadShareForm } from '@/features/scripts/collection/UploadShareForm'

afterEach(() => vi.restoreAllMocks())

const HEADED = [
  '// @argus-meta',
  '// title: Demo',
  '// event: Stop',
  '// runtime: node',
  '// @end',
  '',
  'console.log(1)',
  '',
].join('\n')

describe('UploadShareForm', () => {
  it('walks a headed file to the description step and submits injected bodies', () => {
    const onSubmit = vi.fn()
    render(
      <UploadShareForm
        files={[{ name: 'demo.js', body: HEADED }]}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    )
    // Title prefilled from the header.
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Demo')
    // Required fields filled (prefilled) → Next enabled → advance to description step.
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    const desc = screen.getByLabelText('Pull request description')
    fireEvent.change(desc, { target: { value: 'my desc' } })
    fireEvent.click(screen.getByRole('button', { name: /share/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const [outFiles, description] = onSubmit.mock.calls[0]
    expect(description).toBe('my desc')
    expect(outFiles[0].name).toBe('demo.js')
    expect(outFiles[0].body).toContain('// @argus-meta')
    expect(outFiles[0].body).toContain('// title: Demo')
    expect(outFiles[0].body.match(/\/\/ @argus-meta/g).length).toBe(1)
  })

  it('disables Next until required fields are present (headerless file)', () => {
    render(
      <UploadShareForm
        files={[{ name: 'x.js', body: 'console.log(1)\n' }]}
        onSubmit={() => {}}
        onCancel={() => {}}
      />
    )
    // No title/event → Next disabled (runtime is defaulted from ext, but title+event empty).
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
  })
})
```

> **jsdom note:** Radix `Select` is NOT opened in these tests (the headed file prefills event/runtime),
> avoiding pointer-capture issues. If rendering the Radix `Dialog` throws in jsdom (missing
> `Element.prototype.scrollIntoView` / `hasPointerCapture`), add these stubs at the top of the test
> file:
> ```ts
> beforeAll(() => {
>   Element.prototype.scrollIntoView = vi.fn()
>   // @ts-expect-error jsdom shim
>   Element.prototype.hasPointerCapture = vi.fn()
> })
> ```

- [ ] **Step 5: Verify**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/scripts/ && npx tsc -b --noEmit`
Expected: scripts tests PASS (incl. the form), tsc clean. Then `npx prettier --write src/features/scripts/collection/ tests/features/scripts/collection/`.

- [ ] **Step 6: Full frontend gate**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx tsc -b --noEmit && npx vitest run`
Expected: tsc clean, ALL tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/scripts/collection/UploadShareForm.tsx frontend/src/features/scripts/collection/UploadShareDialog.tsx frontend/src/features/scripts/collection/useCollection.ts frontend/tests/features/scripts/collection/UploadShareForm.test.tsx
git commit -m "feat(collection): per-file metadata wizard + PR description for Upload & share"
```

---

## Final verification (after all tasks)

```bash
cd /Users/duytran/GitHub/argus/backend && go build ./... && go test ./... && golangci-lint run ./...
cd ../frontend && npx tsc -b --noEmit && npx vitest run && npx prettier --check src/features/scripts
```
All must pass before finishing the branch.

**Manual smoke:** Upload & share → pick a script → wizard shows its fields (prefilled if it had a
header) → fill required → Next → description → Share → PR opens **with the description as body** and
each file carries a clean `@argus-meta` header.
```
