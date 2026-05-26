# Phase 2: Reliable Daily Use - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the running hooker installation survive real daily use without data loss, stuck migrations, or silent failures. Deliver: raw payload preservation with degraded ingestion mode, transactional migration runner, export endpoints (NDJSON events + SQLite snapshot), backend process hardening (HTTP timeouts, graceful shutdown, panic recovery, structured logging, WAL checkpoint), and a CI-verified test suite (frontend RTL + hook tests + backend round-trip + normalization fixtures + Playwright smoke). No new product features — this phase is entirely about reliability and testability.

</domain>

<decisions>
## Implementation Decisions

### Raw Payload Schema (MODEL-01–04)

- **D-01:** Add raw payload and metadata as columns directly on the `events` table. New columns: `raw_payload BLOB`, `normalizer_version TEXT`, `agent_version TEXT`. No separate archive table — single table, no joins, minimal migration complexity.
- **D-02:** Store full raw bytes with no size cap. Full-fidelity matches the DATA-04/05 export goal; DB size is user-owned.
- **D-03:** `normalization_status` is a binary TEXT enum: `ok` | `degraded`. `ok` = fully normalized by a known agent; `degraded` = unknown payload or partial parse. No intermediate states in this phase.

### Degraded Event UX (MODEL-04)

- **D-04:** Degraded events show a `Badge` component on the event row in the feed. Uses existing `src/components/ui/Badge`. No global warning banner.
- **D-05:** Badge is a visual indicator only — not clickable/expandable. Raw payload not surfaced in the UI in this phase (kept in DB for export).

### Export Endpoints (DATA-04, DATA-05, SEC-05)

- **D-06:** `GET /api/export/events` returns a full NDJSON dump with no filter params. No `since`/`until`/`session` query params — full dump only. Filtering can be added in a later phase.
- **D-07:** SEC-05 gate: reject requests where `Sec-Fetch-Site: cross-site` (403). Allow requests where the header is absent (curl/wget/scripts continue to work). This protects against browser-based CSRF exfiltration without breaking CLI usage.
- **D-08:** `GET /api/export/snapshot` response headers: `Content-Disposition: attachment; filename=hooker-snapshot-{timestamp}.db` + `Content-Length`. No checksum header — user verifies with `sqlite3` if needed.

### Playwright Data Strategy (TEST-07)

- **D-09:** Playwright test setup POSTs known Claude Code + Codex fixture payloads to `/api/hook` before running assertions. Fully isolated and reproducible — no pre-seeded DB file, no dependency on existing data.
- **D-10:** Playwright runs on every push/PR in CI (same cadence as backend/frontend unit tests). Chromium-only, headless. Uses ubuntu-latest runner consistent with existing CI (Phase 1 D-09).

### Claude's Discretion

- HTTP timeout values (HARD-01): specific milliseconds for `ReadHeaderTimeout`, `ReadTimeout`, `IdleTimeout` — pick reasonable defaults (e.g., 5s/30s/120s).
- Graceful shutdown drain timeout (HARD-02): specific duration — pick a finite value (e.g., 15s).
- `slog` migration scope (HARD-04): full replacement of all `log.Printf` calls or new-code-only — pick whichever keeps the diff clean without introducing inconsistency.
- WAL checkpoint interval (HARD-06): specific duration for background goroutine schedule.
- Panic recovery middleware placement: alongside existing CORS/logging middleware in `backend/internal/server/middleware.go`.
- Migration transaction wrapping (HARD-05): implementation detail of the migration runner loop.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Full requirement IDs for Phase 2: DATA-04, DATA-05, MODEL-01 through MODEL-05, HARD-01 through HARD-06, TEST-01 through TEST-07, SEC-05
- `.planning/ROADMAP.md` §Phase 2 — Success criteria and phase boundary

### Schema + Persistence
- `backend/internal/repository/sqlite/sqlite.go` — Current events table schema; migration runner; all SQL queries that will need updating for new columns
- `backend/internal/repository/sqlite/migrations/` — Existing migration files; next migration adds `raw_payload`, `normalizer_version`, `agent_version`, `normalization_status` columns
- `backend/internal/repository/repository.go` — `EventRepository` interface; `Add()` and `ListEvents()` signatures that need new fields

### Domain + Normalization
- `backend/internal/domain/event.go` — `NormalizedEvent` struct; new fields (`RawPayload`, `NormalizerVersion`, `AgentVersion`, `NormalizationStatus`) added here first
- `backend/internal/agents/claudecode/claudecode.go` — Normalization entry point for Claude Code payloads; `Normalize()` sets new fields
- `backend/internal/agents/codex/codex.go` — Same contract for Codex; `Normalize()` sets new fields
- `backend/internal/handler/hook.go` — Where raw request body is read; `raw_payload` capture happens before normalization call

### Backend Hardening
- `backend/cmd/server/main.go` — HTTP server construction (HARD-01 timeout config) + graceful shutdown wiring (HARD-02)
- `backend/internal/server/middleware.go` — Panic recovery middleware (HARD-03) goes here alongside CORS/logging
- `backend/internal/server/router.go` — Export endpoint route registration; SEC-05 middleware wiring

### Frontend
- `frontend/src/features/events/EventRow.tsx` (or equivalent renderer) — Where degraded badge (D-04) renders
- `frontend/src/components/ui/Badge.tsx` — Existing shadcn Badge primitive to use for degraded indicator
- `frontend/src/types/events.ts` — Must add `normalization_status`, `normalizer_version`, `agent_version` to mirror backend domain changes

### Testing
- `backend/tests/internal/repository/sqlite/sqlite_test.go` — Existing backend test patterns (in-memory SQLite, helper constructors)
- `frontend/tests/` — Existing frontend test structure (Vitest + RTL, `tests/features/` layout)
- `.planning/codebase/TESTING.md` — Test patterns, mocking approach, run commands

### Prior Phase Context
- `.planning/phases/01-local-adoption-baseline/01-CONTEXT.md` — Phase 1 decisions (CI structure D-08/09/10/11, config pattern, handler-per-concern)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/internal/server/middleware.go`: Add panic recovery and SEC-05 Sec-Fetch-Site check here alongside CORS; already the middleware home
- `frontend/src/components/ui/Badge.tsx`: Degraded indicator (D-04) — no new component needed
- `frontend/src/components/ui/Collapsible.tsx`: Available if raw payload drill-down is added in a future phase
- `backend/tests/internal/repository/sqlite/sqlite_test.go`: `newTestDB`, `addEvent` helpers — reuse for new column tests and migration regression tests
- `backend/internal/agents/claudecode/claudecode.go` + `codex.go`: Fixture payloads for TEST-06 normalization regression tests live here

### Established Patterns
- Config via env vars (`ADDR`, `DB_PATH`) — extend for any new runtime config (e.g., shutdown timeout)
- Handler-per-concern in `backend/internal/handler/` — export handler goes in new `export.go`
- In-memory SQLite (`:memory:`) for unit tests; file-based DB for migration regression tests (TEST-05)
- Frontend hooks fetch `/api/*` — no change needed for export endpoints (browser-triggered download)
- `sync.Map` SSE subscriber registry in `service/event_service.go` — graceful shutdown must drain these

### Integration Points
- `backend/internal/repository/sqlite/sqlite.go`: New migration file + `Add()` query update for MODEL-01 columns
- `backend/internal/domain/event.go` + `frontend/src/types/events.ts`: Must stay in sync — add `normalization_status` to both
- `backend/internal/server/router.go`: Register `GET /api/export/events` and `GET /api/export/snapshot` routes
- `backend/cmd/server/main.go`: Wire `http.Server` with timeout fields; add `signal.NotifyContext` graceful shutdown
- CI (`ci.yml`): Add Playwright job step after backend/frontend jobs complete

</code_context>

<specifics>
## Specific Ideas

- Degraded badge should be low-profile — small muted variant, consistent with Phase 1 D-05 version badge style (small muted text).
- Playwright fixture payloads should reuse the same JSON fixtures used by TEST-06 normalization regression tests — single source of truth for known payload shapes.
- `VACUUM INTO` for snapshot (DATA-05): SQLite built-in, zero deps, produces a clean defragmented copy. No custom dump logic needed.
- Export NDJSON: stream row-by-row from SQLite cursor, don't buffer all rows in memory — important for large DBs.

</specifics>

<deferred>
## Deferred Ideas

- Raw payload drill-down in UI (clickable degraded badge) — noted, deferred to Phase 3 or later
- NDJSON export filter params (date range, session) — full dump sufficient for Phase 2; filtering can be added later
- SHA256 checksum header on snapshot — nice to have, deferred; user can run `sha256sum` locally
- Windows native binary — still deferred (WSL path, from Phase 1)
- Homebrew tap — still deferred (from Phase 1)

</deferred>

---

*Phase: 2-Reliable Daily Use*
*Context gathered: 2026-05-26*
