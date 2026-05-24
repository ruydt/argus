# Phase 1: Local Adoption Baseline - Research

**Researched:** 2026-05-24
**Domain:** CI/CD, release pipeline, diagnostics/health endpoints, install scripts, security middleware, frontend version display
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Idempotent append for agent hook configs — check if hooker's entry already exists; skip if present, append if not. Safe to re-run without clobbering existing hook entries.
- **D-02:** Doctor is report-only — print clear pass/fail with actionable fix instructions. Never modify system state. No auto-fix prompts.
- **D-03:** `setup` patches Claude Code and Codex hook configs only. Gemini CLI deferred.
- **D-04:** `setup` builds the binary as part of setup (`go build`). User runs setup once and gets a working installation.
- **D-05:** Version appears in the sidebar footer — small muted text, low-profile, always visible.
- **D-06:** Display format: `v0.1.0 (abc1234)` — version + short commit hash. No build date in the UI.
- **D-07:** Frontend fetches version at runtime via `GET /api/version`. Not baked in at Vite build time. Always reflects the running binary.
- **D-08:** Two workflows: `ci.yml` (every push/PR) + `release.yml` (on `v*` tags only).
- **D-09:** Ubuntu-latest only. GoReleaser cross-compiles darwin binaries from Linux — no macOS runner needed.
- **D-10:** `govulncheck` runs with `continue-on-error: true` — advisory only.
- **D-11:** Frontend build (`pnpm install && pnpm build`) is an explicit inline step in each workflow before `go build`. No Makefile indirection.
- **D-12:** Release binaries embed the pre-built frontend — single-file download.
- **D-13:** Build targets: `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64`. No Windows native binary.
- **D-14:** GitHub Releases only. No Homebrew tap yet.

### Claude's Discretion

- Script language for `./scripts/hooker`: pick bash/sh that maximizes compatibility across macOS and Linux without requiring additional runtime deps.
- Exact output formatting for `doctor` pass/fail report (symbols, colors, grouping of required vs optional checks).
- `golangci-lint` version pin strategy in CI.
- GoReleaser OSS v2 config specifics (archive format, checksum algorithm, changelog source).

### Deferred Ideas (OUT OF SCOPE)

- Homebrew tap — can add when project stabilizes (Phase 3 or later)
- Gemini CLI hook config patching — deferred from setup script scope
- Windows native binary — native Windows build deferred; WSL is primary path
- Makefile-based build orchestration — CI uses inline steps instead
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INSTALL-01 | `./scripts/hooker setup` installs dependencies and patches Claude Code/Codex hook config | Script already exists; needs hook-patching addition (D-01, D-03). Claude Code uses `~/.claude/settings.json` hooks dict; Codex uses `~/.codex/hooks.json` hooks dict. Both confirmed via live inspection. |
| INSTALL-02 | `./scripts/hooker doctor` checks Go/Node/DB writability/port/hook config with required vs optional separation | Script exists with basic checks; needs DIAG-06 (non-loopback warn), hook config presence checks, port check, DB writability check, and required vs optional output split. |
| INSTALL-03 | `docs/quickstart.md` leads to first hook event in under 10 minutes using `go build` (not `go run`) | Doc exists but uses `go run`. Needs `go build` instruction and references to `./scripts/hooker setup`. |
| INSTALL-04 | App emits resolved DB path on startup | Already logged: `log.Printf("db -> %s", cfg.DBPath)` in `main.go`. Needs verification against all startup paths. |
| INSTALL-05 | README short, detailed content in `docs/install.md`, `docs/quickstart.md`, `docs/hooks.md` | `docs/install.md`, `docs/quickstart.md`, `docs/hooks.md` exist. README content requires review for trimming. |
| INSTALL-06 | Explicit support matrix documented | `docs/install.md` has a support matrix table. Needs Node/pnpm minimum versions confirmed. |
| INSTALL-07 | pnpm enforced via `packageManager` field + `engine-strict=true` in `.npmrc` | `packageManager` set to `pnpm@10.23.0` in `package.json`. `.npmrc` does not exist yet — needs `engine-strict=true`. |
| CI-01 | Every push/PR: `go test ./...`, `go vet ./...`, `golangci-lint run ./...` | `.github/workflows/` does not exist. New `ci.yml` needed. golangci-lint config exists at `backend/.golangci.yml`. |
| CI-02 | Every push/PR: frontend typecheck, Vitest, Vite build | Same new `ci.yml`. Scripts: `pnpm run typecheck`, `pnpm run test`, `pnpm run build`. |
| CI-03 | `govulncheck` in CI with `continue-on-error: true` | Install via `go install golang.org/x/vuln/cmd/govulncheck@latest` in CI. |
| CI-04 | Go module cache keyed on `go.sum` | Cache key pattern: `go-${{ hashFiles('backend/go.sum') }}`. |
| CI-05 | pnpm pinned via `packageManager`; CI uses corepack | `packageManager` already set. CI step: `corepack enable && corepack prepare pnpm@10.23.0 --activate`. |
| CI-06 | Frontend build is declared dependency of Go binary build in release workflow | `before: hooks` in GoReleaser config runs `pnpm install --frozen-lockfile && pnpm run build` from the frontend directory before `go build`. |
| DIAG-01 | `GET /healthz` returns 200 when process is running | Not wired in router yet. Trivial inline handler — no dependencies. |
| DIAG-02 | `GET /readyz` returns 200 only when DB is open and migrations complete | Needs a ready flag on the SQLite repository set after `sqlite.New()` completes successfully. |
| DIAG-03 | `GET /api/version` returns app version, Git commit, and build date | Endpoint exists. Returns only `version`. Response struct needs `commit` and `buildDate` fields added. Version package has only `var Version = "0.0.0-dev"`. |
| DIAG-04 | App version visible in frontend UI | UI-SPEC approved. `VersionBadge` component fetches `/api/version` at runtime. `APP_VERSION` Vite-baked span in Sidebar header to be removed. `frontend/src/version.ts` to be deleted. |
| DIAG-05 | Startup emits actionable fatal errors for: port in use, DB not writable, migration failure, invalid config | `main.go` only has `log.Fatalf("open db: %v", err)`. Needs specific error detection: port bind check, DB writability pre-check, migration error. |
| DIAG-06 | `doctor` warns on non-loopback bind address | `doctor` function needs to check `ADDR` env var and warn if non-loopback. |
| DATA-01 | DB file location and override documented; WAL behavior explained | `docs/install.md` covers location and `DB_PATH` override. WAL file note missing. |
| DATA-02 | Backup instructions documented | Missing from current docs. Add to `docs/install.md`. |
| DATA-03 | Reset/cleanup instructions documented | Missing from current docs. Add to `docs/install.md`. |
| DATA-06 | Manual prune/cleanup command or script documented | Missing. Can be `sqlite3 hooker.db "DELETE FROM events WHERE ..."` or a future subcommand. Document the manual SQL path for now. |
| DATA-07 | Privacy warning documented | `docs/install.md` has a partial warning. Needs explicit list of captured data categories. |
| SEC-01 | Host header validation middleware rejects non-localhost hosts | `middleware.go` has only CORS and logging. New middleware function needed: check `r.Host` against allowlist `["localhost", "127.0.0.1", "[::1]"]`. Live DNS rebinding bug — must ship. |
| REL-01 | GoReleaser OSS v2 configured with linux/darwin × amd64/arm64 and checksums.txt | `.goreleaser.yaml` does not exist. New config needed. |
| REL-02 | Release workflow on `v*` tags only; CI on every push/PR | Two separate workflow files. |
| REL-03 | Squash-merge enforced in GitHub settings | Manual repo settings change — not a code task. Document as a manual step in release runbook. |
| REL-04 | Conventional commits recommended; GoReleaser changelog auto-generated | GoReleaser `changelog.use: github` or `git`. Document commit convention in `CONTRIBUTING.md` or release runbook. |
| REL-05 | App version injected at build time via ldflags | GoReleaser injects `main.version`, `main.commit`, `main.date` via ldflags. `version` package needs `Commit` and `BuildDate` vars added alongside `Version`. |
</phase_requirements>

---

## Summary

Phase 1 is exclusively about installability, trust, and release infrastructure — no new product features. The codebase is more built-out than a fresh project: `GET /api/version` already exists, `./scripts/hooker` has setup and doctor subcommands, and docs are partially written. The gap is in correctness and completeness of each piece.

The highest-priority items are SEC-01 (DNS rebinding fix, live bug), CI establishment (`.github/workflows/` directory does not exist at all), and GoReleaser configuration (no `.goreleaser.yaml`). These three are entirely new files. The remaining work is incremental surgery on existing files.

The version pipeline has a mismatch: the frontend currently uses a Vite-baked constant (`__HOOKER_VERSION__` from a `VERSION` file) while DIAG-03/D-07 require runtime fetch. The backend `version` package has only `var Version = "0.0.0-dev"` with no commit or build date vars — those need adding before ldflags injection works. The `/api/version` handler returns only `{"version": "..."}` and needs `commit` and `buildDate` fields.

The hook config patching in `setup` is the trickiest moving part: Claude Code uses `~/.claude/settings.json` (a JSON dict with hooks as arrays of objects), and Codex uses `~/.codex/hooks.json` (same schema). Both are live on this machine and can be inspected for idempotency logic design. The D-01 requirement (check before appending) is critical — both configs already contain hooker entries, so the script must not duplicate them.

**Primary recommendation:** Work in this order: (1) SEC-01 middleware, (2) backend version vars + `/api/version` response, (3) CI workflows, (4) GoReleaser config, (5) `setup`/`doctor` script extensions, (6) health endpoints, (7) frontend `VersionBadge`, (8) docs/pnpm enforcement.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Host header validation (SEC-01) | API / Backend (middleware) | — | DNS rebinding is a server-side attack; must be stopped before reaching any handler |
| `/healthz` / `/readyz` | API / Backend (handler) | — | Process and DB readiness are backend-owned state |
| `/api/version` commit+date fields | API / Backend (handler + version pkg) | — | Version is injected at binary build time, not frontend build time |
| Version display in UI (DIAG-04) | Browser / Client (React component) | API/Backend (data source) | D-07 locks this: frontend fetches from running binary, not baked at Vite time |
| CI workflow (push/PR gate) | CDN / Static (GitHub Actions) | — | Runs in hosted CI environment |
| Release pipeline (GoReleaser) | CDN / Static (GitHub Actions + GoReleaser) | — | Cross-compilation and artifact production |
| pnpm enforcement (.npmrc) | Frontend Server (build tooling) | — | Lockfile / packageManager enforcement at install time |
| ldflags version injection (REL-05) | API / Backend (binary build) | — | `go build -ldflags` writes into the binary at compile time |
| Setup/doctor script | — (shell, outside tiers) | — | Runs on developer machine, not in any runtime tier |
| Docs (DATA-01–07, INSTALL-03–06) | — (static files) | — | No runtime tier — markdown in `docs/` |

---

## Standard Stack

### Core (already in use — verified against codebase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Go stdlib `net/http` | Go 1.25.0 | HTTP server, middleware | Already the entire backend HTTP layer |
| `modernc.org/sqlite` | v1.50.0 | SQLite persistence | Already in use; no CGO required |
| GitHub Actions | current | CI/CD | Zero additional infra for GitHub-hosted repos |
| GoReleaser OSS | v2 | Binary release automation | Standard Go release tool; generates checksums, cross-compiles, publishes GitHub Releases |
| golangci-lint | v1.x (pin in CI) | Static analysis | `backend/.golangci.yml` already configured |
| govulncheck | latest | Vulnerability scanning | Zero-dep install via `go install` |
| pnpm | 10.23.0 | Frontend package manager | Already pinned in `packageManager` field |
| Vitest | 4.1.5 | Frontend unit tests | Already in use |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `goreleaser/goreleaser-action` | `~> v2` | GoReleaser in GitHub Actions | Release workflow only |
| `actions/setup-go` | v5 | Go toolchain in CI | Both ci.yml and release.yml |
| `actions/setup-node` | v4 | Node.js in CI | Both ci.yml and release.yml |
| `actions/cache` | v4 | Go module cache | ci.yml for faster builds |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GoReleaser | `gh release create` + manual cross-compile | GoReleaser handles checksums, archive naming, changelog, and embed ordering automatically — no hand-rolling |
| corepack for pnpm in CI | `npm install -g pnpm` | corepack is the CI-05 requirement; respects `packageManager` pin |
| Host header middleware | IP binding only | Loopback bind (`127.0.0.1`) is not sufficient against DNS rebinding; explicit Host header check is required |

**Installation (CI — not local):**
```bash
# Go tools in CI
go install golang.org/x/vuln/cmd/govulncheck@latest
# GoReleaser via action (no local install needed)
uses: goreleaser/goreleaser-action@v6
  with:
    version: "~> v2"
```

**Version verification:** [VERIFIED: npm registry / codebase]
- pnpm 10.23.0 — confirmed in `frontend/package.json` `packageManager` field
- GoReleaser v2 — confirmed via Context7 docs (latest stable series is v2)
- `goreleaser/goreleaser-action@v6` — confirmed via Context7 as the current action version for GoReleaser v2

---

## Architecture Patterns

### System Architecture Diagram

```
Developer machine
  └── ./scripts/hooker setup
        ├── go mod download
        ├── pnpm install --frozen-lockfile
        ├── go build -o hooker ./cmd/server   (new: D-04)
        ├── patch ~/.claude/settings.json     (new: D-01/D-03)
        └── patch ~/.codex/hooks.json         (new: D-01/D-03)

  └── ./scripts/hooker doctor
        ├── [REQUIRED] go version >= 1.25.0
        ├── [REQUIRED] node version >= 18
        ├── [REQUIRED] pnpm present
        ├── [REQUIRED] DB path writable
        ├── [REQUIRED] port 8765 available (or service running)
        ├── [OPTIONAL] Claude Code hook config present
        ├── [OPTIONAL] Codex hook config present
        └── [OPTIONAL] ADDR is loopback (warns if not)

GitHub Actions (ci.yml — every push/PR)
  ├── pnpm install && pnpm build         (frontend dist/ produced)
  ├── go build ./...                     (verifies embed works)
  ├── go test ./...
  ├── go vet ./...
  ├── golangci-lint run ./...
  ├── govulncheck ./... (continue-on-error)
  ├── pnpm run typecheck
  ├── pnpm run test
  └── pnpm run build

GitHub Actions (release.yml — v* tags)
  └── goreleaser/goreleaser-action@v6
        ├── before.hooks: pnpm install && pnpm build
        ├── go build linux/amd64, linux/arm64, darwin/amd64, darwin/arm64
        │     ldflags: -X hooker/internal/version.Version={{.Version}}
        │               -X hooker/internal/version.Commit={{.Commit}}
        │               -X hooker/internal/version.BuildDate={{.Date}}
        ├── archives: hooker_VERSION_OS_ARCH.tar.gz
        ├── checksums.txt
        └── GitHub Release created

HTTP request path (runtime)
  Browser / curl
    → Go net/http listener (127.0.0.1:8765)
        → hostHeader middleware (new: SEC-01)   rejects non-localhost Host
        → cors middleware (existing)
        → logging middleware (existing)
        → mux.ServeHTTP
            GET /healthz   → 200 always (new: DIAG-01)
            GET /readyz    → 200 after DB ready (new: DIAG-02)
            GET /api/version → {version, commit, buildDate} (extend: DIAG-03)
            POST /api/hook → Hook handler (existing)
            ...
```

### Recommended Project Structure Changes

```
hooker/
├── .github/
│   └── workflows/
│       ├── ci.yml           # NEW — push/PR gate
│       └── release.yml      # NEW — v* tag release
├── .goreleaser.yaml          # NEW
├── frontend/
│   └── .npmrc               # NEW — engine-strict=true
├── backend/
│   └── internal/
│       ├── version/
│       │   └── version.go   # EXTEND — add Commit, BuildDate vars
│       ├── handler/
│       │   ├── version.go   # EXTEND — add commit, buildDate to response
│       │   └── health.go    # NEW — /healthz and /readyz handlers
│       └── server/
│           └── middleware.go # EXTEND — add hostHeader middleware
└── scripts/
    └── hooker               # EXTEND — add hook patching, build step, fuller doctor
```

### Pattern 1: Host Header Validation Middleware (SEC-01)

**What:** Reject requests where the Host header is not in an explicit localhost allowlist.
**When to use:** Apply in the middleware chain before CORS, to all routes.

```go
// Source: standard Go net/http pattern; see backend/internal/server/middleware.go
func hostHeader(next http.Handler) http.Handler {
    allowed := map[string]bool{
        "localhost":        true,
        "127.0.0.1":        true,
        "[::1]":            true,
    }
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        host := r.Host
        // Strip port from host (e.g., "localhost:8765" → "localhost")
        if h, _, err := net.SplitHostPort(host); err == nil {
            host = h
        }
        if !allowed[host] {
            http.Error(w, "forbidden", http.StatusForbidden)
            return
        }
        next.ServeHTTP(w, r)
    })
}
// Wire order in NewRouter: hostHeader(cors(logging(mux)))
```

**Critical:** The `ADDR` config allows the user to bind to non-loopback. If they do, the Host header middleware still protects against DNS rebinding by rejecting requests with non-localhost Host headers. That is the correct behavior. The middleware should not be bypassed when `ADDR` is non-loopback — warn in logs but keep the restriction. [ASSUMED: the correct product behavior is to keep Host restriction even on non-loopback bind — confirm with user if the non-loopback use case is legitimate]

### Pattern 2: Version Variables + ldflags Injection (REL-05, DIAG-03)

**What:** Three package-level vars in `internal/version/version.go` set by GoReleaser ldflags.
**When to use:** Everywhere version metadata is needed (startup log, `/api/version` response).

```go
// Source: goreleaser.com/resources/cookbooks/using-main.version
// File: backend/internal/version/version.go
package version

var (
    Version   = "0.0.0-dev"
    Commit    = "none"
    BuildDate = "unknown"
)
```

GoReleaser `.goreleaser.yaml` ldflags:
```yaml
# Source: goreleaser.com/customization/builds/builders/go
ldflags:
  - -s -w
  - -X hooker/internal/version.Version={{.Version}}
  - -X hooker/internal/version.Commit={{.Commit}}
  - -X hooker/internal/version.BuildDate={{.Date}}
```

### Pattern 3: GoReleaser v2 Config for Embedded Frontend (D-12, REL-01)

**What:** `before.hooks` builds the frontend first; the Go binary embeds `dist/` via existing `//go:embed`. GoReleaser then cross-compiles.
**When to use:** Release workflow only.

```yaml
# Source: goreleaser.com/customization/general/hooks [VERIFIED: Context7]
# Source: goreleaser.com/blog/reproducible-builds [VERIFIED: Context7]
version: 2

before:
  hooks:
    - bash -c "cd frontend && pnpm install --frozen-lockfile && pnpm run build"

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
    goarch:
      - amd64
      - arm64
    flags:
      - -trimpath
    ldflags:
      - -s -w
      - -X hooker/internal/version.Version={{.Version}}
      - -X hooker/internal/version.Commit={{.Commit}}
      - -X hooker/internal/version.BuildDate={{.Date}}

archives:
  - id: default
    name_template: "hooker_{{ .Version }}_{{ .Os }}_{{ .Arch }}"
    format: tar.gz

checksum:
  name_template: "checksums.txt"

changelog:
  use: github
  sort: asc
  filters:
    exclude:
      - "^docs:"
      - "^test:"
      - "^ci:"
```

**Important:** GoReleaser requires `dist/` to be empty when it starts. The `before.hooks` pnpm build writes to `frontend/dist/`, not GoReleaser's `dist/` output directory. The Go `//go:embed dist/*` in `backend/internal/ui/ui.go` embeds `frontend/dist/` relative to the Go source file, not GoReleaser's dist. These are distinct paths — no conflict. [VERIFIED: codebase inspection of `backend/internal/ui/ui.go`]

### Pattern 4: readyz — DB Ready Flag

**What:** SQLite repository sets an atomic bool after `Migrate()` succeeds. `/readyz` handler reads this flag.
**When to use:** Kubernetes/script health checks that need DB-ready confirmation.

```go
// backend/internal/repository/sqlite/sqlite.go
type DB struct {
    db    *sql.DB
    ready atomic.Bool
}
func New(path string) (*DB, error) {
    // ... open db ...
    if err := d.migrate(); err != nil {
        return nil, fmt.Errorf("migrate: %w", err)
    }
    d.ready.Store(true)
    return d, nil
}
func (d *DB) Ready() bool { return d.ready.Load() }

// backend/internal/handler/health.go
func Healthz() http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    })
}
func Readyz(repo interface{ Ready() bool }) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if !repo.Ready() {
            http.Error(w, "not ready", http.StatusServiceUnavailable)
            return
        }
        w.WriteHeader(http.StatusOK)
    })
}
```

The `Ready()` method needs to be added to the `EventRepository` interface in `backend/internal/repository/repository.go`, or handled as a concrete type — because `server.NewRouter` receives `*service.EventService`, not the repo directly. The simplest path: pass `repo.Ready()` result into the service or expose it via a separate function parameter in `NewRouter`. [ASSUMED: simplest wiring is a `readyFunc func() bool` parameter to NewRouter or a Ready method on EventService that delegates to repo]

### Pattern 5: Idempotent Hook Config Patching (INSTALL-01, D-01)

**What:** Bash function that checks for hooker's curl command before appending. Uses `python3 -c` for JSON manipulation (universally available on macOS/Linux without extra deps).
**When to use:** `setup` subcommand only.

**Claude Code hook structure** (confirmed via live inspection of `~/.claude/settings.json`):
```json
{
  "hooks": {
    "PreToolUse": [{ "matcher": ".*", "hooks": [{ "type": "command", "command": "curl ..." }] }],
    "PostToolUse": [...],
    "SessionStart": [...],
    ...
  }
}
```

**Codex hook structure** (confirmed via live inspection of `~/.codex/hooks.json`):
```json
{
  "hooks": {
    "SessionStart": [{ "matcher": "...", "hooks": [{ "type": "command", "command": "curl ..." }] }],
    "PreToolUse": [...]
  }
}
```

Both files use the same schema. The idempotency check: grep for `127.0.0.1:8765/api/hook` in the existing file. If found, print "already configured, skipping." If not found, use `python3` to parse and append the entry.

**Hook events to patch for Claude Code:** `PreToolUse`, `PostToolUse`, `SessionStart`, `SessionEnd`, `Stop` — sufficient to capture all agent activity without over-configuring.

**Hook events to patch for Codex:** `SessionStart`, `PreToolUse` — matches the existing Codex config pattern seen in the wild.

### Anti-Patterns to Avoid

- **Inline version in Sidebar header (existing):** `APP_VERSION` from Vite define-time constant violates D-07. The existing `version.ts` file and import in `Sidebar.tsx` line 199 must be removed entirely.
- **`go run` in quickstart:** The existing `docs/quickstart.md` uses `go run ./cmd/server/main.go`. This must become `go build -o hooker ./cmd/server && ./hooker` to satisfy INSTALL-03.
- **`set -e` alone in setup script:** The existing `scripts/hooker` uses `set -euo pipefail` which is correct. Do not weaken to `set -e` only.
- **GoReleaser `--rm-dist` flag:** The v2 equivalent is `--clean`. The docs show `--rm-dist` in older examples — use `--clean` for GoReleaser v2. [VERIFIED: Context7 GoReleaser docs showing `args: release --clean`]
- **Patching hook configs without a backup:** Write a backup before modifying any hook config file (e.g., `cp ~/.claude/settings.json ~/.claude/settings.json.bak.pre-hooker`).
- **Running `go test ./...` during `doctor`:** The existing doctor runs tests. Tests should not be part of a "report-only" doctor (D-02 says never modify system state, running tests could have side effects and is slow). Consider whether test-running belongs in doctor or a separate `verify` subcommand.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-platform Go binary releases | Custom build matrix + upload scripts | GoReleaser OSS v2 | Handles checksums, archive naming, GitHub Release creation, changelog, and before-hooks ordering |
| JSON manipulation in bash | `sed`/`awk` on JSON | `python3 -c "import json; ..."` | `python3` is universally available on macOS and Linux; `sed` on JSON is fragile |
| DNS rebinding protection | Firewall rules / IP checks | Host header validation middleware | Standard defense; IP-only protection is insufficient when the attacker controls DNS |
| Vulnerability scanning | grep on go.sum | `govulncheck` | CVE database aware, understands call graphs, zero false-positive rate on unused code |
| pnpm version enforcement | `engines` field + manual CI check | `packageManager` + `.npmrc engine-strict=true` + corepack | Enforced at install time, not just advisory |

**Key insight:** GoReleaser's `before.hooks` pattern eliminates the need for any custom orchestration between frontend build and go build — the ordering is declarative and reproducible.

---

## Common Pitfalls

### Pitfall 1: GoReleaser dist/ Collision

**What goes wrong:** Running GoReleaser when `dist/` exists at the repo root (GoReleaser's output dir). Build fails with "dist is not empty."
**Why it happens:** GoReleaser requires a clean `dist/` directory. If a previous run left artifacts, it fails.
**How to avoid:** Always run `goreleaser release --clean` (not `--skip-clean`). The `--clean` flag removes GoReleaser's own `dist/` before starting. This does NOT affect `frontend/dist/` — they are different directories.
**Warning signs:** CI fails on "dist is not empty" error. [VERIFIED: Context7 GoReleaser docs]

### Pitfall 2: ldflags Package Path Must Match Module Path

**What goes wrong:** `var Version` is in package `hooker/internal/version`. The ldflag must be `-X hooker/internal/version.Version={{.Version}}` — not `-X main.version`. Using `main.version` silently does nothing because the var is not in `package main`.
**Why it happens:** GoReleaser docs show `main.version` in examples where the var lives in `package main`. This project put vars in a dedicated `version` package.
**How to avoid:** Match the ldflag path to the actual package import path. [VERIFIED: codebase — `backend/internal/version/version.go` is `package version` in module `hooker`]

### Pitfall 3: Claude Code Hook Config Location Varies

**What goes wrong:** Setup script hardcodes `~/.claude/settings.json` but some Claude Code installations use a project-local config.
**Why it happens:** Claude Code supports both global (`~/.claude/settings.json`) and project-local (`.claude/settings.json`) hook configs.
**How to avoid:** Patch the global config only (`~/.claude/settings.json`). Document that project-local configs are out of scope for the setup script. [VERIFIED: live inspection of `~/.claude/settings.json` confirming it is the active global config on this machine]

### Pitfall 4: readyz Returning 200 Before Migrations Complete

**What goes wrong:** If `ready` flag is set before `migrate()` returns, or if the flag is checked too early, `/readyz` returns 200 while migrations are still running.
**Why it happens:** Race condition or incorrect ordering in `sqlite.New()`.
**How to avoid:** Set `d.ready.Store(true)` as the absolute last line of `New()`, after migrate succeeds. Use `atomic.Bool` (Go 1.19+) — available in Go 1.25.0. [VERIFIED: Go stdlib — `sync/atomic.Bool` added in Go 1.19]

### Pitfall 5: doctor Running Tests (Side Effect in Report-Only Mode)

**What goes wrong:** The existing `doctor` function runs `go test ./...`. This takes ~10-30 seconds and can modify `.cache/go-build`. D-02 says doctor is report-only and must never modify system state.
**Why it happens:** The original doctor was designed before the D-02 constraint was locked.
**How to avoid:** Remove `go test ./...` from `doctor`. Keep it in `setup` or document it as a separate step. Doctor should only check — not run tests.

### Pitfall 6: pnpm engine-strict Without engines Field

**What goes wrong:** `.npmrc engine-strict=true` enforces the `engines` field. If `package.json` has no `engines` field, `engine-strict` has no effect.
**Why it happens:** `frontend/package.json` currently has `packageManager` but no `engines` field.
**How to avoid:** Add `"engines": { "node": ">=18", "pnpm": ">=10" }` to `package.json` alongside `.npmrc engine-strict=true`. [VERIFIED: codebase — `package.json` has no `engines` field]

### Pitfall 7: Host Header Middleware Blocking Non-Browser Clients

**What goes wrong:** Some HTTP clients (curl without `-H Host:`) send an empty or IP-only Host header. The middleware rejects these, breaking `curl http://127.0.0.1:8765/api/version` (which sends `Host: 127.0.0.1:8765`).
**Why it happens:** The allowed list check strips port before comparing. `127.0.0.1` must be in the allowlist (not just `localhost`).
**How to avoid:** Allowlist must include `localhost`, `127.0.0.1`, and `[::1]`. After stripping port: `"127.0.0.1"` matches when curl sends `Host: 127.0.0.1:8765`. [VERIFIED: SEC-01 requirement text lists exactly these three]

---

## Code Examples

### /api/version Extended Response

```go
// Source: backend/internal/handler/version.go (extend existing)
// Source: goreleaser.com/resources/cookbooks/using-main.version
func Version() http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        _ = json.NewEncoder(w).Encode(struct {
            Version   string `json:"version"`
            Commit    string `json:"commit"`
            BuildDate string `json:"buildDate"`
        }{
            Version:   version.Version,
            Commit:    version.Commit,
            BuildDate: version.BuildDate,
        })
    })
}
```

### Frontend useVersion Hook (D-07)

```tsx
// Source: existing pattern in frontend hooks (useEvents, useDashboardStats)
// File: frontend/src/features/version/useVersion.ts (or inline in VersionBadge)
import { useEffect, useState } from 'react'

type VersionInfo = { version: string; commit: string; buildDate: string } | null

export function useVersion(): VersionInfo {
  const [info, setInfo] = useState<VersionInfo>(null)
  useEffect(() => {
    fetch('/api/version')
      .then((r) => r.json())
      .then((d) => setInfo(d))
      .catch(() => {}) // silent on error — badge just doesn't render
  }, [])
  return info
}
```

### VersionBadge Component (D-05, D-06, DIAG-04, UI-SPEC approved)

```tsx
// Source: 01-UI-SPEC.md (approved by gsd-ui-checker 2026-05-24)
// Placement: Sidebar footer, hidden when collapsed
export function VersionBadge() {
  const info = useVersion()
  if (!info) return null
  const short = info.commit !== 'none' ? info.commit.slice(0, 7) : null
  const label = short ? `v${info.version} (${short})` : `v${info.version}`
  return (
    <span
      className="text-[0.66rem] font-medium text-[#444]"
      aria-label={`Application version: ${label}`}
    >
      {label}
    </span>
  )
}
```

### CI Workflow Pattern (ci.yml)

```yaml
# Source: GitHub Actions docs [CITED: docs.github.com/en/actions]
# Source: Context7 GoReleaser — corepack + pnpm pattern
name: CI
on:
  push:
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version-file: backend/go.mod
          cache-dependency-path: backend/go.sum
      - name: Build (verify embed compiles)
        working-directory: frontend
        run: |
          corepack enable
          corepack prepare pnpm@10.23.0 --activate
          pnpm install --frozen-lockfile
          pnpm run build
      - run: go build ./...
        working-directory: backend
      - run: go test ./...
        working-directory: backend
      - run: go vet ./...
        working-directory: backend
      - name: govulncheck
        working-directory: backend
        run: |
          go install golang.org/x/vuln/cmd/govulncheck@latest
          govulncheck ./...
        continue-on-error: true
      - name: golangci-lint
        uses: golangci/golangci-lint-action@v6
        with:
          working-directory: backend
          version: v1.64  # pin explicitly

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: corepack enable && corepack prepare pnpm@10.23.0 --activate
      - run: pnpm install --frozen-lockfile
        working-directory: frontend
      - run: pnpm run typecheck
        working-directory: frontend
      - run: pnpm run test -- --run
        working-directory: frontend
      - run: pnpm run build
        working-directory: frontend
```

### Idempotent Hook Config Patch (Bash)

```bash
# Source: live inspection of ~/.claude/settings.json and ~/.codex/hooks.json
HOOKER_CMD="curl -s --max-time 2 -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @- || true"

patch_claudecode_hooks() {
  local settings="$HOME/.claude/settings.json"
  if [ ! -f "$settings" ]; then
    printf 'Claude Code settings.json not found at %s — skipping\n' "$settings"
    return
  fi
  if grep -q "8765/api/hook" "$settings"; then
    printf 'Claude Code hooks already configured — skipping\n'
    return
  fi
  cp "$settings" "${settings}.bak.pre-hooker"
  python3 - "$settings" "$HOOKER_CMD" <<'PYEOF'
import sys, json, copy
path, cmd = sys.argv[1], sys.argv[2]
with open(path) as f:
    d = json.load(f)
hooks = d.setdefault('hooks', {})
entry = {'hooks': [{'type': 'command', 'command': cmd}]}
for event in ['PreToolUse', 'PostToolUse', 'SessionStart', 'SessionEnd', 'Stop']:
    hooks.setdefault(event, []).append(entry)
with open(path, 'w') as f:
    json.dump(d, f, indent=2)
PYEOF
  printf 'Claude Code hooks configured\n'
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `goreleaser release --rm-dist` | `goreleaser release --clean` | GoReleaser v2 | `--rm-dist` is deprecated in v2; use `--clean` |
| GoReleaser action v4 | `goreleaser/goreleaser-action@v6` | 2024 | v6 is the current action for GoReleaser v2 |
| `npm install -g pnpm` in CI | `corepack enable && corepack prepare pnpm@VERSION --activate` | Node.js 16.9+ | corepack is built into Node; respects `packageManager` field |
| Separate health + ready check | `/healthz` (process alive) + `/readyz` (DB ready) | Kubernetes standard | Split allows load balancers to wait for DB without killing the process |
| `var Version = "dev"` in `package main` | Dedicated `internal/version` package with Version/Commit/BuildDate | Best practice for import-able version | Allows version to be imported by handler and service without circular imports |

**Deprecated/outdated in this codebase:**
- `frontend/src/version.ts` with `__HOOKER_VERSION__`: Vite-baked version. Replaced by runtime fetch per D-07. File to be deleted.
- `go run ./cmd/server/main.go` in quickstart: Replaced by `go build` per INSTALL-03/D-04.
- `scripts/hooker doctor` running `go test ./...`: Remove per D-02 (report-only).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Host header middleware should reject requests even when ADDR is non-loopback | Architecture Patterns (Pattern 1) | If non-loopback ADDR is a legitimate use case that also needs non-localhost Host headers (e.g., LAN access by IP), the middleware would break that use case. Confirm whether SEC-01 should be configurable. |
| A2 | Simplest readyz wiring is a `readyFunc func() bool` parameter to NewRouter or a Ready() method on EventService | Architecture Patterns (Pattern 4) | If EventService does not hold a reference to the repo, wiring is more invasive. Check actual EventService struct — it receives the repo in `service.New(repo)`. |
| A3 | `doctor` running `go test ./...` should be removed (not just flagged) | Common Pitfalls (Pitfall 5) | If the user expects doctor to run tests (despite D-02), removing this would break their workflow. Confirm. |
| A4 | Hook events to patch for Claude Code: PreToolUse, PostToolUse, SessionStart, SessionEnd, Stop | Architecture Patterns (Pattern 5) | The current production config on this machine patches all 20+ hook events. Patching only 5 in `setup` produces a less complete event stream. Could document full-config as opt-in. |
| A5 | golangci-lint version pinned to v1.64 in CI | Code Examples (CI workflow) | Version number is approximate — verify current stable release at time of CI authoring. [ASSUMED from training data] |

---

## Open Questions

1. **Host header restriction vs non-loopback ADDR**
   - What we know: SEC-01 says reject non-localhost Host headers. D-09 says no macOS runner needed (Linux cross-compiles). CONFIG says ADDR can be overridden.
   - What's unclear: If a user sets `ADDR=0.0.0.0:8765` for LAN use, can they reach the server via its LAN IP? Currently the Host header middleware would block `Host: 192.168.1.5:8765`.
   - Recommendation: Ship the strict allowlist per SEC-01. Document in startup warning that Host header restriction is intentional. Let Phase 3 address configurable allowlist if needed.

2. **Vitest run flag in CI**
   - What we know: `pnpm run test` launches Vitest in watch mode. CI needs `--run` flag.
   - What's unclear: Whether the `test` script in `package.json` should be changed to default to `--run`, or if CI should pass `-- --run`.
   - Recommendation: CI passes `-- --run`. Do not change package.json default for local dev ergonomics.

3. **REL-03 manual step documentation**
   - What we know: Squash-merge enforcement is a GitHub repo settings change (not code).
   - What's unclear: Where to document this — README, CONTRIBUTING.md, or a release runbook.
   - Recommendation: Add a `docs/releasing.md` with the manual steps checklist (squash-merge setting, tag format, release notes).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Go | Backend build, CI | ✓ | 1.25.0 | — |
| Node.js | Frontend build | ✓ (local) | detected | — |
| pnpm | Frontend deps | ✓ (local) | 10.23.0 | corepack in CI |
| goreleaser | Release pipeline | ✗ (local) | — | GitHub Actions goreleaser-action (no local install needed) |
| govulncheck | CI vuln scan | ✗ (local) | — | Installed via `go install` in CI — no local install required |
| golangci-lint | Backend lint | ✗ (local) | — | Installed via golangci/golangci-lint-action@v6 in CI |
| python3 | Hook config patching | ✓ (macOS/Linux) | 3.x | Shell fallback: `node -e` if python3 absent (unlikely) |
| curl | Hook delivery, doctor check | ✓ | system | — |
| GitHub Actions | CI/CD | ✓ (cloud) | — | — |

**Missing dependencies with no fallback:** None that block development. goreleaser and golangci-lint are CI-only.

**Missing dependencies with fallback:** goreleaser runs only in GitHub Actions — no local install needed for Phase 1 work.

---

## Validation Architecture

> `nyquist_validation` is `false` in `.planning/config.json` — this section is omitted.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Out of scope for localhost-only Phase 1 |
| V3 Session Management | no | Out of scope |
| V4 Access Control | partial | Host header middleware (SEC-01) is the access control for DNS rebinding |
| V5 Input Validation | yes (existing) | Hook handler validates JSON body; no new input surfaces in Phase 1 |
| V6 Cryptography | no | No cryptography in Phase 1 scope |

### Known Threat Patterns for localhost HTTP

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| DNS rebinding attack | Spoofing | Host header validation — reject requests where Host is not localhost/127.0.0.1/[::1] |
| Wildcard CORS abuse | Elevation of Privilege | Current: `Access-Control-Allow-Origin: *`. SEC-01 Host header check mitigates the primary DNS rebinding vector. SEC-02 (CORS restriction) is Phase 3. |
| Unauthenticated ingestion via local network | Spoofing/Tampering | Default loopback bind (`127.0.0.1`) prevents LAN access. Non-loopback requires explicit env var opt-in. |

**SEC-01 is the only security item in Phase 1 scope.** It is a live DNS rebinding bug and must ship before any public documentation goes out. [VERIFIED: STATE.md, CONCERNS.md]

---

## Sources

### Primary (HIGH confidence)
- Codebase inspection (`backend/internal/version/version.go`, `backend/internal/server/middleware.go`, `backend/internal/handler/version.go`, `backend/cmd/server/main.go`, `scripts/hooker`, `frontend/src/app/Sidebar.tsx`, `frontend/src/version.ts`, `frontend/vite.config.ts`, `frontend/package.json`) — [VERIFIED: direct file reads]
- Live hook config inspection (`~/.claude/settings.json`, `~/.codex/hooks.json`) — [VERIFIED: direct reads + grep]
- `.planning/phases/01-local-adoption-baseline/01-CONTEXT.md` — locked decisions D-01 through D-14
- `.planning/phases/01-local-adoption-baseline/01-UI-SPEC.md` — approved UI design contract
- Context7 `/websites/goreleaser` — GoReleaser v2 build config, ldflags, before hooks, GitHub Actions workflow, checksum config, `--clean` flag
- Go stdlib `sync/atomic.Bool` — Go 1.19+, confirmed available in Go 1.25.0

### Secondary (MEDIUM confidence)
- `.planning/codebase/CONCERNS.md` — confirmed SEC-01 DNS rebinding bug context
- `.planning/REQUIREMENTS.md` — full requirement text for all Phase 1 IDs
- `docs/install.md`, `docs/quickstart.md` — existing doc state confirmed

### Tertiary (LOW confidence)
- golangci-lint v1.64 version number in CI example — training-data estimate; verify against current release at implementation time [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified against codebase and Context7
- Architecture: HIGH — patterns verified against existing code and GoReleaser docs
- Pitfalls: HIGH — most verified by direct codebase inspection; one ASSUMED (golangci-lint version)
- Hook config patching: HIGH — live config structures inspected on this machine

**Research date:** 2026-05-24
**Valid until:** 2026-06-24 (GoReleaser and GitHub Actions action versions may update; verify at implementation time)
