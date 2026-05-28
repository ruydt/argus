---
phase: 06-diagnostics-ui
plan: "03"
subsystem: frontend
tags: [diagnostics, testing, vitest, react-testing-library]
dependency_graph:
  requires:
    - frontend/src/features/diagnostics/DiagnosticsPage.tsx
    - frontend/src/features/diagnostics/types.ts
    - frontend/src/app/Sidebar.tsx
  provides:
    - frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx
    - frontend/tests/features/diagnostics/DiagnosticsRoute.test.tsx
    - frontend/tests/app/Sidebar.desktop.test.tsx (augmented)
  affects: []
tech_stack:
  added: []
  patterns:
    - vi.stubGlobal('fetch') pattern for fetch mocking (not vi.spyOn)
    - never-resolving Promise for loading-state tests
    - navigator.clipboard mock via Object.defineProperty in beforeEach
    - resolveRefresh deferred promise pattern for manual-refresh test
key_files:
  created:
    - frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx
    - frontend/tests/features/diagnostics/DiagnosticsRoute.test.tsx
  modified:
    - frontend/tests/app/Sidebar.desktop.test.tsx
decisions:
  - "vi.stubGlobal('fetch') used throughout per Phase 2 decision — vi.spyOn(Storage.prototype) pattern is prohibited"
  - "navigator.clipboard mocked via Object.defineProperty in beforeEach to satisfy jsdom Clipboard API absence"
  - "warningDiagnostics and emptyDiagnostics built by spreading healthyDiagnostics to avoid fixture duplication"
  - "resolveRefresh deferred promise approach used in manual-refresh test to control in-flight fetch resolution precisely"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-28T15:51:17Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 06 Plan 03: Diagnostics Frontend Tests Summary

**One-liner:** 9 new tests across 3 files — 7 DiagnosticsPage state scenarios (loading/error/healthy/warning/empty/not-ready/refresh), 2 route reachability assertions, and 1 sidebar nav link assertion — all passing with zero regressions.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write DiagnosticsPage.test.tsx with 7 state scenarios | 5b7ef23 | tests/features/diagnostics/DiagnosticsPage.test.tsx |
| 2 | Write DiagnosticsRoute.test.tsx and augment Sidebar.desktop.test.tsx | 85b2717 | tests/features/diagnostics/DiagnosticsRoute.test.tsx, tests/app/Sidebar.desktop.test.tsx |

## What Was Built

**DiagnosticsPage.test.tsx** — 218 lines, 7 state scenarios:

- **Loading:** skeleton shown (aria-busy container), content cards absent (Agent Connectivity, System Facts not in DOM)
- **Error:** retry panel with "Failed to load diagnostics", "Could not reach /api/diagnostics", and "Retry Load" button; heading still present
- **Healthy:** all sections rendered (Agent Connectivity, System Facts, agent labels, Ready tile, export warning)
- **Warning:** Degraded badge for degraded agent, extra CORS origins badge visible
- **Empty/first-run:** "No activity observed yet" hint with hooker setup text
- **Not-ready:** "Not ready" tile text + reason string "Database migration pending"; other sections still rendered
- **Manual refresh:** button disabled during in-flight refresh, existing data (Claude Code) stays visible, button re-enables after resolve

**DiagnosticsRoute.test.tsx** — 2 route reachability assertions:
- Heading present when mounted at /diagnostics
- Heading present when fetch is pending (loading state)

**Sidebar.desktop.test.tsx** — 1 new assertion added to existing 4-test suite:
- `getByRole('link', { name: /system diagnostics/i })` matches the `ariaLabel="System Diagnostics"` on the Diagnostics NAV_ITEMS entry

## Verification

- `npx tsc --noEmit` — no errors
- `npx vitest run` — 87/87 tests pass (77 baseline + 10 new; 0 regressions)
- All 9 new scenarios pass individually
- vi.spyOn not used in any new test file
- navigator.clipboard mocked in all tests that render copy buttons

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

No new security-relevant surface introduced. T-06-03-02 (vi.stubGlobal fetch scope) mitigated: stubs cleared in afterEach via vi.clearAllMocks() in all three test files.

## Self-Check: PASSED

- frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx — FOUND
- frontend/tests/features/diagnostics/DiagnosticsRoute.test.tsx — FOUND
- frontend/tests/app/Sidebar.desktop.test.tsx (modified) — FOUND
- Task 1 commit 5b7ef23 — FOUND
- Task 2 commit 85b2717 — FOUND
- npx tsc --noEmit — PASSED
- npx vitest run — PASSED (87/87)
