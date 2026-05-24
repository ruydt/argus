---
phase: 01-local-adoption-baseline
verified: 2026-05-24T11:46:41Z
status: human_needed
score: 4/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Run full onboarding from clean machine: `./scripts/hooker setup` then `./scripts/hooker doctor` and capture first hook event via docs/quickstart.md in under 10 minutes."
    expected: "User completes first-event flow within 10 minutes with clear pass/fail doctor output."
    why_human: "Time-to-complete and real first-event capture depend on manual environment and user actions."
  - test: "Verify GitHub repo setting enforces squash-merge-only (REL-03) and that an actual push/PR run passes both CI jobs in GitHub Actions."
    expected: "Repo settings match release prerequisites; CI green on real GitHub runner."
    why_human: "GitHub repository settings and hosted runner execution are external to local codebase."
  - test: "Validate startup fatal messaging quality for migration-failure path by intentionally causing a migration error in a disposable DB and reviewing operator clarity."
    expected: "Fatal output clearly identifies migration/state issue and actionable next step."
    why_human: "Behavioral clarity judgment is operator-facing and requires induced runtime failure."
---

# Phase 1: Local Adoption Baseline Verification Report

**Phase Goal:** A new user can install hooker from source in under 10 minutes, run `doctor` to verify their setup, trust the app is secure, and find versioned releases with checksums  
**Verified:** 2026-05-24T11:46:41Z  
**Status:** human_needed  
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | User can run `./scripts/hooker setup` then `./scripts/hooker doctor` with clear pass/fail checks for Go, Node, DB writability, port availability, and hook config presence | ✓ VERIFIED | `scripts/hooker` implements `setup` and `doctor` with required/optional sections; `doctor` output shows all required categories and optional hook checks. |
| 2 | User can follow `docs/quickstart.md` and capture first hook event in under 10 minutes using `go build` (not `go run`) | ? UNCERTAIN | `docs/quickstart.md` uses `go build -o hooker ./cmd/server` and first-event steps; 10-minute completion and first-event success require human run-through. |
| 3 | App version, commit, build date visible in startup logs, `/api/version`, and frontend UI | ✓ VERIFIED | `backend/internal/version/version.go`, `backend/internal/handler/version.go`, `backend/cmd/server/main.go`, `frontend/src/features/version/*`, `frontend/src/app/Sidebar.tsx` wire runtime version path and UI badge. |
| 4 | `/healthz` returns 200 immediately; `/readyz` returns 200 only after DB+migrations; startup has actionable fatal errors for port-in-use/DB-not-writable/migration failures | ✓ VERIFIED | `backend/internal/handler/health.go`, `backend/internal/repository/sqlite/sqlite.go` ready flag, `backend/cmd/server/main.go` startup checks and `EADDRINUSE` messaging. |
| 5 | Push/PR CI runs backend lint/vet/test + frontend typecheck/vitest/build; release on `v*` produces checksums | ✓ VERIFIED | `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.goreleaser.yaml` include required gates and `checksums.txt`. |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `scripts/hooker` | setup+doctor flow with required/optional checks | ✓ VERIFIED | Substantive command paths; includes binary build, hook patching, and doctor checks. |
| `backend/internal/server/middleware.go` | Host header guard | ✓ VERIFIED | `hostHeader` allowlist + `SplitHostPort`; 403 on disallowed hosts by code path. |
| `backend/internal/server/router.go` | health/ready/version routes and middleware chain | ✓ VERIFIED | Registers `/healthz`, `/readyz`, `/api/version`; returns `hostHeader(cors(logging(mux)))`. |
| `backend/internal/repository/sqlite/sqlite.go` | readiness flag based on migration completion | ✓ VERIFIED | `atomic.Bool ready`, set true after successful `migrate()`, exposed via `Ready()`. |
| `backend/cmd/server/main.go` | startup diagnostics + router wiring | ✓ VERIFIED | DB writability pre-check, ADDR validation, `repo.Ready` routing, `EADDRINUSE` branch. |
| `backend/internal/version/version.go` | ldflag-injectable version metadata | ✓ VERIFIED | `Version`, `Commit`, `BuildDate` vars present. |
| `backend/internal/handler/version.go` | `/api/version` version+commit+buildDate | ✓ VERIFIED | JSON response includes all three fields. |
| `.github/workflows/ci.yml` | backend and frontend quality gates | ✓ VERIFIED | Includes go build/test/vet/lint+govulncheck and frontend typecheck/test/build. |
| `.github/workflows/release.yml` + `.goreleaser.yaml` | tag-only release + checksums + ldflags | ✓ VERIFIED | `v*` trigger, goreleaser v2, checksum, frontend build hook, version ldflags. |
| `frontend/src/features/version/useVersion.ts` + `VersionBadge.tsx` + `Sidebar.tsx` | runtime version in UI | ✓ VERIFIED | Fetches `/api/version`; footer badge rendered when expanded; old static import removed. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `backend/internal/server/router.go` | `backend/internal/server/middleware.go` | `hostHeader(cors(logging(mux)))` | WIRED | Direct return-chain call present. |
| `backend/cmd/server/main.go` | `backend/internal/server/router.go` | `server.NewRouter(svc, repo.Ready)` | WIRED | Ready function injected from sqlite repo. |
| `backend/internal/handler/version.go` | `backend/internal/version/version.go` | `version.Version/Commit/BuildDate` | WIRED | Response struct populated from version package vars. |
| `frontend/src/features/version/useVersion.ts` | `/api/version` | `fetch('/api/version')` | WIRED | Runtime fetch in `useEffect`, consumed by `VersionBadge`. |
| `frontend/src/app/Sidebar.tsx` | `frontend/src/features/version/VersionBadge.tsx` | footer integration | WIRED | Imports `VersionBadge` and renders when `!collapsed`. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `frontend/src/features/version/VersionBadge.tsx` | `info` | `useVersion()` | Yes, from `/api/version` handler | ✓ FLOWING |
| `frontend/src/features/version/useVersion.ts` | `VersionInfo` state | `GET /api/version` | Yes, handler returns structured JSON | ✓ FLOWING |
| `backend/internal/handler/health.go` (`Readyz`) | `ready()` | sqlite `DB.Ready()` | Yes, set post-migration | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Backend compiles/tests/vets | `cd backend && go build ./... && go test ./... && go vet ./...` | Exit 0 for all commands | ✓ PASS |
| Frontend type/test/build | `cd frontend && npx tsc --noEmit && npx vitest run && npm run build` | Exit 0; 51 tests passed; build artifacts generated | ✓ PASS |
| Doctor command surfaces required/optional report | `./scripts/hooker doctor` | Structured output shown; failed on occupied port as expected | ✓ PASS |
| Live endpoint curl against freshly started local server | `go run ./cmd/server` then curl health/ready/version | Bind blocked in sandbox (`bind: operation not permitted`) | ? SKIP |

### Probe Execution

| Probe | Command | Result | Status |
| --- | --- | --- | --- |
| Step 7c | `find scripts -path '*/tests/probe-*.sh' -type f` | No probe scripts found | ? SKIP (no probes declared) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| INSTALL-01/02/03/04/05/06/07 | 01-04, 01-05, 01-03 | setup+doctor+docs+pnpm enforcement | ✓ SATISFIED | `scripts/hooker`, docs, frontend package/`.npmrc`, CI. |
| CI-01/02/03/04/05/06 | 01-03 | backend/frontend CI + govulncheck + go.sum cache + embed-order | ✓ SATISFIED | `.github/workflows/ci.yml`, release/frontend build sequencing. |
| DIAG-01/02/03/04/05/06 | 01-01, 01-02, 01-06, 01-04 | health/ready/version/UI/startup diagnostics/loopback warning | ✓ SATISFIED | handlers/router/main/sidebar/doctor checks. |
| DATA-01/02/03/06/07 | 01-05 | DB lifecycle docs + privacy warning | ✓ SATISFIED | `docs/install.md` sections for WAL/backup/reset/prune/privacy. |
| SEC-01 | 01-01 | host header protection | ✓ SATISFIED | `hostHeader` middleware wired outermost. |
| REL-01/02/04/05 | 01-03, 01-02 | GoReleaser, tag trigger, changelog filter, ldflags | ✓ SATISFIED | `.goreleaser.yaml`, workflows, version vars. |
| REL-03 | 01-05 | squash-merge enforcement in GitHub settings | ? NEEDS HUMAN | Only documentation can be verified locally; settings are external. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `docs/install.md` | 85-86 (section text) | Doctor docs mention test/lint checks no longer run by doctor script | ⚠️ Warning | Documentation drift; can mislead users about doctor scope. |

### Human Verification Required

### 1. Clean-Machine Onboarding Timing

**Test:** Run full flow from clean environment: clone, `./scripts/hooker setup`, backend start, frontend start, first event capture.  
**Expected:** First event captured within 10 minutes; doctor report is clear and actionable.  
**Why human:** Time-to-value and user workflow completion are user-observable, not static-code properties.

### 2. GitHub Settings + Hosted CI Confirmation

**Test:** Check repository merge settings and trigger a real push/PR CI run.  
**Expected:** Squash-only merge policy configured; CI jobs pass on GitHub runners.  
**Why human:** External platform state not present in local repo.

### 3. Migration-Failure Message Quality

**Test:** Induce migration failure in disposable environment and review startup fatal message quality.  
**Expected:** Error clearly indicates migration failure/remediation path.  
**Why human:** Requires runtime fault injection and operator interpretation.

---

_Verified: 2026-05-24T11:46:41Z_  
_Verifier: the agent (gsd-verifier)_
