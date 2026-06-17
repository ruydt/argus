# Registry Rename + Command Field Design

**Date:** 2026-06-16
**Status:** Approved

## Summary

Four coordinated changes:
1. Rename `my-custom-hook-scripts/` → `registry/` in the argus repo
2. Replace `runtime` with `command` in the `@argus-meta` header format
3. Replace the Runtime dropdown with a Command text input in the upload form
4. Auto-append all script headers to the PR description body on publish

The `argus-hooks/registry` GitHub repo (fork+PR target) is deleted and recreated manually — no code change required there.

---

## 1. Directory Rename: `my-custom-hook-scripts` → `registry`

`git mv my-custom-hook-scripts registry`

Files to update after the move:

| File | Change |
|------|--------|
| `CLAUDE.md` | 3 references to `my-custom-hook-scripts/` → `registry/` |
| `registry/catalog.json` | All 12 `source` URLs: `…/argus/tree/main/my-custom-hook-scripts` → `…/argus/tree/main/registry` |
| `Makefile` | `sync-scripts` target source path |
| `backend/internal/scriptcatalog/` | Embed path pointing at the old directory |

No behavioral change — only paths move.

---

## 2. `@argus-meta` Format: Replace `runtime` with `command`

### New format

```
// @argus-meta
// title: Short human title
// event: PreToolUse
// runtime: node          # node | python3 | sh  ← REMOVED
// command: node hook.js --flag   # NEW — full invocation including params
// matcher: Bash          # optional
// purpose: One line describing what it does.
// @end
```

### Backward compatibility

Old scripts with `// runtime: node` (no `command`) continue to work. The backend derives runtime from the first token of `command` when present; falls back to the `runtime` field when `command` is absent.

### Changes per layer

**Frontend — `argusMeta.ts`**
- `ArgusMeta` type: remove `runtime`, add `command: string`
- `FIELD_KEYS`: swap `runtime` → `command`
- `buildArgusMeta`: emit `// command: …` instead of `// runtime: …`
- `parseArgusMeta`: parse `command` field
- Remove `RUNTIMES` constant (no longer needed in the form)
- Keep `runtimeFromExt` as an internal helper for auto-populating `command` default

**Frontend — `frontend/src/types/community.ts`**
- `CommunityScript`: add `command?: string`, keep `runtime?: string` (catalog still emits it for installed-runtime check)

**Backend — `scriptmeta/scriptmeta.go`**
- `Meta` struct: add `Command string`, keep `Runtime string` for backward compat
- `Parse`: handle both `command` and `runtime` fields
- `EnsureAuthor`: unchanged

**Backend — `domain/community.go`**
- `CommunityScript`: add `Command string \`json:"command,omitempty"\``

**Backend — `community/source.go` (RuntimeAvailable check)**
- When `Command` is set: derive runtime = first token of `Command` (split on space, take `[0]`)
- Fall back to `Runtime` field when `Command` is empty

**`registry/catalog.json`**
- Each of the 12 packages: add `"command": "node <filename>"`, keep `"runtime"` for backward compat with any consumers that haven't updated

**`registry/*.js` (12 scripts)**
- Migrate headers: `// runtime: node` → `// command: node <filename>`

---

## 3. UploadShareForm: Runtime Dropdown → Command Text Input

**File:** `frontend/src/features/scripts/collection/UploadShareForm.tsx`

### Changes

- Remove `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` imports (if no longer used elsewhere in the file)
- Remove `RUNTIMES` from `argusMeta` imports
- Add `command` to `ArgusMeta` state
- `initialMeta`: auto-populate `command` from parsed meta if present; otherwise derive from extension:
  - `.py` → `python3 <filename>`
  - `.sh` → `sh <filename>`
  - default → `node <filename>`
- Replace Runtime `<Select>` block with a Command `<Input>` (free text, required)
- `requiredFilled`: check `command` instead of `runtime`
- Label: `Command *` with placeholder `e.g. node hook.js --config ~/.argus/config.json`

### UI position

Command input replaces the Runtime field in the same position in the form (below Event, before Matcher).

---

## 4. PR Description: Auto-Append All Script Headers

**File:** `frontend/src/features/scripts/collection/UploadShareForm.tsx`

In the `share()` function, after `injectMeta`, extract the `@argus-meta` block from each finalized file body and append to the user's description string before calling `onSubmit`.

### Appended format

```
<user description text>

---
## Scripts

### block-dangerous.js
```
// @argus-meta
// title: Block dangerous commands
// event: PreToolUse
// command: node block-dangerous.js
// matcher: Bash
// purpose: Deny dangerous shell commands…
// @end
```

### protect-secrets.js
```
// @argus-meta
// title: Protect secret files
// event: PreToolUse
// command: node protect-secrets.js
// matcher: Read|Edit|Write|Bash
// purpose: Deny access to secret files…
// @end
```
```

If the user left description blank, the `---\n## Scripts\n\n` section is still appended (no blank-description guard).

### Helper

Extract the header block with a simple slice between `// @argus-meta` and `// @end` (inclusive). This is pure string manipulation — no new import needed.

**Backend unchanged** — `description` field in `publishRequest` already accepts arbitrary text.

---

## Out of Scope

- `argus-hooks/registry` GitHub repo deletion/recreation — manual step in GitHub UI
- Changing the community catalog fetch mechanism (`/api/community/catalog`)
- Changes to the `ScriptsPage` community tab card layout

---

## Test Plan

**Frontend**
- `npx tsc --noEmit` — no type errors after `runtime` removal
- `npx vitest run` — existing tests pass; update any test snapshots that reference `runtime`
- Manual: upload 1-file and 2-file sets; verify PR description contains all headers

**Backend**
- `go build ./...` — no compile errors
- `go test ./...` — `scriptmeta` tests pass; add test for `command`-present + `command`-absent backward compat
- `golangci-lint run ./...` — clean
