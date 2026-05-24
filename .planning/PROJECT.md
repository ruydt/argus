# hooker

## What This Is

hooker is a local-first monitoring dashboard for AI coding agent activity. It receives hook payloads from Claude Code, Codex, and Gemini CLI, normalizes them into a canonical event model, persists to SQLite, and streams to a React SPA in real time. Built for solo developers who want visibility into their coding agent sessions without cloud dependencies.

## Core Value

A developer can install hooker from source in under 10 minutes and trust that it reliably captures, stores, and surfaces their coding agent activity without data loss, silent failures, or upgrade surprises.

## Requirements

### Validated

- ✓ Hook event ingestion via `POST /api/hook` — existing
- ✓ Agent normalization for Claude Code, Codex, Gemini CLI — existing
- ✓ SQLite persistence with versioned migrations — existing
- ✓ SSE real-time event streaming to browser — existing
- ✓ React SPA: session browser, events feed, dashboard stats, usage breakdown — existing
- ✓ Docker support with embedded static file serving — existing
- ✓ Official Anthropic Go SDK integration — existing (migrated in recent refactor)
- ✓ Watcher worker for JSONL transcript polling — existing

### Active

**Milestone 1 — Local Adoption Baseline:**

- [ ] Source-install quickstart that works in under 10 minutes
- [ ] Root helper script (`./scripts/hooker`) with `setup` and `doctor` subcommands
- [ ] Layered docs: terse README + `docs/quickstart.md` + `docs/install.md` + `docs/hooks.md`
- [ ] `pnpm` standardization across frontend
- [ ] CI: backend tests, vet, lint + frontend typecheck + frontend build
- [ ] Versioned releases with checksums
- [ ] App version visible in backend logs and frontend UI
- [ ] `/healthz` and `/readyz` endpoints (with DB-open check)
- [ ] `doctor` command: required checks (Go, Node, DB writable, port free) + optional warnings (hook config missing, remote bind)
- [ ] Startup validation with actionable fatal error messages
- [ ] DB file location documented + backup/reset instructions
- [ ] JSON export and SQLite snapshot export paths
- [ ] Retention defaults documented; manual cleanup/prune command

**Milestone 2 — Reliable Daily Use:**

- [ ] Frontend regression coverage: component/hook tests + route smoke tests (Vitest + RTL)
- [ ] Backend graceful shutdown + HTTP timeouts (read, write, idle)
- [ ] Panic recovery middleware
- [ ] SQLite WAL documented, indexes reviewed, migration correctness tested
- [ ] End-to-end HTTP workflow test: ingest fixture payloads → verify via API
- [ ] Playwright smoke: load events/sessions/dashboard, verify core data visible
- [ ] Raw payload archive layer (canonical + raw event model)
- [ ] `normalizer_version` and `agent_version` fields on stored events
- [ ] Partial-ingest mode for unknown/drifted payloads with visible warnings

**Milestone 3 — Mature Local Product:**

- [ ] Semantic versioning with automated changelog from conventional commits
- [ ] Security threat model documented; loopback-only as enforced default
- [ ] CORS tightened; optional local auth for non-loopback use
- [ ] Privacy controls: ignore/exclusion patterns for repos/paths; data-capture warning in docs
- [ ] `CONTRIBUTING.md` + architecture overview + ADRs (SQLite choice, normalization strategy, local-first positioning)
- [ ] Contributor guardrails: new adapter contract, fixture coverage requirement

**Phase 4 — Product Features (deferred until M3 stable):**

- [ ] Full-text search across prompts, paths, tools, errors
- [ ] Filters by agent, session, time range, model, event type, status
- [ ] Diagnostics page in UI (hook compatibility warnings, DB stats, app version, normalizer version)
- [ ] Richer diff navigation and code context
- [ ] Agent/session comparison tools
- [ ] Better token and cost analytics
- [ ] Anomaly highlighting for failed tool runs / repeated retries
- [ ] Built-in sample data mode for demos

### Out of Scope

- Kubernetes / distributed tracing / horizontal scaling — local-first product, SQLite until proven bottleneck
- Multi-tenant auth or cloud control plane — out of product scope
- Native Windows first-class support — macOS/Linux/WSL are first-class; Windows documented separately
- Binary release artifacts — source install first, Docker second, binaries later
- External adapter plugin system — keep adapters in-tree until ecosystem justifies the complexity
- Remote sharing / ngrok support as official feature — unofficial/advanced; public internet exposure not supported

## Context

- **Solo developer project.** One maintainer — decisions optimize for low operational overhead, not team coordination.
- **Existing codebase is post-refactor.** Worker/queue/AI-insights layer removed in recent cleanup; official Anthropic Go SDK replacing custom HTTP client.
- **Architecture:** Layered Go monolith (config → service → repository) with embedded React SPA. Agent normalizers are strategy-pattern adapters. No global state library on frontend.
- **Known architectural concerns:** `EventService` is over-concentrated (ingestion + aggregation + SSE fanout); multiple handlers duplicate query parsing. Both are tracked in `.planning/codebase/ARCHITECTURE.md`.
- **Local usage scale target:** Dozens of sessions, years of history — SQLite is the right choice; no need to optimize for extreme scale.
- **Existing plan.md** contains full gap analysis and prioritized roadmap — this PROJECT.md supersedes it as GSD source of truth.

## Constraints

- **Stack:** Go backend + React/TypeScript SPA — no new runtimes without strong justification
- **Storage:** SQLite for all local use — no alternative until real usage data demands it
- **Solo maintainer:** Avoid abstractions or CI overhead that creates maintenance tax without proportional value
- **Source install first:** Docs and scripts must support source install as the primary path; Docker is secondary
- **No breaking schema changes without migration + upgrade notes**
- **Privacy:** Product captures prompts, diffs, tool outputs, file paths — data handling must be explicit, not implicit

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SQLite as sole storage | Local-first, single-user, zero infra overhead | — Pending |
| Agent normalizers as in-tree adapters | Too early for plugin complexity; fixture coverage is required for each | — Pending |
| Embedded React SPA in Go binary | Single-binary distribution; no separate static server | — Pending |
| Source install as primary distribution | OSS users expect it; Docker is secondary convenience | — Pending |
| Refactored out worker/queue/AI-insights | Reduced scope to core monitoring; deferred async AI features | — Pending |
| Official Anthropic Go SDK over custom HTTP client | Reduces maintenance burden; better error classification | — Pending |
| pnpm standardization | Eliminate lockfile drift between contributors | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-24 after initialization*
