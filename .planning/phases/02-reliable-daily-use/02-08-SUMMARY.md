---
phase: 02-reliable-daily-use
plan: "08"
subsystem: e2e-testing/playwright
tags: [playwright, e2e, smoke-test, ci, chromium, data-testid]
dependency_graph:
  requires:
    - 02-04  # export endpoints exist; backend binary builds cleanly
  provides:
    - playwright-e2e-smoke-test
    - ci-playwright-job
  affects:
    - playwright.config.ts
    - tests-e2e/smoke.spec.ts
    - package.json
    - .github/workflows/ci.yml
    - frontend/src/features/events/EventRow.tsx
    - frontend/src/features/dashboard/SummaryStats.tsx
    - frontend/src/features/projects/ProjectsPage.tsx
    - .gitignore
tech_stack:
  added:
    - "@playwright/test ^1.48.0 — E2E test runner at project root"
  patterns:
    - beforeAll fixture POST — POST Claude Code + Codex payloads via request.newContext() before page assertions
    - data-testid attributes — minimal selectors added to EventRow, SummaryStats, ProjectsPage for stable E2E targeting
    - CI playwright job with needs — runs after backend+frontend jobs, rebuilds all artifacts, health-checks server before tests
key_files:
  created:
    - playwright.config.ts
    - tests-e2e/smoke.spec.ts
    - package.json
  modified:
    - .github/workflows/ci.yml
    - frontend/src/features/events/EventRow.tsx
    - frontend/src/features/dashboard/SummaryStats.tsx
    - frontend/src/features/projects/ProjectsPage.tsx
    - .gitignore
decisions:
  - "projects page used for sessions assertion (not /sessions) — /sessions redirects to /projects; projects page shows session_count per CWD, which confirms session ingest worked"
  - "data-testid added to EventRow outermost div, SummaryStats stat value div, ProjectsPage Link element — minimal footprint; no semantic role conflicts"
  - "npm install at root (not pnpm) — project root has no pnpm-lock.yaml; npm is always available in ubuntu-latest without corepack; avoids lockfile divergence"
  - "root node_modules and package-lock.json added to .gitignore — Playwright binary is installed to ~/.cache/ms-playwright, not node_modules; only package.json needs tracking"
metrics:
  duration: "35 minutes"
  completed: "2026-05-26"
  tasks_completed: 2
  files_changed: 8
---

# Phase 2 Plan 08: Playwright E2E Smoke Test Summary

**One-liner:** Playwright chromium smoke test POSTs Claude Code + Codex fixtures via API then asserts events, projects, and dashboard pages show live data; CI job runs after backend+frontend jobs on every push/PR.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install Playwright + config + smoke test + data-testid attributes | 2abdc64 | package.json, playwright.config.ts, tests-e2e/smoke.spec.ts, EventRow.tsx, SummaryStats.tsx, ProjectsPage.tsx, .gitignore |
| 2 | Add playwright CI job to ci.yml | a99dd04 | .github/workflows/ci.yml |

## What Was Built

### Task 1 — Playwright Setup and Smoke Test

**package.json** (root): Created with `@playwright/test ^1.48.0` in devDependencies. Uses npm (not pnpm) — project root has no pnpm lockfile. `node_modules/` and `package-lock.json` added to `.gitignore`.

**playwright.config.ts**: Chromium-only, `headless: true`, `baseURL: http://127.0.0.1:8765`, `testDir: ./tests-e2e`. `webServer` block runs `go run ./cmd/server` for local dev with `reuseExistingServer: true` so it reuses an already-running server. CI ignores the webServer block (starts server manually before running tests).

**tests-e2e/smoke.spec.ts**: Three tests gated by a `beforeAll` that POSTs Claude Code and Codex fixtures to `/api/hook`:
- `events page shows at least one event row` — navigates to `/`, asserts `[data-testid="event-row"]` is visible
- `projects page shows at least one project` — navigates to `/projects`, asserts `[data-testid="project-card"]` is visible
- `dashboard page shows stat values` — navigates to `/dashboard`, asserts `[data-testid="stat-value"]` is visible

**data-testid additions** (minimal, no semantic conflicts):
- `EventRow.tsx`: `data-testid="event-row"` on the outermost `<div>` of each event row
- `SummaryStats.tsx`: `data-testid="stat-value"` on the stat value `<div>` inside each Card
- `ProjectsPage.tsx`: `data-testid="project-card"` on each project `<Link>` element

Frontend TypeScript compiles clean after changes (`tsc --noEmit` passes).

### Task 2 — CI Playwright Job

**ci.yml** `playwright` job added after `frontend` job:
- `needs: [backend, frontend]` — gates on both jobs passing
- Rebuilds frontend with pnpm (needed for go:embed), syncs dist into backend embed path
- Builds backend binary: `go build -o hooker ./cmd/server`
- Installs Playwright: `npm install && npx playwright install chromium --with-deps`
- Starts server: `DB_PATH=/tmp/hooker-playwright-ci.db ./backend/hooker &` with `until curl -sf healthz` health-check loop, `timeout-minutes: 1`
- Runs: `npx playwright test --project=chromium`
- On failure: uploads `playwright-report/` artifact (7-day retention) via `actions/upload-artifact@v4`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added .gitignore entries for Playwright output**
- **Found during:** Task 1 — after `npm install`, `git status` showed `node_modules/` and `package-lock.json` as untracked
- **Issue:** Root `.gitignore` only had `frontend/node_modules/`; new root-level Playwright install created tracked artifacts that should be ignored
- **Fix:** Added `node_modules/`, `package-lock.json`, `playwright-report/`, `test-results/` to `.gitignore`
- **Files modified:** `.gitignore`
- **Commit:** 2abdc64

**2. [Rule 1 - Deviation] Projects page used instead of sessions page**
- **Found during:** Task 1 — reading `App.tsx` revealed `/sessions` redirects to `/projects`; `SessionListPage` requires a CWD path parameter
- **Issue:** Plan said "sessions page shows at least one session" but there is no `/sessions` page — it redirects to `/projects`, and `SessionListPage` is at `/sessions/:encodedCwd` requiring a known CWD
- **Fix:** Smoke test navigates to `/projects` and asserts a project card is visible, which proves session ingest worked (projects are derived from sessions with `cwd` values)
- **Files modified:** `tests-e2e/smoke.spec.ts`
- **Commit:** 2abdc64

## Known Stubs

None. The smoke test has concrete page.locator() selectors backed by real data-testid attributes. All three assertions test live data from the fixture POST.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. Playwright test files are dev/CI-only and do not affect the runtime binary.

| Flag | File | Description |
|------|------|-------------|
| threat_flag: ci-artifact-disclosure | .github/workflows/ci.yml | playwright-report/ artifact uploaded on failure — contains screenshots/traces only from CI DB (ephemeral /tmp/hooker-playwright-ci.db); no user data |

Mitigated per T-02-08-03: 7-day retention, fresh DB per run.

## Self-Check: PASSED

- playwright.config.ts — FOUND
- tests-e2e/smoke.spec.ts — FOUND
- package.json — FOUND
- playwright.config.ts contains "chromium" — FOUND
- smoke.spec.ts contains "beforeAll" — FOUND
- ci.yml playwright job with needs: [backend, frontend] — FOUND
- ci.yml has "npx playwright test --project=chromium" — FOUND
- Commit 2abdc64 (Task 1) — FOUND
- Commit a99dd04 (Task 2) — FOUND
- frontend tsc --noEmit — PASSED (no errors)
- YAML syntax ci.yml — PASSED
