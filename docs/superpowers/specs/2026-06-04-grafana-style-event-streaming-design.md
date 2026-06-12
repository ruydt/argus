# Grafana-Style Event Streaming Design

**Date:** 2026-06-04  
**Status:** Approved  

## Problem

The events page fetches at most 1000 events globally (or 5000 per session). Time range filtering is client-side on that capped set. Selecting "last 30 days" returns only the 1000 most recent events that happen to fall in that window — not all events in the range. There is no way to page through older history.

## Solution

Introduce two distinct event-fetching modes — **Live** and **Historical** — inspired by Grafana Explore. Live mode tails the SSE stream with a small backfill. Historical mode queries the server with time-range parameters and supports cursor-based pagination to load older events.

## Decisions

| Question | Decision |
|---|---|
| Live mode + long time range | Live ignores time range; picker disabled while live |
| Historical pagination | Cursor-based, newest-first, "Load more" fetches older events |
| Architecture | Two separate hooks; `EventsPage` mounts the active one |
| Page size | 200 events per page (max 500, server-clamped) |
| SSE backfill | Reduced from 1000 → 100 events |

## Architecture

```
Live mode (isLive=true)
  EventsPage
    └── useLiveEvents → EventSource /api/events/stream
                         backfill: 100 events
                         streams: new events indefinitely

Historical mode (isLive=false)
  EventsPage
    └── useHistoricalEvents(since, until, sessionFilter)
          initial:   GET /api/events?since=&until=&limit=200
          load more: GET /api/events?since=&until=&before_id=<cursor>&limit=200
          returns:   { events, hasMore, loadMore, loading, error, refresh }

useEventFilters (shared)
  owns:        actionFilter, agentFilter, projectFilter, searchQuery, sortOrder
  owns:        timeRange / customStart / customEnd (state + localStorage)
  exposes:     sinceISO, untilISO → passed to useHistoricalEvents
  no longer:   applies time-range filter to events (server handles it in historical; disabled in live)
```

Both hooks are always mounted in `EventsPage`. Each accepts an `enabled` param — the inactive hook makes no network calls.

## Backend Changes

### Repository (`sqlite.go`)

New method:

```go
func (d *DB) ListByTimeRange(
    since, until string,
    sessionID string,
    beforeID int64,
    limit int,
) (events []domain.NormalizedEvent, minID int64, hasMore bool, err error)
```

WHERE clause additions to `listWithWhere`:
```sql
AND created_at >= ?   -- since (RFC3339), if non-empty
AND created_at < ?    -- until (RFC3339), if non-empty
AND id < ?            -- beforeID, if > 0
AND session_id = ?    -- sessionID, if non-empty (existing)
```

Results ordered `id DESC`. `hasMore` = true when a row exists beyond the returned page.

### Repository interface (`repository.go`)

Add `ListByTimeRange` to `EventRepository` interface.

### Handler (`events.go`)

`GET /api/events` gains query params:

| Param | Type | Default | Notes |
|---|---|---|---|
| `since` | RFC3339 string | "" | Inclusive lower bound |
| `until` | RFC3339 string | "" | Exclusive upper bound |
| `before_id` | int64 | 0 | Cursor — fetch events with `id < before_id` |
| `limit` | int | 200 | Clamped to max 500 server-side |
| `session` | string | "" | Existing param, unchanged |

Response shape (extends existing):
```json
{
  "events": [...],
  "has_more": true,
  "next_cursor": 8432
}
```

Backward compatibility: no params → returns 1000 latest events unchanged.

### SSE handler (`events.go`)

`sseBackfillLimit = 100` replaces `defaultEventsLimit` (1000) for the SSE backfill call only. `defaultEventsLimit` remains for the no-param REST fallback.

### Migration

New file `backend/internal/repository/sqlite/migrations/NNNN_add_created_at_index.sql`:

```sql
CREATE INDEX IF NOT EXISTS idx_hook_events_created_at ON hook_events(created_at);
```

## Frontend Changes

### `useLiveEvents.ts` (refactor from `useEvents.ts`)

- Removes REST `reload` — live mode has no manual refresh
- SSE backfill comes from the stream (server sends 100 events on connect)
- Accepts `enabled: boolean` param — returns empty state and skips SSE when false
- Returns `{ events, error }`

### `useHistoricalEvents.ts` (new, `features/events/hooks/`)

```ts
function useHistoricalEvents(
  since: string,
  until: string,
  sessionFilter: string,
  enabled: boolean,
): {
  events: EventRecord[]
  hasMore: boolean
  loading: boolean
  error: string | null
  loadMore: () => void
  refresh: () => void
}
```

- Initial mount (when `enabled`): fetches first page
- `loadMore()`: appends next page using `before_id` = smallest `id` seen so far
- `refresh()`: clears state, re-fetches first page from scratch
- Re-fetches when `since`, `until`, or `sessionFilter` change
- When `enabled=false`: no network calls, returns empty state

### `useEventFilters.ts` (minor change)

- Removes time-range filtering from `filteredEvents` computation
- Still owns `timeRange`/`customStart`/`customEnd` + localStorage persistence
- Still updates `nowMs` on a 1s interval for live trailing windows
- Exposes `sinceISO: string` and `untilISO: string` derived from `timeRange`/`nowMs`/custom dates
- `filteredEvents` applies action/agent/project/search filters only (time already server-filtered in historical; not applicable in live)

### `EventsPage.tsx` (orchestration)

New state:
```tsx
const [isLive, setIsLive] = useState(true)
```

Both hooks always mounted, only the active one `enabled`:
```tsx
const liveState = useLiveEvents(sessionFilter, { enabled: isLive })
const histState = useHistoricalEvents(sinceISO, untilISO, sessionFilter, { enabled: !isLive })
const { events, ... } = isLive ? liveState : histState
```

Events list cleared on mode switch (each hook manages its own state and resets when `enabled` flips).

### UI additions to filter bar

- **Mode toggle**: `ToggleGroup` with "Live" (pulsing green dot) | "Historical" — leftmost position in filter bar
- **Time range picker**: `disabled` prop + greyed styling when `isLive=true`
- **Refresh button**: visible only when `!isLive`; calls `histState.refresh()`
- **Load more button**: rendered below event list; visible when `!isLive && hasMore && !loading`

## Error Handling

| Scenario | Behavior |
|---|---|
| Historical fetch fails | `error` set, `loading` cleared, user retries via Refresh button |
| SSE disconnects | Existing `onerror` handler — "Connection lost, reconnecting..." |
| `before_id` cursor points to deleted event | Server returns empty page + `has_more: false` — graceful end |
| `limit` out of range | Server clamps to 1–500, no client validation needed |

## Testing

### Backend (new tests)

- `TestListByTimeRange_sinceFilter` — events before `since` excluded
- `TestListByTimeRange_untilFilter` — events after `until` excluded
- `TestListByTimeRange_beforeID` — cursor pagination returns correct page
- `TestListByTimeRange_hasMore` — `has_more` true when more rows exist beyond the page
- `TestEventsHandler_timeRangeParams` — handler parses `since`/`until`/`before_id`/`limit`
- `TestEventsHandler_backwardCompat` — no params returns 1000 events, `has_more` false

### Frontend (new tests)

- `useHistoricalEvents.test.ts` — initial fetch, `loadMore` appends with cursor, `refresh` resets, param change triggers re-fetch, `enabled=false` skips fetch
- `EventsPage` mode toggle test — switching to Historical disables live hook; switching to Live clears historical events

Existing `useEvents` tests cover `useLiveEvents` (rename only, behavior unchanged).
