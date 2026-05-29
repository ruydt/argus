# Roadmap: hooker

## Milestones

- [x] **v1.0 MVP** — Phases 1-3, 19 plans (shipped 2026-05-27). Full archive: [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- [x] **v1.1 Diagnostics** — Phases 4-6, 9 plans (shipped 2026-05-29). Full archive: [v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
- [ ] **v1.2 Polish & Cleanup** — Phases 7-9, coverage: 10/10 requirements

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

**v1.2 Polish & Cleanup**

- [ ] **Phase 7: Backend Code Quality** — Eliminate silent JSON failures, extract shared pagination helper, and add missing handler tests
- [ ] **Phase 8: Frontend Component Quality** — Replace raw buttons with shadcn primitive, remove inline styles, and flatten deep prop drilling in sessions feature
- [ ] **Phase 9: Frontend Test Coverage & Docs Cleanup** — Add Vitest coverage for DiagnosticsPage, UsagePage, and VersionBadge; archive stale spec files

---

## Phase Details

### Phase 7: Backend Code Quality

**Goal**: Backend handlers are observable, consistent, and covered by tests
**Depends on**: Nothing (Go-only changes, independent from frontend)
**Requirements**: BACK-01, BACK-02, BACK-03
**Success Criteria** (what must be TRUE):

  1. Any JSON encode failure in a handler produces a log line — no silent discard
  2. Sessions and traces handlers both delegate page-size parsing to a single shared helper — no duplicated parsing logic
  3. Dashboard, file_changes, health, usage, and version handlers each have at least one httptest-based test that exercises the happy path

**Plans**: 3 plans

Plans:
**Wave 1**

- [x] 07-01-PLAN.md — Extract parsePageSize helper; update sessions.go and traces.go (BACK-02)
- [ ] 07-02-PLAN.md — Add smoke tests for dashboard, file_changes, health, usage, version handlers (BACK-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 07-03-PLAN.md — Replace all 14 suppressed JSON encode errors with log.Printf calls (BACK-01)

### Phase 8: Frontend Component Quality

**Goal**: Sessions feature uses consistent, maintainable UI primitives with no prop drilling beyond 2 levels
**Depends on**: Phase 7 (logically independent, but ordering keeps frontend changes batched)
**Requirements**: COMP-01, COMP-02, COMP-03
**Success Criteria** (what must be TRUE):

  1. FileChangesDrawer, TraceViewPage, EventTimeline, and TraceTreeNode render no raw `<button>` elements — all use the shadcn Button primitive
  2. FileChangesDrawer contains no `style={{}}` attributes for properties expressible as Tailwind utility classes
  3. TraceTreeNode receives session data through no more than 2 component levels from TraceViewPage — intermediate prop chains eliminated

**Plans**: TBD
**UI hint**: yes

### Phase 9: Frontend Test Coverage & Docs Cleanup

**Goal**: Key frontend pages have Vitest coverage for all rendering states, and stale placeholder docs are gone
**Depends on**: Phase 8 (component shape must be stable before writing component tests)
**Requirements**: TEST-01, TEST-02, TEST-03, DOCS-01
**Success Criteria** (what must be TRUE):

  1. DiagnosticsPage Vitest suite covers loading, error, healthy, and degraded state branches — all pass
  2. UsagePage Vitest suite covers loading, empty, and populated state branches — all pass
  3. VersionBadge Vitest suite covers loaded, loading, and error states — all pass
  4. No files under `docs/superpowers/specs/` or `docs/superpowers/plans/` contain placeholder or stub content — directory is either empty or contains only finalized material

**Plans**: TBD

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
| 7. Backend Code Quality | v1.2 | 1/3 | In Progress|  |
| 8. Frontend Component Quality | v1.2 | 0/? | Not started | - |
| 9. Frontend Test Coverage & Docs Cleanup | v1.2 | 0/? | Not started | - |

---

*Roadmap created: 2026-05-24*
*Last updated: 2026-05-29 — Phase 7 planned (3 plans, 2 waves)*
