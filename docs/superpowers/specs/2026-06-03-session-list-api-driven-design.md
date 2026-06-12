# Session List: API-Driven with Lazy Event Loading

**Date:** 2026-06-03  
**Status:** Approved

## Problem

The Events page session list is derived entirely from the SSE event cache (capped at 1000 most-recent events). Under heavy usage, 1000 events covers only ~24 hours. Selecting "last 30 days" in the time range filter has no effect on the session list — it still shows only the sessions present in the event cache window.

Root cause: `SessionList` receives `filteredEvents: EventRecord[]` and groups them by session ID. The session list is bounded by the event cap, not the selected time range.

## Solution

Decouple the session list from the event cache. Fetch sessions from `GET /api/sessions?since=<RFC3339>` — which is not event-count-bounded — and render session headers from that API response. Events within each session are sourced from the existing SSE cache when available, and fetched lazily on expand for older sessions.

## Architecture

```
GET /api/sessions?since=<RFC3339> ──→ Session[]  (all sessions in time window)
SSE → 1000 events (newest) ─────────→ eventCache: Map<sessionId, EventRecord[]>

SessionList:
  for each Session from API:
    if sessionId in eventCache → render events normally (existing behavior)
    if not → show session header only; expand triggers GET /api/events?session=<id>
```

The session list is now correct for any selected time range. Events for recent sessions remain instant (already in SSE cache). Events for older sessions load on expand.

Split-view behavior is unchanged — sessions remain draggable between panels.

## Backend Changes

### `handler/sessions.go`
Add `since` param support to the non-`cwd` path (currently only the `cwd`+paginated path respects `since`):

```go
// Before
sessions, err = svc.ListSessions()

// After
sessions, err = svc.ListSessionsSince(since)
```

`since` is already validated as RFC3339 earlier in the handler — no new validation needed.

### `service/event_service.go`
Add `ListSessionsSince(since string)`:

```go
func (s *EventService) ListSessionsSince(since string) ([]domain.Session, error) {
    return s.repo.ListSessions(since)
}
```

Rename existing `ListSessions()` → `ListSessionsSince("")` internally, or add overload. All existing callers updated.

### `repository/sqlite/sqlite.go`
Update `ListSessions` signature to accept `since string`:

```go
func (d *DB) ListSessions(since string) ([]domain.Session, error) {
    where := ""
    args := []any{}
    if since != "" {
        where = "WHERE datetime(last_seen_at) >= datetime(?)"
        args = append(args, since)
    }
    // existing ORDER BY started_at DESC query + where clause
}
```

No schema migration needed — filters on existing `last_seen_at` column.

## Frontend Changes

### `useEventFilters.ts`
Export `sinceISO: string | null` — the selected time range expressed as an RFC3339 timestamp. Already computes `rangeStartMs`; just format it:

```ts
const sinceISO = rangeStartMs !== null ? new Date(rangeStartMs).toISOString() : null
```

### `useSessions.ts`
Add `since?: string` param. Pass to API: `GET /api/sessions?since=<iso>`. Poll every 5s (existing interval).

```ts
export function useSessions(since?: string) {
  // fetch /api/sessions + (since ? `?since=${since}` : '')
  // poll every 5s
}
```

### New: `useSessionEvents.ts`
Manages per-session lazy event fetches. Prevents duplicate requests. Exposes loading state per session.

```ts
type SessionEventsState = {
  events: EventRecord[]
  loading: boolean
  error: string | null
}

export function useSessionEvents() {
  const [state, setState] = useState<Map<string, SessionEventsState>>(new Map())

  const loadEvents = useCallback(async (sessionId: string) => {
    // skip if already loaded or loading
    // fetch GET /api/events?session=<sessionId>
    // store in state map
  }, [])

  return { sessionEvents: state, loadEvents, loadingIds: /* Set of in-flight IDs */ }
}
```

### `SessionList.tsx`
Signature change — accepts API sessions and event cache instead of raw `EventRecord[]`:

```tsx
// Before
type SessionListProps = {
  events: EventRecord[]
  // ...
}

// After
type SessionListProps = {
  sessions: Session[]                          // from API
  eventCache: Map<string, EventRecord[]>       // from SSE (recent events)
  sessionEvents: Map<string, SessionEventsState>  // lazy-fetched per session
  loadEvents: (sessionId: string) => void
  loadingIds: Set<string>
  // sortOrder, searchQuery, collapsedSessions, etc. unchanged
}
```

For each session, resolve events: `sessionEvents.get(id)?.events ?? eventCache.get(id) ?? []`.

### `AgentSession.tsx`
Accept `session: Session` (API type) for all header data. Events passed separately as `EventRecord[]` (may be empty).

- Agent badge: derived from `session.agent` string directly (no longer needs `firstEvent`)
- CWD, model, timestamps: from `session` fields
- Token usage: still from `sessionUsage` context (unchanged)
- If `events` is empty and session is expanded: show loading skeleton or trigger `loadEvents`

### `EventsPage.tsx`
Orchestrate both data sources:

```tsx
const { sinceISO, filteredEvents, ...rest } = useEventFilters(events, ...)
const { sessions } = useSessions(sinceISO ?? undefined)
const { events } = useEvents()
const eventCache = useMemo(() => groupBySessionId(events), [events])
const { sessionEvents, loadEvents, loadingIds } = useSessionEvents()
```

Pass `sessions`, `eventCache`, `sessionEvents`, `loadEvents`, `loadingIds` to `SessionList`.

Split-view panels: filter `sessions` by panel assignment (same logic as current `panel1Events`/`panel2Events`, but keyed on session ID).

## Testing

### Backend
- `handler/sessions_test.go`:
  - `GET /api/sessions?since=<RFC3339>` returns only sessions with `last_seen_at >= since`
  - `GET /api/sessions?since=invalid` returns 400
  - `GET /api/sessions` (no since) returns all sessions
- `sqlite_test.go`:
  - `ListSessions("")` returns all rows
  - `ListSessions(since)` with `since` set returns filtered subset

### Frontend
- `useSessions.test.ts`: assert `since` param is included in fetch URL when provided; omitted when not
- `useSessionEvents.test.ts`:
  - `loadEvents(id)` fetches once, not again on second call
  - Error state stored per session, does not affect other sessions
- `SessionList.test.tsx`:
  - Sessions from API with no cached events render session header without crashing
  - Expand triggers `loadEvents` callback
- `AgentSession.test.tsx`:
  - Renders from `Session` type with empty events without crash
  - Shows loading skeleton when `loadingIds` contains session ID

## Non-Goals

- Pagination of the session list on the Events page (out of scope)
- Changing the 1000-event SSE cap (not needed — event cache is now supplementary)
- Changing the 5000-event per-session fetch cap
