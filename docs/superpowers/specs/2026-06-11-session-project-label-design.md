# Session Project Label — Design

**Date:** 2026-06-11
**Status:** Approved
**Scope:** Show the project (cwd) each session belongs to in the Events page session list.

## Decision

Derive the project from the events already loaded (first non-empty `cwd` in the session group). No new fetch, no backend change. Plain text label — not clickable.

## Changes

- `frontend/src/types/events.ts` — `SessionGroup` gains `cwd: string` (frontend-only grouping type; no backend mirror exists for it).
- `frontend/src/features/events/SessionList.tsx` — grouping sets `cwd: event.cwd ?? ''` when creating a group and backfills it if the group's cwd is empty and a later event in the group carries one.
- `frontend/src/features/events/AgentSession.tsx` — in the session header, after the session-id span: a muted plain-text label rendering `shortenCwd(cwd)` with `title={cwd}` (full path on hover). Rendered only when cwd is non-empty. `shortenCwd` imported from `@/features/sessions/utils` — the mandated single source for session display formatting.
- Test in `frontend/tests/features/events/` — session header shows the shortened project for events with cwd; no label when events lack cwd.

## Out of scope

- Clickable navigation to the project's session list.
- Backend/API changes.
