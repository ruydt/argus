# Roadmap: hooker

## Milestones

- [x] **v1.0 MVP** — Phases 1-3, 19 plans (shipped 2026-05-27). Full archive: [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- [x] **v1.1 Diagnostics** — Phases 4-6, 9 plans (shipped 2026-05-29). Full archive: [v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
- [x] **v1.2 Polish & Cleanup** — Phases 7-9, 11 plans (shipped 2026-06-01). Full archive: [v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md)
- [ ] **v1.3 UI Quality** — Phases 10-11 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-3) — SHIPPED 2026-05-27</summary>

- [x] Phase 1: Local Adoption Baseline (6/6 plans) — completed 2026-05-24
- [x] Phase 2: Reliable Daily Use (8/8 plans) — completed 2026-05-26
- [x] Phase 3: Mature Local Product (5/5 plans) — completed 2026-05-27

</details>

<details>
<summary>v1.1 Diagnostics (Phases 4-6) — SHIPPED 2026-05-29</summary>

- [x] Phase 4: Diagnostics Data Contract (3/3 plans) — completed 2026-05-27
- [x] Phase 5: Hook and Privacy Diagnostics (3/3 plans) — completed 2026-05-28
- [x] Phase 6: Diagnostics UI (3/3 plans) — completed 2026-05-28

</details>

<details>
<summary>v1.2 Polish & Cleanup (Phases 7-9) — SHIPPED 2026-06-01</summary>

- [x] Phase 7: Backend Code Quality (3/3 plans) — completed 2026-05-29
- [x] Phase 8: Session File Changes View (5/5 plans) — completed 2026-05-31
- [x] Phase 9: Frontend Test Coverage & Docs Cleanup (3/3 plans) — completed 2026-06-01

</details>

**v1.3 UI Quality (Phases 10-11)**

- [ ] **Phase 10: Diagnostics Backend Performance** - Fix O(n²) SQL correlated subquery in DiagnosticsAgentStats
- [ ] **Phase 11: Frontend Polish & UX** - Cache diagnostics, fix chart scale, copyable session IDs, file-change line numbers, and triage bugs

## Phase Details

### Phase 10: Diagnostics Backend Performance
**Goal**: The diagnostics page loads in under 2 seconds regardless of event volume
**Depends on**: Nothing (self-contained backend fix)
**Requirements**: PERF-01
**Success Criteria** (what must be TRUE):
  1. Opening the Diagnostics page completes within 2 seconds on a dataset with thousands of hook events
  2. The agent stats section shows correct normalizer version data (same values as before, faster query)
  3. `go test ./...` passes with the refactored query; no regression in diagnostics data contract tests
**Plans**: 1 plan

Plans:
- [ ] 10-01-PLAN.md — Replace O(n²) correlated subqueries in DiagnosticsAgentStats with O(n) MAX()+GROUP BY queries

### Phase 11: Frontend Polish & UX
**Goal**: Users can interact with the UI without encountering the known chart, caching, copy, and line-number deficiencies
**Depends on**: Phase 10
**Requirements**: FRONT-01, FRONT-02, UX-01, UX-02, TRIAGE-01
**Success Criteria** (what must be TRUE):
  1. The Diagnostics page does not re-fetch data on every visit — data persists until the user clicks a refresh button
  2. The Dashboard chart renders token values at all magnitudes — a bar representing 818k tokens is visibly distinct from one representing 140M tokens
  3. User can click a session ID on the Events page and have it copied to the clipboard with visible confirmation
  4. The Sessions file-change view displays line numbers alongside changed code lines
  5. UI bugs discovered during manual testing of v1.3 are fixed before milestone close
**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Local Adoption Baseline | v1.0 | 6/6 | Complete | 2026-05-24 |
| 2. Reliable Daily Use | v1.0 | 8/8 | Complete | 2026-05-26 |
| 3. Mature Local Product | v1.0 | 5/5 | Complete | 2026-05-27 |
| 4. Diagnostics Data Contract | v1.1 | 3/3 | Complete | 2026-05-27 |
| 5. Hook and Privacy Diagnostics | v1.1 | 3/3 | Complete | 2026-05-28 |
| 6. Diagnostics UI | v1.1 | 3/3 | Complete | 2026-05-28 |
| 7. Backend Code Quality | v1.2 | 3/3 | Complete | 2026-05-29 |
| 8. Session File Changes View | v1.2 | 5/5 | Complete | 2026-05-31 |
| 9. Frontend Test Coverage & Docs Cleanup | v1.2 | 3/3 | Complete | 2026-06-01 |
| 10. Diagnostics Backend Performance | v1.3 | 0/1 | Not started | - |
| 11. Frontend Polish & UX | v1.3 | 0/0 | Not started | - |

---

*Roadmap created: 2026-05-24*
*Last updated: 2026-06-01 — Phase 10 planned (1 plan)*
