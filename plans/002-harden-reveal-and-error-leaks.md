# Plan 002: Confine the Reveal endpoint to argus-owned paths and stop echoing internal errors

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 11c8916..HEAD -- backend/internal/handler/reveal.go backend/internal/handler/reveal_test.go backend/internal/handler/hooks_config.go backend/internal/server/router.go`
> If any of these changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (use `make verify-backend` from plan 001 if present; otherwise the explicit commands below)
- **Category**: security
- **Planned at**: commit `11c8916`, 2026-06-18

## Why this matters

`POST /api/diagnostics/reveal` (`reveal.go`) takes a fully attacker-controlled `path`,
checks only that the file exists, and hands it to the OS file manager
(`open -R <path>` / `xdg-open <dir>`). Its sibling `CollectionReveal`
(`collection_reveal.go`) is hardened — it confines input to `~/.argus/hooks` via
`hookTarget`. `Reveal` is the one unconstrained-path primitive left.

This is **not** a critical RCE: arguments are passed as `exec` argv (no shell), so
there is no command injection, and the response is body-less (no file-content
exfiltration). The middleware already added in this branch (`secFetchSite`,
`hostHeader` in `middleware.go`) blocks cross-site browsers and DNS rebinding. The
residual harm is real but low: any local process — or any client that omits the
`Sec-Fetch-Site` header (which `secFetchSite` deliberately allows for CLI tools) —
can (a) pop file-manager windows for arbitrary paths and (b) use the `204` vs `404`
response as a **file-existence oracle** for any absolute path. The fix is cheap,
removes the oracle, and brings `Reveal` in line with the project's own posture.

The same change also fixes two information-disclosure spots: `hooks_config.go` returns
raw error text (`fmt.Sprintf("...%v", err)`) to the client, leaking home-directory
paths and filesystem errors. A repo-wide sweep during recon found these are the
**only** two such `http.Error` leaks (`diagnostics.go` and the others already use
generic messages), so this plan closes the category.

## Current state

- `backend/internal/handler/reveal.go` — the vulnerable handler (full file):

  ```go
  type revealRequest struct {
  	Path string `json:"path"`
  }

  var revealExec = func(name string, args ...string) error {
  	return exec.Command(name, args...).Start()
  }

  func Reveal() http.Handler {
  	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
  		if r.Method != http.MethodPost { /* 405 */ }
  		var req revealRequest
  		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" {
  			http.Error(w, "path is required", http.StatusBadRequest)
  			return
  		}
  		if _, err := os.Stat(req.Path); err != nil {        // <-- existence oracle
  			http.Error(w, "file not found", http.StatusNotFound)
  			return
  		}
  		switch runtime.GOOS {
  		case "darwin":
  			err = revealExec("open", "-R", req.Path)        // <-- arbitrary path
  		case "linux":
  			err = revealExec("xdg-open", filepath.Dir(req.Path))
  		...
  ```

- `backend/internal/handler/collection_reveal.go` — the hardened pattern to mirror:
  `CollectionReveal(argusDir string)` calls `target, err := hookTarget(argusDir, req.Filename)`
  and rejects anything that isn't a flat basename before touching the filesystem.

- `backend/internal/server/router.go:101` registers Reveal with **no argument**, vs
  line 134 which passes `opts.ArgusDir` to CollectionReveal:

  ```go
  mux.Handle("POST /api/diagnostics/reveal", secFetchSite(handler.Reveal()))
  ...
  mux.Handle("POST /api/collection/reveal", secFetchSite(handler.CollectionReveal(opts.ArgusDir)))
  ```

- The legitimate reveal paths are exactly what `scanFileSystem` (in
  `backend/internal/service/event_service.go:919-957`) returns, all under three roots:
  `argusDir` (`~/.argus`: binary, `*.log`, `hooks/*`), `~/.claude` (`hooks/*`,
  `history.jsonl`), and `~/.codex` (`hooks/*`, `*.sqlite`). The frontend
  (`FileSystemCard.tsx`) only ever sends `entry.path` from the diagnostics response —
  it never sends user-typed paths. So confining `Reveal` to these three roots does not
  break any legitimate call.

- `backend/internal/handler/hooks_config.go:59` and `:126` — the error leaks:

  ```go
  // serveGetHooksConfig (line 57-60)
  slog.Error("[hooks-config] read config", "agent", agent, "err", err)
  http.Error(w, fmt.Sprintf("failed to read config: %v", err), http.StatusInternalServerError) // LEAK

  // servePutHooksConfig (line 124-127)
  slog.Error("[hooks-config] write config", "agent", agent, "err", err)
  http.Error(w, fmt.Sprintf("failed to write config: %v", err), http.StatusInternalServerError) // LEAK
  ```

  Note the full error is already logged server-side via `slog.Error` — so dropping it
  from the HTTP response loses no debugging signal.

- `backend/internal/handler/reveal_test.go` is **`package handler`** (white-box). It
  stubs `revealExec` by save/restore and asserts the captured `name`/`args`. The
  existing tests call `Reveal()` directly (no `handler.` prefix). Mirror this.

## Commands you will need

| Purpose          | Command                                                             | Expected            |
|------------------|--------------------------------------------------------------------|---------------------|
| Build backend    | `cd backend && go build ./...`                                     | exit 0              |
| Reveal tests     | `cd backend && go test ./internal/handler/ -run Reveal -v`        | all pass            |
| Hooks-config tests | `cd backend && go test ./... -run HooksConfig`                  | all pass            |
| Full gate        | `make verify-backend` (if plan 001 landed) or `cd backend && go build ./... && go test ./...` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `backend/internal/handler/reveal.go`
- `backend/internal/handler/reveal_test.go`
- `backend/internal/server/router.go` (one line — pass `opts.ArgusDir` to `Reveal`)
- `backend/internal/handler/hooks_config.go` (two `http.Error` lines)

**Out of scope** (do NOT touch):
- `collection_reveal.go` / `scripts.go` — already correct; reuse, don't change.
- `FileSystemCard.tsx` or any frontend file — the frontend already sends only
  argus-owned paths; no change needed. If you believe the frontend must change, STOP.
- The `secFetchSite` / `hostHeader` middleware — already in place; do not modify.
- Any error response that already uses a generic message (e.g. `diagnostics.go`).

## Git workflow

- Branch: `advisor/002-harden-reveal`.
- Commit message style: conventional commits, e.g.
  `fix(security): confine reveal endpoint to argus-owned paths; stop echoing config errors`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add an allowlist confinement helper and apply it in Reveal

Change `Reveal()` to accept `argusDir string` and confine `req.Path` to the three
argus-owned roots **before** any `os.Stat` (so a disallowed path returns `400`
without revealing whether it exists — this closes the oracle). Target shape:

```go
func Reveal(argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req revealRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" {
			http.Error(w, "path is required", http.StatusBadRequest)
			return
		}
		if !pathWithinArgusRoots(argusDir, req.Path) {
			http.Error(w, "invalid path", http.StatusBadRequest) // before Stat: no existence oracle
			return
		}
		if _, err := os.Stat(req.Path); err != nil {
			http.Error(w, "file not found", http.StatusNotFound)
			return
		}
		// ... unchanged switch on runtime.GOOS using revealExec ...
	})
}

// pathWithinArgusRoots reports whether p resolves to a location inside one of the
// argus-owned roots that the diagnostics file-system view legitimately exposes:
// ~/.argus (argusDir), ~/.claude, and ~/.codex. Symlinks are resolved best-effort
// so a symlink inside a root cannot redirect the reveal outside it.
func pathWithinArgusRoots(argusDir, p string) bool {
	roots := []string{argusDir}
	if home, err := os.UserHomeDir(); err == nil {
		roots = append(roots, filepath.Join(home, ".claude"), filepath.Join(home, ".codex"))
	}
	clean := filepath.Clean(p)
	if resolved, err := filepath.EvalSymlinks(clean); err == nil {
		clean = resolved
	}
	for _, root := range roots {
		rc := filepath.Clean(root)
		if resolved, err := filepath.EvalSymlinks(rc); err == nil {
			rc = resolved
		}
		if clean == rc || strings.HasPrefix(clean, rc+string(os.PathSeparator)) {
			return true
		}
	}
	return false
}
```

Add `"strings"` to the imports if not present. Keep `revealExec`, `revealRequest`,
and the `runtime.GOOS` switch exactly as they are.

**Verify**: `cd backend && go build ./...` → exit 0.

### Step 2: Pass argusDir at the route

In `backend/internal/server/router.go`, change line 101 from
`secFetchSite(handler.Reveal())` to `secFetchSite(handler.Reveal(opts.ArgusDir))`.

**Verify**: `cd backend && go build ./...` → exit 0;
`grep -n "handler.Reveal(" backend/internal/server/router.go` shows `opts.ArgusDir`.

### Step 3: Replace the leaking error responses in hooks_config.go

At `hooks_config.go:59` and `:126`, keep the `slog.Error(...)` lines unchanged and
replace the `http.Error(...)` argument with a generic message (no `%v`):

```go
// line ~59
http.Error(w, "failed to read config", http.StatusInternalServerError)
// line ~126
http.Error(w, "failed to write config", http.StatusInternalServerError)
```

Remove the now-unused `fmt` import only if `go build` reports it unused (it is used
elsewhere in the file for `fmt.Errorf` — likely keep it).

**Verify**: `grep -n "Sprintf" backend/internal/handler/hooks_config.go` → no matches
in the two `http.Error` calls; `cd backend && go build ./...` → exit 0.

### Step 4: Update and extend the reveal tests

In `backend/internal/handler/reveal_test.go` (`package handler`):

1. Update the existing four tests to call `Reveal(dir)` instead of `Reveal()`, where
   `dir := t.TempDir()` serves as the argus root.
2. In `TestRevealLaunchesFileManager`, create the test file **inside** `dir` (the
   argus root) instead of an unrelated temp dir, so it passes confinement, e.g.
   `file := filepath.Join(dir, "argus.log")`.
3. Add `TestRevealRejectsPathOutsideRoots`: create a real file in a *separate*
   `t.TempDir()` (not under the argus root), POST it, and assert `400`
   (and that `revealExec` was NOT called — reuse the stub pattern with a bool flag).
4. Add `TestRevealRejectsTraversal`: POST `{"path":"../../etc/hosts"}` and assert `400`.

Model the stub and assertions on the existing `TestRevealLaunchesFileManager`.

**Verify**: `cd backend && go test ./internal/handler/ -run Reveal -v` → all pass.

### Step 5: Guard the hooks-config response change with a test (if not already covered)

Check whether an existing test asserts on the *body* of the hooks-config error
response: `grep -rn "failed to read config\|failed to write config" backend`. If a
test asserts the body contains the raw error text, update it to expect the generic
message. If you add a new test, model it on the existing hooks-config tests
(`go test ./... -run HooksConfig -v` to find them).

**Verify**: `cd backend && go test ./... -run HooksConfig` → all pass.

## Test plan

- New tests in `reveal_test.go`: `TestRevealRejectsPathOutsideRoots` (the core fix —
  an existing-but-out-of-root path returns 400 and does not exec),
  `TestRevealRejectsTraversal`. Updated: the four existing tests now pass an argus root.
- Pattern to follow: the `revealExec` save/restore stub already in `reveal_test.go`.
- Verification: `cd backend && go test ./internal/handler/...` → all pass, including
  the new reveal tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `cd backend && go build ./...` exits 0
- [ ] `cd backend && go test ./...` exits 0
- [ ] `Reveal` takes `argusDir`; `grep -n "handler.Reveal(" backend/internal/server/router.go` shows `opts.ArgusDir`
- [ ] `reveal_test.go` has a test asserting an out-of-root existing path → 400 and no exec
- [ ] `grep -n "Sprintf" backend/internal/handler/hooks_config.go` shows no `%v` in `http.Error` calls
- [ ] No frontend files modified (`git status --porcelain frontend` is empty)
- [ ] `plans/README.md` status row for 002 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The diagnostics frontend turns out to send a reveal `path` that is NOT under
  `~/.argus`, `~/.claude`, or `~/.codex` (the confinement would break a real feature).
  Check `frontend/src/features/diagnostics/FileSystemCard.tsx` and the
  `scanFileSystem` output before concluding this — but if confirmed, STOP.
- `filepath.EvalSymlinks` causes an existing legitimate test to fail in a way that
  suggests the allowlist is too strict.
- More than the two known `%v` error leaks turn up and fixing them would touch
  out-of-scope handlers — list them and STOP rather than expanding scope.

## Maintenance notes

- If a future diagnostics feature exposes files outside the three roots (e.g. a new
  `~/.config/argus` location), `pathWithinArgusRoots` must be extended in lockstep —
  keep its root list aligned with `scanFileSystem`.
- A reviewer should confirm the allowlist check happens **before** `os.Stat` (order
  matters: it's what removes the existence oracle) and that `revealExec` is never
  reached for a disallowed path.
- Deferred: a deeper redesign that replaces the raw `path` body with a `kind` enum
  (`binary|log|db|hook`) resolved entirely server-side would eliminate client-supplied
  paths altogether. Not done here to keep the frontend contract stable; note it as a
  future option.
- This is defense-in-depth layered on top of `secFetchSite`/`hostHeader` — do not
  remove those guards thinking this replaces them.
