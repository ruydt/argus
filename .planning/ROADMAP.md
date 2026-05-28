# Roadmap: hooker

## Milestones

- [x] **v1.0 MVP** — Phases 1-3, 19 plans (shipped 2026-05-27). Full archive: [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- [ ] **v1.1 Diagnostics** — Phases 4-6, 20 requirements (planned)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-3) — SHIPPED 2026-05-27</summary>

- [x] Phase 1: Local Adoption Baseline (6/6 plans) — completed 2026-05-24
- [x] Phase 2: Reliable Daily Use (8/8 plans) — completed 2026-05-26
- [x] Phase 3: Mature Local Product (5/5 plans) — completed 2026-05-27

</details>

### Phase 4: Diagnostics Data Contract

**Goal**: Add a read-only backend diagnostics contract that reports system health, version metadata, storage facts, and aggregate event/session stats without expensive full-table scans.
**Depends on**: v1.0 MVP
**Requirements**: DIAG-01, DIAG-02, DIAG-03, DIAG-04, TEST-01
**Success Criteria** (what must be TRUE):

1. `GET /api/diagnostics` returns app version, commit, build date, health/readiness, DB path, DB size, total events, total sessions, and latest event timestamp.
2. Diagnostics storage counts are computed through targeted SQLite aggregate queries rather than loading event lists into memory.
3. Backend tests cover response shape, empty DB behavior, DB stats, readiness state, and aggregate query behavior.
4. The endpoint is read-only and does not expose raw prompts, diffs, tool outputs, raw payload bodies, or arbitrary captured text.

**Plans**: 3 plans
Plans:

**Wave 1**

- [x] 04-01-PLAN.md — Domain response shape + repository diagnostics aggregate queries

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — Service/handler wiring + `/api/diagnostics` route

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-03-PLAN.md — Backend tests for system health, storage stats, empty DB, and response shape

### Phase 5: Hook and Privacy Diagnostics

**Goal**: Extend diagnostics data with hybrid agent hook status and privacy/security posture while preserving local-first sensitivity boundaries.
**Depends on**: Phase 4
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05, PRIV-01, PRIV-02, PRIV-03, PRIV-04
**Success Criteria** (what must be TRUE):

1. Diagnostics reports one row each for Claude Code, Codex, and Gemini CLI with event count, last seen timestamp, degraded count/warning, and normalizer version information when available.
2. Diagnostics reports best-effort hook config status using setup/doctor-detectable config locations, with `unknown` where detection is not implemented.
3. Hook statuses distinguish `configured`, `missing`, `unknown`, `no events`, `stale`, and `degraded` without treating unknown or stale states as fatal.
4. Diagnostics reports ignore file path, load status, active pattern count, remote-bind posture, and CORS origin summary.
5. Diagnostics includes export sensitivity warning text and does not expose raw captured content or raw ignore pattern text.

**Plans**: 3 plans
Plans:

**Wave 1**

- [x] 05-01-PLAN.md — Agent telemetry aggregates and normalizer/degraded status

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02-PLAN.md — Best-effort hook config detection shared with doctor-known locations

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05-03-PLAN.md — Privacy/security posture diagnostics + backend tests

### Phase 6: Diagnostics UI

**Goal**: Add a compact operator Diagnostics page in the React app that makes health, hook connectivity, and privacy posture understandable at a glance.
**Depends on**: Phase 5
**Requirements**: UI-01, UI-02, UI-03, UI-04, TEST-02, TEST-03
**Success Criteria** (what must be TRUE):

1. Sidebar navigation includes Diagnostics and `/diagnostics` lazy-loads a Diagnostics page.
2. The page presents a compact operator layout with status summary, system facts, agent connectivity table, and privacy panel.
3. The page handles loading, error, empty, warning, healthy, and manual refresh states.
4. The layout is responsive and consistent with the existing app shell.
5. Frontend tests cover healthy, warning, loading, error, empty, manual refresh, route, and sidebar navigation behavior.

**Plans**: 3 plans
Plans:

**Wave 1**

- [x] 06-01-PLAN.md — Diagnostics route, hook, types, and sidebar navigation

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-02-PLAN.md — Diagnostics page layout: status summary, system facts, agent table, privacy panel

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 06-03-PLAN.md — Frontend rendering/state tests and responsive polish

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Local Adoption Baseline | v1.0 | 6/6 | Complete | 2026-05-24 |
| 2. Reliable Daily Use | v1.0 | 8/8 | Complete | 2026-05-26 |
| 3. Mature Local Product | v1.0 | 5/5 | Complete | 2026-05-27 |
| 4. Diagnostics Data Contract | v1.1 | 3/3 | Complete   | 2026-05-27 |
| 5. Hook and Privacy Diagnostics | v1.1 | 3/3 | Complete    | 2026-05-28 |
| 6. Diagnostics UI | v1.1 | 3/3 | Complete   | 2026-05-28 |
