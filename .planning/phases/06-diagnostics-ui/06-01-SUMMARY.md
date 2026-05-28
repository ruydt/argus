---
phase: 06-diagnostics-ui
plan: "01"
subsystem: frontend
tags: [diagnostics, typescript, routing, navigation]
dependency_graph:
  requires: []
  provides:
    - frontend/src/features/diagnostics/types.ts
    - frontend/src/features/diagnostics/hooks/useDiagnostics.ts
    - frontend/src/features/diagnostics/DiagnosticsPage.tsx
  affects:
    - frontend/src/App.tsx
    - frontend/src/app/Sidebar.tsx
tech_stack:
  added: []
  patterns:
    - reloadKey + mounted guard fetch pattern (from useDashboardStats, adapted for diagnostics)
    - lazy() + Suspense fallback={null} route wiring
    - NAV_ITEMS array extension for sidebar navigation
key_files:
  created:
    - frontend/src/features/diagnostics/types.ts
    - frontend/src/features/diagnostics/hooks/useDiagnostics.ts
    - frontend/src/features/diagnostics/DiagnosticsPage.tsx
  modified:
    - frontend/src/App.tsx
    - frontend/src/app/Sidebar.tsx
decisions:
  - "useDiagnostics excludes data from useEffect deps to avoid infinite fetch loop; eslint-disable comment added per plan spec"
  - "DiagnosticsPage uses named export only — lazy adapter in App.tsx requires .then((m) => ({ default: m.DiagnosticsPage }))"
  - "error state surfaces as string | null per D-09; dashboard pattern swallows errors but diagnostics must not"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-28T10:02:28Z"
  tasks_completed: 2
  files_changed: 5
---

# Phase 06 Plan 01: Diagnostics Feature Wiring Summary

**One-liner:** Diagnostics feature wired into app shell with 10 TypeScript interfaces matching backend JSON contract, fetch hook with error/lastUpdatedAt/refreshing state, lazy route at /diagnostics, and Stethoscope sidebar nav entry.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create types.ts and useDiagnostics hook | 3f8e847 | types.ts, hooks/useDiagnostics.ts |
| 2 | Scaffold DiagnosticsPage stub, wire route and sidebar | d9a4eca | DiagnosticsPage.tsx, App.tsx, Sidebar.tsx |

## What Was Built

**types.ts** — 10 named TypeScript interfaces mirroring `backend/internal/domain/diagnostics.go` JSON shape:
- Go `*int64` → `number | null` (dbSizeBytes)
- Go `*string` → `string | null` (latestEventAt, lastSeenAt, normalizerVersion)
- Go `string` with `omitempty` → TypeScript `string?` optional (reason, dbSizeReason, hookConfigReason)
- CORS field correctly named `cors` (from Go JSON tag `"cors"`, not the struct field name `CORS`)

**useDiagnostics hook** — Fetch-on-mount-only hook (D-13) with:
- `loading: boolean` — true on first fetch, false after
- `refreshing: boolean` — true during reload when data already exists (D-14)
- `error: string | null` — surfaces fetch failure as string (D-09)
- `lastUpdatedAt: Date | null` — set to `new Date()` on each successful fetch (D-15)
- `reload: () => void` — increments reloadKey to trigger re-fetch
- No caching, no polling, no focus-refresh

**DiagnosticsPage stub** — Named export with placeholder `<h1>Diagnostics</h1>` heading; enough for lazy import to resolve and Plan 02 to replace the body.

**App.tsx** — DiagnosticsPage lazy import added after TraceView; `path="diagnostics"` route registered inside `<Route element={<Layout />}>` block.

**Sidebar.tsx** — `Stethoscope` added to lucide-react import; `Diagnostics` NAV_ITEMS entry with `ariaLabel="System Diagnostics"` and `to="/diagnostics"` appended after Projects.

## Verification

- `npx tsc --noEmit` — no errors
- `npx vitest run` — 77/77 tests pass (0 regressions)
- No default exports in diagnostics feature
- No barrel index.ts in diagnostics feature

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

| File | Description |
|------|-------------|
| frontend/src/features/diagnostics/DiagnosticsPage.tsx | Placeholder body with only `<h1>Diagnostics</h1>` heading; full layout wired in Plan 02 |

This stub is intentional per plan spec — Plan 02 replaces the body. The placeholder does not prevent the plan's goal (route wiring and contract establishment) from being achieved.

## Threat Flags

No new security-relevant surface introduced beyond the plan's threat model. The `/api/diagnostics` fetch in useDiagnostics is covered by T-06-01-01 through T-06-01-03 in the plan's threat register.

## Self-Check: PASSED

- frontend/src/features/diagnostics/types.ts — FOUND
- frontend/src/features/diagnostics/hooks/useDiagnostics.ts — FOUND
- frontend/src/features/diagnostics/DiagnosticsPage.tsx — FOUND
- frontend/src/App.tsx (modified) — FOUND
- frontend/src/app/Sidebar.tsx (modified) — FOUND
- Task 1 commit 3f8e847 — FOUND
- Task 2 commit d9a4eca — FOUND
