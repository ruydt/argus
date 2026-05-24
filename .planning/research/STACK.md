# Technology Stack Research

**Project:** hooker — local-first AI coding session observer
**Research Date:** 2026-05-24
**Milestone Context:** Milestone 1–2 (Local Adoption Baseline + Reliable Daily Use)
**Scope:** Go service reliability, binary distribution, frontend testing, CI/CD, pnpm setup

---

## 1. Go Service Reliability

### 1.1 Graceful Shutdown

**Current state:** `main.go` already uses `signal.NotifyContext` + `srv.Shutdown`. The pattern is correct. Two gaps need fixing:

1. `srv.Shutdown(context.Background())` passes an uncanceled context — if in-flight requests stall, shutdown hangs forever.
2. No HTTP timeouts are set on `http.Server`.

**Recommended pattern — HIGH confidence (Go stdlib, official docs):**

```go
srv := &http.Server{
    Addr:              cfg.Addr,
    Handler:           h,
    ReadHeaderTimeout: 5 * time.Second,
    ReadTimeout:       10 * time.Second,
    WriteTimeout:      30 * time.Second,  // wider for SSE streams
    IdleTimeout:       60 * time.Second,
}

ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
defer stop()

go func() {
    <-ctx.Done()
    shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()
    _ = srv.Shutdown(shutdownCtx)
}()
```

**Timeout rationale:**
- `ReadHeaderTimeout: 5s` — closes slowloris attacks; no cost to normal clients
- `ReadTimeout: 10s` — guards against slow-body attacks on `POST /api/hook`
- `WriteTimeout: 30s` — must be wider than SSE heartbeat interval; set to 0 for the SSE endpoint specifically, or use hijack/flusher pattern already in the events stream handler
- `IdleTimeout: 60s` — reclaims keep-alive connections from idle browsers
- Shutdown deadline: `10s` is enough for a local tool; gives in-flight requests time to drain

**SSE exception:** The `/api/events/stream` handler must flush continuously. `WriteTimeout` applies globally — verify the SSE handler resets its deadline via `http.ResponseController.SetWriteDeadline` (Go 1.20+) or set `WriteTimeout: 0` and accept the tradeoff for a local-only service. For a loopback-only tool, `WriteTimeout: 0` is acceptable.

### 1.2 Structured Logging

**Current state:** Uses `log.Printf` throughout. Fine for now; not structured.

**Recommendation:** Migrate to `log/slog` (stdlib since Go 1.21; project is on Go 1.25). Do not add zerolog, zap, or any third-party logger — slog's throughput is sufficient for a local single-user tool, and zero new dependencies is a real constraint here.

**Pattern — HIGH confidence:**

```go
// main.go — initialize once
logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
    Level: slog.LevelInfo,
}))
slog.SetDefault(logger)

// handler usage
slog.Info("hook ingested", "session_id", evt.SessionID, "agent", evt.Agent)
slog.Error("db write failed", "err", err)
```

Switch to `slog.NewJSONHandler` when/if Docker log aggregation is added. Use text for local dev.

**What NOT to use:** zerolog, zap, logrus — all fine libraries, none justified when slog is in stdlib and this is a solo local tool with zero log-aggregation infra.

### 1.3 Panic Recovery Middleware

**Current state:** No panic recovery middleware exists. A panic in any handler goroutine crashes the entire server process.

**Recommendation:** Write a minimal stdlib-compatible recovery middleware. Do NOT add chi or any router middleware library just for this.

**Pattern — HIGH confidence (stdlib + established Go pattern):**

```go
// internal/server/middleware.go
func recovery(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if rec := recover(); rec != nil {
                buf := make([]byte, 64<<10)
                buf = buf[:runtime.Stack(buf, false)]
                slog.Error("panic recovered",
                    "panic", fmt.Sprintf("%v", rec),
                    "stack", string(buf),
                    "path", r.URL.Path,
                )
                http.Error(w, "internal server error", http.StatusInternalServerError)
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

Wire it outermost in `NewRouter`: `return recovery(cors(logging(mux)))`.

**Caveat:** This only catches panics on the request goroutine. Panics in background goroutines (SSE broadcaster, JSONL watcher) must be wrapped independently with the same recover pattern.

**What NOT to use:** Do not add `github.com/go-chi/chi` solely for its `middleware.Recoverer`. The project's stdlib mux is adequate; adding chi now is scope creep.

### 1.4 Health Endpoints

Already in Milestone 1 requirements. Standard pattern:

```go
// /healthz — always 200, confirms process is alive
// /readyz  — 200 only if DB is open/pingable
```

Use `repo.Ping()` (add to `repository.EventRepository` interface) for `/readyz`. This is the only DB-alive check needed for a local tool.

---

## 2. Binary Distribution

### 2.1 GoReleaser (OSS)

**Recommendation:** Use GoReleaser OSS (free, MIT-licensed for the tool itself). The Pro tier adds macOS signing/notarization and installer generation — not needed at this stage.

**Current version:** GoReleaser v2.15+ (actively maintained, latest stable as of research date). Version 2 is the current major version; v1 configs are deprecated.

**Confidence:** HIGH — official docs verified.

**Minimal `.goreleaser.yaml` for hooker:**

```yaml
version: 2

project_name: hooker

before:
  hooks:
    - go mod tidy

builds:
  - id: hooker
    main: ./cmd/server
    dir: backend
    binary: hooker
    env:
      - CGO_ENABLED=0
    goos:
      - linux
      - darwin
      - windows
    goarch:
      - amd64
      - arm64
    ldflags:
      - -s -w
      - -X hooker/internal/version.Version={{.Version}}

archives:
  - id: default
    name_template: "{{ .ProjectName }}_{{ .Version }}_{{ .Os }}_{{ .Arch }}"
    format_overrides:
      - goos: windows
        formats: [zip]

checksum:
  name_template: "checksums.txt"
  algorithm: sha256

changelog:
  sort: asc
  filters:
    exclude:
      - "^docs:"
      - "^test:"
      - "^chore:"

release:
  github:
    owner: "{{ env \"GITHUB_REPOSITORY_OWNER\" }}"
```

**What GoReleaser gives for free:**
- Cross-compilation for linux/darwin/windows × amd64/arm64 in one command
- `checksums.txt` (SHA256) uploaded automatically to GitHub Release
- Changelog generated from git log
- GitHub Release created via GITHUB_TOKEN

**What it does NOT give for free:**
- Homebrew tap (needs a separate tap repo — defer until there are users)
- macOS code signing / notarization (requires Pro or manual `codesign` step)
- Auto-update mechanism (see 2.2)

**GitHub Actions trigger** (`.github/workflows/release.yml`):

```yaml
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # GoReleaser needs full history for changelog
      - uses: actions/setup-go@v5
        with:
          go-version-file: backend/go.mod
      - name: Build frontend
        run: |
          cd frontend && pnpm install --frozen-lockfile && pnpm build
      - uses: goreleaser/goreleaser-action@v6
        with:
          version: latest
          args: release --clean
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`fetch-depth: 0` is required — GoReleaser reads git tags for the changelog; a shallow clone breaks it.

### 2.2 Update Mechanism

**Recommendation for now: None.** A local developer tool does not need auto-update. Document the upgrade path in `docs/install.md`:
- Source install: `git pull && make build`
- Docker: `docker pull && docker-compose up -d`
- Binary: check GitHub releases page

Defer any in-app "update available" banner until Milestone 3+. If implemented, use GitHub Releases API polling — no agent/daemon, just a check on startup.

**What NOT to use:** go-selfupdate, equinox.io — complexity not justified for solo OSS at this stage.

---

## 3. Frontend Testing Stack

### 3.1 Current State

The project already has the right stack:
- Vitest 4.1.5 (current)
- `@testing-library/react` 16.3.2 (current)
- `@testing-library/jest-dom` 6.9.1 (current)
- jsdom 29.1.1 (current)
- `vite.config.ts` correctly sets `environment: 'jsdom'` and `setupFiles`

The only gap is coverage: tests exist but coverage of components and hooks is thin (per Milestone 2 requirements).

### 3.2 Vitest + RTL Setup Assessment

**Current `vite.config.ts` test config is correct** with one improvement needed: add `globals: true` so tests don't need to import `describe`/`it`/`expect` explicitly (matches current project style).

```ts
test: {
  globals: true,          // add this
  environment: 'jsdom',
  setupFiles: './src/test/setup.ts',
  css: true,
  include: ['tests/**/*.{test,spec}.{ts,tsx}'],
}
```

And add `"types": ["vitest/globals"]` to `tsconfig.json` compilerOptions to prevent TS errors on `describe`/`it` if not already present.

**`src/test/setup.ts` should contain:**

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
```

**Confidence:** HIGH — verified against Vitest 4.x and RTL 16.x docs.

### 3.3 Missing: `@testing-library/user-event`

The project currently lacks `@testing-library/user-event`. This is the preferred way to simulate user interactions (typing, clicking, selecting) in RTL tests — it produces more realistic event sequences than `fireEvent`.

**Add:**
```bash
pnpm add -D @testing-library/user-event
```

Current version: `^14.x` (major). Use `userEvent.setup()` pattern (v14 API):

```ts
import userEvent from '@testing-library/user-event'

const user = userEvent.setup()
await user.click(screen.getByRole('button', { name: /filter/i }))
```

**Confidence:** HIGH — RTL official docs recommend user-event over fireEvent for interaction tests.

### 3.4 Playwright for E2E (Milestone 2)

**Recommendation:** Add Playwright for smoke tests in Milestone 2. Keep scope tight: 3–5 tests that verify core routes load and display data. Do not aim for full coverage.

**Install:**
```bash
cd frontend
pnpm add -D @playwright/test
npx playwright install chromium  # chromium only — skip webkit/firefox for now
```

**Config (`frontend/playwright.config.ts`):**

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://localhost:8765',
    headless: true,
  },
  webServer: {
    command: 'pnpm preview --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
```

**Smoke test scope (Milestone 2 minimum):**
1. Load `/` — sessions list renders without error
2. Load `/events` — events page renders
3. Load `/dashboard` — stats cards visible
4. `POST /api/hook` with fixture payload → verify session appears in `/` within 2s

**What NOT to use:**
- Cypress — larger install, slower, Node-based driver; Playwright is the current community standard for new projects
- Vitest Browser Mode — it's experimental in Vitest 4.x, requires Playwright anyway, adds configuration complexity with no benefit over direct Playwright for smoke tests

**GitHub Actions for E2E** (separate job, runs only on push to main, not on every PR):

```yaml
e2e:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-go@v5
      with:
        go-version-file: backend/go.mod
    - uses: actions/setup-node@v4
      with:
        node-version: 20
    - run: corepack enable && pnpm install --frozen-lockfile
      working-directory: frontend
    - run: pnpm build
      working-directory: frontend
    - run: go build -o hooker ./cmd/server && ./hooker &
      working-directory: backend
      env:
        DB_PATH: /tmp/hooker-e2e.db
    - run: npx playwright install chromium --with-deps
      working-directory: frontend
    - run: npx playwright test
      working-directory: frontend
```

**Confidence:** MEDIUM — Playwright setup is well-documented; the specific webServer config with the Go binary needs validation against actual startup timing.

---

## 4. CI/CD for Solo OSS Go+React

### 4.1 Recommended Workflow Structure

Two separate workflow files, not one monolithic one:

**`.github/workflows/ci.yml`** — runs on every push + PR:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: backend/go.mod
          cache-dependency-path: backend/go.sum
      - run: go build ./...
      - run: go vet ./...
      - run: go test ./...
      - uses: golangci/golangci-lint-action@v9
        with:
          version: v2.12
          working-directory: backend

  govulncheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: backend/go.mod
      - uses: golang/govulncheck-action@v1
        with:
          work-dir: backend

  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test -- --run
      - run: pnpm build
```

**`.github/workflows/release.yml`** — runs on `v*` tags only (see section 2.1).

### 4.2 govulncheck

Use `golang/govulncheck-action@v1` (the official Google-maintained action). It scans for known CVEs in the Go vulnerability database, which is more precise than Dependabot for Go modules — Dependabot fires on any version in the advisory database even when the vulnerable code path is never reachable; govulncheck only fires on reachable call paths.

**Recommendation:** Run govulncheck as a separate non-blocking advisory job on CI (use `continue-on-error: true` initially until you've triaged existing findings). Do not use Dependabot security alerts for Go — the signal-to-noise ratio is poor. Keep Dependabot enabled only for GitHub Actions version bumps.

**Confidence:** MEDIUM — based on multiple sources including the "Turn Dependabot Off" post by Filippo Valsorda (Go security team) and the govulncheck-action README.

### 4.3 Dependabot Configuration

Enable only for GitHub Actions dependencies (to keep action pins current). Disable for Go modules (govulncheck is better) and npm (pnpm doesn't fully integrate with Dependabot — it generates npm lockfile diffs).

**`.github/dependabot.yml`:**

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

**What NOT to do:** Do not enable `package-ecosystem: gomod` or `package-ecosystem: npm` — the former produces noisy PRs for indirect deps; the latter doesn't understand pnpm lockfiles well and generates churn.

### 4.4 Action Pinning

Pin actions to SHA when security is a concern (per the tj-actions/changed-files supply chain incident of 2025). For a solo personal tool the risk is lower, but it's good practice. At minimum: pin third-party actions (goreleaser-action, golangci-lint-action). GitHub's own actions (checkout, setup-go, setup-node) are lower risk.

**Confidence:** MEDIUM — based on 2025 supply chain incident reporting and GitHub security blog.

### 4.5 Go Version

Use `go-version-file: backend/go.mod` rather than hardcoding a version. This keeps CI and local dev synchronized without manual maintenance.

---

## 5. pnpm Setup for Frontend Subdirectory

### 5.1 Current State

The frontend already uses pnpm correctly:
- `"packageManager": "pnpm@10.23.0"` in `frontend/package.json` — this is the right field; Corepack reads it
- `pnpm-lock.yaml` is present

### 5.2 This is NOT a Workspace Setup

The project is a Go+React hybrid, not a JavaScript monorepo. There is no `pnpm-workspace.yaml` and none is needed. The frontend is a standalone pnpm project living in a subdirectory. This is the correct architecture.

**What "pnpm standardization" means in this context:**
1. Enforce pnpm as the only package manager (already done via `packageManager` field)
2. Use `--frozen-lockfile` in CI (prevents lockfile drift from CI installs)
3. Ensure contributors can't accidentally run `npm install` or `yarn`

**Add to `frontend/package.json`:**

```json
"engines": {
  "node": ">=18.0.0",
  "pnpm": ">=10.0.0"
}
```

**Add `.npmrc` in `frontend/`:  **

```
engine-strict=true
```

This causes pnpm to error (not warn) if Node or pnpm version requirements aren't met. Without it, `engines` is advisory only.

**Add a root-level `.npmrc` or a `scripts/hooker` helper note** that tells contributors to `cd frontend && pnpm install`, not `npm install`. Document in `docs/install.md`.

**Confidence:** HIGH — pnpm docs confirm `engine-strict` behavior and `packageManager` field semantics.

### 5.3 pnpm-workspace.yaml — Should You Add One?

No. Adding `pnpm-workspace.yaml` at the repo root would make pnpm treat the entire repo as a monorepo. The backend is Go and has no `package.json`. The frontend is self-contained. A workspace here would add `node_modules` hoisting behavior and `workspace:` protocol complexity with zero benefit.

The correct mental model: this is a Go project that happens to contain a `frontend/` directory. pnpm manages `frontend/` in isolation.

---

## Alternatives Considered

| Category | Recommended | Alternative Considered | Reason Not Chosen |
|----------|-------------|----------------------|-------------------|
| Structured logging | `log/slog` (stdlib) | zerolog, zap | No new deps; slog is in stdlib since Go 1.21; throughput irrelevant for local tool |
| Binary release | GoReleaser OSS | Manual `go build` + shell script | GoReleaser handles cross-compilation, checksums, and GitHub Release creation in 5 lines of YAML |
| E2E testing | Playwright | Cypress | Playwright is current community standard; Cypress is heavier and Node-based |
| Vulnerability scanning | govulncheck | Dependabot Go alerts | govulncheck is call-graph-aware; Dependabot fires on unreachable vulns |
| Panic recovery | Stdlib middleware | `go-chi/chi` middleware.Recoverer | No justification to add chi as a dependency just for one middleware function |
| Update mechanism | None (document manually) | go-selfupdate, equinox.io | Unnecessary complexity for a local tool at this stage |
| CI lint | golangci-lint-action@v9 | Running `golangci-lint` via `go install` | Official action handles caching and binary management better |

---

## Open Questions / Flags for Roadmap

1. **WriteTimeout vs SSE:** The SSE stream on `/api/events/stream` requires either `WriteTimeout: 0` or per-request deadline resetting via `http.ResponseController`. Needs a concrete implementation decision in Milestone 2. `WriteTimeout: 0` is acceptable for loopback-only; `ResponseController.SetWriteDeadline` is the correct production approach.

2. **govulncheck initial run:** Running govulncheck for the first time on an existing project often surfaces findings. Milestone 1 CI setup should use `continue-on-error: true` initially, review findings, then make it blocking.

3. **Playwright webServer timing:** The Playwright `webServer` config assumes the Go binary starts within its timeout window. The hooker server starts fast (no external infra), but the exact startup time should be validated before the CI job is finalized.

4. **`GITHUB_REPOSITORY_OWNER` in goreleaser.yaml:** The release workflow example uses an env var for owner. For a personal repo, hardcode the owner or let GoReleaser infer it from `GITHUB_TOKEN` context.

---

## Sources

- [Graceful Shutdown in Go: Practical Patterns — VictoriaMetrics](https://victoriametrics.com/blog/go-graceful-shutdown/)
- [Graceful Shutdowns with signal.NotifyContext — millhouse.dev](https://millhouse.dev/posts/graceful-shutdowns-in-golang-with-signal-notify-context)
- [log/slog — Go Packages (official)](https://pkg.go.dev/log/slog)
- [Structured Logging with slog — go.dev blog (official)](https://go.dev/blog/slog)
- [GoReleaser OSS — goreleaser.com](https://goreleaser.com/)
- [GoReleaser Checksums — goreleaser.com/customization/sign](https://goreleaser.com/customization/sign/)
- [GoReleaser Build Customization — goreleaser.com/customization/builds/builders/go](https://goreleaser.com/customization/builds/builders/go/)
- [golang/govulncheck-action — GitHub](https://github.com/golang/govulncheck-action)
- [Turn Dependabot Off — Filippo Valsorda](https://words.filippo.io/dependabot/)
- [golangci/golangci-lint-action — GitHub](https://github.com/golangci/golangci-lint-action)
- [Vitest Config — vitest.dev](https://vitest.dev/config/)
- [Testing Library Setup — testing-library.com](https://testing-library.com/docs/svelte-testing-library/setup/)
- [Playwright CI Setup — playwright.dev/docs/ci-intro](https://playwright.dev/docs/ci-intro)
- [pnpm Workspace — pnpm.io/workspaces](https://pnpm.io/workspaces)
- [pnpm package.json engines — pnpm.io/package_json](https://pnpm.io/package_json)
- [SHA Pinning GitHub Actions — stepsecurity.io](https://www.stepsecurity.io/blog/pinning-github-actions-for-enhanced-security-a-complete-guide)
- [Building and Testing Go — GitHub Docs](https://docs.github.com/en/actions/use-cases-and-examples/building-and-testing/building-and-testing-go)
