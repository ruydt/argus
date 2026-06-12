# CPU Optimization — Design Spec

**Date:** 2026-06-13
**Status:** Approved (brainstorm complete)
**Scope:** Backend (Go) + Frontend (React), tiered fix-in-place. No new architecture, no new runtimes, no new dependencies.

## Motivation

Argus runs local-first on a developer's machine alongside coding agents. CPU it burns competes directly with the user's own work. A full-codebase audit found sustained idle burn (frontend timers/polls, per-request recomputation) and per-event spikes (ingest file reads, transcript scans). This spec fixes all HIGH and MED findings as one project.

## Accepted trade-offs

- Dashboard stats may be up to ~5s stale (server-side TTL cache).
- Hidden browser tab stops polling; data refreshes immediately on tab return.
- Header clock is scoped/simplified so the app shell stops re-rendering every second.
- Files larger than 2 MB skip hook context enrichment (event stored without context fields).

## Section 1 — Backend ingest hot path (`POST /api/hook`)

### 1a. Single file read in enrichment

`enrichContext` (`backend/internal/handler/hook.go:137-181`) currently causes two full reads of the target file: `fileutil.FindStartLine` and `fileutil.ComputeContext` each call `os.ReadFile` and split lines (`backend/internal/fileutil/fileutil.go:172-223`).

**Change:** read the file once in `enrichContext`, split lines once, pass `[]string` into both helpers.

- New functions: `FindStartLineInLines(lines []string, snippet string) int` and `ComputeContextFromLines(lines []string, ...)`.
- Existing `FindStartLine` / `ComputeContext` become thin wrappers (read file → delegate). Public API and existing tests preserved.
- Output identical to current behavior; half the I/O, one line-split instead of two.

### 1b. Size cap on enrichment

Files over **2 MB** skip context enrichment entirely. Event persists without context fields (already a valid state today when enrichment fails).

- Cap is a named constant in `fileutil`.
- Skip is logged via `log.Printf` at debug-style level (`[fileutil] skip enrichment path=... size=...`).

### 1c. Marshal-once SSE broadcast

`sendSSE` (`backend/internal/handler/events.go:163-169`) marshals the event per subscriber. With N subscribers, that is N identical `json.Marshal` calls per event.

**Change:** `EventService.broadcast` marshals once to `[]byte`; subscriber channels change from `chan domain.NormalizedEvent` to `chan []byte`; `sendSSE` writes bytes directly.

- Marshal failure: log and skip the broadcast. Event is already persisted; behavior matches today's failure semantics, just centralized.
- SSE handler ordering invariant preserved: subscribe before backfill (see `handler/events.go`).

## Section 2 — Backend read paths (dashboard, sessions, usage)

### 2a. Kill double transcript scan in dashboard stats

`GetDashboardStats` (`backend/internal/service/event_service.go:360-450`) calls `backfillSessionUsage` and then `enrichDashboardStats`, both of which scan the same transcript JSONL files via `computeUsageBreakdown`.

**Change:** `backfillSessionUsage` writes computed usage into the in-memory `sessions[i]` slice (and DB); `enrichDashboardStats` reuses those values and never re-scans. At most one scan per session per request — made rare by 2b.

### 2b. Usage computed at write time, not read time

`backfillSessionUsage` currently runs on every `ListSessions`, `ListSessionsByCWD`, `ListSessionsByCWDPage`, and `GetDashboardStats` call (`event_service.go:338-410`) — an N+1 file-scan pattern multiplied by request frequency.

**Change:**

- Remove `backfillSessionUsage` from all list read paths. Read paths become pure DB reads.
- Compute and persist usage in `AddEvent` when session-ending/stop events arrive (incremental, cheap).
- Existing sessions missing usage: one-time backfill goroutine on server startup. Low priority, logs progress per batch, errors logged per session, never crashes the server, runs once and exits.

### 2c. Dashboard stats TTL cache

Cache the full `GetDashboardStats` response keyed by query-range, **5s TTL**. Same pattern as the existing diagnostics cache.

- Single mutex + map. Bounded: distinct range keys are few.
- Invalidation: TTL only. No event-driven bust.
- On compute error: do not cache; next request retries.

### 2d. SQL tune-up

- Replace `datetime()` function predicates in dashboard queries (`backend/internal/repository/sqlite/sqlite.go:991-1163`) with direct `created_at` string comparisons — RFC3339 strings compare lexicographically, so indexes stay usable.
- Run `EXPLAIN QUERY PLAN` on dashboard aggregates. Add a composite index migration `(created_at, agent)` **only if** a table scan is confirmed. New `.sql` migration file with next sequence number; never edit existing migrations.

### 2e. `mergeChildProjects` O(n²) → O(n log n)

`mergeChildProjects` (`sqlite.go:515-565`) does a nested prefix-match loop.

**Change:** sort projects by CWD; the parent of any path is the nearest preceding prefix — single pass with a stack. Output identical; add a test asserting new algorithm equals old algorithm on a nested-paths fixture.

## Section 3 — Frontend idle burn

### 3a. Scoped header clock

`Layout.tsx:149` holds a 1s-interval `now` state that re-renders the entire app shell and outlet every second, indefinitely.

**Change:** extract a tiny `HeaderClock` component owning its own interval; `Layout` drops the `now` state. If the clock displays only minutes, interval drops to 30s. Single biggest idle win.

### 3b. Visibility-aware polling

Raw `setInterval` polls run even when the tab is hidden: `useSessions.ts:35-38` (5s), projects poll in `useEventFilters.ts:78-82` (15s).

**Change:** new shared hook `usePollingInterval(callback, ms)` in `frontend/src/hooks/`:

- Wraps `setInterval`; pauses when `document.hidden`.
- Listens to `visibilitychange`; on return to visible, fires callback immediately, then resumes interval.
- Replaces raw intervals in `useSessions`, `useEventFilters` projects poll, and any diagnostics/dashboard polls found during implementation.

Hidden tab → zero requests and zero render work; tab return → instant refresh.

### 3c. SSE handling unchanged

`useLiveEvents` already batches via `requestAnimationFrame` — keep. Downstream recompute per batch is bounded by Section 4 changes (filter/tree recompute at most once per frame).

## Section 4 — Frontend render efficiency

### 4a. Pre-format timestamps once

`EventRow.tsx:107,134` calls `toLocaleTimeString()` per row per render.

**Change:** format at ingestion time (when events enter state in `useEvents`/`useLiveEvents`) or via a memoized `Map<timestamp, string>` formatter cache in `lib/format.ts`. `EventRow` reads the cached string.

### 4b. Memoized highlight regex

`highlight()` (`format.ts:17-28`) builds a `new RegExp` per call per row.

**Change:** module-level cache of last query → compiled regex. Recompile only when query changes.

### 4c. Incremental filter guard

`useEventFilters.ts:102-137` re-filters the entire event array on every SSE batch.

**Change:** keep `useMemo`, add an append-path short-circuit: when the only change is new events appended (filter deps unchanged), filter just the new slice and concat. Track previous events length + a filter-deps signature via refs. Full re-filter only when any filter changes. Correctness invariant: append-path output must equal full re-filter output (tested).

### 4d. Stable session grouping

`SessionList.tsx:36-84` rebuilds and re-sorts the whole session tree per incoming event.

**Change:** split the memo:

- Group-by-session memo (deps: `events`).
- Sort memo (deps: groups, `sortOrder`) — sorts session headers only.
- Per-session event sort memoized via `Map` keyed by `sessionId + event count`.

### 4e. Chart prop stability

`TokenTimelineChart.tsx:37-40`, `ActivityPanel.tsx:34-60`: `chartConfig`, `labelByBucket`, `xAxisTicks` recreated per render → Recharts re-draws on identical data.

**Change:** hoist into `useMemo` with minimal deps so Recharts receives stable refs between polls when data is unchanged. Memoize `dashboard-utils.ts` timeline key generation by range key.

### 4f. Pagination math memo

`AgentSession.tsx:52-66`: `totalPages`/`pageStart`/`pageEnd` computed inline per render. Move into `useMemo`.

### Explicitly out of scope (YAGNI)

List virtualization, web workers, `useHistoricalEvents` array-copy optimization (paginated and bounded), `EventBadges` lookup memoization (trivial once row memo holds), backend caching-layer service, background indexer beyond the one-time startup backfill.

## Error handling summary

| Path | Failure | Behavior |
|---|---|---|
| Enrichment size cap | File > 2 MB | Skip enrichment, persist event without context, debug log |
| SSE broadcast | `json.Marshal` error | Log, drop broadcast only; persistence unaffected |
| Startup usage backfill | Per-session compute error | Log and continue; never crash server |
| Stats cache | Compute error | Don't cache; next request retries |

## Testing & verification

### Backend gates

`go build ./...` · `go test ./...` · `golangci-lint run ./...` — all green before any task is done.

Key new tests:

- Enrichment single-read equivalence: same output as current implementation on fixtures.
- Size-cap skip behavior.
- Marshal-once broadcast: subscriber receives byte-identical payload.
- Stats cache: hit within TTL, recompute after expiry, error-not-cached.
- `mergeChildProjects`: new vs old algorithm equality on nested fixture.
- Write-time usage persisted after `AddEvent` with stop event.

### Backend benchmarks (before/after numbers recorded in plan/PR)

1. `BenchmarkEnrichContext` — large file fixture.
2. `BenchmarkGetDashboardStats` — seeded in-memory DB, 100 sessions.
3. `BenchmarkBroadcast` — 5 subscribers, marshal-once vs per-subscriber.

### Frontend gates

`npx tsc --noEmit` · `npx vitest run` · `npx prettier --write` on changed files.

Key new tests (Vitest, fake timers + `document.hidden` mock where needed):

- `usePollingInterval`: pauses when hidden, resumes on visible, fires immediately on return.
- `HeaderClock`: ticks in isolation; `Layout` no longer re-renders per second.
- Filter short-circuit: append-path output equals full re-filter output.
- Highlight regex cache: correct matches across query changes.

### Manual QA

React DevTools profiler on Events page: idle tab shows ~0 commits/sec after clock scoping and visibility-aware polling.

## Audit findings retained for reference (already fine — do not touch)

- SSE rAF batching in `useLiveEvents` — keep.
- `EventRow` / `AgentSession` memoization — keep.
- SQLite WAL mode, busy timeout, hourly idle-session sweep, 5-min WAL checkpoint — keep.
- Existing indexes on `session_id`, `agent`, `created_at`, `hook_event_name`, `action` — sufficient except possibly 2d composite.
- `GetFileChanges` EXISTS subquery — well-indexed, keep.
