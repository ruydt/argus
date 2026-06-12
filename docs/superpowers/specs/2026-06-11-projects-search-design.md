# Projects Page Search — Design

**Date:** 2026-06-11
**Status:** Approved
**Scope:** Client-side search input filtering the Projects page card grid.

## Design

- shadcn `Input` in the Projects page header row (right-aligned), placeholder "Search projects…".
- Case-insensitive substring filter over `project.name` and `project.cwd`, applied live while typing.
- Zero matches → "No projects match" message (existing empty-state styling).
- Local `useState` only — no URL param, resets on navigation.
- Existing loading / no-projects states unchanged; filter applies only when projects exist.

## Testing

Extend `frontend/tests/features/projects/ProjectsPage.test.tsx`: typing narrows cards (non-matching disappears), match via cwd segment works, clearing restores all, zero-match message renders.

## Out of scope

- Server-side search, URL persistence, fuzzy matching.
