---
phase: 06-diagnostics-ui
plan: "02"
subsystem: frontend
tags: [diagnostics, react, typescript, ui, accessibility]
dependency_graph:
  requires:
    - frontend/src/features/diagnostics/types.ts
    - frontend/src/features/diagnostics/hooks/useDiagnostics.ts
  provides:
    - frontend/src/features/diagnostics/DiagnosticsPage.tsx
  affects: []
tech_stack:
  added: []
  patterns:
    - LoadedContent sub-component pattern to isolate type narrowing (data: Diagnostics vs null)
    - BADGE_RED/AMBER/GREEN constants for CSS-var badge overrides (avoids variant="destructive")
    - MonoPath sub-component for reusable monospace path + copy button pattern
    - loading-only skeleton guard — refreshing uses spinner, not skeleton (D-14)
key_files:
  created: []
  modified:
    - frontend/src/features/diagnostics/DiagnosticsPage.tsx
decisions:
  - "LoadedContent extracted as sub-component so TypeScript narrows data to Diagnostics (non-null) without repeated null checks throughout JSX"
  - "Badge variant set to 'outline' on all custom-colored badges; BADGE_RED/AMBER/GREEN className constants override colors — variant='destructive' never used directly per UI-SPEC"
  - "loading-only condition for skeleton branch (not loading || refreshing) per D-14; refreshing only spins the button icon, data stays visible"
  - "isFirstRun condition: totalEvents===0 AND all agents have status no-events — empty state hint shown inside CardContent below table header"
  - "Privacy & Security card title encoded as Privacy &amp; Security in JSX to satisfy Prettier/HTML escaping"
metrics:
  duration: "~12 minutes"
  completed: "2026-05-28T15:57:00Z"
  tasks_completed: 2
  files_changed: 1
---

# Phase 06 Plan 02: DiagnosticsPage Full Implementation Summary

**One-liner:** Full DiagnosticsPage replacing stub — all 7 state branches, 4 summary tiles with warning-count logic, agent connectivity table, system facts card, privacy & security card with calm checklist tone, responsive two-column layout, and accessible skeleton/retry patterns.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement DiagnosticsPage — loading/error branches and page header | 2ad017f | DiagnosticsPage.tsx |
| 2 | Implement agent table, system facts card, and privacy/security card | 2ad017f | DiagnosticsPage.tsx |

Both tasks implemented in a single file rewrite and committed atomically.

## What Was Built

**DiagnosticsPage.tsx** — 494-line complete implementation with:

**State branches:**
- `loading === true` → `aria-busy` skeleton container: 4 tile skeletons + agent/facts/privacy section skeletons (D-16)
- `error !== null && !loading` → retry panel with "Failed to load diagnostics" heading + Retry Load button (D-09)
- `data !== null && !loading` → full loaded view via `<LoadedContent>` sub-component
- During `refreshing` → spinner on Refresh button only; data stays visible (D-14)

**Summary tile row (4 tiles):**
- Tile 1: Readiness — green/red dot + Ready/Not ready + reason text when not ready (D-01, D-02, D-10)
- Tile 2: Events — total count + relative "Latest: N ago" or "No events yet" (D-03)
- Tile 3: Agent Warnings — count per D-06/D-07/D-08 rules (degraded, missing, unknown+0events; no-events excluded)
- Tile 4: Privacy Warnings — count (allowRemote, extraOrigins>0, ignoreFile.status=error)

**Agent Connectivity table:**
- Columns: Agent, Status, Events, Last Seen, Hook Config, Warnings
- Status badges: healthy=green, degraded=red, stale=amber, no-events=muted span (D-05, D-07)
- Hook Config badges: configured=green, missing=red, unknown=amber (D-08)
- Warnings capped at 2 items + "+N more" muted span (T-06-02-04 mitigated)
- Empty/first-run state: "No activity observed yet" hint with setup commands (D-11)

**System Facts card:**
- Version row with commit hash in monospace + build date
- DB Path with MonoPath component (monospace + truncate + title + copy button) (D-20)
- DB Size with formatBytes helper (B/KB/MB/GB)
- Total Events, Total Sessions, Latest Event rows with Separator between each

**Privacy & Security card:**
- Ignore File with MonoPath + status badge (loaded=green, missing_ok=muted "Not configured", missing=amber, error=red) (D-12)
- Active Rules count
- Bind Posture: loopback=green, remote/allowRemote=red "Remote enabled" warning badge (D-19)
- CORS Origins: extraOrigins=0=green "Local only", >0=amber "+N extra origins" (D-19)
- Export sensitivity Alert (always visible, no icon, bg=secondary) (D-18)

**Layout:**
- Two-column `lg:grid-cols-[1fr_360px]` on large screens, single-column stack on mobile (D-04)
- Page header with h1 visible in all states (accessibility contract)
- Updated timestamp near refresh button using formatDistanceToNow (D-15)

## Verification

- `npx tsc --noEmit` — no errors
- `npx vitest run` — 77/77 tests pass (0 regressions)
- `npx prettier --check` — passes (formatted before commit)
- All acceptance criteria for Task 1 and Task 2 verified via grep

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — DiagnosticsPage is fully implemented. All sections render from live data.

## Threat Flags

No new security-relevant surface beyond the plan's threat model.
T-06-02-04 (large warnings[] DoS) is mitigated: warnings display is capped at 2 items with "+N more" text.

## Self-Check: PASSED

- frontend/src/features/diagnostics/DiagnosticsPage.tsx — FOUND
- Task commit 2ad017f — verified via git log
- npx tsc --noEmit — PASSED
- npx vitest run — PASSED (77/77)
