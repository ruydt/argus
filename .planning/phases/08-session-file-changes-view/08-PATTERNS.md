---
phase: 08
slug: session-file-changes-view
status: complete
created: 2026-05-31
---

# Phase 08 Patterns - Session File Changes View

## Component Placement

- Keep route-level session UI in `frontend/src/features/sessions/`.
- Prefer feature-local components for file-change rows and snippets unless a component is already shared across features.
- Use `PascalCase.tsx` for components and `useX.ts` for hooks.
- Keep frontend tests under `frontend/tests/features/sessions/`.

## Data Pattern

- Continue using session route params from `TraceViewPage`.
- Continue fetching session metadata from `/api/sessions?cwd=...`.
- Continue fetching file changes through `useFileChanges(sessionId)`.
- Treat frontend-side pagination as a view concern over `FileChangeGroup[]`.

## UI Pattern

- Use shadcn `Button`, `Badge`, `Separator`, `Skeleton`, `Empty`, and optional `Card`.
- Use lucide icons for disclosure, pagination, files, and file types when needed.
- Keep the page neutral dark, compact, and operator-focused.
- Use mono text for paths, timestamps, line numbers, and snippets.
- Do not render trace controls, trace tree, timeline ticks, split panels, or trace inspection panels on the route.

## Testing Pattern

- Use Testing Library with `MemoryRouter`, `Routes`, and route params, following `frontend/tests/features/sessions/project-session-traces.test.tsx`.
- Use `vi.stubGlobal('fetch')` for API responses.
- Verify user-visible states: loading, error, empty, populated, expanded row, and pagination.
- Keep older pure trace utility tests if the underlying trace modules still exist, but route-level tests should assert the new file-change page behavior.

## Verification Pattern

- Frontend implementation should run:
  - `rtk cd frontend && pnpm run typecheck`
  - `rtk cd frontend && pnpm run lint`
  - `rtk cd frontend && pnpm run test -- tests/features/sessions`
- If backend files change, run backend Go tests relevant to file changes and repository behavior.
