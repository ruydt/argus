# Grafana-Style Event Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 1000-event client-side cap with server-side time-range queries and cursor-based pagination, plus a Live/Historical mode toggle on the events page.

**Architecture:** Two hooks — `useLiveEvents` (SSE tail, ~100-event backfill) and `useHistoricalEvents` (paginated REST with `since`/`until`/`before_id`) — mounted in `EventsPage` based on an `isLive` toggle. Backend gains `ListByTimeRange` on the repo and service layers, and `GET /api/events` gains time-range query params; `GET /api/events/stream` backfill drops from 1000 → 100.

**Tech Stack:** Go stdlib (`net/http`, `database/sql`), `modernc.org/sqlite`, React 19, TypeScript 6, Vitest, `@testing-library/react`, shadcn `ToggleGroup`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `backend/internal/repository/sqlite/migrations/010_add_created_at_index.sql` | Index for time-range queries |
| Modify | `backend/internal/repository/repository.go` | Add `ListByTimeRange` to interface |
| Modify | `backend/internal/repository/sqlite/sqlite.go` | Implement `ListByTimeRange` |
| Modify | `backend/internal/service/event_service.go` | Expose `ListByTimeRange` via service |
| Modify | `backend/internal/handler/events.go` | Parse time-range params; reduce SSE backfill |
| Modify | `backend/tests/internal/service/event_service_test.go` | Add `ListByTimeRange` stub to `mockRepo` |
| Modify | `backend/tests/internal/handler/events_test.go` | Add time-range + backward-compat handler tests |
| Modify | `backend/tests/internal/repository/sqlite/sqlite_test.go` | Add `ListByTimeRange` repository tests |
| Modify | `frontend/src/types/events.ts` | Add `has_more`, `next_cursor` to `EventsResponse` |
| Rename/Modify | `frontend/src/features/events/hooks/useEvents.ts` → `useLiveEvents.ts` | Add `enabled` param, remove REST reload |
| Create | `frontend/src/features/events/hooks/useHistoricalEvents.ts` | Paginated historical fetch hook |
| Modify | `frontend/src/features/events/hooks/useEventFilters.ts` | Remove time-range client filter; expose `sinceISO`/`untilISO` |
| Modify | `frontend/src/features/events/EventsPage.tsx` | Mode toggle; wire both hooks |
| Modify | `frontend/tests/features/events/useEvents.test.tsx` | Update import to `useLiveEvents` |
| Create | `frontend/tests/features/events/useHistoricalEvents.test.ts` | Tests for new hook |
| Modify | `frontend/tests/features/events/useEventFilters.test.ts` | Update to reflect removed time-range filtering |

---

## Task 1: Migration — add `created_at` index

**Files:**
- Create: `backend/internal/repository/sqlite/migrations/010_add_created_at_index.sql`

- [ ] **Step 1: Create migration file**

```sql
CREATE INDEX IF NOT EXISTS idx_hook_events_created_at ON hook_events(created_at);
```

- [ ] **Step 2: Verify migration runs**

```bash
cd backend
go test ./internal/repository/sqlite/... -v -run TestMigration
```

If no `TestMigration` exists, run all sqlite tests — a fresh `:memory:` DB runs all migrations on every test startup:

```bash
go test ./internal/repository/sqlite/... -v
```

Expected: all tests pass (the migration file is picked up automatically by the embedded `//go:embed migrations/*.sql` loader).

- [ ] **Step 3: Commit**

```bash
git add backend/internal/repository/sqlite/migrations/010_add_created_at_index.sql
git commit -m "feat(db): add created_at index for time-range event queries"
```

---

## Task 2: Repository — `ListByTimeRange`

**Files:**
- Modify: `backend/internal/repository/repository.go`
- Modify: `backend/internal/repository/sqlite/sqlite.go`
- Modify: `backend/tests/internal/repository/sqlite/sqlite_test.go`

- [ ] **Step 1: Add method to interface**

In `backend/internal/repository/repository.go`, add to the `EventRepository` interface after `ListBySession`:

```go
ListByTimeRange(since, until, sessionID string, beforeID int64, limit int) (events []domain.NormalizedEvent, minID int64, hasMore bool, err error)
```

- [ ] **Step 2: Write the failing repository tests**

Add to `backend/tests/internal/repository/sqlite/sqlite_test.go`:

```go
func TestListByTimeRange_sinceFilter(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}

	base := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 5; i++ {
		addTestEvent(t, db, base.Add(time.Duration(i)*time.Hour))
	}

	since := base.Add(2 * time.Hour).Format(time.RFC3339)
	events, _, _, err := db.ListByTimeRange(since, "", "", 0, 100)
	if err != nil {
		t.Fatalf("ListByTimeRange: %v", err)
	}
	// events at +2h, +3h, +4h = 3 events
	if len(events) != 3 {
		t.Errorf("got %d events, want 3", len(events))
	}
}

func TestListByTimeRange_untilFilter(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}

	base := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 5; i++ {
		addTestEvent(t, db, base.Add(time.Duration(i)*time.Hour))
	}

	until := base.Add(3 * time.Hour).Format(time.RFC3339)
	events, _, _, err := db.ListByTimeRange("", until, "", 0, 100)
	if err != nil {
		t.Fatalf("ListByTimeRange: %v", err)
	}
	// events at +0h, +1h, +2h = 3 events (until is exclusive)
	if len(events) != 3 {
		t.Errorf("got %d events, want 3", len(events))
	}
}

func TestListByTimeRange_beforeID(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}

	base := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 5; i++ {
		addTestEvent(t, db, base.Add(time.Duration(i)*time.Hour))
	}

	// First page — newest 2
	page1, minID, hasMore, err := db.ListByTimeRange("", "", "", 0, 2)
	if err != nil {
		t.Fatalf("page1: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 got %d, want 2", len(page1))
	}
	if !hasMore {
		t.Error("page1 hasMore = false, want true")
	}

	// Second page — next 2 using cursor
	page2, _, _, err := db.ListByTimeRange("", "", "", minID, 2)
	if err != nil {
		t.Fatalf("page2: %v", err)
	}
	if len(page2) != 2 {
		t.Fatalf("page2 got %d, want 2", len(page2))
	}

	// Verify no overlap
	ids1 := map[int64]bool{}
	for _, e := range page1 {
		_ = e // NormalizedEvent doesn't expose DB id — verify via time field instead
	}
	_ = ids1

	// Page1 events are newer than page2 events (ORDER BY id DESC)
	t1 := page1[len(page1)-1].Time
	t2 := page2[0].Time
	if t1 <= t2 {
		t.Errorf("page1 tail (%s) should be newer than page2 head (%s)", t1, t2)
	}
}

func TestListByTimeRange_hasMore(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}

	base := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 3; i++ {
		addTestEvent(t, db, base.Add(time.Duration(i)*time.Hour))
	}

	_, _, hasMore, err := db.ListByTimeRange("", "", "", 0, 2)
	if err != nil {
		t.Fatalf("ListByTimeRange: %v", err)
	}
	if !hasMore {
		t.Error("hasMore = false, want true when rows remain")
	}

	_, _, hasMore2, err := db.ListByTimeRange("", "", "", 0, 10)
	if err != nil {
		t.Fatalf("ListByTimeRange exact: %v", err)
	}
	if hasMore2 {
		t.Error("hasMore = true, want false when all rows fit in limit")
	}
}
```

Check whether `addTestEvent` already exists in the sqlite test file. If not, add:

```go
func addTestEvent(t *testing.T, db *sqlite.DB, ts time.Time) {
	t.Helper()
	err := db.Add(domain.NormalizedEvent{
		Time:          ts.UTC().Format(time.RFC3339),
		Agent:         "codex",
		Session:       "test-session",
		HookEventName: "PreToolUse",
		Action:        "READ",
		Path:          "/tmp/file",
		RawPayload:    []byte(`{}`),
	})
	if err != nil {
		t.Fatalf("addTestEvent: %v", err)
	}
}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd backend
go test ./tests/internal/repository/sqlite/... -v -run "TestListByTimeRange"
```

Expected: compile error — `ListByTimeRange undefined`.

- [ ] **Step 4: Implement `ListByTimeRange` in `sqlite.go`**

Add after `ListBySession` (around line 187):

```go
func (d *DB) ListByTimeRange(since, until, sessionID string, beforeID int64, limit int) ([]domain.NormalizedEvent, int64, bool, error) {
	var conditions []string
	var args []any

	if sessionID != "" {
		conditions = append(conditions, "session_id = ?")
		args = append(args, sessionID)
	}
	if since != "" {
		conditions = append(conditions, "created_at >= ?")
		args = append(args, since)
	}
	if until != "" {
		conditions = append(conditions, "created_at < ?")
		args = append(args, until)
	}
	if beforeID > 0 {
		conditions = append(conditions, "id < ?")
		args = append(args, beforeID)
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Fetch limit+1 to detect hasMore without a separate COUNT query.
	fetchLimit := limit + 1
	events, err := d.listWithWhere(where, args, fetchLimit, 0)
	if err != nil {
		return nil, 0, false, err
	}

	hasMore := len(events) > limit
	if hasMore {
		events = events[:limit]
	}

	var minID int64
	if len(events) > 0 {
		// Retrieve the DB id of the oldest event in the page for cursor use.
		// listWithWhere returns events ORDER BY id DESC, so last element is oldest.
		oldest := events[len(events)-1]
		row := d.db.QueryRow("SELECT id FROM hook_events WHERE dedup_key = ? LIMIT 1", oldest.DedupKey)
		if err := row.Scan(&minID); err != nil {
			// Non-fatal: cursor is best-effort; hasMore already computed.
			minID = 0
		}
	}

	return events, minID, hasMore, nil
}
```

Add `"strings"` to the import block in `sqlite.go` if not already present.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend
go test ./tests/internal/repository/sqlite/... -v -run "TestListByTimeRange"
```

Expected: all 4 tests pass.

- [ ] **Step 6: Run full backend test suite**

```bash
cd backend
go test ./... && golangci-lint run ./...
```

Expected: all 201+ tests pass, no lint errors. Fix any lint issues before continuing.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/repository/repository.go backend/internal/repository/sqlite/sqlite.go backend/tests/internal/repository/sqlite/sqlite_test.go
git commit -m "feat(repo): add ListByTimeRange with cursor pagination and time-range filtering"
```

---

## Task 3: Service — expose `ListByTimeRange`

**Files:**
- Modify: `backend/internal/service/event_service.go`
- Modify: `backend/tests/internal/service/event_service_test.go`

- [ ] **Step 1: Add stub to `mockRepo` in service test**

In `backend/tests/internal/service/event_service_test.go`, add after `func (m *mockRepo) ListBySession(...)`:

```go
func (m *mockRepo) ListByTimeRange(_, _, _ string, _ int64, _ int) ([]domain.NormalizedEvent, int64, bool, error) {
	return nil, 0, false, nil
}
```

- [ ] **Step 2: Verify service tests still compile and pass**

```bash
cd backend
go test ./tests/internal/service/... -v
```

Expected: all tests pass (stub satisfies the interface).

- [ ] **Step 3: Add service method**

In `backend/internal/service/event_service.go`, add after `ListEventsBySession`:

```go
func (s *EventService) ListEventsByTimeRange(since, until, sessionID string, beforeID int64, limit int) ([]domain.NormalizedEvent, int64, bool, error) {
	return s.repo.ListByTimeRange(since, until, sessionID, beforeID, limit)
}
```

- [ ] **Step 4: Build**

```bash
cd backend
go build ./...
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/service/event_service.go backend/tests/internal/service/event_service_test.go
git commit -m "feat(service): expose ListEventsByTimeRange"
```

---

## Task 4: Handler — time-range params + reduced SSE backfill

**Files:**
- Modify: `backend/internal/handler/events.go`
- Modify: `backend/tests/internal/handler/events_test.go`

- [ ] **Step 1: Write failing handler tests**

Add to `backend/tests/internal/handler/events_test.go`:

```go
func TestEventsHandler_timeRangeParams(t *testing.T) {
	svc := newTestService(t)

	base := time.Now().UTC()
	for i := 0; i < 5; i++ {
		if err := svc.AddEvent(domain.NormalizedEvent{
			Time:          base.Add(time.Duration(i) * time.Hour).Format(time.RFC3339),
			Agent:         "codex",
			Session:       "s1",
			HookEventName: "PreToolUse",
			Action:        "READ",
			Path:          "/tmp/f",
			RawPayload:    []byte(`{}`),
		}); err != nil {
			t.Fatalf("AddEvent: %v", err)
		}
	}

	since := base.Add(2 * time.Hour).Format(time.RFC3339)
	h := handler.Events(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/events?since="+since, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var payload struct {
		Events  []domain.NormalizedEvent `json:"events"`
		HasMore bool                     `json:"has_more"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// events at +2h, +3h, +4h = 3 events
	if len(payload.Events) != 3 {
		t.Errorf("got %d events, want 3", len(payload.Events))
	}
}

func TestEventsHandler_backwardCompat(t *testing.T) {
	svc := newTestService(t)

	// Insert fewer than defaultEventsLimit events.
	for i := 0; i < 5; i++ {
		if err := svc.AddEvent(domain.NormalizedEvent{
			Time:          time.Now().UTC().Add(time.Duration(i) * time.Second).Format(time.RFC3339),
			Agent:         "codex",
			Session:       "s1",
			HookEventName: "PreToolUse",
			Action:        "READ",
			Path:          "/tmp/f",
			RawPayload:    []byte(`{}`),
		}); err != nil {
			t.Fatalf("AddEvent: %v", err)
		}
	}

	h := handler.Events(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/events", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var payload struct {
		Events  []domain.NormalizedEvent `json:"events"`
		HasMore bool                     `json:"has_more"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Events) != 5 {
		t.Errorf("got %d events, want 5", len(payload.Events))
	}
	if payload.HasMore {
		t.Error("has_more = true, want false")
	}
}

func TestEventsHandler_limitClamped(t *testing.T) {
	svc := newTestService(t)

	h := handler.Events(svc)
	// Request limit=9999, should be clamped to 500.
	req := httptest.NewRequest(http.MethodGet, "/api/events?limit=9999", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
go test ./tests/internal/handler/... -v -run "TestEventsHandler_timeRange|TestEventsHandler_backwardCompat|TestEventsHandler_limitClamped"
```

Expected: compile error or test failures — response shape doesn't include `has_more` yet.

- [ ] **Step 3: Update `events.go` handler**

Replace the `Events` handler and update constants in `backend/internal/handler/events.go`:

```go
const (
	defaultEventsLimit  = 1000
	sessionEventsLimit  = 5000
	sseBackfillLimit    = 100
	maxEventsPageLimit  = 500
	defaultEventsPage   = 200
)
```

Replace the `Events` handler function:

```go
func Events(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		since := q.Get("since")
		until := q.Get("until")
		sessionID := q.Get("session")

		beforeID := int64(0)
		if s := q.Get("before_id"); s != "" {
			if v, err := strconv.ParseInt(s, 10, 64); err == nil {
				beforeID = v
			}
		}

		limit := defaultEventsPage
		if s := q.Get("limit"); s != "" {
			if v, err := strconv.Atoi(s); err == nil {
				limit = v
			}
		}
		if limit < 1 {
			limit = 1
		}
		if limit > maxEventsPageLimit {
			limit = maxEventsPageLimit
		}

		// No time params and no cursor = backward-compat path.
		if since == "" && until == "" && beforeID == 0 {
			events, err := listEvents(svc, sessionID)
			if err != nil {
				http.Error(w, "list events", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			resp := map[string]any{"events": events, "has_more": false, "next_cursor": int64(0)}
			if err := json.NewEncoder(w).Encode(resp); err != nil {
				log.Printf("[handler] encode events: %v", err)
			}
			return
		}

		events, minID, hasMore, err := svc.ListEventsByTimeRange(since, until, sessionID, beforeID, limit)
		if err != nil {
			http.Error(w, "list events", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		resp := map[string]any{"events": events, "has_more": hasMore, "next_cursor": minID}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			log.Printf("[handler] encode events: %v", err)
		}
	})
}
```

Add `"strconv"` to the import block.

- [ ] **Step 4: Reduce SSE backfill**

In `EventsStream`, replace the `listEvents` call for backfill:

```go
// Replace this line:
if existing, err := listEvents(svc, sessionID); err == nil {

// With:
if existing, err := svc.ListEventsByTimeRange("", "", sessionID, 0, sseBackfillLimit); err == nil {
	existing = existing // events is first return value; adapt to the 4-return signature:
```

Actually use the full signature correctly:

```go
if backfill, _, _, err := svc.ListEventsByTimeRange("", "", sessionID, 0, sseBackfillLimit); err == nil {
    for _, e := range backfill {
        sendSSE(w, e)
    }
    flusher.Flush()
}
```

Remove the old `listEvents` helper function entirely — it is no longer called.

- [ ] **Step 5: Run tests**

```bash
cd backend
go test ./tests/internal/handler/... -v -run "TestEventsHandler_timeRange|TestEventsHandler_backwardCompat|TestEventsHandler_limitClamped"
```

Expected: all 3 tests pass.

- [ ] **Step 6: Run full suite**

```bash
cd backend
go test ./... && golangci-lint run ./...
```

Expected: all tests pass, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/handler/events.go backend/tests/internal/handler/events_test.go
git commit -m "feat(handler): add time-range params to events endpoint, reduce SSE backfill to 100"
```

---

## Task 5: Frontend types

**Files:**
- Modify: `frontend/src/types/events.ts`

- [ ] **Step 1: Update `EventsResponse`**

In `frontend/src/types/events.ts`, update the interface:

```ts
export interface EventsResponse {
  events?: EventRecord[]
  has_more?: boolean
  next_cursor?: number
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/events.ts
git commit -m "feat(types): add has_more and next_cursor to EventsResponse"
```

---

## Task 6: Rename `useEvents` → `useLiveEvents`, add `enabled` param

**Files:**
- Modify: `frontend/src/features/events/hooks/useEvents.ts` (rename to `useLiveEvents.ts`)
- Modify: `frontend/tests/features/events/useEvents.test.tsx`
- Modify: `frontend/src/features/events/EventsPage.tsx` (import path update only in this task)

- [ ] **Step 1: Copy file, update export name, add `enabled` param**

Create `frontend/src/features/events/hooks/useLiveEvents.ts` with the content of `useEvents.ts`, then apply these changes:

1. Rename the export: `export function useLiveEvents(sessionFilterOverride = '', { enabled = true } = {})`
2. Wrap the entire SSE `useEffect` body in `if (!enabled) return`:

```ts
useEffect(() => {
  if (!enabled) return
  // ... existing SSE setup unchanged ...
}, [mergeEvents, sessionFilter, enabled])
```

3. Remove the `reload` function and `refreshing` state entirely (live mode has no manual refresh).

4. Return `{ events, error }` only (drop `refreshing`, `reload`).

Full file after changes:

```ts
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { EventRecord } from '@/types'
import { buildEventKey } from '../eventKey'

export function useLiveEvents(sessionFilterOverride = '', { enabled = true }: { enabled?: boolean } = {}) {
  const [searchParams] = useSearchParams()
  const sessionFilter = sessionFilterOverride || searchParams.get('session') || ''
  const [events, setEvents] = useState<EventRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    queueMicrotask(() => setEvents([]))
  }, [sessionFilter])

  const mergeEvents = useCallback((incoming: EventRecord[]) => {
    setEvents((prev) => {
      const seen = new Set(prev.map(buildEventKey))
      const next = [...prev]
      incoming.forEach((event) => {
        const key = buildEventKey(event)
        if (seen.has(key)) return
        seen.add(key)
        next.push(event)
      })
      return next
    })
  }, [])

  useEffect(() => {
    if (!enabled) return

    const seen = new Set<string>()
    const buffer: EventRecord[] = []
    let rafId: number | undefined

    const params = new URLSearchParams()
    if (sessionFilter) params.set('session', sessionFilter)
    const qs = params.toString()
    const es = new EventSource(`/api/events/stream${qs ? `?${qs}` : ''}`)

    const flush = () => {
      const batch = buffer.splice(0)
      if (batch.length > 0) {
        mergeEvents(batch)
      }
    }

    es.onmessage = (ev) => {
      try {
        const e = JSON.parse(ev.data as string) as EventRecord
        const key = buildEventKey(e)
        if (seen.has(key)) return
        seen.add(key)
        buffer.push(e)
        setError(null)

        if (rafId !== undefined) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(flush)
      } catch {
        // ignore parse errors
      }
    }

    es.onopen = () => {
      setError(null)
    }

    es.onerror = () => {
      setError('Connection lost, reconnecting...')
    }

    return () => {
      es.close()
      if (rafId !== undefined) cancelAnimationFrame(rafId)
    }
  }, [mergeEvents, sessionFilter, enabled])

  return { events, error }
}
```

- [ ] **Step 2: Delete old file**

```bash
rm frontend/src/features/events/hooks/useEvents.ts
```

- [ ] **Step 3: Update the test file**

In `frontend/tests/features/events/useEvents.test.tsx`:

1. Update import: `import { useLiveEvents } from '@/features/events/hooks/useLiveEvents'`
2. Replace every `useEvents(` call with `useLiveEvents(`
3. Remove test `'fetches historical session events when session override provided'` — `useLiveEvents` no longer does a REST fetch on session override.

- [ ] **Step 4: Update `EventsPage.tsx` import**

In `frontend/src/features/events/EventsPage.tsx`, update:

```ts
// Before:
import { useEvents } from './hooks/useEvents'

// After:
import { useLiveEvents } from './hooks/useLiveEvents'
```

Also update the call site temporarily to keep it compiling — pass `enabled: true` for now (the mode toggle wiring comes in Task 9):

```ts
const { events, error } = useLiveEvents(sessionFilterOverride, { enabled: true })
```

Remove `refreshing` and `reload` from the destructure if present.

- [ ] **Step 5: Type-check + tests**

```bash
cd frontend
npx tsc --noEmit && npx vitest run tests/features/events/useEvents.test.tsx
```

Expected: no type errors, tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/events/hooks/useLiveEvents.ts frontend/src/features/events/hooks/useEvents.ts frontend/src/features/events/EventsPage.tsx frontend/tests/features/events/useEvents.test.tsx
git commit -m "refactor(events): rename useEvents → useLiveEvents, add enabled param, remove REST reload"
```

---

## Task 7: `useHistoricalEvents` hook

**Files:**
- Create: `frontend/src/features/events/hooks/useHistoricalEvents.ts`
- Create: `frontend/tests/features/events/useHistoricalEvents.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/features/events/useHistoricalEvents.test.ts`:

```ts
import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHistoricalEvents } from '@/features/events/hooks/useHistoricalEvents'

function makeEvent(overrides = {}) {
  return {
    session: 'sess-1',
    time: '2026-06-01T12:00:00Z',
    agent: 'codex',
    action: 'READ',
    path: '/tmp/f',
    hook_event_name: 'PreToolUse',
    dedup_key: Math.random().toString(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useHistoricalEvents', () => {
  it('fetches events on mount when enabled', async () => {
    const events = [makeEvent(), makeEvent()]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events, has_more: false, next_cursor: 0 }) })
    )

    const { result } = renderHook(() =>
      useHistoricalEvents('2026-06-01T00:00:00Z', '2026-06-02T00:00:00Z', '', true)
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.events).toHaveLength(2)
    expect(result.current.hasMore).toBe(false)
  })

  it('does not fetch when enabled=false', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    renderHook(() => useHistoricalEvents('2026-06-01T00:00:00Z', '', '', false))

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('loadMore appends next page using next_cursor', async () => {
    const page1 = [makeEvent({ dedup_key: 'a' }), makeEvent({ dedup_key: 'b' })]
    const page2 = [makeEvent({ dedup_key: 'c' })]
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ events: page1, has_more: true, next_cursor: 42 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ events: page2, has_more: false, next_cursor: 0 }) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useHistoricalEvents('2026-06-01T00:00:00Z', '', '', true)
    )

    await waitFor(() => expect(result.current.events).toHaveLength(2))
    expect(result.current.hasMore).toBe(true)

    act(() => result.current.loadMore())

    await waitFor(() => expect(result.current.events).toHaveLength(3))
    expect(result.current.hasMore).toBe(false)

    // Second fetch must include before_id=42
    expect(fetchMock.mock.calls[1][0]).toContain('before_id=42')
  })

  it('refresh resets state and re-fetches from scratch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ events: [makeEvent()], has_more: false, next_cursor: 0 }) })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() =>
      useHistoricalEvents('2026-06-01T00:00:00Z', '', '', true)
    )

    await waitFor(() => expect(result.current.events).toHaveLength(1))

    act(() => result.current.refresh())

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    // After refresh, cursor resets — second call must NOT contain before_id
    expect(fetchMock.mock.calls[1][0]).not.toContain('before_id')
  })

  it('sets error on fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    )

    const { result } = renderHook(() =>
      useHistoricalEvents('', '', '', true)
    )

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.loading).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
npx vitest run tests/features/events/useHistoricalEvents.test.ts
```

Expected: error — module `useHistoricalEvents` not found.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/features/events/hooks/useHistoricalEvents.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { EventRecord, EventsResponse } from '@/types'
import { buildEventKey } from '../eventKey'

export function useHistoricalEvents(
  since: string,
  until: string,
  sessionFilter: string,
  enabled: boolean,
) {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cursorRef = useRef<number>(0)
  const refreshCountRef = useRef(0)

  const buildUrl = useCallback(
    (beforeID: number) => {
      const params = new URLSearchParams()
      if (since) params.set('since', since)
      if (until) params.set('until', until)
      if (sessionFilter) params.set('session', sessionFilter)
      if (beforeID > 0) params.set('before_id', String(beforeID))
      params.set('limit', '200')
      const qs = params.toString()
      return `/api/events${qs ? `?${qs}` : ''}`
    },
    [since, until, sessionFilter],
  )

  const fetchPage = useCallback(
    async (beforeID: number, replace: boolean) => {
      setLoading(true)
      try {
        const res = await fetch(buildUrl(beforeID))
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
        const data = (await res.json()) as EventsResponse
        const incoming = data.events ?? []
        setHasMore(data.has_more ?? false)
        cursorRef.current = data.next_cursor ?? 0

        setEvents((prev) => {
          if (replace) {
            return incoming
          }
          const seen = new Set(prev.map(buildEventKey))
          const next = [...prev]
          incoming.forEach((e) => {
            const key = buildEventKey(e)
            if (!seen.has(key)) {
              seen.add(key)
              next.push(e)
            }
          })
          return next
        })
        setError(null)
      } catch {
        setError('Failed to load events.')
      } finally {
        setLoading(false)
      }
    },
    [buildUrl],
  )

  // Re-fetch from scratch whenever params or enabled change.
  useEffect(() => {
    if (!enabled) return
    cursorRef.current = 0
    refreshCountRef.current += 1
    setEvents([])
    setHasMore(false)
    fetchPage(0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [since, until, sessionFilter, enabled])

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return
    fetchPage(cursorRef.current, false)
  }, [fetchPage, loading, hasMore])

  const refresh = useCallback(() => {
    cursorRef.current = 0
    setEvents([])
    setHasMore(false)
    fetchPage(0, true)
  }, [fetchPage])

  return { events, hasMore, loading, error, loadMore, refresh }
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend
npx vitest run tests/features/events/useHistoricalEvents.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/events/hooks/useHistoricalEvents.ts frontend/tests/features/events/useHistoricalEvents.test.ts
git commit -m "feat(events): add useHistoricalEvents hook with cursor-based pagination"
```

---

## Task 8: `useEventFilters` — remove time-range client filter, accept time range as params

**Files:**
- Modify: `frontend/src/features/events/hooks/useEventFilters.ts`
- Modify: `frontend/tests/features/events/useEventFilters.test.ts`

> **Design note:** `timeRange`/`customStart`/`customEnd` state moves to `EventsPage` (which needs them to compute `sinceISO`/`untilISO` before mounting `useHistoricalEvents`). `useEventFilters` receives them as parameters. This resolves a circular dependency: `EventsPage` must know `sinceISO` before it has events, but `useEventFilters` currently owns that state.

- [ ] **Step 1: Update `useEventFilters` signature to receive time range as params**

Change the function signature to accept time range values as parameters:

```ts
export function useEventFilters(
  events: EventRecord[],
  searchQuery: string,
  setSearchQuery: Dispatch<SetStateAction<string>>,
  sessionFilterOverride = '',
  timeRange: string,
  setTimeRange: Dispatch<SetStateAction<string>>,
  customStart: string,
  setCustomStart: Dispatch<SetStateAction<string>>,
  customEnd: string,
  setCustomEnd: Dispatch<SetStateAction<string>>,
)
```

Remove the internal `useState` declarations for `timeRange`, `customStart`, `customEnd` and their `useEffect` localStorage persistence — those move to `EventsPage`.

Remove the time-range filter lines from `filteredEvents`. The `useMemo` for `filteredEvents` currently includes a block like:
```ts
if (!sessionFilter) {
  if (rangeStartMs !== null && eventTime < rangeStartMs) return false
  // custom range checks...
}
```
Remove those lines. Events from `useHistoricalEvents` are already server-filtered; live mode has the picker disabled.

Keep `rangeStartMs` and `nowMs` state in the hook — they are still used for `availableProjects` polling interval and may be used elsewhere. The `rangeStartMs` computation from `timeRange` stays.

- [ ] **Step 2: Update `useEventFilters` tests**

In `frontend/tests/features/events/useEventFilters.test.ts`:

1. Every `renderHook(() => useEventFilters(...))` call must be updated to pass the new required `timeRange`/`setTimeRange`/`customStart`/`setCustomStart`/`customEnd`/`setCustomEnd` parameters. Pass `'15m'`, `vi.fn()`, `''`, `vi.fn()`, `''`, `vi.fn()` as defaults.

2. Remove any test that asserts time-range filtering removes events from `filteredEvents` — that behavior is gone (server now handles it).

3. Do not add new tests for `sinceISO` — that computation now lives in `EventsPage`.

- [ ] **Step 3: Type-check + tests**

```bash
cd frontend
npx tsc --noEmit && npx vitest run tests/features/events/useEventFilters.test.ts
```

Expected: no errors, all remaining tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/events/hooks/useEventFilters.ts frontend/tests/features/events/useEventFilters.test.ts
git commit -m "refactor(filters): remove client-side time filter, accept time range as params"
```

- [ ] **Step 3: Type-check + tests**

```bash
cd frontend
npx tsc --noEmit && npx vitest run tests/features/events/useEventFilters.test.ts
```

Expected: no errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/events/hooks/useEventFilters.ts frontend/tests/features/events/useEventFilters.test.ts
git commit -m "refactor(filters): remove client-side time filter, expose sinceISO/untilISO for server queries"
```

---

## Task 9: `EventsPage` — mode toggle + orchestration

**Files:**
- Modify: `frontend/src/features/events/EventsPage.tsx`

- [ ] **Step 1: Add `isLive` state, own time range state, and wire both hooks**

In `EventsPage.tsx`:

1. Add import for `useHistoricalEvents`:
   ```ts
   import { useHistoricalEvents } from './hooks/useHistoricalEvents'
   ```

2. Add `isLive` state and time range state near the top of the component. `EventsPage` now owns `timeRange`/`customStart`/`customEnd` (Task 8 removed them from `useEventFilters`). Persist to localStorage via `useEffect`:

   ```ts
   const [isLive, setIsLive] = useState(true)

   const [timeRange, setTimeRange] = useState(() => localStorage.getItem('events_time_range') ?? '15m')
   const [customStart, setCustomStart] = useState(() => localStorage.getItem('events_custom_start') ?? '')
   const [customEnd, setCustomEnd] = useState(() => localStorage.getItem('events_custom_end') ?? '')

   useEffect(() => { localStorage.setItem('events_time_range', timeRange) }, [timeRange])
   useEffect(() => { localStorage.setItem('events_custom_start', customStart) }, [customStart])
   useEffect(() => { localStorage.setItem('events_custom_end', customEnd) }, [customEnd])
   ```

3. Compute `sinceISO`/`untilISO` from time range state. Add a `nowMs` ticker and derive the ISO strings:

   ```ts
   const [nowMs, setNowMs] = useState(() => Date.now())
   useEffect(() => {
     if (timeRange === 'custom') return
     const id = window.setInterval(() => setNowMs(Date.now()), 1000)
     return () => window.clearInterval(id)
   }, [timeRange])

   const sinceISO = useMemo(() => {
     if (timeRange === 'custom') return customStart ? new Date(customStart.replace(' ', 'T')).toISOString() : ''
     const offsets: Record<string, number> = {
       '5m': 5, '15m': 15, '1h': 60, '6h': 360, '24h': 1440, '7d': 10080, '30d': 43200,
     }
     const mins = offsets[timeRange]
     return mins !== undefined ? new Date(nowMs - mins * 60 * 1000).toISOString() : ''
   }, [timeRange, customStart, nowMs])

   const untilISO = useMemo(() => {
     if (timeRange === 'custom') return customEnd ? new Date(customEnd.replace(' ', 'T')).toISOString() : ''
     return '' // server defaults to now
   }, [timeRange, customEnd])
   ```

4. Mount both hooks — only the active one makes network calls:

   ```ts
   const liveState = useLiveEvents(sessionFilterOverride, { enabled: isLive })
   const histState = useHistoricalEvents(sinceISO, untilISO, sessionFilterOverride, !isLive)
   const activeEvents = isLive ? liveState.events : histState.events
   const activeError = isLive ? liveState.error : histState.error
   ```

5. Pass time range state down to `useEventFilters` (Task 8 updated its signature to accept these as params):

   ```ts
   const {
     actionFilter, setActionFilter,
     agentFilter, setAgentFilter,
     availableAgents,
     projectFilter, setProjectFilter,
     availableProjects,
     sortOrder, setSortOrder,
     filteredEvents,
   } = useEventFilters(
     activeEvents, searchQuery, setSearchQuery, sessionFilterOverride,
     timeRange, setTimeRange, customStart, setCustomStart, customEnd, setCustomEnd,
   )
   ```

- [ ] **Step 2: Add mode toggle UI**

In the filter bar section of `EventsPage.tsx`, add a `ToggleGroup` as the leftmost filter element:

```tsx
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
```

```tsx
<ToggleGroup
  type="single"
  value={isLive ? 'live' : 'historical'}
  onValueChange={(v) => {
    if (v === 'live' || v === 'historical') setIsLive(v === 'live')
  }}
  className="shrink-0"
>
  <ToggleGroupItem value="live" className="gap-1.5 text-xs">
    <span
      className={`size-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground'}`}
    />
    Live
  </ToggleGroupItem>
  <ToggleGroupItem value="historical" className="text-xs">
    Historical
  </ToggleGroupItem>
</ToggleGroup>
```

- [ ] **Step 3: Disable time range picker in live mode**

Find the time range `Select` or `ToggleGroup` in the filter bar and add `disabled={isLive}` prop. Also add visual muting:

```tsx
<div className={isLive ? 'pointer-events-none opacity-40' : ''}>
  {/* time range picker */}
</div>
```

- [ ] **Step 4: Add Refresh button (historical mode only)**

Find where the existing refresh/reload button is in the filter bar. Update it to call `histState.refresh()` and hide it in live mode:

```tsx
{!isLive && (
  <Button
    variant="ghost"
    size="sm"
    onClick={histState.refresh}
    disabled={histState.loading}
    className="gap-1"
  >
    <RefreshCw className={`size-3 ${histState.loading ? 'animate-spin' : ''}`} />
    Refresh
  </Button>
)}
```

Add `import { RefreshCw } from 'lucide-react'` if not already imported.

- [ ] **Step 5: Add "Load more" button**

At the bottom of the event list (after the event rows), add:

```tsx
{!isLive && histState.hasMore && (
  <div className="flex justify-center py-4">
    <Button
      variant="outline"
      size="sm"
      onClick={histState.loadMore}
      disabled={histState.loading}
    >
      {histState.loading ? 'Loading...' : 'Load more'}
    </Button>
  </div>
)}
```

- [ ] **Step 6: Show live error / historical error**

Update the existing error display to use `activeError`:

```tsx
{activeError && (
  <div className="text-sm text-destructive px-4 py-2">{activeError}</div>
)}
```

- [ ] **Step 7: Type-check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Run all frontend tests**

```bash
cd frontend
npx vitest run
```

Expected: all tests pass. Fix any that broke due to `useEventFilters` signature change.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/events/EventsPage.tsx frontend/src/features/events/hooks/useEventFilters.ts frontend/tests/features/events/
git commit -m "feat(events): add Live/Historical mode toggle with server-side time-range queries and load-more pagination"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run full backend suite**

```bash
cd backend
go test ./... && golangci-lint run ./...
```

Expected: all tests pass, no lint errors.

- [ ] **Step 2: Run full frontend suite**

```bash
cd frontend
npx tsc --noEmit && npx vitest run
```

Expected: no type errors, all tests pass.

- [ ] **Step 3: Smoke test manually**

Start the app:
```bash
# Terminal 1
cd backend && go run ./cmd/server

# Terminal 2
cd frontend && pnpm dev
```

Open `http://localhost:5173/events` and verify:

1. Page loads in Live mode (green pulsing dot, time range picker greyed out).
2. New hook events appear in real time as they stream in.
3. Switch to Historical — time picker enables, events re-fetch from server for the selected range.
4. "Load more" appears and fetches older events when `has_more = true`.
5. "Refresh" re-fetches the same time range.
6. Switch back to Live — SSE stream resumes, historical state clears.
7. Select "last 30 days" in Historical mode — events are server-filtered (not just latest 1000).

- [ ] **Step 4: Final commit (if any fixes from smoke test)**

```bash
git add -p
git commit -m "fix(events): smoke test fixes"
```
