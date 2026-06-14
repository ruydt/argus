# Upload & Share Form — Per-File Metadata Wizard + PR Description

**Status:** Approved design
**Date:** 2026-06-14
**Builds on:** scripts-v2 (registry-only, Upload & share)
**Branch:** continue on `feat/community-script-sharing`

---

## 1. Goal

When a user clicks "Upload & share", open a wizard that walks file-by-file, prefilling each script's
`@argus-meta` fields (parsed from the file), letting the user confirm/fill the required ones, then
collects a PR description. On submit, argus injects a clean `@argus-meta` header into each file and
opens the registry PR with the description as its body. This makes shared scripts indexable (they get
the header the registry Action needs) and gives the PR a real description.

## 2. Decisions (locked)

- **Sequential per-file wizard:** one step per file (confirm/edit its fields, Next), then a final
  step for the PR description, then Share.
- **Fields per file:** `title` (required), `event` (required, dropdown), `runtime` (required,
  dropdown, defaulted from extension), `matcher` (optional), `purpose` (optional).
- **Prefill from parse:** each file's existing `@argus-meta` (if any) prefills the step; missing
  fields are blank and required ones block Next.
- **On submit, normalize:** regenerate one clean `@argus-meta` block from the confirmed fields per
  file (strip any existing block, prepend) — uniform path for has-header and no-header files.
- **One PR description** for the whole PR → becomes the PR body.
- **Concurrent parse:** read + parse all picked files with `Promise.all`.

## 3. Components

### 3.1 `frontend/src/features/scripts/community/argusMeta.ts` (pure, unit-tested)

```ts
export type ArgusMeta = {
  title: string
  event: string
  runtime: string
  matcher: string
  purpose: string
}

export const HOOK_EVENTS: string[]   // PreToolUse, PostToolUse, UserPromptSubmit, SessionStart,
                                     // SessionEnd, Stop, SubagentStop, PermissionRequest,
                                     // Notification, PreCompact
export const RUNTIMES = ['node', 'python3', 'sh']

export function runtimeFromExt(filename: string): string  // .js→node, .py→python3, .sh→sh, else node
export function parseArgusMeta(body: string): Partial<ArgusMeta>  // reads the // key: value lines
export function buildArgusMeta(m: ArgusMeta): string   // the // @argus-meta … // @end block + \n
export function injectMeta(body: string, m: ArgusMeta): string
  // strip any existing @argus-meta…@end block, then prepend buildArgusMeta(m) + '\n'
```

- `parseArgusMeta`: find the `// @argus-meta` … `// @end` span; for each line matching
  `^//\s*(\w+):\s*(.*)$`, capture known keys (title/event/runtime/matcher/purpose). Unknown keys
  ignored. Returns only the keys it found.
- `injectMeta`: if a `@argus-meta`…`@end` block exists, remove it (and a single trailing blank
  line); prepend the freshly built header. Result always has exactly one header.

### 3.2 `frontend/src/features/scripts/collection/UploadShareForm.tsx`

A `Dialog`-based wizard. Props: `{ files: {name; body}[]; onSubmit(files, description); onCancel }`.

State: `step` (0..files.length, where the last index = description step), and a per-file
`ArgusMeta[]` initialized from `parseArgusMeta(body)` merged with defaults
(`runtime: runtimeFromExt(name)`, others `''`).

- **File steps (`step < files.length`):** header "File N of M — `<filename>`"; inputs for title
  (Input), event (Select from `HOOK_EVENTS`), runtime (Select from `RUNTIMES`), matcher (Input,
  optional), purpose (Input, optional). **Next** disabled unless title && event && runtime are
  non-empty. Back/Next navigation.
- **Description step (`step === files.length`):** a textarea for the PR description (optional); a
  **Share** button. Back returns to the last file.
- **Share** → builds `outFiles = files.map((f, i) => ({ name: f.name, body: injectMeta(f.body,
  meta[i]) }))` and calls `onSubmit(outFiles, description)`.

### 3.3 `UploadShareDialog.tsx` → opens the form

The existing button keeps the hidden file input. After files are picked + read, instead of
immediately publishing, it stores the files and renders `<UploadShareForm files=… onSubmit=…
onCancel=… />`. `onSubmit` calls `onPublish(outFiles, description)` and reports the result via the
existing `onResult` notice. `onCancel` closes the form.

`onPublish` signature widens to `(files, description) => Promise<string>`.

### 3.4 `collection/useCollection.ts` — `publishFiles` gains description

```ts
const publishFiles = useCallback(
  async (files: { name: string; body: string }[], description: string): Promise<string> => {
    const resp = await fetch('/api/registry/publish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, description }),
    })
    // ...same 401→unauthenticated / 403→needs-scope / !ok→error / → pull_request_url
  }, [])
```

### 3.5 Backend — PR body

- `handler/registry_publish.go`: `publishRequest` gains `Description string json:"description"`; pass
  it to `svc.PublishToRegistry(ctx, files, description)`.
- `github/service.go`: `PublishToRegistry(ctx, files, description string)` → `gc.PublishRegistry(ctx,
  files, description)`.
- `github/repo_publish.go`: `PublishRegistry(ctx, files []PublishFile, description string)`; the
  openPR call adds `"body": description`.

## 4. Data flow

```
Upload & share → pick files → read+parse (Promise.all) → wizard
  step per file: confirm title/event/runtime(+matcher/purpose)
  final step: PR description
  Share → injectMeta per file → POST /api/registry/publish {files, description}
        → backend fork+commit (headers present) + PR (body = description)
        → notice banner: "Opened a pull request… View PR"
```

## 5. Error handling

- Required field empty → Next/Share disabled (no submit possible).
- Cancel at any step → no publish, form closes.
- Publish 401/403/error → existing notice + re-auth path (unchanged).
- A file with a malformed/partial existing header → `parseArgusMeta` returns what it can; the rest
  are blank and required-gated.

## 6. Testing

- **`argusMeta.ts`:** `parseArgusMeta` (full header, partial header, no header); `injectMeta` (no
  existing header → prepend; existing header → replaced, exactly one block); `runtimeFromExt`.
- **`UploadShareForm.tsx`:** renders file 1 prefilled from its header; Next disabled until required
  filled; advancing through files reaches the description step; Share calls `onSubmit` with
  header-injected bodies + description.
- **Backend:** `RegistryPublish` forwards `description`; `PublishRegistry` sends it as the PR `body`
  (fake-GitHub assert the pulls payload has `body`).
- Gates: backend `go build/test/golangci-lint`; frontend `tsc -b --noEmit` + `vitest run` + prettier.

## 7. Out of scope (YAGNI)

- Editing/normalizing scripts already in the registry (this is upload-only).
- Per-file description (one PR-level description).
- Auto-detecting event/matcher from script contents (user picks).
- A rich markdown editor for the description (plain textarea).
