# Registry Rename + Command Field Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `my-custom-hook-scripts/` → `registry/`, replace the `runtime` field in `@argus-meta` with a free-text `command` field, update the upload form to match, and auto-append all script headers to PR descriptions on publish.

**Architecture:** The `@argus-meta` header format gains a `command` field (full CLI invocation + optional params) replacing `runtime`. `CommunityScript.runtime` in Go and TS stays — it is a security gate in `handler/community.go` used for `exec.LookPath` and interpreter selection; it comes from `index.json` not from script headers. `command` is added alongside as an optional display field. The PR description append is frontend-only in `UploadShareForm.share()`.

**Tech Stack:** Go 1.25, TypeScript, React 19, shadcn `Input`, Vitest, `go test`

---

## File Map

| File | Action |
|------|--------|
| `my-custom-hook-scripts/` → `registry/` | rename (git mv) |
| `CLAUDE.md` | update 3 path references |
| `registry/catalog.json` | add `command` field, update `source` URLs |
| `registry/*.js` (12 files) | migrate `// runtime: node` → `// command: node <filename>` |
| `backend/internal/scriptmeta/scriptmeta.go` | add `Command` to `Meta`, parse it in `Parse()` |
| `backend/internal/scriptmeta/scriptmeta_test.go` | add `command` parsing test, add backward compat test |
| `backend/internal/domain/community.go` | add `Command string` field |
| `frontend/src/features/scripts/community/argusMeta.ts` | remove `runtime`, add `command`; update `FIELD_KEYS`, `buildArgusMeta`, `parseArgusMeta`; remove `RUNTIMES` |
| `frontend/src/types/community.ts` | add `command?: string` |
| `frontend/src/features/scripts/collection/UploadShareForm.tsx` | replace Runtime Select → Command Input; update `initialMeta`, `requiredFilled`, `share()` |

---

## Task 1: Rename directory + update path references

**Files:**
- Rename: `my-custom-hook-scripts/` → `registry/`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Rename the directory**

```bash
git mv my-custom-hook-scripts registry
```

- [ ] **Step 2: Update CLAUDE.md**

Find and replace all three occurrences of `my-custom-hook-scripts` with `registry` in `CLAUDE.md`. The affected lines are in the project overview, the auto-generated files table, and the project description paragraph.

```bash
sed -i '' 's/my-custom-hook-scripts/registry/g' CLAUDE.md
```

Verify:
```bash
grep -n "my-custom-hook-scripts" CLAUDE.md
# Expected: no output
```

- [ ] **Step 3: Commit**

```bash
git add registry/ CLAUDE.md
git commit -m "refactor: rename my-custom-hook-scripts to registry"
```

---

## Task 2: Migrate script headers in `registry/*.js`

**Files:**
- Modify: all 12 `.js` files under `registry/`

Each file has `// runtime: node` in its `@argus-meta` block. Replace with `// command: node <filename>`.

- [ ] **Step 1: Migrate all 12 headers**

For each file, the change is:
```
// runtime: node
```
→
```
// command: node <filename>.js
```

Run these 12 edits:

```bash
sed -i '' 's|// runtime: node|// command: node argus-activate-local.js|' registry/argus-activate-local.js
sed -i '' 's|// runtime: node|// command: node block-dangerous.js|' registry/block-dangerous.js
sed -i '' 's|// runtime: node|// command: node cost-warn.js|' registry/cost-warn.js
sed -i '' 's|// runtime: node|// command: node format-lint.js|' registry/format-lint.js
sed -i '' 's|// runtime: node|// command: node git-autostage.js|' registry/git-autostage.js
sed -i '' 's|// runtime: node|// command: node inject-context.js|' registry/inject-context.js
sed -i '' 's|// runtime: node|// command: node notify-webhook.js|' registry/notify-webhook.js
sed -i '' 's|// runtime: node|// command: node permission-request.js|' registry/permission-request.js
sed -i '' 's|// runtime: node|// command: node protect-branch.js|' registry/protect-branch.js
sed -i '' 's|// runtime: node|// command: node protect-secrets.js|' registry/protect-secrets.js
sed -i '' 's|// runtime: node|// command: node scan-injection.js|' registry/scan-injection.js
sed -i '' 's|// runtime: node|// command: node stop.js|' registry/stop.js
```

- [ ] **Step 2: Verify headers look correct**

```bash
head -10 registry/block-dangerous.js
# Expected to contain: // command: node block-dangerous.js
grep "runtime:" registry/*.js
# Expected: no output (all replaced)
grep "command:" registry/*.js
# Expected: 12 lines, one per file
```

- [ ] **Step 3: Commit**

```bash
git add registry/*.js
git commit -m "feat: migrate @argus-meta headers from runtime to command field"
```

---

## Task 3: Update `catalog.json`

**Files:**
- Modify: `registry/catalog.json`

Two changes per entry: add `"command"` field, update `"source"` URL from `.../my-custom-hook-scripts` → `.../registry`.

- [ ] **Step 1: Update source URLs**

```bash
sed -i '' 's|argus/tree/main/my-custom-hook-scripts|argus/tree/main/registry|g' registry/catalog.json
```

- [ ] **Step 2: Add `command` field to each of the 12 packages**

Open `registry/catalog.json`. For each package entry, add `"command": "node <filename>"` after the `"filename"` field. The final shape of each entry should be:

```json
{
  "id": "block-dangerous",
  "filename": "block-dangerous.js",
  "command": "node block-dangerous.js",
  "version": "1.0.0",
  "title": "Block dangerous commands",
  ...
  "runtime": "node",
  ...
}
```

Keep `"runtime"` — it is still used by the community handler's security gate and `exec.LookPath` check.

The 12 `command` values to add:
- `argus-activate-local.js` → `"command": "node argus-activate-local.js"`
- `block-dangerous.js` → `"command": "node block-dangerous.js"`
- `cost-warn.js` → `"command": "node cost-warn.js"`
- `format-lint.js` → `"command": "node format-lint.js"`
- `git-autostage.js` → `"command": "node git-autostage.js"`
- `inject-context.js` → `"command": "node inject-context.js"`
- `notify-webhook.js` → `"command": "node notify-webhook.js"`
- `permission-request.js` → `"command": "node permission-request.js"`
- `protect-branch.js` → `"command": "node protect-branch.js"`
- `protect-secrets.js` → `"command": "node protect-secrets.js"`
- `scan-injection.js` → `"command": "node scan-injection.js"`
- `stop.js` → `"command": "node stop.js"`

- [ ] **Step 3: Verify JSON is valid**

```bash
python3 -c "import json,sys; json.load(open('registry/catalog.json')); print('OK')"
# Expected: OK
```

- [ ] **Step 4: Commit**

```bash
git add registry/catalog.json
git commit -m "feat: add command field and update source URLs in catalog.json"
```

---

## Task 4: Backend `scriptmeta` — add `Command` field

**Files:**
- Modify: `backend/internal/scriptmeta/scriptmeta.go`
- Modify: `backend/internal/scriptmeta/scriptmeta_test.go`

- [ ] **Step 1: Write the new failing tests**

Add to `backend/internal/scriptmeta/scriptmeta_test.go`:

```go
func TestParseExtractsCommandField(t *testing.T) {
	body := "// @argus-meta\n" +
		"// title: My hook\n" +
		"// event: PreToolUse\n" +
		"// command: node hook.js --strict\n" +
		"// matcher: Bash\n" +
		"// @end\n\nbody\n"

	m := scriptmeta.Parse(body)
	if m.Command != "node hook.js --strict" {
		t.Errorf("Command = %q", m.Command)
	}
	// Runtime stays zero when not present.
	if m.Runtime != "" {
		t.Errorf("Runtime = %q, want empty", m.Runtime)
	}
}

func TestParseBackwardCompatRuntimeField(t *testing.T) {
	body := "// @argus-meta\n" +
		"// title: Old script\n" +
		"// event: Stop\n" +
		"// runtime: node\n" +
		"// @end\n\nbody\n"

	m := scriptmeta.Parse(body)
	if m.Runtime != "node" {
		t.Errorf("Runtime = %q, want node", m.Runtime)
	}
	if m.Command != "" {
		t.Errorf("Command = %q, want empty", m.Command)
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && go test ./internal/scriptmeta/... -run "TestParseExtractsCommandField|TestParseBackwardCompatRuntimeField" -v
# Expected: FAIL — field Command undefined on Meta
```

- [ ] **Step 3: Add `Command` to `Meta` and parse it**

Replace `backend/internal/scriptmeta/scriptmeta.go` with:

```go
// Package scriptmeta parses the `// @argus-meta` … `// @end` header that argus
// scripts carry, so saved copies keep their title/event/runtime. The format
// mirrors the frontend's argusMeta.ts exactly.
package scriptmeta

import (
	"regexp"
	"strings"
)

const (
	metaStart = "// @argus-meta"
	metaEnd   = "// @end"
)

// Meta holds the recognised header fields. Absent fields stay empty.
type Meta struct {
	Title   string
	Author  string
	Event   string
	Runtime string // kept for backward compat with old scripts that declare // runtime:
	Matcher string
	Purpose string
	Command string // full invocation e.g. "node hook.js --flag"
}

var fieldLine = regexp.MustCompile(`^//\s*(\w+):\s*(.*)$`)

// EnsureAuthor stamps `// author: <author>` into the meta block when the script
// doesn't already declare one — used on publish so a shared script always
// carries attribution (the publisher's GitHub login). Scripts with an author,
// or with no meta block at all, are returned unchanged.
func EnsureAuthor(body, author string) string {
	if author == "" || Parse(body).Author != "" {
		return body
	}
	start := strings.Index(body, metaStart)
	if start == -1 {
		return body
	}
	nl := strings.Index(body[start:], "\n")
	if nl == -1 {
		return body
	}
	at := start + nl + 1
	return body[:at] + "// author: " + author + "\n" + body[at:]
}

// Parse extracts the argus-meta header from a script body. Returns a zero Meta
// when the header is missing or malformed.
func Parse(body string) Meta {
	start := strings.Index(body, metaStart)
	end := strings.Index(body, metaEnd)
	if start == -1 || end == -1 || end < start {
		return Meta{}
	}
	var m Meta
	for _, line := range strings.Split(body[start:end], "\n") {
		match := fieldLine.FindStringSubmatch(strings.TrimSpace(line))
		if match == nil {
			continue
		}
		value := strings.TrimSpace(match[2])
		switch match[1] {
		case "title":
			m.Title = value
		case "author":
			m.Author = value
		case "event":
			m.Event = value
		case "runtime":
			m.Runtime = value
		case "matcher":
			m.Matcher = value
		case "purpose":
			m.Purpose = value
		case "command":
			m.Command = value
		}
	}
	return m
}
```

- [ ] **Step 4: Run all scriptmeta tests**

```bash
cd backend && go test ./internal/scriptmeta/... -v
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add backend/internal/scriptmeta/scriptmeta.go backend/internal/scriptmeta/scriptmeta_test.go
git commit -m "feat(scriptmeta): add Command field, keep Runtime for backward compat"
```

---

## Task 5: Backend domain — add `Command` to `CommunityScript`

**Files:**
- Modify: `backend/internal/domain/community.go`

`Runtime` stays — `handler/community.go` uses it as a security gate (`allowedRuntimes[c.Runtime]`) and for `exec.LookPath`. `Command` is an optional display field.

- [ ] **Step 1: Add `Command` field**

Edit `backend/internal/domain/community.go`:

```go
package domain

// CommunityScript is one entry in the public registry's index.json, plus the
// per-request install/runtime state argus fills in. The registry is external
// and read-only; nothing here is persisted to SQLite.
type CommunityScript struct {
	ID               string `json:"id"`
	Author           string `json:"author"`
	Title            string `json:"title"`
	Purpose          string `json:"purpose,omitempty"`
	Event            string `json:"event,omitempty"`
	Matcher          string `json:"matcher,omitempty"`
	Runtime          string `json:"runtime,omitempty"`  // node | python3 | sh — security gate
	Command          string `json:"command,omitempty"`  // full invocation e.g. "node hook.js --flag"
	Tier             string `json:"tier"`               // always "community"
	SHA256           string `json:"sha256"`             // bare hex of the file body
	Source           string `json:"source"`             // path within the registry repo
	PublishedAt      string `json:"published_at,omitempty"`
	Installed        bool   `json:"installed"`          // filled by handler
	RuntimeAvailable bool   `json:"runtime_available"`  // filled by handler
}
```

- [ ] **Step 2: Build and test**

```bash
cd backend && go build ./... && go test ./... && golangci-lint run ./...
# Expected: all pass, no lint errors
```

- [ ] **Step 3: Commit**

```bash
git add backend/internal/domain/community.go
git commit -m "feat(domain): add Command field to CommunityScript"
```

---

## Task 6: Frontend `argusMeta.ts` — replace `runtime` with `command`

**Files:**
- Modify: `frontend/src/features/scripts/community/argusMeta.ts`

- [ ] **Step 1: Update the file**

Replace the entire contents of `frontend/src/features/scripts/community/argusMeta.ts`:

```typescript
export type ArgusMeta = {
  title: string
  author?: string
  event: string
  command: string
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

export function runtimeFromExt(filename: string): string {
  if (filename.endsWith('.py')) return 'python3'
  if (filename.endsWith('.sh')) return 'sh'
  return 'node'
}

const FIELD_KEYS: (keyof ArgusMeta)[] = [
  'title',
  'author',
  'event',
  'command',
  'matcher',
  'purpose',
]
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
  const lines = [META_START, `// title: ${m.title}`]
  if (m.author) lines.push(`// author: ${m.author}`)
  lines.push(`// event: ${m.event}`, `// command: ${m.command}`)
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

Note: `RUNTIMES` constant is removed — no longer needed. `runtimeFromExt` stays exported (used by `UploadShareForm` to auto-populate the command default).

- [ ] **Step 2: Type check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected errors at this point: `UploadShareForm.tsx` still references `runtime` and `RUNTIMES` — that's fine, fixed in Task 8.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/scripts/community/argusMeta.ts
git commit -m "feat(argusMeta): replace runtime with command field, remove RUNTIMES constant"
```

---

## Task 7: Frontend `community.ts` type — add `command` field

**Files:**
- Modify: `frontend/src/types/community.ts`

- [ ] **Step 1: Add `command` field**

```typescript
export type CommunityScript = {
  id: string
  author: string
  title: string
  purpose?: string
  event?: string
  matcher?: string
  runtime?: string
  command?: string
  tier: 'community'
  sha256: string
  source: string
  published_at?: string
  installed: boolean
  runtime_available: boolean
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/community.ts
git commit -m "feat(types): add command field to CommunityScript"
```

---

## Task 8: `UploadShareForm` — Command input + PR description header append

**Files:**
- Modify: `frontend/src/features/scripts/collection/UploadShareForm.tsx`

This task does two things: replaces the Runtime dropdown with a Command text input, and appends all script `@argus-meta` blocks to the PR description in `share()`.

- [ ] **Step 1: Write the updated file**

Replace the full contents of `frontend/src/features/scripts/collection/UploadShareForm.tsx`:

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
    command: parsed.command ?? `${runtimeFromExt(f.name)} ${f.name}`,
    matcher: parsed.matcher ?? '',
    purpose: parsed.purpose ?? '',
  }
}

const META_START = '// @argus-meta'
const META_END = '// @end'

function extractMetaBlock(body: string): string | null {
  const si = body.indexOf(META_START)
  const ei = body.indexOf(META_END)
  if (si === -1 || ei === -1) return null
  return body.slice(si, ei + META_END.length)
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

  const requiredFilled = !!current && !!current.title && !!current.event && !!current.command

  function share() {
    const out = files.map((f, i) => ({ name: f.name, body: injectMeta(f.body, meta[i]) }))

    const headerSections = out
      .map((f) => {
        const block = extractMetaBlock(f.body)
        return block ? `### ${f.name}\n\`\`\`\n${block}\n\`\`\`` : null
      })
      .filter((h): h is string => h !== null)
      .join('\n\n')

    const fullDescription = headerSections
      ? `${description ? description + '\n\n' : ''}---\n## Scripts\n\n${headerSections}`
      : description

    onSubmit(out, fullDescription)
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
              <span className="text-[0.72rem] text-[#999]">Command *</span>
              <Input
                value={current.command}
                onChange={(e) => setField('command', e.target.value)}
                placeholder="e.g. node hook.js --config ~/.argus/config.json"
                aria-label="Command"
              />
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
              {step > 0 ? (
                <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
              ) : (
                <span />
              )}
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

- [ ] **Step 2: Type check — must be clean**

```bash
cd frontend && npx tsc --noEmit
# Expected: no errors
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && npx vitest run
# Expected: all pass
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/scripts/collection/UploadShareForm.tsx
git commit -m "feat(UploadShareForm): replace Runtime dropdown with Command input, append headers to PR description"
```

---

## Task 9: Final verification

- [ ] **Step 1: Backend full check**

```bash
cd backend && go build ./... && go test ./... && golangci-lint run ./...
# Expected: all pass, zero lint errors
```

- [ ] **Step 2: Frontend full check**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
# Expected: no type errors, all tests pass
```

- [ ] **Step 3: Smoke check the PR description append**

Manually confirm the `share()` logic by tracing through a single-file case:
- `injectMeta` produces a body with `// @argus-meta` … `// @end`
- `extractMetaBlock` finds and returns that block
- `fullDescription` = `"---\n## Scripts\n\n### block-dangerous.js\n```\n// @argus-meta\n...\n// @end\n```"`
- For two files: both headers appear joined by `\n\n`
- If user typed a description: it prepends with a blank line separator before `---`

- [ ] **Step 4: Done**

All 4 spec goals met:
- `my-custom-hook-scripts/` renamed to `registry/` ✓
- `@argus-meta` `runtime` → `command` in headers, form, and parsers ✓
- Upload form shows Command text input, auto-populated from extension ✓
- PR description auto-appends all script headers ✓
