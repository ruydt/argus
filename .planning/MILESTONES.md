# Milestones

## v1.2 Polish & Cleanup (Shipped: 2026-06-01)

**Delivered:** Backend handler cleanup, a session file-change browser, focused frontend coverage, and stale docs cleanup.

**Phases completed:** 3 phases (7–9), 11 plans, 7 tasks  
**Archive:** [v1.2-ROADMAP.md](milestones/v1.2-ROADMAP.md), [v1.2-REQUIREMENTS.md](milestones/v1.2-REQUIREMENTS.md), [v1.2-MILESTONE-AUDIT.md](milestones/v1.2-MILESTONE-AUDIT.md)

**Key accomplishments:**

- Extracted shared backend pagination parsing and removed silent JSON encode failures across handlers.
- Added httptest coverage for dashboard, file_changes, health, usage, and version handlers.
- Replaced the session trace/timeline page with a paginated file-change browser showing expandable old/new snippets.
- Fixed Codex `apply_patch` visibility for both future normalized events and historical command-only rows.
- Added Vitest coverage for DiagnosticsPage, UsagePage, and VersionBadge rendering states.
- Removed stale active superpowers docs that referenced obsolete trace/timeline/session-waterfall direction.
- Completed formal verification and Nyquist validation for all v1.2 phases: 10/10 requirements satisfied.

---

## v1.0 MVP (Shipped: 2026-05-27)

**Phases completed:** 3 phases, 19 plans, 30 tasks  
**Archive:** [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md), [v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md), [v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md)

### Key Accomplishments

- Established source-install adoption path with setup/doctor tooling, build-first quickstart, install docs, release runbook, and a concise README.
- Added CI and release infrastructure: backend/frontend quality gates, pnpm enforcement, GoReleaser v2, tag-only releases, and checksums.
- Wired runtime diagnostics across backend and frontend: `/healthz`, `/readyz`, `/api/version`, startup diagnostics, resolved DB path logging, and the sidebar version badge.
- Hardened daily-use reliability with transactional migrations, raw payload storage, normalization metadata, degraded ingestion, HTTP timeouts, graceful shutdown, panic recovery, WAL checkpointing, and structured logging.
- Shipped data portability with streaming NDJSON export and full-fidelity SQLite snapshot export, protected by `Sec-Fetch-Site`.
- Added regression coverage across backend migrations/normalization/export, frontend hooks/components, and Playwright smoke wiring.
- Enforced local-first privacy and security posture with gitignore-style ignore rules, no-store/no-SSE privacy gate, explicit CORS allowlist, loopback-only default bind, and remote-bind opt-in warning.
- Documented mature contributor guardrails through `CONTRIBUTING.md`, frontend-backend contract checklist, adapter fixture requirements, and accepted ADRs.

### Known Deferred Items at Close

3 open human-verification items were acknowledged and deferred at milestone close; see `.planning/STATE.md` Deferred Items.

## v1.1 Diagnostics (Shipped: 2026-05-29)

**Phases completed:** 3 phases (4–6), 9 plans, 20 tasks  
**Archive:** [v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md), [v1.1-REQUIREMENTS.md](milestones/v1.1-REQUIREMENTS.md), [v1.1-MILESTONE-AUDIT.md](milestones/v1.1-MILESTONE-AUDIT.md)

### Key Accomplishments

- Defined typed diagnostics domain contract with grouped version/health/storage sections and targeted SQLite aggregate queries — no full-table scans.
- Wired `GET /api/diagnostics` end-to-end: service composition, read-only handler, router mount, and DB path propagation via server options.
- Added Claude Code and Codex agent telemetry rows with event count, last-seen timestamp, degraded warning status, and normalizer version.
- Implemented best-effort hook config detection (`configured`/`missing`/`unknown`) in a new `hookconfig` package matching doctor-known locations.
- Exposed privacy/security posture: ignore file path/status/pattern count, remote-bind posture, CORS origin counts, and export sensitivity warning — without leaking raw captured content.
- Built full `DiagnosticsPage` with 7 state branches, 4 summary tiles, agent connectivity table, system facts card, privacy & security card, and responsive two-column layout.
- Delivered 176/176 backend tests and 87/87 frontend tests covering all rendering states, route, and sidebar navigation.
- Closed 2 audit gaps at milestone boundary: HOOK-01 scope reduced to Claude Code + Codex; agent status `"ok"→"healthy"` mismatch fixed.

---
