# hooker

## What This Is

hooker is a local-first monitoring dashboard for AI coding agent activity. It receives hook payloads from Claude Code, Codex, and Gemini CLI, normalizes them into a canonical event model, persists them to SQLite, and streams them to a React SPA in real time. It is built for solo developers who want visibility into coding-agent sessions without cloud dependencies.

## Core Value

A developer can install hooker from source, capture coding-agent activity locally, and trust that the app handles diagnostics, data durability, privacy controls, exports, and security posture without silent surprises.

## Current Milestone: v1.2 Polish & Cleanup

**Goal:** Improve component quality and eliminate technical debt across backend, frontend, tests, and docs — no new features.

**Target features:**
- Frontend component quality: Replace ad-hoc UI with proper shadcn primitives in Events, Sessions, Dashboard, Usage pages
- Backend Go cleanup: dead code, handler consolidation, over-concentrated EventService, duplicated query parsing
- Frontend TypeScript cleanup: inconsistent patterns, dead imports, prop drilling
- Test quality: flaky/slow tests, missing coverage
- Docs cleanup: outdated docs, stale comments, README drift

## Current State

**v1.1 Diagnostics shipped on 2026-05-29.** Both milestones are archived in `.planning/milestones/` and summarized in `.planning/MILESTONES.md`.

What is now in place:

- Source-install path with `./scripts/hooker setup`, `./scripts/hooker doctor`, quickstart/install/release docs, CI, and GoReleaser configuration.
- Runtime diagnostics: `/healthz`, `/readyz`, `/api/version`, version badge, startup validation, DB path visibility, and actionable fatal errors.
- Durable event model: raw payload archive, normalization metadata, degraded ingestion for unknown payloads, transactional migrations, WAL checkpointing, and export endpoints.
- Reliability and regression coverage: backend tests (176/176), frontend tests (87/87), Playwright smoke wiring, panic recovery, graceful shutdown, HTTP timeouts, and export round-trip tests.
- Privacy and security controls: host header validation, explicit CORS allowlist, loopback-only default bind, remote-bind opt-in, gitignore-style ignore file, privacy docs, and local threat model docs.
- Contributor guardrails: `CONTRIBUTING.md`, frontend-backend contract checklist, adapter fixture requirements, and ADRs for SQLite, normalization, local-first positioning, and proxy scope.
- Operator Diagnostics: `GET /api/diagnostics` with version/health/storage/agent/privacy/security sections; React DiagnosticsPage with 7 state branches, agent connectivity table, system facts card, and privacy & security card.

Known deferred close-out items:

- Phase 01 verification still needs human confirmation for clean-machine onboarding timing, GitHub settings/hosted CI, and migration-failure message quality.
- Phase 03 UAT still needs human confirmation for doctor privacy output, remote-bind runtime rejection, and end-to-end privacy gate behavior.
- Phases 4–6 have no VALIDATION.md (Nyquist) files; all phases have VERIFICATION.md with full evidence.

## Requirements

### Validated

- Hook event ingestion via `POST /api/hook` — existing before v1.0
- Agent normalization for Claude Code, Codex, Gemini CLI — existing before v1.0
- SQLite persistence with versioned migrations — existing before v1.0
- SSE real-time event streaming to browser — existing before v1.0
- React SPA: session browser, events feed, dashboard stats, usage breakdown — existing before v1.0
- Docker support with embedded static file serving — existing before v1.0
- Official Anthropic Go SDK integration — existing before v1.0
- Watcher worker for JSONL transcript polling — existing before v1.0
- Source-install quickstart that uses `go build` and reaches first-event capture path — v1.0
- Root helper script with `setup` and `doctor` subcommands — v1.0
- Layered docs: terse README plus quickstart, install, hooks, release, privacy, and security docs — v1.0
- pnpm standardization and frontend package-manager guardrails — v1.0
- CI for backend build/test/vet/lint and frontend typecheck/test/build — v1.0
- Versioned release pipeline with checksums and ldflag-injected version metadata — v1.0
- Health, readiness, and version endpoints plus frontend runtime version display — v1.0
- Startup diagnostics for port, DB path, migration/config, resolved DB location, and bind warnings — v1.0
- DB lifecycle docs for WAL, backup, reset, prune, privacy, NDJSON export, and SQLite snapshot export — v1.0
- Raw payload archive, normalizer version, agent version, and degraded ingestion status — v1.0
- Transactional migration runner and migration regression tests — v1.0
- Backend hardening: timeouts, panic recovery, slog, finite shutdown, WAL checkpointing — v1.0
- Export endpoints protected by `Sec-Fetch-Site` — v1.0
- Frontend hook/component tests and Playwright smoke wiring — v1.0
- Explicit privacy controls via `~/.config/hooker/ignore` / `HOOKER_IGNORE` — v1.0
- CORS allowlist and loopback-only default bind with `HOOKER_ALLOW_REMOTE=1` opt-in — v1.0
- Threat model, privacy posture, contributor guide, and architecture ADRs — v1.0
- Diagnostics backend data contract: `GET /api/diagnostics` grouped response with version, health/readiness, storage facts, aggregate counts, latest event timestamp, and captured-content non-leakage tests — v1.1 Phase 4
- Diagnostics agent/privacy/security backend contract: Claude Code and Codex telemetry/config rows, ignore file status/count, remote-bind/CORS posture counts, and export sensitivity warning — v1.1 Phase 5
- Operator Diagnostics page: compact React UI with 7 state branches, 4 summary tiles, agent connectivity table, system facts card, privacy & security card, responsive layout, and 87/87 tests — v1.1 Phase 6

### Active

**Milestone v1.2 Polish & Cleanup**

- [ ] Replace ad-hoc UI with proper shadcn primitives in Events, Sessions, Dashboard, and Usage pages
- [ ] Fix broken component patterns and inconsistencies across frontend
- [ ] Backend Go cleanup: dead code removal, handler consolidation, duplicated query parsing
- [ ] Frontend TypeScript cleanup: inconsistent patterns, dead imports, prop drilling
- [ ] Test quality: flaky/slow tests, missing coverage gaps
- [ ] Docs cleanup: outdated docs, stale comments, README drift

### Candidate Next Milestone Ideas

- Full-text search across prompts, paths, tools, errors, and models.
- Filter UI by agent, session, time range, model, event type, and status.
- Diagnostics UI for hook compatibility warnings, DB stats, app version, and normalizer versions.
- Richer diff navigation and code context.
- Agent/session comparison tools.
- Better token and cost analytics.
- Anomaly highlighting for failed tool runs and repeated retries.
- Built-in sample data mode for demos.

### Out of Scope

- Kubernetes / distributed tracing / horizontal scaling — local-first product, SQLite until proven bottleneck.
- Multi-tenant auth or cloud control plane — out of product scope.
- Native Windows first-class support — macOS/Linux/WSL are first-class; Windows documented separately.
- External adapter plugin system — keep adapters in-tree until ecosystem justifies the complexity.
- Remote sharing / ngrok support as an official feature — unofficial/advanced; public internet exposure not supported.
- Automatic PII redaction — creates false confidence; gitignore-style path exclusion is the current scope.
- curl-pipe-bash install script — wrong trust model for a tool that stores sensitive dev data.
- Replacing SQLite — not until real usage data demands it.

## Context

- **Solo developer project.** Decisions optimize for low operational overhead.
- **Architecture:** Layered Go monolith (config -> service -> repository) with embedded React SPA. Agent normalizers are in-tree strategy adapters.
- **Known architectural concerns:** `EventService` is over-concentrated; multiple handlers duplicate query parsing. These remain tracked in `.planning/codebase/ARCHITECTURE.md`.
- **Local usage scale target:** Dozens of sessions and years of history. SQLite remains the right default.
- **Planning state:** v1.0 artifacts are archived. New product work should begin with fresh requirements, not by extending the archived v1 requirement file.

## Constraints

- **Stack:** Go backend + React/TypeScript SPA; no new runtimes without strong justification.
- **Storage:** SQLite for all local use until real usage data proves otherwise.
- **Solo maintainer:** Avoid abstractions or CI overhead that creates maintenance tax without proportional value.
- **Source install first:** Docs and scripts must support source install as the primary path; Docker is secondary.
- **No breaking schema changes without migration and upgrade notes.**
- **Privacy:** Product captures prompts, diffs, tool outputs, file paths, raw payloads, and exports; data handling must stay explicit.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite as sole storage | Local-first, single-user, zero infra overhead | Good — validated in v1.0 |
| Agent normalizers as in-tree adapters | Too early for plugin complexity; fixture coverage is required for each | Good — contributor guide codifies this |
| Embedded React SPA in Go binary | Single-binary distribution; no separate static server | Good — release flow supports embedded frontend build |
| Source install as primary distribution | OSS users can inspect and run locally before trusting a sensitive-data tool | Good — quickstart/setup path is documented |
| Refactored out worker/queue/AI-insights | Reduced scope to core monitoring; deferred async AI features | Good — kept v1.0 focused |
| Official Anthropic Go SDK over custom HTTP client | Reduces maintenance burden; better error classification | Good — retained as existing foundation |
| pnpm standardization | Eliminates lockfile drift between contributors | Good — enforced in package metadata and CI |
| Export before advanced diagnostics UI | Backup/migration path is more urgent than UI polish | Good — NDJSON and snapshot export shipped in v1.0 |
| Gitignore-style privacy gate | Explicit path exclusion is clearer than unreliable automatic redaction | Good — shipped as local privacy control |
| Remote bind requires explicit opt-in | Local-first product should not silently expose sensitive data | Good — enforced with startup failure and warning |
| Diagnostics uses dedicated repository aggregate method | Avoids mixing diagnostics reads with dashboard/list flows | Good — DiagnosticsStorageStats() / DiagnosticsAgentStats() are separate concerns |
| hookconfig as separate Go package | Testable and reusable without shelling out to scripts/hooker | Good — doctor-equivalent detection in-process |
| HOOK-01 scope reduced to Claude Code + Codex | Gemini CLI not emitting compatible hook payloads; implementing would require spec work | Good — requirement updated at audit, no tech debt |
| Agent status "healthy" not "ok" | UI AgentStatusCell switch needs exact string match; "ok" hit the default case silently | Good — fixed at audit, prevented silent rendering failure |

## Evolution

This document evolves at milestone boundaries.

**After each milestone:**
1. Move shipped requirements to Validated.
2. Add new requirements for the next milestone only after fresh discovery.
3. Update Current State and known deferred items.
4. Revisit Key Decisions and mark outcomes.

---
*Last updated: 2026-05-29 after v1.2 Polish & Cleanup milestone start*
