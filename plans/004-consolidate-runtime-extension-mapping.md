# Plan 004: Make the script runtime↔extension mapping a single source of truth

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 11c8916..HEAD -- backend/internal/handler/collection.go backend/internal/handler/community.go backend/internal/handler/helpers.go`
> If any changed since this plan was written, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (run plan 003 first if you want the traversal guard pinned before
  touching this package, but not required)
- **Category**: tech-debt
- **Planned at**: commit `11c8916`, 2026-06-18

## Why this matters

The correspondence between a script's runtime and its file extension —
`node ↔ .js`, `python3 ↔ .py`, `sh ↔ .sh` (default) — is encoded **twice**, as two
inverse functions in two files: `runtimeFromExt` (extension → runtime,
`collection.go:45`) and `runtimeExt` (runtime → extension, `community.go:26`). They are
not copy-paste duplicates, but they share one table, so they can **drift**: add a new
runtime (say `deno ↔ .ts`) to one and it silently disagrees with the other. Pulling the
table into one place removes that drift risk.

This is a **modest, low-risk** consolidation — scope it honestly. It is *not* a big
refactor: `idFromFilename` and `listLocalHooks` are single-definition (not duplicated),
and `hookTarget`/`hooksDir`/`writeHookScript` are already centralized in `scripts.go`.
None of those are touched. The one security-relevant subtlety is preserved exactly: the
community path validates the runtime against an allowlist (`allowedRuntimes`) **before**
deriving the extension, because community metadata is untrusted; that guard stays put.

## Current state

- `backend/internal/handler/collection.go:45-54` — extension → runtime (for trusted,
  locally-installed scripts):

  ```go
  func runtimeFromExt(filename string) string {
  	switch filepath.Ext(filename) {
  	case ".js":
  		return "node"
  	case ".py":
  		return "python3"
  	default:
  		return "sh"
  	}
  }
  ```

  Call sites (per recon): `collection.go:136`, `collection.go:177`.

- `backend/internal/handler/community.go:18-35` — runtime → extension, with the
  security comment and allowlist that MUST be preserved:

  ```go
  // allowedRuntimes are the only interpreters a community script may declare.
  // The registry index.json is fetched over HTTPS but its metadata is not
  // checksum-verified, so the runtime field is untrusted: gating it here prevents
  // an arbitrary string from ever reaching exec.LookPath or the sandbox command.
  var allowedRuntimes = map[string]bool{"sh": true, "node": true, "python3": true}

  // runtimeExt maps an allowlisted runtime to the temp-file extension used for the
  // sandbox. Derived from the runtime, never from the untrusted source path.
  func runtimeExt(runtime string) string {
  	switch runtime {
  	case "node":
  		return ".js"
  	case "python3":
  		return ".py"
  	default:
  		return ".sh"
  	}
  }
  ```

  Call site (per recon): `community.go:173`, guarded by `allowedRuntimes` at
  `community.go:47` in `communityState`.

- `backend/internal/handler/helpers.go` — the existing home for small unexported
  package helpers (currently holds `parsePageSize`). New shared mapping goes here.

  ```go
  package handler

  import "strconv"

  func parsePageSize(pageStr, sizeStr string, defaultSize, maxSize int) (page, size int) { ... }
  ```

- The runtime↔extension behavior to preserve **exactly**:
  - `runtimeFromExt`: `.js`→`node`, `.py`→`python3`, anything else (incl. `.sh`)→`sh`
  - `runtimeExt`: `node`→`.js`, `python3`→`.py`, anything else (incl. `sh`)→`.sh`

## Commands you will need

| Purpose                 | Command                                                                 | Expected |
|-------------------------|-------------------------------------------------------------------------|----------|
| Build handler package   | `cd backend && go build ./internal/handler`                            | exit 0   |
| Handler tests           | `cd backend && go test ./internal/handler/... ./tests/internal/handler/... -v` | all pass |
| Confirm single defs     | `cd backend && grep -rn "func runtimeFromExt\|func runtimeExt" internal/handler` | 1 each   |
| All backend tests       | `cd backend && go test ./...`                                          | all pass |

## Scope

**In scope** (modify only these):
- `backend/internal/handler/helpers.go` — add the single mapping table + both
  accessor functions.
- `backend/internal/handler/collection.go` — remove the local `runtimeFromExt`
  definition (call sites stay; the function name is unchanged).
- `backend/internal/handler/community.go` — remove the local `runtimeExt` definition;
  **keep** `allowedRuntimes`, its comment, and the guard at the call site.
- `backend/internal/handler/helpers_test.go` (**create**, `package handler`) — round-trip
  and default-case tests for the two accessors.

**Out of scope** (do NOT touch):
- `idFromFilename`, `listLocalHooks` (collection.go) — single definitions, not
  duplicated. Leave them.
- `hookTarget`, `hooksDir`, `writeHookScript` (scripts.go) — already centralized.
- `allowedRuntimes` and the `if allowedRuntimes[...]` guard in `communityState` — this
  is the trust boundary; it must remain exactly where it is.
- Any change to call sites, exported behavior, or JSON output shape.

## Git workflow

- Branch: `advisor/004-runtime-mapping`.
- Commit message style: conventional commits, e.g.
  `refactor(handler): single source of truth for runtime↔extension mapping`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add the mapping and accessors to helpers.go

Add to `backend/internal/handler/helpers.go` (add `"path/filepath"` to imports):

```go
// runtimeExtensions is the single source of truth for the script runtime <-> file
// extension correspondence. Two views derive from it: runtimeFromExt (used for
// trusted, locally-installed scripts) and runtimeExt (used to derive a sandbox
// temp-file extension from an already-allowlisted runtime). Keep additions here so
// the two directions can never drift.
var runtimeExtensions = []struct{ runtime, ext string }{
	{"node", ".js"},
	{"python3", ".py"},
	{"sh", ".sh"},
}

// runtimeFromExt infers the interpreter from a filename's extension. Unknown
// extensions default to "sh" (preserving prior behavior).
func runtimeFromExt(filename string) string {
	ext := filepath.Ext(filename)
	for _, m := range runtimeExtensions {
		if m.ext == ext {
			return m.runtime
		}
	}
	return "sh"
}

// runtimeExt maps an (already allowlisted) runtime to its sandbox temp-file
// extension. Unknown runtimes default to ".sh". Callers MUST validate the runtime
// against allowedRuntimes before calling this — the input is otherwise untrusted.
func runtimeExt(runtime string) string {
	for _, m := range runtimeExtensions {
		if m.runtime == runtime {
			return m.ext
		}
	}
	return ".sh"
}
```

Verify the defaults match the originals: `runtimeFromExt(".sh")` → `"sh"` (no `.sh`
entry would still default to `sh`; here `.sh` maps to `sh` — same result);
`runtimeExt("sh")` → `.sh`. Behavior is identical to the originals.

**Verify**: `cd backend && go build ./internal/handler` — will FAIL with "redeclared"
until Step 2/3 remove the originals; that is expected. Proceed.

### Step 2: Remove the duplicate from collection.go

Delete the `runtimeFromExt` function definition (`collection.go:45-54`). Leave the call
sites (`collection.go:136`, `:177`) unchanged — they now resolve to the helpers.go
version. If `path/filepath` becomes unused in `collection.go`, let `go build` tell you
(it is used elsewhere in the file for `filepath.Ext` in `listLocalHooks`, so it stays).

**Verify**: `cd backend && grep -n "func runtimeFromExt" internal/handler/collection.go`
→ no matches.

### Step 3: Remove the duplicate from community.go

Delete the `runtimeExt` function definition (`community.go:26-35`). **Keep**
`allowedRuntimes` (community.go:22) and its comment. Leave the call site
(`community.go:173`) and the `allowedRuntimes` guard unchanged.

**Verify**: `cd backend && grep -n "func runtimeExt" internal/handler/community.go`
→ no matches; `grep -n "allowedRuntimes" internal/handler/community.go` → still present.

### Step 4: Build and run existing tests (behavior must be unchanged)

**Verify**:
- `cd backend && go build ./...` → exit 0
- `cd backend && go test ./internal/handler/... ./tests/internal/handler/...` → all pass
  (the existing `collection`/`community` tests exercise these paths — they must still pass
  with zero changes, proving behavior is preserved).
- `cd backend && grep -rn "func runtimeFromExt\|func runtimeExt" internal/handler` →
  exactly one definition of each, both in `helpers.go`.

### Step 5: Add direct tests for the accessors

Create `backend/internal/handler/helpers_test.go` (`package handler`):

```go
package handler

import "testing"

func TestRuntimeMappingRoundTrip(t *testing.T) {
	cases := map[string]string{"x.js": "node", "x.py": "python3", "x.sh": "sh", "x.txt": "sh", "noext": "sh"}
	for name, wantRuntime := range cases {
		if got := runtimeFromExt(name); got != wantRuntime {
			t.Errorf("runtimeFromExt(%q) = %q, want %q", name, got, wantRuntime)
		}
	}
	extCases := map[string]string{"node": ".js", "python3": ".py", "sh": ".sh", "weird": ".sh"}
	for rt, wantExt := range extCases {
		if got := runtimeExt(rt); got != wantExt {
			t.Errorf("runtimeExt(%q) = %q, want %q", rt, got, wantExt)
		}
	}
}
```

**Verify**: `cd backend && go test ./internal/handler/ -run RuntimeMapping -v` → pass.

## Test plan

- New `helpers_test.go` (`package handler`): the round-trip + default-case table above —
  this is the regression net proving the consolidation preserved every mapping.
- Existing `collection`/`community` handler tests must pass unchanged (they are the
  end-to-end proof that call sites still behave identically).
- Verification: `cd backend && go test ./...` → all pass.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "func runtimeFromExt\|func runtimeExt" backend/internal/handler` shows exactly one of each, both in `helpers.go`
- [ ] `grep -n "allowedRuntimes" backend/internal/handler/community.go` still present (guard intact)
- [ ] `backend/internal/handler/helpers_test.go` exists and asserts all five `runtimeFromExt` cases and four `runtimeExt` cases
- [ ] `cd backend && go test ./...` exits 0 (existing collection/community tests unchanged and passing)
- [ ] `git status --porcelain` shows only the four in-scope files
- [ ] `plans/README.md` status row for 004 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Removing `runtimeExt` from `community.go` tempts you to also remove or relocate
  `allowedRuntimes` or its call-site guard — do NOT. That guard is the trust boundary
  for untrusted registry metadata. If it seems in the way, STOP.
- An existing `collection`/`community` test fails after the move — that means behavior
  changed; recheck the default cases against the "Current state" mappings, and if you
  can't make it identical, STOP and report.
- You discover a third copy of the mapping elsewhere in the repo — report it; decide
  with the operator whether to fold it in (may widen scope).

## Maintenance notes

- Future runtimes go in `runtimeExtensions` only — both directions update together.
- Adding a runtime there is NOT sufficient to allow it for community scripts: it must
  also be added to `allowedRuntimes`. Keep that two-step intentional (allowlist is the
  security gate; the mapping is just plumbing).
- A reviewer should confirm the `allowedRuntimes` guard still precedes every
  `runtimeExt` call on the untrusted (community) path.
