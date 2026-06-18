# Plan 001: One-command local verification gate (`make verify`)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9953e77..HEAD -- Makefile CONTRIBUTING.md`
> If `Makefile` or `CONTRIBUTING.md` changed since this plan was written, compare
> the "Current state" excerpts against the live files before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (this plan unblocks the verification gates of 002–005)
- **Category**: dx
- **Planned at**: commit `9953e77`, 2026-06-18

## Why this matters

There is no single command that verifies a change. CI (`.github/workflows/ci.yml`)
runs the full gate, and `CONTRIBUTING.md` lists the commands, but they are split
across two directories and six invocations with non-obvious traps: the frontend
`test` script defaults to **watch mode** (hangs CI/agents unless run with `--run`),
and `golangci-lint` is **not installed by default** (it runs via a GitHub Action in
CI). An executor running the other plans in this set needs one reliable gate it can
invoke and trust. This is the standard "verification baseline" — it lands first so
every later plan has a machine-checkable done criterion.

## Current state

- `Makefile` (repo root) currently has only `build-local` and `clean`. It uses the
  `cd <subdir> && <cmd>` convention (not `make -C`). Excerpt:

  ```makefile
  .PHONY: build-local clean

  # Build with version ldflags and hot-swap the running local service
  build-local:
  	cd frontend && pnpm run build
  	cp -r frontend/dist/. $(DIST)/
  	cd backend && go build -ldflags "$(LDFLAGS)" -o $(LOCAL_BINARY) ./cmd/server
  	...
  clean:
  	rm -rf frontend/dist
  	find $(DIST) -not -name '.gitkeep' -delete
  ```

- `CONTRIBUTING.md:51-65` lists the pre-PR commands (note: it omits `go vet`, which
  CI runs):

  ```
  Run checks before opening a PR:
  cd backend
  go build ./...
  go test ./...
  golangci-lint run ./...

  cd frontend
  pnpm run check
  pnpm exec vitest run
  pnpm run build
  ```

- `frontend/package.json` scripts: `check` = `tsc --noEmit && eslint && prettier --check`;
  `test` = `vitest` (watch — must be invoked as `pnpm run test -- --run` for a single
  pass, the form CI uses); `build` = `tsc -b && vite build`.
- `.github/workflows/ci.yml` is the source of truth for the canonical gate. Its
  backend job runs `go build ./...`, `go vet ./...`, `go test ./...`, then
  `golangci-lint` via `golangci/golangci-lint-action@v9` pinned to `v2.12.2`.
- **Verified during recon**: `go build ./...` and `go test ./...` already pass from
  `cd backend` *without* a prior frontend build — the embedded `dist/` directory
  exists in-tree (`backend/internal/ui/ui.go` has `//go:embed all:dist`), so the
  backend compiles standalone. The CI frontend→backend artifact handoff is only for
  shipping the real UI, not for compilation. So `verify` does **not** need to rebuild
  the frontend before the backend.
- **Verified during recon**: `golangci-lint` is NOT installed in this environment
  (`which golangci-lint` → not found). The verify target must therefore degrade
  gracefully when the tool is absent, not hard-fail.

## Commands you will need

| Purpose            | Command (from repo root)              | Expected on success           |
|--------------------|---------------------------------------|-------------------------------|
| Backend build      | `cd backend && go build ./...`        | exit 0, no output             |
| Backend vet        | `cd backend && go vet ./...`          | exit 0, no output             |
| Backend tests      | `cd backend && go test ./...`         | `ok` per package              |
| Frontend gate      | `cd frontend && pnpm run check`       | exit 0                        |
| Frontend tests     | `cd frontend && pnpm run test -- --run` | `Test Files N passed`       |
| Frontend build     | `cd frontend && pnpm run build`       | `built in …ms`                |
| New target         | `make verify`                         | runs all of the above, exit 0 |

## Scope

**In scope** (the only files you should modify):
- `Makefile` — add `verify`, `verify-backend`, `verify-frontend` targets.
- `CONTRIBUTING.md` — add one line pointing contributors at `make verify`.

**Out of scope** (do NOT touch):
- `.github/workflows/ci.yml` — CI is already correct; do not change it.
- Any source, test, or config file. This plan adds a convenience gate only.
- The existing `build-local` / `clean` targets — leave them exactly as they are.
- Do NOT add a `.env` loader or any new dependency.

## Git workflow

- Branch: `advisor/001-verification-baseline` (or the repo's convention if one is
  evident from `git log`).
- One commit; message style is conventional commits (see `git log`, e.g.
  `chore(dx): add make verify gate`).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the verify targets to the Makefile

Append to the `Makefile` (do not modify existing targets). Update the `.PHONY` line
to include the new targets. Use this exact shape:

```makefile
.PHONY: build-local clean verify verify-backend verify-frontend

## verify — full local gate (backend + frontend), mirrors .github/workflows/ci.yml
verify: verify-backend verify-frontend

## verify-backend — build, vet, test, lint. Lint is skipped with a warning if
## golangci-lint is not installed (CI still enforces it).
verify-backend:
	cd backend && go build ./...
	cd backend && go vet ./...
	cd backend && go test ./...
	@if command -v golangci-lint >/dev/null 2>&1; then \
		cd backend && golangci-lint run ./...; \
	else \
		echo "WARNING: golangci-lint not installed — skipping backend lint."; \
		echo "         CI still enforces it. Install: brew install golangci-lint"; \
		echo "         (CI pins v2.12.2; see https://golangci-lint.run/welcome/install/)"; \
	fi

## verify-frontend — typecheck + lint + format check + tests (non-watch) + build
verify-frontend:
	cd frontend && pnpm run check
	cd frontend && pnpm run test -- --run
	cd frontend && pnpm run build
```

Note the `pnpm run test -- --run` form — this is mandatory. `pnpm test` alone starts
vitest in watch mode and never exits.

**Verify**: `make verify-frontend` → exits 0, ends with `built in …ms`. Then
`make verify-backend` → exits 0; because golangci-lint is absent in this environment
it must print the WARNING lines and still exit 0 (run `echo $?` to confirm it is `0`).

### Step 2: Run the full gate

**Verify**: `make verify` → runs backend then frontend, exits 0. Confirm with
`make verify; echo "exit=$?"` → `exit=0`.

### Step 3: Document the command in CONTRIBUTING.md

In `CONTRIBUTING.md`, in the "Run checks before opening a PR" section (around
line 51), add one line above or below the command blocks:

```
You can run the full gate in one step from the repo root with `make verify`
(equivalent to the backend + frontend commands below; backend lint is skipped
with a warning if `golangci-lint` is not installed locally).
```

Do not delete the existing explicit command blocks — keep them as the canonical
reference.

**Verify**: `grep -n "make verify" CONTRIBUTING.md` → returns the new line.

## Test plan

No unit tests — this is build tooling. Verification is the commands above:
- `make verify-backend` exits 0 (with the lint-skipped warning in this environment).
- `make verify-frontend` exits 0.
- `make verify` exits 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `make verify` exists and exits 0 on the current clean tree (`make verify; echo $?` → `0`)
- [ ] `make verify-backend` and `make verify-frontend` each exist and exit 0
- [ ] With `golangci-lint` absent, `verify-backend` prints the WARNING and still exits 0
- [ ] `grep -n "make verify" CONTRIBUTING.md` returns a match
- [ ] `git status --porcelain` shows only `Makefile` and `CONTRIBUTING.md` modified
- [ ] `plans/README.md` status row for 001 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `pnpm run test -- --run` does not terminate (watch mode not disabled) — report the
  exact vitest invocation; do not "fix" by killing it silently.
- `cd backend && go build ./...` fails with an embed error like
  `pattern all:dist: no matching files` — this means `backend/internal/ui/dist` was
  emptied (e.g. by `make clean`); report it rather than rebuilding the frontend here.
- `make verify` requires changing CI or any source file to pass — that is out of
  scope; report what failed.

## Maintenance notes

- Keep `verify` in lockstep with `.github/workflows/ci.yml`. If CI adds a step
  (e.g. `govulncheck`), decide whether local `verify` should include it; do **not**
  pull the heavy Playwright e2e job into `verify` (too slow for a per-change gate).
- A reviewer should confirm the frontend test step uses `--run` (watch mode is the
  classic footgun here) and that lint degradation is a warning, not a silent skip.
- Deferred out of this plan: a pre-commit hook that calls `make verify`. Left out
  intentionally — it changes contributor workflow and should be opt-in.
