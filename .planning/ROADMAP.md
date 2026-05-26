# Roadmap: hooker

## Overview

hooker is a working prototype that needs hardening into a trustworthy daily-use product. Phase 1 closes the gap between "it runs" and "a stranger can install it in 10 minutes and trust it" — CI, security fix, install tooling, health endpoints, version wiring, and release pipeline. Phase 2 makes it reliable under real use — migration safety, raw payload archive, backend hardening, full test coverage, and data export. Phase 3 completes the mature local product — privacy controls, security posture documentation, and contributor infrastructure.

## Phases

- [x] **Phase 1: Local Adoption Baseline** - CI gates + security fix + install/doctor/health/version/release pipeline (completed 2026-05-24)
- [ ] **Phase 2: Reliable Daily Use** - Migration safety + backend hardening + data model + testing + export
- [ ] **Phase 3: Mature Local Product** - Privacy controls + security posture + contributor infrastructure

## Phase Details

### Phase 1: Local Adoption Baseline

**Goal**: A new user can install hooker from source in under 10 minutes, run `doctor` to verify their setup, trust the app is secure, and find versioned releases with checksums
**Depends on**: Nothing (first phase)
**Requirements**: INSTALL-01, INSTALL-02, INSTALL-03, INSTALL-04, INSTALL-05, INSTALL-06, INSTALL-07, CI-01, CI-02, CI-03, CI-04, CI-05, CI-06, DIAG-01, DIAG-02, DIAG-03, DIAG-04, DIAG-05, DIAG-06, DATA-01, DATA-02, DATA-03, DATA-06, DATA-07, SEC-01, REL-01, REL-02, REL-03, REL-04, REL-05
**Success Criteria** (what must be TRUE):

  1. User can run `./scripts/hooker setup` then `./scripts/hooker doctor` and get a clear pass/fail report covering Go version, Node version, DB writability, port availability, and hook config presence
  2. User can follow `docs/quickstart.md` and capture their first hook event in under 10 minutes using `go build` (not `go run`)
  3. App version, Git commit, and build date are visible in startup logs, `/api/version` response, and the frontend UI
  4. `GET /healthz` returns 200 immediately; `GET /readyz` returns 200 only after DB is open and migrations complete; startup emits actionable fatal errors for port-in-use, DB-not-writable, and migration failures
  5. Every push/PR passes backend lint/vet/test and frontend typecheck/vitest/build in CI; GoReleaser produces versioned binaries with `checksums.txt` on `v*` tags

**Plans**: 6 plans
Plans:

- [x] 01-01-PLAN.md — SEC-01 host header middleware + DIAG-01/02 health endpoints + DB ready flag
- [x] 01-02-PLAN.md — Version package extension + /api/version commit+date + main.go startup diagnostics
- [x] 01-03-PLAN.md — CI workflows + GoReleaser config + pnpm enforcement
- [x] 01-04-PLAN.md — scripts/hooker setup (binary build + hook patching) + doctor (required/optional split)
- [x] 01-05-PLAN.md — Docs: quickstart go build + install.md data lifecycle + releases.md runbook
- [x] 01-06-PLAN.md — Frontend VersionBadge component + runtime version fetch + Sidebar wiring

**UI hint**: yes

### Phase 2: Reliable Daily Use

**Goal**: The running app survives real daily use without data loss, stuck migrations, lost raw payloads, or flaky tests; data export is available for backup and migration
**Depends on**: Phase 1
**Requirements**: DATA-04, DATA-05, MODEL-01, MODEL-02, MODEL-03, MODEL-04, MODEL-05, HARD-01, HARD-02, HARD-03, HARD-04, HARD-05, HARD-06, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06, TEST-07, SEC-05
**Success Criteria** (what must be TRUE):

  1. Every ingested hook event stores the raw payload bytes; `normalizer_version` and `agent_version` fields are present on stored events; unknown payloads are ingested in degraded mode with a visible warning rather than dropped
  2. Migrations are transactional — a partial-apply on power loss or OOM kill does not leave the DB in a stuck unrecoverable state
  3. User can export all events as streaming NDJSON via `GET /api/export/events` and download a full-fidelity SQLite snapshot via `GET /api/export/snapshot`
  4. Backend survives a panic without crashing the process; HTTP timeouts are configured; graceful shutdown drains open connections within a finite timeout
  5. Frontend component/hook test suite passes in CI; Playwright smoke confirms events, sessions, and dashboard load with real data

**Plans**: 8 plans
Plans:
**Wave 1**

- [ ] 02-01-PLAN.md — Migration 008 (3 new columns) + transactional runner (HARD-05) + domain model fields
- [ ] 02-03-PLAN.md — HTTP timeouts + graceful shutdown + slog migration + WAL checkpoint goroutine

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 02-02-PLAN.md — Degraded ingestion path in hook.go + NormalizerVersion constants in agents
- [ ] 02-04-PLAN.md — Panic recovery + secFetchSite middleware + NDJSON export + snapshot export handler
- [ ] 02-05-PLAN.md — Frontend EventRecord type additions + degraded badge in EventBadges

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 02-06-PLAN.md — Frontend test infra (user-event, unstubGlobals) + hook tests + component tests
- [ ] 02-07-PLAN.md — Backend migration/dedup/normalization tests + export round-trip test
- [ ] 02-08-PLAN.md — Playwright setup + smoke test + CI playwright job

### Phase 3: Mature Local Product

**Goal**: Users have explicit privacy controls over what data is captured, the security posture is documented and enforced, and contributors have everything they need to extend hooker safely
**Depends on**: Phase 2
**Requirements**: SEC-02, SEC-03, SEC-04, PRIV-01, PRIV-02, PRIV-03, CONTRIB-01, CONTRIB-02, CONTRIB-03
**Success Criteria** (what must be TRUE):

  1. User can create a gitignore-style exclusion file (`~/.config/hooker/ignore`) and matched repo paths are not ingested — verifiable by checking events are absent for excluded paths
  2. CORS origin is restricted to an explicit allowlist (not `*`); loopback-only bind is the enforced default; remote bind requires an explicit env var with a startup warning
  3. `doctor` output and setup docs include a clear privacy warning listing what categories of data are captured (prompts, diffs, file paths, tool outputs)
  4. `CONTRIBUTING.md` covers project structure, layer boundaries, how to add a new agent adapter with its fixture requirement, and the frontend-backend contract change process; ADRs are documented for SQLite choice, normalization strategy, and local-first positioning

**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Local Adoption Baseline | 6/6 | Complete   | 2026-05-24 |
| 2. Reliable Daily Use | 0/8 | Not started | - |
| 3. Mature Local Product | 0/TBD | Not started | - |
