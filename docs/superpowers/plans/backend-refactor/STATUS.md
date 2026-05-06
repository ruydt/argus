# Backend Refactor — Phase Tracker

## Handoff Context (read this first if picking up mid-way)

- **Repo:** `/Users/duytran/GitHub/codex-test`
- **Backend dir:** `backend/` — Go module `agent-monitor`, Go 1.23
- **SQLite driver:** `modernc.org/sqlite` (pure Go, no CGO — added in Phase 4)
- **Spec:** `docs/superpowers/specs/2026-05-06-backend-refactor-design.md`
- **Full plan:** `docs/superpowers/plans/2026-05-06-backend-refactor.md`
- **Skill to use:** `superpowers:executing-plans` or `superpowers:subagent-driven-development`

## Goal

Restructure backend from fat `main.go` to layered golang-standards/project-layout with SQLite persistence, SSE streaming, and extensible agent adapter pattern.

## Phase Status

| # | Phase | File | Status |
|---|-------|------|--------|
| 1 | Domain Types | [phase-01-domain-types.md](phase-01-domain-types.md) | ✅ Complete |
| 2 | Config Package | [phase-02-config.md](phase-02-config.md) | ✅ Complete |
| 3 | File Utilities | [phase-03-fileutil.md](phase-03-fileutil.md) | ✅ Complete |
| 4 | Repo Interface + Dep + Migrations | [phase-04-repository-interface.md](phase-04-repository-interface.md) | ⬜ Pending |
| 5 | SQLite Repository Implementation | [phase-05-sqlite-impl.md](phase-05-sqlite-impl.md) | ⬜ Pending |
| 6 | Service Layer + SSE | [phase-06-service.md](phase-06-service.md) | ⬜ Pending |
| 7 | Agent Adapters (Normalize) | [phase-07-agent-adapters.md](phase-07-agent-adapters.md) | ⬜ Pending |
| 8 | HTTP Handlers | [phase-08-handlers.md](phase-08-handlers.md) | ⬜ Pending |
| 9 | Server Router + Middleware | [phase-09-router.md](phase-09-router.md) | ⬜ Pending |
| 10 | Wire Up + Cleanup | [phase-10-wire-cleanup.md](phase-10-wire-cleanup.md) | ⬜ Pending |

## How to Resume After Usage Reset

1. Read this file to find the first ⬜ Pending or 🔄 In Progress phase
2. Open that phase file — it is **self-contained** with all code needed
3. Run: use `superpowers:executing-plans` skill and point it at the phase file
4. After each phase completes: update the status above from ⬜ → ✅

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Complete + committed |
| ❌ | Blocked — see notes column |
