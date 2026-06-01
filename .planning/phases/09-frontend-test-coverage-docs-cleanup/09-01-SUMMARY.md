---
phase: 09-frontend-test-coverage-docs-cleanup
plan: "01"
subsystem: frontend-tests
tags: [vitest, diagnostics, test-coverage, TEST-01]
dependency_graph:
  requires: []
  provides: [TEST-01]
  affects: [frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx]
tech_stack:
  added: []
  patterns: [vi.stubGlobal-fetch, MemoryRouter, aria-busy-assertion]
key_files:
  created: []
  modified:
    - frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx
decisions:
  - "Audit found all TEST-01 branches already covered by 7 existing tests; only gap was missing aria-busy assertion in loading test"
  - "Added aria-busy='true' DOM assertion to loading test per D-04 (low-cost nearby edge state)"
  - "No production code changed; test-only plan executed as specified"
metrics:
  duration: "1m"
  completed: "2026-06-01"
  tasks: 2
  files: 1
---

# Phase 9 Plan 1: DiagnosticsPage Test Coverage Audit Summary

DiagnosticsPage TEST-01 branch coverage confirmed complete — audit proved 7 existing tests cover all named branches; one aria-busy assertion added to tighten the loading test.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Audit DiagnosticsPage branch coverage | 8cdccd3 | `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx` |
| 2 | Tighten missing DiagnosticsPage assertions (gap found: aria-busy) | 8cdccd3 | `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx` |

## Branch Coverage Map (TEST-01)

| Branch | Test Name | Assertions Proven |
|--------|-----------|-------------------|
| Loading | `renders skeleton sections and heading during loading` | `Diagnostics` heading visible; `aria-busy="true"` on skeleton container; `Agent Connectivity` and `System Facts` absent |
| Error | `renders retry panel when fetch fails` | `Failed to load diagnostics`, `Could not reach /api/diagnostics`, `Retry Load` button, heading persists |
| Healthy | `renders all sections when diagnostics load successfully` | `Agent Connectivity`, `System Facts`, `Claude Code`, `Codex`, `Ready`, export warning text |
| Degraded | `renders degraded and extra CORS badges in warning state` | `Degraded` badge, `extra origin` text |
| First-run | `renders first-run hint when no events have been observed` | `No activity observed yet`, `hooker setup` text |
| Not-ready | `renders Not ready tile and reason when health.ready is false` | `Not ready`, reason text, `Agent Connectivity` still renders |
| Refresh | `shows spin animation on refresh button click and keeps data visible` | button disabled during refresh, data visible throughout, button re-enabled after |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

**Task 1 (audit) finding:** Coverage was complete for all six TEST-01 named branches (loading, error, healthy, degraded, plus first-run, not-ready, refresh extras). The one gap identified per D-04 was the absence of an `aria-busy="true"` assertion in the loading test, which DiagnosticsPage.tsx line 467 explicitly sets on the skeleton container.

**Task 2 (tighten) action:** Added `expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument()` to the loading test. This is the only change to the test file. No production code modified.

## Known Stubs

None — tests use structured fixtures with no placeholder data flowing to rendered UI.

## Threat Flags

None — test-only plan with synthetic fixtures; no new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- [x] `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx` — modified and committed at 8cdccd3
- [x] Commit 8cdccd3 exists in git log
- [x] 7/7 tests pass (`pnpm test --run tests/features/diagnostics/DiagnosticsPage.test.tsx`)
- [x] TypeScript reports no errors (`npx tsc --noEmit`)
