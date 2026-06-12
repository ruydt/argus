# Events Page Search + Collapsible Filters — Design

Date: 2026-06-13
Status: Approved

## Problem

The events page has a complete search pipeline — `searchQuery` state in `Layout.tsx`, debounced
matching across event fields in `useEventFilters.ts`, and `highlight()` marking in event
renderers — but no input UI exposes it. Separately, the filter bar (Action/Agent/Project/Sort/
Time) takes significant horizontal space, especially in split view.

## Design

All UI changes live in `frontend/src/features/events/EventFilters.tsx`, with prop wiring in
`EventsPage.tsx`. No backend changes, no new dependencies, no changes to filter or highlight
logic.

### 1. Search control (magnifier → expanding input)

- Leftmost control in the filter bar: ghost icon button with the lucide `Search` icon.
- Clicking it expands an `Input` (~220px, CSS width transition) and autofocuses it.
- Input is controlled by `searchQuery` / `setSearchQuery`, passed as new props from
  `EventsPage` (already returned by `useEventFilters`).
- Escape clears the query and collapses the input. Blur with an empty query collapses.
  While the query is non-empty the input stays expanded so the active search is visible.
- Matching events are filtered and matches highlighted by the existing pipeline.

### 2. Collapsible filter group (funnel icon)

- `ListFilter` icon button next to the search control toggles visibility of the
  Action/Agent/Project/Sort/Time (+ custom range) group.
- Collapsed state persists in `sessionStorage` under `events_filters_collapsed`,
  matching the existing filter persistence pattern in `useEventFilters.ts`.
- When collapsed and any filter is non-default (action/agent/project ≠ all, sort ≠ newest),
  a green dot badge renders on the funnel icon.
- Live / Refresh / Split buttons remain always visible on the right side.

## Testing

Component tests in `frontend/src/features/events/__tests__/EventFilters.test.tsx`:

- Magnifier click expands input and focuses it.
- Typing calls `setSearchQuery` with the typed value.
- Escape clears query and collapses input.
- Funnel click hides the filter group; second click shows it.
- Dot badge renders when a filter is active and the group is collapsed.

Gate: `npx tsc --noEmit`, `npx vitest run`, prettier.
