# Requirements: hooker v1.1 Diagnostics

**Defined:** 2026-05-27
**Core Value:** A developer can install hooker from source, capture coding-agent activity locally, and trust that the app handles diagnostics, data durability, privacy controls, exports, and security posture without silent surprises.

## v1.1 Requirements

### System Health (DIAG)

- [x] **DIAG-01**: Operator can open diagnostics and see app version, Git commit, and build date.
- [x] **DIAG-02**: Operator can see current health/readiness state in the Diagnostics UI.
- [x] **DIAG-03**: Operator can see DB path, DB size, total event count, total session count, and latest event timestamp.
- [x] **DIAG-04**: Diagnostics backend computes counts with aggregate queries, not by loading all events into memory.

### Agent Connectivity (HOOK)

- [x] **HOOK-01**: Operator can see one diagnostics row each for Claude Code, Codex, and Gemini CLI.
- [x] **HOOK-02**: Operator can see last-seen timestamp and event count per supported agent.
- [x] **HOOK-03**: Operator can see degraded event count or warning state per supported agent.
- [x] **HOOK-04**: Operator can see best-effort hook config status using existing setup/doctor-detectable locations, with `unknown` where detection is not implemented.
- [x] **HOOK-05**: Diagnostics distinguishes `configured`, `missing`, `unknown`, `no events`, `stale`, and `degraded` without treating unknown states as fatal.

### Privacy and Security Posture (PRIV)

- [ ] **PRIV-01**: Operator can see ignore file path and load status.
- [ ] **PRIV-02**: Operator can see active ignore pattern count without exposing raw captured prompts, diffs, tool output, or raw payload content.
- [ ] **PRIV-03**: Operator can see loopback/remote-bind posture and CORS origin summary.
- [ ] **PRIV-04**: Diagnostics UI shows an export sensitivity warning covering prompts, diffs, file paths, tool outputs, raw payloads, and exports.

### Diagnostics UI (UI)

- [ ] **UI-01**: Diagnostics page is reachable from the sidebar at `/diagnostics`.
- [ ] **UI-02**: Diagnostics page presents a compact operator layout: status summary, system facts, agent connectivity table, and privacy panel.
- [ ] **UI-03**: Diagnostics page supports loading, error, empty, warning, healthy, and manual refresh states.
- [ ] **UI-04**: Diagnostics page is responsive and consistent with the existing app shell.

### Regression Coverage (TEST)

- [x] **TEST-01**: Backend tests cover diagnostics response shape, DB stats, agent summaries, privacy status, and hook config detection states.
- [ ] **TEST-02**: Frontend tests cover diagnostics rendering for healthy, warning, loading, error, and empty states.
- [ ] **TEST-03**: Route/sidebar tests cover Diagnostics navigation.

## Future Requirements

### Diagnostics Operations

- **DOPS-01**: Operator can trigger safe DB maintenance actions such as checkpoint, vacuum, or prune from the UI.
- **DOPS-02**: Operator can export a diagnostics bundle for support or self-debugging.
- **DOPS-03**: Operator can repair supported hook configs from the UI after explicit confirmation.

### Analytics and Search

- **ANLY-01**: Operator can inspect failure/anomaly trends across sessions.
- **ANLY-02**: Operator can compare agents and sessions by usage, failures, and cost.
- **SRCH-01**: Operator can search prompts, paths, tools, errors, and models.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mutating DB maintenance actions | v1.1 is read-only diagnostics; mutating controls need separate safety design. |
| Hook config repair from UI | Existing setup/doctor owns repair flow; UI repair would require confirmation and write-safety UX. |
| Raw payload, prompt, diff, or tool-output display | Diagnostics must not expose sensitive captured content. |
| Full analytics dashboard | v1.1 answers install trust, not usage analytics. |
| Full-text search | Search deserves its own milestone and indexing design. |
| Remote/public diagnostics sharing | Conflicts with local-first and sensitive-data posture. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIAG-01 | Phase 4 | Complete |
| DIAG-02 | Phase 4 | Complete |
| DIAG-03 | Phase 4 | Complete |
| DIAG-04 | Phase 4 | Complete |
| HOOK-01 | Phase 5 | Complete |
| HOOK-02 | Phase 5 | Complete |
| HOOK-03 | Phase 5 | Complete |
| HOOK-04 | Phase 5 | Complete |
| HOOK-05 | Phase 5 | Complete |
| PRIV-01 | Phase 5 | Pending |
| PRIV-02 | Phase 5 | Pending |
| PRIV-03 | Phase 5 | Pending |
| PRIV-04 | Phase 5 | Pending |
| UI-01 | Phase 6 | Pending |
| UI-02 | Phase 6 | Pending |
| UI-03 | Phase 6 | Pending |
| UI-04 | Phase 6 | Pending |
| TEST-01 | Phase 4 | Complete |
| TEST-02 | Phase 6 | Pending |
| TEST-03 | Phase 6 | Pending |

**Coverage:**
- v1.1 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-05-27*
*Last updated: 2026-05-27 after v1.1 requirements definition*
