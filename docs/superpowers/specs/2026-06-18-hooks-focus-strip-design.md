# Design: Strip Argus to a hooks-focused tool

**Date:** 2026-06-18
**Status:** Approved (design phase)

## Goal

Refocus Argus on its core value — managing, configuring, and testing AI coding-agent
hooks — by removing the analytics surface area. After this change Argus is:

- Hooks config editor + presets
- Hook simulator
- Public hook script collection (registry / community)
- A **live events feed** as the only observability view

Everything related to dashboards, the projects explorer, the per-session explorer, and
**all token / usage tracking** (UI, API, and SQLite schema) is removed.

## Non-goals

- No change to hook ingestion: `POST /api/hook` keeps normalizing, persisting, and
  broadcasting events.
- No change to the simulator, hooks-config, scripts/collection, GitHub, or diagnostics
  features.
- No rejection of agent payloads that still contain token fields — normalization simply
  stops extracting them.

## End state

Observability collapses to the **events feed only**. Dashboard, Projects, and the
sessions explorer (per-cwd session list + file-changes view) are gone. No token/usage
concept survives anywhere in the stack.

---

## Section 1 — Frontend

### Delete entirely
- `frontend/src/features/dashboard/` (DashboardPage, `useDashboardStats`, date-range helpers)
- `frontend/src/features/projects/` (ProjectsPage)
- `frontend/src/features/sessions/SessionListPage.tsx`
- `frontend/src/features/sessions/SessionFileChangesPage.tsx`
- `frontend/src/features/sessions/FileChangesList.tsx`
- `frontend/src/features/sessions/hooks/`
- `frontend/src/hooks/useSessions.ts`

### Trim
- `features/sessions/utils.ts` — keep only `projectName` and `shortenCwd` (used by the
  events feed). Drop `isRunning`, `sessionDurationMs`, `formatDuration`, `formatTimeAxis`
  (only the deleted explorer used them).
- `App.tsx` — remove the `dashboard`, `projects`, `sessions`, `sessions/:encodedCwd`, and
  `sessions/:encodedCwd/:sessionId` routes and their lazy imports. Index route stays Events.
- `app/Sidebar.tsx` — remove the Dashboard and Projects nav items.
- `app/Layout.tsx` — remove `useSessions`, `sessionUsage`, and `refreshSessionUsage` from
  the outlet context. **Keep** `collapsedSessions` — it is the events feed's collapse state,
  not the explorer's.
- `features/events/EventsPage.tsx`, `AgentSession.tsx`, `SessionList.tsx` — remove the
  `sessionUsage` prop threading and the `usage-summary` / `usage-item` render blocks.
- `features/events/hooks/useEventFilters.ts` — drop the `/api/projects` fetch; derive the
  filter's session/project options from the already-loaded events (no network). This fully
  removes the project concept from the client.
- `types/events.ts` — remove `SessionUsage` and the `sessionUsage` / `refreshSessionUsage`
  members of `LayoutOutletContext`.
- `types/sessions.ts` + `types/index.ts` — remove `SessionUsageType`, `Session`,
  `SessionTreeNode`, and `Project` plus their barrel re-exports. Keep whatever `projectName`
  needs (it takes a plain `cwd: string`, so likely nothing).
- `lib/format.ts` — remove token-formatting helpers.

---

## Section 2 — Backend

### Delete entirely
- `internal/handler/dashboard.go` (+ its test)
- `internal/handler/projects.go` (+ its test)
- `internal/service/stats_cache_test.go`
- `internal/service/usage_throttle_test.go`
- `internal/service/backfill_test.go`
- Usage/stats portions of `internal/service/event_service_bench_test.go`

### Trim
- `internal/server/router.go` — remove routes: `/api/dashboard/stats`, `/api/projects`,
  `/api/session-usage`, `/api/sessions/tree`.
- `internal/service/event_service.go` — remove `GetDashboardStats`, session-usage,
  stats-cache, and usage-throttle logic plus the broadcast paths feeding them.
- `internal/repository/repository.go` + `internal/repository/sqlite/sqlite.go` — remove
  `GetDashboardStats`, `ListSessionsByCWDPage`, `GetSessionTree`, and session-usage queries;
  stop writing `session_model_usage` and token columns on ingest.
- `internal/domain/event.go` — remove `DashboardStats`, `Session`, `SessionTreeNode`, usage
  structs, and the **token fields on `NormalizedEvent`**.
- `internal/agents/claudecode/` + `internal/agents/codex/` — remove `ComputeUsage` and
  `ComputeUsageBreakdown`; trim `Normalize()` so it stops emitting token fields; update the
  normalization tests.
- `internal/fileutil/` — keep (context enrichment, not usage-specific) unless it proves
  usage-only on inspection.

### Migration (new file, next sequence number)
- `DROP TABLE session_model_usage`.
- Drop token columns from `events` / `sessions`. SQLite supports `ALTER TABLE ... DROP COLUMN`
  (3.35+); fall back to table-rebuild if needed. **Never edit existing migrations.** The
  existing downgrade guard already refuses to open a DB whose recorded version exceeds the
  binary's.

---

## Section 3 — Docs, data contract, verification

### Docs
- `CLAUDE.md` (project) — remove Dashboard / Projects / sessions-explorer / usage from the
  architecture map, endpoint list, "what lives where", and the single-sources-of-truth table
  (trim or drop the `sessions/utils.ts` entry).
- `README.md` — drop usage / dashboard / projects feature claims.
- `.planning/codebase/*` — update ARCHITECTURE / CONVENTIONS references to removed pieces.
- `backend/cmd/seed/` — trim the seeder so it no longer writes token / session-usage data.

### Data contract invariant
`domain/event.go` JSON tags must stay in sync with `types/events.ts` — there is no
transformation layer, so a mismatch breaks the contract silently. Token fields are removed
from both sides in the same change; verify both.

### Ingest still works
`POST /api/hook` continues to normalize → persist → broadcast. Agent payloads may still
contain token data; `Normalize()` just stops extracting it. No payloads are rejected.

### Verification gates
- Backend: `go build ./...` → `go test ./...` → `golangci-lint run ./...`
- Frontend: `npx tsc --noEmit` → `npx vitest run`
- Manual:
  - Ingest a hook payload → it appears in the events feed.
  - Removed routes 404; removed nav items gone.
  - A fresh DB migrates clean **and** an existing populated DB migrates (column drop) clean.

### Build order (single PR)
migration → domain/agents → repository/service → handlers/router → backend green →
frontend types → frontend features/routes → frontend green → docs.
