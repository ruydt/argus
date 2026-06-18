# Plan 003: Close the high-value handler test gaps (traversal guard, dashboard branches, file-changes)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 11c8916..HEAD -- backend/internal/handler/scripts.go backend/internal/handler/dashboard.go backend/internal/handler/file_changes.go backend/tests/internal/handler/`
> If any changed since this plan was written, compare the "Current state" excerpts
> against the live code before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (uses plan 001's `make verify-backend` if present)
- **Category**: tests
- **Planned at**: commit `11c8916`, 2026-06-18

## Why this matters

Three coverage gaps carry real risk:

1. **The path-traversal guard has no direct test.** `hookTarget` (`scripts.go`) is the
   single defense that confines every script install/reveal to `~/.argus/hooks`. It is
   exercised only *indirectly* through `collection`/`community` handler tests. A
   refactor that weakened it (e.g. plan 004 touches the same package) could pass CI
   silently. A direct unit test makes the guard a first-class, regression-protected
   contract.
2. **`dashboard.go` has branch logic with one happy-path test.** The handler parses
   `start`/`end` RFC3339 params (with an `endAt.Before(startAt)` → 400 rule) and a
   `range` enum (`1h`/`6h`/`24h`/`7d`/`30d`). Only `TestDashboardStatsReturns200`
   exists — the validation and range branches are untested.
3. **`file_changes.go` only tests the missing-param case.** The nil→`[]` conversion
   (returns `200` with an empty array, **not** 404) is an easy-to-regress contract that
   the frontend depends on, and it is untested.

`CLAUDE.md` and `CONTRIBUTING.md:115` both require backend tests for handler behavior;
these are additive, low-risk tests that pay down the gap on the security-critical and
branch-heavy spots first.

> Note: an earlier audit pass flagged `projects`/`dashboard`/`file_changes` as
> "untested." That was a false positive from filename-based detection — `projects`
> cascade-delete **is** tested in `backend/tests/internal/handler/projects_sessions_test.go`
> (`TestProjectsHandlerDeleteCascades`), and `dashboard`/`file_changes` have minimal
> tests in `dashboard_health_usage_version_test.go`. This plan targets only the genuine
> remaining gaps. Do **not** re-test the projects cascade — it is already covered.

## Current state

- `backend/internal/handler/scripts.go` — the guard under test (unexported helpers):

  ```go
  func hooksDir(argusDir string) string { return filepath.Join(argusDir, "hooks") }

  func hookTarget(argusDir, filename string) (string, error) {
  	if filename == "" || filepath.Base(filename) != filename {
  		return "", fmt.Errorf("invalid script filename %q", filename)
  	}
  	return filepath.Join(hooksDir(argusDir), filename), nil
  }

  func writeHookScript(argusDir, filename string, body []byte) error {
  	target, err := hookTarget(argusDir, filename)
  	if err != nil { return err }
  	if err := os.MkdirAll(hooksDir(argusDir), 0o700); err != nil { return err }
  	f, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o700)
  	...
  }
  ```

  Because `hookTarget` / `writeHookScript` are **unexported**, their direct test must
  live in **`package handler`** (white-box) — a `handler_test` black-box file cannot
  see them. `backend/internal/handler/reveal_test.go` is an existing white-box
  (`package handler`) example in this same directory; follow its package declaration.

- `backend/internal/handler/dashboard.go` — branch logic (full handler):

  ```go
  if start != "" && end != "" {
  	startAt, startErr := time.Parse(time.RFC3339, start)
  	endAt, endErr := time.Parse(time.RFC3339, end)
  	if startErr != nil || endErr != nil || endAt.Before(startAt) {
  		http.Error(w, "invalid start/end query params", http.StatusBadRequest)
  		return
  	}
  	...
  } else {
  	now := time.Now().Truncate(5 * time.Second)
  	switch r.URL.Query().Get("range") {
  	case "1h": ...
  	case "24h": ...
  	default: since = "" // all time
  	}
  }
  stats, err := svc.GetDashboardStats(since, until)
  ```

- `backend/internal/handler/file_changes.go` — the nil→`[]` contract:

  ```go
  sessionID := r.URL.Query().Get("session_id")
  if sessionID == "" { http.Error(w, "session_id required", http.StatusBadRequest); return }
  groups, err := svc.GetFileChanges(sessionID)
  if err != nil { http.Error(w, "get file changes", http.StatusInternalServerError); return }
  if groups == nil { groups = []domain.FileChangeGroup{} }   // <-- 200 empty array, not 404
  // ... json encode groups ...
  ```

- The existing black-box tests and the shared helper live in
  `backend/tests/internal/handler/`:
  - `hook_test.go:33-40` defines `newTestService(t)` →
    `service.New(sqlite.New(":memory:"))`. Reuse it.
  - `dashboard_health_usage_version_test.go` (`package handler_test`) holds
    `TestDashboardStatsReturns200` and `TestFileChangesReturnsBadRequestWithoutSessionID`.
    Add the new dashboard/file-changes tests here.

## Commands you will need

| Purpose                | Command                                                              | Expected   |
|------------------------|---------------------------------------------------------------------|------------|
| Build backend          | `cd backend && go build ./...`                                      | exit 0     |
| White-box handler tests| `cd backend && go test ./internal/handler/... -v`                  | all pass   |
| Black-box handler tests| `cd backend && go test ./tests/internal/handler/... -v`           | all pass   |
| All backend tests      | `cd backend && go test ./...`                                      | all pass   |

## Scope

**In scope** (create or modify only these):
- `backend/internal/handler/scripts_test.go` (**create**, `package handler`) — direct
  unit tests for `hookTarget` and `writeHookScript`.
- `backend/tests/internal/handler/dashboard_health_usage_version_test.go` (**modify**)
  — add dashboard branch tests + file-changes empty-array test.

**Out of scope** (do NOT touch):
- `scripts.go`, `dashboard.go`, `file_changes.go` — this plan adds tests only, no
  production changes.
- The projects cascade-delete test — already exists; do not duplicate.
- `collection_test.go` / `community_test.go` — they exercise `hookTarget` indirectly;
  leave them. Add a NEW direct unit test instead.
- Do not introduce repository mocks — use the real in-memory SQLite via
  `newTestService`.

## Git workflow

- Branch: `advisor/003-handler-test-gaps`.
- Commit message style: conventional commits, e.g.
  `test(handler): add direct traversal-guard, dashboard-range, and file-changes tests`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Direct unit tests for the traversal guard

Create `backend/internal/handler/scripts_test.go` with `package handler` (white-box,
matching `reveal_test.go`). Cover `hookTarget`:

- rejects `""` → error
- rejects `"../evil.sh"` → error (has a path separator, so `filepath.Base != filename`)
- rejects `"/etc/passwd"` → error
- rejects `"sub/dir.sh"` → error
- accepts `"ok.sh"` → no error, returns `<argusDir>/hooks/ok.sh`

And `writeHookScript` (use `t.TempDir()` as `argusDir`):

- writes a file under `<argusDir>/hooks/` with mode `0700`
- a second call with the same filename returns an error (the `O_EXCL` flag)
- rejects a traversal filename (delegates to `hookTarget`)

Example shape (adapt, don't copy blindly):

```go
package handler

import (
	"path/filepath"
	"testing"
)

func TestHookTargetRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	for _, bad := range []string{"", "../evil.sh", "/etc/passwd", "sub/dir.sh"} {
		if _, err := hookTarget(dir, bad); err == nil {
			t.Errorf("hookTarget(%q) = nil error, want rejection", bad)
		}
	}
	got, err := hookTarget(dir, "ok.sh")
	if err != nil {
		t.Fatalf("hookTarget(ok.sh) error: %v", err)
	}
	if want := filepath.Join(dir, "hooks", "ok.sh"); got != want {
		t.Errorf("hookTarget = %q, want %q", got, want)
	}
}
```

**Verify**: `cd backend && go test ./internal/handler/ -run "HookTarget|WriteHookScript" -v`
→ all pass.

### Step 2: Dashboard branch tests

In `backend/tests/internal/handler/dashboard_health_usage_version_test.go`
(`package handler_test`), add tests using `newTestService(t)` and
`handler.DashboardStats(svc)`:

- `start`+`end` valid RFC3339, `end` after `start` → `200`
- `start`+`end` with `end` before `start` → `400`
- `start` present but unparseable → `400`
- `range=24h` → `200`
- `range=garbage` (falls to default "all time") → `200`

Assert status codes; for the 200 cases also assert the body is valid JSON (mirror the
existing `TestDashboardStatsReturns200`).

**Verify**: `cd backend && go test ./tests/internal/handler/ -run Dashboard -v` → all pass.

### Step 3: File-changes empty-array contract test

In the same file, add a test: call `handler.FileChanges(svc)` with a `session_id` that
has no events, and assert (a) status `200` (not 404) and (b) the body is exactly an
empty JSON array `[]` (not `null`). Example assertion:

```go
if strings.TrimSpace(rec.Body.String()) != "[]" {
	t.Fatalf("body = %q, want []", rec.Body.String())
}
```

**Verify**: `cd backend && go test ./tests/internal/handler/ -run FileChanges -v` → all pass.

### Step 4: Full suite

**Verify**: `cd backend && go test ./...` → all pass.

## Test plan

- New file `scripts_test.go` (`package handler`): traversal rejection table + a valid
  case; `writeHookScript` mode/O_EXCL behavior.
- Added to `dashboard_health_usage_version_test.go`: five dashboard branch cases + one
  file-changes empty-array case.
- Structural patterns: `reveal_test.go` for the white-box package declaration;
  `hook_test.go:33-40` (`newTestService`) and the existing
  `TestDashboardStatsReturns200` for the black-box service-backed pattern.
- Verification: `cd backend && go test ./...` passes with the new tests counted.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `backend/internal/handler/scripts_test.go` exists, declares `package handler`,
      and tests `hookTarget` rejection of `""`, `../evil.sh`, `/etc/passwd`, `sub/dir.sh`
- [ ] Dashboard tests cover: valid range → 200, end-before-start → 400, bad RFC3339 → 400, `range=24h` → 200
- [ ] A file-changes test asserts `200` + body `[]` for a session with no changes
- [ ] `cd backend && go test ./...` exits 0
- [ ] No production (`.go` non-`_test.go`) files modified (`git status --porcelain '*.go' | grep -v _test.go` is empty)
- [ ] `plans/README.md` status row for 003 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `hookTarget` does NOT reject one of the listed traversal inputs — that is a real
  vulnerability in the guard, not a test problem. Report it; do not weaken the test to
  make it pass.
- `DashboardStats` returns a status other than 400 for `end` before `start` — report
  the actual behavior; the production handler is out of scope to change here.
- `FileChanges` returns `null` instead of `[]` for an empty session — report it (the
  nil→`[]` line may have regressed); do not change the handler in this plan.

## Maintenance notes

- These tests pin contracts that plan 004 (handler-package refactor) and plan 002
  (reveal) operate near. Run them after any change in `internal/handler/`.
- A reviewer should confirm `scripts_test.go` is `package handler` (white-box) — if it
  is `handler_test`, it cannot compile against the unexported helpers.
- Deferred: deeper service/repository-level tests for `GetDashboardStats` aggregation
  correctness are out of scope here (this plan is handler-level only).
