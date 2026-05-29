# Requirements: hooker

**Defined:** 2026-05-29
**Core Value:** A developer can install hooker from source, capture coding-agent activity locally, and trust that the app handles diagnostics, data durability, privacy controls, exports, and security posture without silent surprises.

## v1.2 Requirements

### COMP — Frontend Component Quality

- [ ] **COMP-01**: Developer sees consistent Button usage in sessions feature — raw `<button>` elements in FileChangesDrawer, TraceViewPage, EventTimeline, and TraceTreeNode replaced with shadcn Button primitive
- [ ] **COMP-02**: FileChangesDrawer uses no static inline `style={{}}` for CSS properties expressible as Tailwind utility classes
- [ ] **COMP-03**: Sessions trace tree component hierarchy passes props no more than 2 levels deep — 7-prop drilling chain from TraceViewPage to TraceTreeNode refactored

### BACK — Backend Code Quality

- [ ] **BACK-01**: All JSON encode failures in handlers are logged rather than silently discarded — 14 suppressed `_ = json.NewEncoder` errors replaced with log output
- [x] **BACK-02**: Pagination query parameter parsing is extracted into a shared `parsePageSize()` helper used by both sessions.go and traces.go — no duplication
- [x] **BACK-03**: Backend handler tests added for dashboard, file_changes, health, usage, and version handlers using httptest

### TEST — Frontend Test Coverage

- [ ] **TEST-01**: DiagnosticsPage has Vitest tests covering all main rendering states (loading, error, healthy, degraded)
- [ ] **TEST-02**: UsagePage has Vitest tests covering main rendering states (loading, empty, populated)
- [ ] **TEST-03**: VersionBadge / version feature has Vitest tests covering loaded, loading, and error states

### DOCS — Documentation

- [ ] **DOCS-01**: Stale placeholder spec files in `docs/superpowers/specs/` and `docs/superpowers/plans/` are archived or removed — no placeholder-reference content remains in active docs

## Future Requirements

### UX Enhancement

- Full-text search across prompts, paths, tools, errors, and models
- Filter UI by agent, session, time range, model, event type, and status
- Richer diff navigation and code context viewing
- Agent/session comparison tools

### Analytics

- Better token and cost analytics with trend views
- Anomaly highlighting for failed tool runs and repeated retries

### Developer Experience

- Built-in sample data mode for demos and onboarding

## Out of Scope

| Feature | Reason |
|---------|--------|
| New user-facing features | This milestone is cleanup only — no new capabilities |
| ai-insights feature tests | Feature scope unclear; audit first before adding test coverage |
| projects feature tests | Feature scope unclear; audit first before adding test coverage |
| proxy handler tests | Proxy handlers (OpenAI/Anthropic) need functional spec before coverage |
| EventService refactor | Over-concentration is known; full refactor is large scope, track for future milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COMP-01 | Phase 8 | Pending |
| COMP-02 | Phase 8 | Pending |
| COMP-03 | Phase 8 | Pending |
| BACK-01 | Phase 7 | Pending |
| BACK-02 | Phase 7 | Complete |
| BACK-03 | Phase 7 | Complete |
| TEST-01 | Phase 9 | Pending |
| TEST-02 | Phase 9 | Pending |
| TEST-03 | Phase 9 | Pending |
| DOCS-01 | Phase 9 | Pending |

**Coverage:**
- v1.2 requirements: 10 total
- Mapped to phases: 10 (roadmap complete)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-29*
*Last updated: 2026-05-29 — traceability table filled after roadmap creation*
