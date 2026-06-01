---
phase: 11
slug: frontend-polish-ux
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-01
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Go `testing` + Vitest 4.1.5 + Testing Library |
| **Config file** | `backend/.golangci.yml`, `frontend/vite.config.ts` |
| **Backend quick run** | `cd backend && go test ./tests/internal/service/...` |
| **Frontend quick run** | `cd frontend && npx vitest run tests/features/diagnostics/` |
| **Full suite command** | `cd backend && go test ./... && cd ../frontend && npx vitest run` |
| **Estimated runtime** | ~30s backend, ~15s frontend |

---

## Sampling Rate

- **After every task commit:** Run quick run for the affected feature area
- **After every plan wave:** Run full suite (both backend and frontend)
- **Before `/gsd-verify-work`:** Full suite must be green (173 backend + 78+ frontend)
- **Max feedback latency:** ~45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | FRONT-01 | — | Cache miss calls repo; cache hit skips repo | unit | `go test ./tests/internal/service/... -run TestDiagnosticsCache` | ❌ Wave 0 | ⬜ pending |
| 11-01-02 | 01 | 1 | FRONT-01 | — | Cache expires after TTL | unit | `go test ./tests/internal/service/... -run TestDiagnosticsCacheTTL` | ❌ Wave 0 | ⬜ pending |
| 11-01-03 | 01 | 1 | FRONT-01 | — | useDiagnostics does not re-fetch on re-mount when cache warm | unit | `npx vitest run tests/features/diagnostics/` | ❌ Wave 0 | ⬜ pending |
| 11-02-01 | 02 | 2 | FRONT-02 | — | N/A (visual; smoke test no crash) | unit | `npx vitest run tests/features/dashboard/` | ✅ | ⬜ pending |
| 11-02-02 | 02 | 2 | UX-01 | — | Copy icon appears on hover; click copies sessionId | unit | `npx vitest run tests/features/events/` | ❌ Wave 0 | ⬜ pending |
| 11-02-03 | 02 | 2 | UX-02 | — | Click ChangeRow expands code with line numbers | unit | `npx vitest run tests/features/sessions/` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/internal/service/event_service_test.go` — add TestDiagnosticsCache + TestDiagnosticsCacheTTL stubs
- [ ] `frontend/tests/features/diagnostics/useDiagnostics.test.tsx` — add no-remount-fetch stub
- [ ] `frontend/tests/features/events/AgentSession.test.tsx` — add copy-icon stub (or add to existing `__tests__/`)
- [ ] `frontend/tests/features/sessions/FileChangesDrawer.test.tsx` — add expand-code stub

*Existing test infrastructure sufficient — no new framework installs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Diagnostics page loads in <2s after cache warms | FRONT-01 / PERF-01 | Requires live server + real DB | Load /diagnostics twice; second load should be near-instant |
| Log scale bars all visible at different magnitudes | FRONT-02 | Visual rendering | Use seed data with 818k and 140M token models side by side |
| Copy icon hover visibility | UX-01 | CSS hover state | Hover over session header; verify clipboard icon appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
