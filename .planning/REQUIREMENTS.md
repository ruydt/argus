# Requirements: hooker

**Defined:** 2026-06-01
**Core Value:** A developer can install hooker from source, capture coding-agent activity locally, and trust that the app handles diagnostics, data durability, privacy controls, exports, and security posture without silent surprises.

## v1.3 Requirements

Requirements for the UI Quality milestone. Each maps to roadmap phases.

### Performance

- [x] **PERF-01**: Diagnostics page loads in under 2 seconds (replace correlated subquery in `DiagnosticsAgentStats` with `MAX()` join) — completed Phase 10

### Frontend

- [ ] **FRONT-01**: Diagnostics page caches loaded data; re-fetches only on explicit refresh button press
- [ ] **FRONT-02**: Dashboard chart displays token values at all magnitudes — small values are not visually invisible on a large-scale axis

### UX

- [ ] **UX-01**: User can copy session ID from Events page with one click
- [ ] **UX-02**: Session file-change view shows line numbers alongside changed code

### Triage

- [ ] **TRIAGE-01**: UI bugs discovered during manual testing are fixed within the milestone

## Future Requirements

### Triage (ongoing)

- **TRIAGE-02**: Additional design improvements identified post-v1.3

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full-text search | Deferred to future milestone — not in v1.3 scope |
| Filter UI | Deferred to future milestone — not in v1.3 scope |
| Token/cost analytics overhaul | Deferred — small chart scale fix only |
| Agent/session comparison tools | Deferred to future milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PERF-01 | 10 | Complete 2026-06-01 |
| FRONT-01 | 11 | Pending |
| FRONT-02 | 11 | Pending |
| UX-01 | 11 | Pending |
| UX-02 | 11 | Pending |
| TRIAGE-01 | 11 | Pending |

**Coverage:**
- v1.3 requirements: 6 total
- Mapped to phases: 6
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-01*
*Last updated: 2026-06-01 after initial definition*
