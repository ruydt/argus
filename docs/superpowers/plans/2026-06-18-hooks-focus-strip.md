# Hooks-Focus Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Dashboard page, Projects page, sessions explorer, and all token/usage tracking so Argus focuses solely on hook management, simulation, and the script collection — keeping only the live events feed as observability.

**Architecture:** Backend stays handler→service→repository→domain. We delete the dashboard/projects/sessions-explorer/file-changes HTTP surface and the token-usage machinery (transcript scanning, `session_model_usage` table, usage columns), but keep a *minimal* `sessions` table (no usage columns) so `hook.go` keeps backfilling an event's model. A new forward-only migration drops the usage schema. Frontend deletes three feature directories and the sessions-explorer pages, trims the events feed's usage display, and derives the events project filter from loaded events instead of `/api/projects`.

**Tech Stack:** Go 1.25 (`net/http`, `modernc.org/sqlite`), React 19 + TypeScript + Vite + Vitest, Go `testing`.

## Global Constraints

- Backend done = `go build ./...` clean, `go test ./...` green, `golangci-lint run ./...` clean. Copy verbatim from CLAUDE.md.
- Frontend done = `npx tsc --noEmit` clean, `npx vitest run` green. Run `npx prettier --write` on changed files before commit.
- Prettier rules: no semicolons, single quotes, 2-space indent, trailing commas ES5, 100-char width.
- Never edit existing migrations; add a new `.sql` file with the next sequence number (next = `018`).
- `domain/event.go` JSON tags must stay in sync with `frontend/src/types/events.ts` — no transformation layer exists.
- Never import handler from service; never skip layers.
- Do NOT hand-edit `frontend/src/components/ui/*`.
- Commit after each task. Branch is `chore/v1-audit-fixes` (already checked out).

---

## Phase A — Backend: remove token/usage computation and schema

### Task A1: New migration — drop usage schema

**Files:**
- Create: `backend/internal/repository/sqlite/migrations/018_drop_usage.sql`
- Test: `backend/tests/internal/repository/sqlite/migration_usage_drop_test.go` (new) — or add to existing sqlite test package if one already targets migrations.

**Interfaces:**
- Produces: a `sessions` table with NO usage columns (`input_tokens`, `output_tokens`, `cache_creation_tokens`, `cache_read_tokens`, `turns` removed) and NO `session_model_usage` table.

- [ ] **Step 1: Write the migration SQL**

`backend/internal/repository/sqlite/migrations/018_drop_usage.sql`:

```sql
-- Argus refocus: remove all token/usage tracking. The sessions table keeps only
-- lifecycle + identity columns (used for per-event model backfill on ingest).
-- SQLite supports ALTER TABLE DROP COLUMN since 3.35; modernc.org/sqlite honors it.
DROP TABLE IF EXISTS session_model_usage;

ALTER TABLE sessions DROP COLUMN input_tokens;
ALTER TABLE sessions DROP COLUMN output_tokens;
ALTER TABLE sessions DROP COLUMN cache_creation_tokens;
ALTER TABLE sessions DROP COLUMN cache_read_tokens;
ALTER TABLE sessions DROP COLUMN turns;
```

- [ ] **Step 2: Write a failing test that a fresh in-memory DB migrates clean and the columns/table are gone**

`migration_usage_drop_test.go` (package `sqlite_test`):

```go
package sqlite_test

import (
	"testing"

	"argus/internal/repository/sqlite"
)

func TestMigration018DropsUsageSchema(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	// session_model_usage must not exist.
	var n int
	if err := db.DB().QueryRow(
		`SELECT count(*) FROM sqlite_master WHERE type='table' AND name='session_model_usage'`,
	).Scan(&n); err != nil {
		t.Fatalf("query master: %v", err)
	}
	if n != 0 {
		t.Fatalf("session_model_usage table still present")
	}

	// sessions must not have a turns column.
	rows, err := db.DB().Query(`SELECT name FROM pragma_table_info('sessions')`)
	if err != nil {
		t.Fatalf("pragma: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var col string
		if err := rows.Scan(&col); err != nil {
			t.Fatalf("scan: %v", err)
		}
		if col == "turns" || col == "input_tokens" {
			t.Fatalf("usage column %q still present on sessions", col)
		}
	}
}
```

> NOTE: This test calls `db.DB()` and `db.Close()`. If `*sqlite.DB` does not already expose a `DB()` accessor returning `*sql.DB` and a `Close()`, check `sqlite.go` for the existing test accessor pattern (other `sqlite_test` files in `backend/tests/internal/repository/sqlite/` show the real accessors) and use whatever they use. Do NOT add new exported methods just for the test if an accessor already exists.

- [ ] **Step 3: Run the test — expect FAIL**

Run: `cd backend && go test ./tests/internal/repository/sqlite/ -run TestMigration018DropsUsageSchema -v`
Expected: FAIL (migration file not yet picked up if embed list is explicit, OR columns still present). If migrations are auto-globbed via `//go:embed migrations/*.sql`, the file is picked up automatically; the test fails only if SQL is wrong.

- [ ] **Step 4: Confirm migration registration**

Check `backend/internal/repository/sqlite/sqlite.go` (or wherever migrations are embedded). If it uses `//go:embed migrations/*.sql` + sorted filenames, no code change needed. If migrations are listed explicitly, append `018_drop_usage.sql` to the list. Grep: `rg -n "go:embed|migrations/" backend/internal/repository/sqlite/*.go`.

- [ ] **Step 5: Run the test — expect PASS**

Run: `cd backend && go test ./tests/internal/repository/sqlite/ -run TestMigration018DropsUsageSchema -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/internal/repository/sqlite/migrations/018_drop_usage.sql backend/tests/internal/repository/sqlite/migration_usage_drop_test.go
git commit -m "feat(db): migration 018 drops token/usage schema"
```

---

### Task A2: Strip usage computation from agents

**Files:**
- Modify: `backend/internal/agents/claudecode/claudecode.go` (remove `ComputeUsageBreakdown`, line ~51)
- Modify: `backend/internal/agents/codex/codex.go` (remove `ComputeUsageBreakdown`, line ~132)
- Modify/Delete: any `*_test.go` in `backend/tests/internal/agents/**` asserting usage breakdown — remove those test funcs; keep `Normalize`/`MatchesTranscript` tests.

**Interfaces:**
- `Normalize()` and `MatchesTranscript()` are UNCHANGED — `NormalizedEvent` has no token fields, so normalization needs no edit.
- Removes: `claudecode.ComputeUsageBreakdown`, `codex.ComputeUsageBreakdown`, and the `domain.UsageBreakdown` / `domain.ModelUsageBreakdown` types once no longer referenced (handled in A4).

- [ ] **Step 1: Delete `ComputeUsageBreakdown` from `claudecode.go`**

Remove the entire `func ComputeUsageBreakdown(...) domain.UsageBreakdown { ... }` and any helper functions/consts used ONLY by it (e.g. transcript-token parsing helpers). Grep within the file for private helpers and confirm they have no other caller: `rg -n "funcName" backend/internal/agents/claudecode/`.

- [ ] **Step 2: Delete `ComputeUsageBreakdown` from `codex.go`** (same approach).

- [ ] **Step 3: Remove usage-breakdown agent tests**

Grep: `rg -ln "ComputeUsageBreakdown" backend/tests`. In each hit, delete the test functions that call it. Leave normalize/match tests intact.

- [ ] **Step 4: Build (will fail at service callers — expected, fixed in A3)**

Run: `cd backend && go build ./internal/agents/...`
Expected: PASS for the agents packages themselves.

- [ ] **Step 5: Commit** (the tree won't fully build until A3; commit the agent slice anyway to keep tasks atomic, or defer commit to end of A3 — implementer's choice. Prefer combining A2+A3 into one commit if `go build ./...` is the gate.)

```bash
git add backend/internal/agents
git commit -m "refactor(agents): remove usage breakdown computation"
```

---

### Task A3: Strip usage logic from the service

**Files:**
- Modify: `backend/internal/service/event_service.go`
- Delete: `backend/internal/service/stats_cache_test.go`, `backend/internal/service/usage_throttle_test.go`, `backend/internal/service/backfill_test.go`
- Modify: `backend/internal/service/event_service_bench_test.go` (remove usage/dashboard benchmarks; keep event-ingest/broadcast benchmarks)

**Interfaces:**
- `AddEvent` keeps: time normalization, dedup key, `repo.Add`, minimal `repo.UpsertSession` (new no-usage signature from A4), `broadcast`. It DROPS: `shouldComputeUsage`, `computeUsageBreakdown`, `ReplaceSessionModelUsage`, `usageScannedAt`.
- Removes these `EventService` methods entirely: `shouldComputeUsage`, `ListProjectsPage`, `DeleteProject`, `ListSessions`, `ListSessionsByCWD`, `GetDashboardStats`, `SetStatsCachedAt`, `BackfillMissingSessionUsage`, `enrichDashboardStats`, `GetSessionTree`, `ListSessionsByCWDPage`, `GetFileChanges`, and any usage cache helpers in `invalidateCaches`/`SetDiagCachedAt` that reference stats/usage caches.
- Keeps: `SessionModel` (reads sessions table), `SweepStaleSessions`/`MarkStaleSessions` (lifecycle — keep), event list methods, diagnostics, compact, prune, broadcast.

- [ ] **Step 1: Rewrite `AddEvent`** (replace lines ~127–167 inner block)

New body of the `if e.Session != "" { ... }` block:

```go
	if e.Session != "" {
		endedAt := endedAtForEvent(e)
		if err := s.repo.UpsertSession(
			e.Session,
			e.Agent,
			e.Model,
			e.Source,
			e.CWD,
			e.TranscriptPath,
			e.Time,
			endedAt,
		); err != nil {
			return err
		}
	}
	s.broadcast(e)
	return nil
```

- [ ] **Step 2: Delete `shouldComputeUsage`** (lines ~172–188) and any package-level `usageRescanInterval` const + `usageScannedAt` field on the `EventService` struct, plus `computeUsageBreakdown` dispatcher (the helper that switches on agent and calls `claudecode/codex.ComputeUsageBreakdown`).

- [ ] **Step 3: Delete the dashboard/projects/sessions/file-change service methods** listed in Interfaces above. After deleting, grep the file for now-unused imports (`sort`, `slices`, etc.) and remove them.

- [ ] **Step 4: Delete the three usage/stats test files**

```bash
git rm backend/internal/service/stats_cache_test.go backend/internal/service/usage_throttle_test.go backend/internal/service/backfill_test.go
```

- [ ] **Step 5: Trim `event_service_bench_test.go`** — remove benchmark funcs referencing dashboard/usage; keep ingest/broadcast benchmarks. If the whole file is usage-only, `git rm` it.

- [ ] **Step 6: Build service package**

Run: `cd backend && go build ./internal/service/...`
Expected: FAIL only on `repo.UpsertSession` arity (fixed in A4) and removed repo methods. That's expected; proceed to A4 before the full-build gate.

- [ ] **Step 7: Commit** (combine with A4 for a green gate, or commit now)

```bash
git add backend/internal/service
git commit -m "refactor(service): remove dashboard/usage/sessions-explorer logic"
```

---

### Task A4: Trim the repository contract + SQLite adapter + domain types

**Files:**
- Modify: `backend/internal/repository/repository.go`
- Modify: `backend/internal/repository/sqlite/sqlite.go`
- Modify: `backend/internal/domain/event.go`

**Interfaces:**
- New `UpsertSession` signature (drop the `usage domain.SessionUsage` param):
  `UpsertSession(sessionID, agent, model, source, cwd, transcriptPath, eventTime, endedAt string) error`
- Repository interface KEEPS: `Add`, `List`, `ListBySession`, `ListByTimeRange`, `ListBySessionsTimeRange`, `SessionModel`, `UpsertSession` (new sig), `DiagnosticsStorageStats`, `DiagnosticsAgentStats`, `ExportEvents`, `ExportSnapshot`, `GetRawPayload`, `Compact`, `PruneEvents`, `MarkStaleSessions`, `Ready`, `DBHealth`.
- Repository interface REMOVES: `ListProjectsPage`, `ListSessions`, `ListSessionsByCWD`, `ReplaceSessionModelUsage`, `GetSessionModelUsage`, `DeleteProjectByCWD`, `GetDashboardStats`, `GetSessionTree`, `ListSessionsByCWDPage`, `GetFileChanges`, `GetSessionFileChangeCounts`.
- `domain` REMOVES: `SessionUsage`, `DashboardStats`, `SessionTreeNode`, `Project`, `AgentModelUsage`, `DashboardSessionUsage`, `DashboardModelUsage`, `TokenTimelineBucket`, `TokenTimelineAgentBucket`, `AgentTimelineBucket`, `TimelineBucket`, `ActionCount`, `UsageBreakdown`, `ModelUsageBreakdown`, and the `Usage` field on `Session`. KEEPS: `NormalizedEvent`, `CtxLine`, `Session` (minus `Usage`), `FileChangeEvent`/`FileChangeGroup` only if still referenced (they are not after A3 — remove them too), diagnostics structs, `CompactResult`.

- [ ] **Step 1: Update `domain/event.go`**

Edit `type Session struct` to drop the `Usage SessionUsage` field (line 110) and `FileChangeCount` (line 111, only used by explorer). Delete the struct blocks for `SessionUsage`, `Project`, `SessionTreeNode`, `DashboardStats`, and every timeline/usage/action struct below it. Then grep for leftovers: `rg -n "FileChangeGroup|FileChangeEvent|ModelUsageBreakdown|UsageBreakdown" backend/internal` — delete any struct with zero remaining references.

- [ ] **Step 2: Update `repository.go`** — delete the removed method lines; change `UpsertSession` to the new signature.

- [ ] **Step 3: Update `sqlite.go`**

  - Change `UpsertSession` to the new signature; rewrite its SQL to the minimal columns:

```go
func (d *DB) UpsertSession(sessionID, agent, model, source, cwd, transcriptPath, eventTime, endedAt string) error {
	if eventTime == "" {
		eventTime = time.Now().UTC().Format(time.RFC3339)
	} else {
		eventTime = normalizeToUTC(eventTime)
	}
	endedAt = normalizeToUTC(endedAt)
	_, err := d.db.Exec(`
		INSERT INTO sessions (
			session_id, agent, model, source, cwd, transcript_path, started_at, last_seen_at, ended_at
		)
		VALUES (?,?,?,?,?,?,?,?,?)
		ON CONFLICT(session_id) DO UPDATE SET
			model        = COALESCE(NULLIF(excluded.model,''), sessions.model),
			last_seen_at = CASE
				WHEN datetime(excluded.last_seen_at) > datetime(sessions.last_seen_at)
				THEN excluded.last_seen_at
				ELSE sessions.last_seen_at
			END,
			ended_at = CASE
				WHEN (excluded.ended_at IS NULL OR excluded.ended_at = '')
					AND sessions.ended_at IS NOT NULL AND sessions.ended_at != ''
					AND datetime(excluded.last_seen_at) > datetime(sessions.ended_at)
				THEN NULL
				WHEN excluded.ended_at IS NULL OR excluded.ended_at = ''
				THEN sessions.ended_at
				WHEN (sessions.ended_at IS NULL OR sessions.ended_at = '')
					AND datetime(excluded.ended_at) >= datetime(sessions.last_seen_at)
				THEN excluded.ended_at
				WHEN sessions.ended_at IS NULL OR sessions.ended_at = ''
				THEN sessions.ended_at
				WHEN datetime(excluded.ended_at) > datetime(sessions.ended_at)
				THEN excluded.ended_at
				ELSE sessions.ended_at
			END`,
		sessionID, agent, model, source, cwd, transcriptPath, eventTime, eventTime, nullStr(endedAt),
	)
	return err
}
```

  - Delete the method bodies for all repository methods removed in Step 2 (`ListProjectsPage`, `ListSessions`, `ListSessionsByCWD`, `ReplaceSessionModelUsage`, `GetSessionModelUsage`, `DeleteProjectByCWD`, `GetDashboardStats`, `GetSessionTree`, `ListSessionsByCWDPage`, `GetFileChanges`, `GetSessionFileChangeCounts`). Remove now-unused private helpers and imports.

- [ ] **Step 4: Build the whole backend**

Run: `cd backend && go build ./...`
Expected: FAIL on handler/router references (fixed in A5). If anything else fails, fix the dangling reference before moving on.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/repository backend/internal/domain
git commit -m "refactor(repo,domain): drop usage/dashboard/projects contract + minimal sessions upsert"
```

---

## Phase B — Backend: remove HTTP surface

### Task B1: Delete dashboard/projects/sessions-explorer handlers + routes

**Files:**
- Delete: `backend/internal/handler/dashboard.go` (+ its test)
- Delete: `backend/internal/handler/projects.go` (+ its test)
- Delete: `backend/internal/handler/sessions.go` (the `Sessions` + `SessionsTree` handlers) and `backend/internal/handler/file_changes.go` if it exists (handler for `/api/file-changes`); plus their tests
- Modify: `backend/internal/server/router.go`
- Modify: `backend/internal/handler/hook.go` (only if it referenced removed service methods — it uses `svc.SessionModel`, which is KEPT, so likely no change)

**Interfaces:**
- Routes REMOVED from `router.go`: `GET /api/projects`, `DELETE /api/projects`, `GET /api/sessions`, `GET /api/sessions/tree`, `GET /api/file-changes`, `GET /api/dashboard/stats`.
- Routes KEPT: everything else (hook, events, events/stream, events/raw, version, diagnostics*, export*, hooks-config, hooks/simulate, github*, collection*, community*, `/`).

- [ ] **Step 1: Delete the handler files + their tests**

```bash
git rm backend/internal/handler/dashboard.go backend/internal/handler/projects.go backend/internal/handler/sessions.go
# delete matching tests; discover them:
rg -ln "DashboardStats|func TestProjects|SessionsTree|FileChanges\(" backend/tests backend/internal/handler
git rm backend/internal/handler/file_changes.go 2>/dev/null || true
```
Then `git rm` each test file the grep surfaced that targets the deleted handlers.

- [ ] **Step 2: Remove the six routes from `router.go`** (lines 103–108 plus the `/api/sessions` and `/api/file-changes` lines). Remove now-unused imports.

- [ ] **Step 3: Confirm `hook.go` still compiles** — it calls `svc.SessionModel` (kept). No change expected. If it referenced any removed method, repoint or drop that enrichment.

- [ ] **Step 4: Full backend build + tests + lint (the green gate)**

Run:
```bash
cd backend && go build ./... && go test ./... && golangci-lint run ./...
```
Expected: all PASS. Fix any dangling reference (a leftover handler test, an unused import) until green.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(api): remove dashboard/projects/sessions/file-changes endpoints"
```

---

## Phase C — Frontend: remove pages, routes, nav

### Task C1: Delete feature directories and the sessions explorer pages

**Files:**
- Delete: `frontend/src/features/dashboard/` (whole dir)
- Delete: `frontend/src/features/projects/` (whole dir)
- Delete: `frontend/src/features/sessions/SessionListPage.tsx`, `SessionFileChangesPage.tsx`, `FileChangesList.tsx`, and `frontend/src/features/sessions/hooks/` (whole dir)
- Delete: `frontend/src/hooks/useSessions.ts`
- Delete: any `__tests__` co-located with the above

**Interfaces:**
- `frontend/src/features/sessions/utils.ts` SURVIVES but is trimmed (Task C3). `projectName` is consumed by `features/events/AgentSession.tsx`.

- [ ] **Step 1: Delete the directories/files**

```bash
git rm -r frontend/src/features/dashboard frontend/src/features/projects
git rm frontend/src/features/sessions/SessionListPage.tsx frontend/src/features/sessions/SessionFileChangesPage.tsx frontend/src/features/sessions/FileChangesList.tsx
git rm -r frontend/src/features/sessions/hooks
git rm frontend/src/hooks/useSessions.ts
# delete any sessions explorer tests:
rg -ln "SessionListPage|SessionFileChangesPage|FileChangesList|useSessions|useFileChanges" frontend/src
```
`git rm` each test/file the grep surfaces that targets the deleted units (do NOT delete `utils.ts` or `AgentSession`).

- [ ] **Step 2: Do not build yet** — App.tsx/Sidebar still import these; fixed in C2. Proceed.

- [ ] **Step 3: Commit** (combine with C2 for a compiling gate)

---

### Task C2: Remove routes + nav items

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/app/Sidebar.tsx`

- [ ] **Step 1: Edit `App.tsx`** — remove the lazy imports `DashboardPage`, `ProjectsPage`, `SessionList`, `SessionFileChanges`, and the `<Route>` entries for `dashboard`, `projects`, `sessions` (the `<Navigate to="/projects">` redirect), `sessions/:encodedCwd`, and `sessions/:encodedCwd/:sessionId`. Index route stays `<Events />`. Keep `diagnostics`, `hooks-config`, `scripts`.

- [ ] **Step 2: Edit `Sidebar.tsx`** — remove the `NAV_ITEMS` entries `{ to: '/dashboard', ... }` (lines ~118–124) and `{ to: '/projects', ... }` (lines ~132–138). Remove now-unused icon imports (`LayoutDashboard`, `FolderOpen`) from the `lucide-react` import.

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors ONLY about `Layout`/types still referencing `sessionUsage` (fixed in C4) and events usage (C5). No errors about missing route components.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/app/Sidebar.tsx frontend/src/features frontend/src/hooks
git commit -m "feat(ui): remove dashboard/projects/sessions-explorer pages, routes, nav"
```

---

### Task C3: Trim `features/sessions/utils.ts`

**Files:**
- Modify: `frontend/src/features/sessions/utils.ts`

**Interfaces:**
- KEEPS exports still referenced outside the deleted explorer: `projectName` (used by `AgentSession.tsx`). Verify `shortenCwd` usage with grep; keep only if referenced.
- REMOVES: `isRunning`, `sessionDurationMs`, `formatDuration`, `formatTimeAxis` (only the deleted explorer used them).

- [ ] **Step 1: Confirm surviving consumers**

Run: `cd frontend && rg -n "from '@/features/sessions/utils'|projectName|shortenCwd|isRunning|sessionDurationMs|formatDuration|formatTimeAxis" src --glob '!src/features/sessions/utils.ts'`
Keep exactly the functions that still have a consumer; delete the rest. Remove the now-unused `Session` type import at the top of `utils.ts` (the deleted functions were the only ones typed against `Session`).

- [ ] **Step 2: Delete the unused functions** from `utils.ts`.

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: same residual errors as C2 (sessionUsage/events usage), nothing new from utils.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/sessions/utils.ts
git commit -m "refactor(ui): trim sessions utils to event-feed helpers only"
```

---

### Task C4: Remove `sessionUsage` from Layout + types

**Files:**
- Modify: `frontend/src/app/Layout.tsx`
- Modify: `frontend/src/types/events.ts`
- Modify: `frontend/src/types/sessions.ts`
- Modify: `frontend/src/types/index.ts`

**Interfaces:**
- `LayoutOutletContext` (in `types/events.ts`) REMOVES: `sessionUsage`, `refreshSessionUsage`. KEEPS: `collapsedSessions`, `setCollapsedSessions`, `searchQuery`, `setSearchQuery`, `isLive`, `setIsLive`.
- `types/events.ts` REMOVES the `SessionUsage` interface.
- `types/sessions.ts` REMOVES `SessionUsageType`, `Session`, `SessionTreeNode`, `Project` (whatever is no longer imported anywhere). Verify each with grep before deleting.

- [ ] **Step 1: Edit `Layout.tsx`** — remove `useSessions` import + call, the `sessionUsage` `useMemo` (lines ~111–117), and `sessionUsage`/`refreshSessionUsage` from the outlet context value object (lines ~134, ~139). Keep `collapsedSessions` and its persistence effect (events feed needs it).

- [ ] **Step 2: Edit `types/events.ts`** — delete the `SessionUsage` interface (lines 65–71) and the `sessionUsage`/`refreshSessionUsage` members of `LayoutOutletContext` (lines 83, 88).

- [ ] **Step 3: Edit `types/sessions.ts` + `types/index.ts`** — grep each exported type's consumers:

Run: `cd frontend && rg -n "SessionUsageType|SessionTreeNode|\bSession\b|\bProject\b" src/types src --glob '!src/types/sessions.ts'`
Delete from `sessions.ts` every type with no remaining external consumer, and remove its re-export from `index.ts`. `Project` is referenced by `useEventFilters.ts` until Task C6 lands — sequence C6 before deleting `Project`, or delete `Project` here and let C6 land in the same uncommitted batch.

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: errors now only in `features/events/*` (usage display) — fixed in C5.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/Layout.tsx frontend/src/types
git commit -m "refactor(ui): drop sessionUsage from layout context + types"
```

---

### Task C5: Strip usage display from the events feed

**Files:**
- Modify: `frontend/src/features/events/EventsPage.tsx`
- Modify: `frontend/src/features/events/AgentSession.tsx`
- Modify: `frontend/src/features/events/SessionList.tsx`
- Modify: `frontend/src/lib/format.ts`
- Modify: frontend agent descriptors that define `buildUsageItems` (grep to locate, likely `frontend/src/agents/*`)

**Interfaces:**
- `AgentSession`, `SessionList`, `EventsPage` lose the `sessionUsage` prop and the usage-summary render. They keep `collapsedSessions`, event grouping, and the `{events.length} events • {lastTimeLabel}` line.

- [ ] **Step 1: Edit `AgentSession.tsx`** — delete the `sessionUsage` usage block (lines ~123–146, the `{sessionUsage[sessionId] && agent.buildUsageItems && (() => { ... })()}` IIFE). Keep line 147 `{events.length} events • {lastTimeLabel}`. Remove the `sessionUsage` prop from the component's props type (line ~22) and destructure (line ~37). Remove the now-unused `formatTokenCount` import and `setTooltip`/tooltip wiring ONLY if the tooltip is used nowhere else in the file (grep `setTooltip` within the file first; the usage block may be its only consumer).

- [ ] **Step 2: Edit `SessionList.tsx`** — remove `sessionUsage` from props type (line ~13), destructure (line ~36), and the `sessionUsage={sessionUsage}` pass-through to `AgentSession` (line ~111).

- [ ] **Step 3: Edit `EventsPage.tsx`** — remove every `sessionUsage` reference: props types (lines ~100, ~250), destructures (lines ~134, ~250, ~323), the `useOutletContext` destructure of `sessionUsage` (near line 323), and all `sessionUsage={sessionUsage}` pass-throughs (lines ~164, ~207, ~301, ~553, ~574). Also remove `refreshSessionUsage` if destructured from the outlet context here.

- [ ] **Step 4: Edit agent descriptors** — grep `rg -n "buildUsageItems" frontend/src`. Remove the `buildUsageItems` method from each agent descriptor object and its type definition.

- [ ] **Step 5: Edit `lib/format.ts`** — remove `formatTokenCount` and any other token-only formatting helper. Confirm no other consumer first: `rg -n "formatTokenCount" frontend/src`.

- [ ] **Step 6: Type-check + tests + prettier**

Run:
```bash
cd frontend && npx prettier --write src/features/events src/lib/format.ts && npx tsc --noEmit && npx vitest run
```
Expected: tsc clean. Vitest may fail on events tests asserting usage display — update those tests to drop usage assertions (do not delete whole event tests). Re-run until green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/events frontend/src/lib/format.ts frontend/src/agents
git commit -m "refactor(ui): remove token-usage display from events feed"
```

---

### Task C6: Derive events project filter from loaded events (drop `/api/projects`)

**Files:**
- Modify: `frontend/src/features/events/hooks/useEventFilters.ts`
- Test: `frontend/src/features/events/__tests__/useEventFilters.test.tsx` (existing or new)
- Modify: `frontend/src/features/events/EventsPage.tsx` (remove any `refreshProjects()` call site)

**Interfaces:**
- `useEventFilters` return shape KEEPS `availableProjects: string[]` (now derived from events). It REMOVES `refreshProjects` from the return.
- No network call remains in this hook.

- [ ] **Step 1: Write the failing test** — `availableProjects` is the sorted unique set of event `cwd`s, with no fetch.

`frontend/src/features/events/__tests__/useEventFilters.test.tsx`:

```tsx
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { useEventFilters } from '../hooks/useEventFilters'
import type { EventRecord } from '@/types/events'

function ev(partial: Partial<EventRecord>): EventRecord {
  return { time: '2026-06-18T00:00:00Z', action: '', path: '', ...partial }
}

describe('useEventFilters availableProjects', () => {
  it('derives sorted unique cwds from events with no network call', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const events = [ev({ cwd: '/b' }), ev({ cwd: '/a' }), ev({ cwd: '/b' }), ev({ cwd: '' })]
    const { result } = renderHook(
      () =>
        useEventFilters(events, '', vi.fn(), '', 'all', vi.fn(), '', vi.fn(), '', vi.fn(), true),
      { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> }
    )
    expect(result.current.availableProjects).toEqual(['/a', '/b'])
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
```

> NOTE: match the exact positional argument order of `useEventFilters` (events, searchQuery, setSearchQuery, sessionFilterOverride, timeRange, setTimeRange, customStart, setCustomStart, customEnd, setCustomEnd, isLive). Adjust the call if the signature differs.

- [ ] **Step 2: Run the test — expect FAIL**

Run: `cd frontend && npx vitest run src/features/events/__tests__/useEventFilters.test.tsx`
Expected: FAIL (currently fetches `/api/projects`; `availableProjects` starts `[]`).

- [ ] **Step 3: Rewrite the project source in `useEventFilters.ts`**

Remove the `Project` import (line 5), the `availableProjects` `useState` + `projectsMountedRef` + `refreshProjects` + the two `useEffect`s and `usePollingInterval` that fetch `/api/projects` (lines 66–95). Replace with a derived memo mirroring `computedAgents`:

```ts
  const availableProjects = useMemo(() => {
    const cwds = new Set<string>()
    for (const e of events) {
      if (e.cwd) cwds.add(e.cwd)
    }
    return Array.from(cwds).sort()
  }, [events])
```

Remove `refreshProjects` from the returned object (line ~183). Drop the now-unused imports (`useCallback`, `useRef` if no longer used; `usePollingInterval`).

- [ ] **Step 4: Remove `refreshProjects` callers** — grep `rg -n "refreshProjects" frontend/src`; remove the call site(s) in `EventsPage.tsx`.

- [ ] **Step 5: Run the test — expect PASS**

Run: `cd frontend && npx vitest run src/features/events/__tests__/useEventFilters.test.tsx`
Expected: PASS

- [ ] **Step 6: Full frontend gate**

Run: `cd frontend && npx prettier --write src/features/events && npx tsc --noEmit && npx vitest run`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/events
git commit -m "refactor(ui): derive events project filter from loaded events"
```

---

## Phase D — Docs + seed + final verification

### Task D1: Update the dev seeder

**Files:**
- Modify: `backend/cmd/seed/` (main.go and any helpers)

- [ ] **Step 1: Find usage writes** — `rg -n "Usage|input_tokens|session_model_usage|ReplaceSessionModelUsage|UpsertSession" backend/cmd/seed`. Remove usage-data generation; update any `UpsertSession` call to the new no-usage signature (it most likely goes through `svc.AddEvent`, in which case no change is needed).

- [ ] **Step 2: Build + run seeder smoke**

Run: `cd backend && go build ./cmd/seed/ && go vet ./cmd/seed/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/cmd/seed
git commit -m "chore(seed): drop token/usage seed data"
```

---

### Task D2: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/STACK.md` (only where they reference removed pieces)

- [ ] **Step 1: `CLAUDE.md`** — in the architecture diagram, remove the `GET /api/dashboard/stats`, `GET /api/session-usage`, `GET /api/projects`, `GET /api/sessions/tree`, `GET /api/file-changes` lines. In "What lives where", remove `dashboard/`, `projects/`, and the sessions-explorer page bullets (keep `sessions/utils.ts` mention, trimmed). In the single-sources-of-truth table, trim the `features/sessions/utils.ts` row to the surviving helpers. Remove the "Per-model usage is persisted in `session_model_usage`" storage bullet and dashboard re-scan note.

- [ ] **Step 2: `README.md`** — remove dashboard/projects/usage feature claims; keep hooks config, simulator, scripts, events feed, diagnostics.

- [ ] **Step 3: `.planning/codebase/*`** — grep `rg -ln "dashboard|projects|session_model_usage|token|usage" .planning/codebase` and trim references to removed components.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md .planning/codebase
git commit -m "docs: remove dashboard/projects/usage references"
```

---

### Task D3: Final full-stack verification

- [ ] **Step 1: Backend gate**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: all green.

- [ ] **Step 2: Frontend gate**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: all green.

- [ ] **Step 3: Migration smoke on a populated DB** — verify an existing DB (with usage columns) migrates clean:

```bash
cd backend
# build a DB at the previous schema using the seeder, then re-open with the new binary:
go run ./cmd/seed --db /tmp/argus_migrate_test.db 2>/dev/null || true
go run ./cmd/server --help >/dev/null 2>&1 || true
# Simplest deterministic check: open the seeded DB via a one-off test that calls sqlite.New on a file path.
```
If a file-path open test does not already exist, add a quick `sqlite_test` case that copies a fixture DB created at schema 017 and asserts `sqlite.New(path)` succeeds (migration 018 applies the column drops). Expected: opens without error.

- [ ] **Step 4: Manual ingest smoke** — start the server, POST a sample Claude Code hook payload to `/api/hook`, confirm it appears via `GET /api/events`, and confirm `GET /api/dashboard/stats` and `GET /api/projects` now return 404.

```bash
cd backend && go run ./cmd/server &
sleep 1
curl -s -X POST localhost:10804/api/hook -H 'Content-Type: application/json' \
  -d '{"hook_event_name":"PreToolUse","session_id":"s1","cwd":"/tmp/p","transcript_path":"/x/.claude/t.jsonl","tool_name":"Bash"}'
curl -s 'localhost:10804/api/events?limit=5'
curl -s -o /dev/null -w '%{http_code}\n' localhost:10804/api/dashboard/stats   # expect 404
curl -s -o /dev/null -w '%{http_code}\n' localhost:10804/api/projects          # expect 404
kill %1
```
Expected: event present in the events list; both removed routes return 404.

- [ ] **Step 5: Final commit (if any doc/cleanup deltas)**

```bash
git add -A && git commit -m "chore: hooks-focus strip — final cleanup" || true
```

---

## Self-Review notes (for the executor)

- **Sequencing gotcha:** Backend won't fully build until Task A4 + B1 are both done (UpsertSession arity + route removal). Treat A2–A4 as a unit if you want a green build between commits, or accept red intermediate commits and rely on the B1 gate.
- **Frontend `Project` type:** referenced by `useEventFilters` until C6. Either land C4 (type deletion) and C6 (hook rewrite) in the same uncommitted batch, or delete `Project` in C6.
- **`SessionModel` is KEPT** — do not remove it; `hook.go` depends on it for model backfill, and the minimal `sessions` table still feeds it.
- **`ended_at` column** stays on the minimal sessions table (added by migration 007); UpsertSession keeps its lifecycle logic, only the 5 usage columns are dropped.
- **Tooltip wiring in AgentSession:** confirm whether `setTooltip` is used outside the usage block before removing it.
