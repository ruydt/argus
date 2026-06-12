# Session List: API-Driven with Lazy Event Loading — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Events page session list so it reflects the selected time range by fetching sessions from `GET /api/sessions?since=<RFC3339>` instead of deriving them from the event cache.

**Architecture:** Sessions are fetched from the API (time-range-aware, not event-count-bounded). Each session renders its header from the `Session` API type. Events are sourced from the SSE event cache when available; older sessions load events lazily on expand via `GET /api/events?session=<id>`.

**Tech Stack:** Go stdlib `net/http`, `modernc.org/sqlite`, React 19, TypeScript, Vitest, Testing Library, shadcn `Collapsible`, `Skeleton`

---

## File Map

**Backend — modified:**
- `backend/internal/repository/repository.go` — interface: `ListSessions()` → `ListSessions(since string)`
- `backend/internal/repository/sqlite/sqlite.go` — implementation: add WHERE clause when `since != ""`
- `backend/internal/service/event_service.go` — rename `ListSessions()` → `ListSessionsSince(since string)`; update internal `GetDashboardStats` caller
- `backend/internal/handler/sessions.go` — wire `since` to non-cwd path

**Backend — test files modified:**
- `backend/tests/internal/service/event_service_test.go` — update `mockRepo.ListSessions` signature
- `backend/tests/internal/server/router_test.go` — update `noopRepo.ListSessions` signature
- `backend/tests/internal/repository/sqlite/sqlite_test.go` — update `db.ListSessions()` call sites; add `since` filter test
- `backend/tests/internal/handler/projects_sessions_test.go` — add `since` handler test

**Frontend — modified:**
- `frontend/src/agents/index.ts` — add `agentForSession(session: Session): AgentConfig`
- `frontend/src/hooks/useSessions.ts` — add `since?: string` param
- `frontend/src/features/events/hooks/useEventFilters.ts` — export `sinceISO: string | null`
- `frontend/src/features/events/AgentSession.tsx` — accept `Session` + `EventRecord[]` instead of `SessionGroup`
- `frontend/src/features/events/SessionList.tsx` — accept `Session[]` + event caches instead of `EventRecord[]`
- `frontend/src/features/events/EventsPage.tsx` — orchestrate `useSessions`, `useSessionEvents`, `eventCache`

**Frontend — new:**
- `frontend/src/features/events/hooks/useSessionEvents.ts` — lazy per-session event fetch

**Frontend — test files modified/new:**
- `frontend/tests/hooks/useSessions.test.ts` — add `since` param test
- `frontend/tests/features/events/AgentSession.test.tsx` — update for `Session` type props
- `frontend/tests/features/events/hooks/useSessionEvents.test.ts` — new

---

## Task 1: Backend — repository interface + SQLite implementation

**Files:**
- Modify: `backend/internal/repository/repository.go:18`
- Modify: `backend/internal/repository/sqlite/sqlite.go:370-372`
- Modify: `backend/tests/internal/service/event_service_test.go:85-89`
- Modify: `backend/tests/internal/server/router_test.go:28`
- Modify: `backend/tests/internal/repository/sqlite/sqlite_test.go` (call sites)
- Test: `backend/tests/internal/repository/sqlite/sqlite_test.go`

- [ ] **Step 1: Update repository interface**

In `backend/internal/repository/repository.go`, change line 18:

```go
// Before
ListSessions() ([]domain.Session, error)

// After
ListSessions(since string) ([]domain.Session, error)
```

- [ ] **Step 2: Update SQLite implementation**

In `backend/internal/repository/sqlite/sqlite.go`, replace the `ListSessions` function at line 370:

```go
func (d *DB) ListSessions(since string) ([]domain.Session, error) {
	if since != "" {
		return d.listSessionsWhere(
			"WHERE datetime(last_seen_at) >= datetime(?)",
			[]any{since},
		)
	}
	return d.listSessionsWhere("", nil)
}
```

- [ ] **Step 3: Update mock in service test**

In `backend/tests/internal/service/event_service_test.go`, change the `ListSessions` mock at line 85:

```go
// Before
func (m *mockRepo) ListSessions() ([]domain.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]domain.Session{}, m.sessions...), nil
}

// After
func (m *mockRepo) ListSessions(since string) ([]domain.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]domain.Session{}, m.sessions...), nil
}
```

- [ ] **Step 4: Update noopRepo in router test**

In `backend/tests/internal/server/router_test.go`, change line 28:

```go
// Before
func (noopRepo) ListSessions() ([]domain.Session, error) { return nil, nil }

// After
func (noopRepo) ListSessions(string) ([]domain.Session, error) { return nil, nil }
```

- [ ] **Step 5: Update sqlite_test call sites**

In `backend/tests/internal/repository/sqlite/sqlite_test.go`, find all `db.ListSessions()` calls (lines 364, 464) and update to `db.ListSessions("")`.

- [ ] **Step 6: Add `since` filter test to sqlite_test**

Append to `backend/tests/internal/repository/sqlite/sqlite_test.go`:

```go
func TestListSessions_filtersBySince(t *testing.T) {
	db := newTestDB(t)

	if err := db.UpsertSession(
		"old-session", "codex", "gpt-5.4", "startup", "/cwd", "/transcript",
		"2026-01-01T10:00:00Z", "2026-01-01T10:05:00Z", domain.SessionUsage{},
	); err != nil {
		t.Fatalf("UpsertSession old: %v", err)
	}
	if err := db.UpsertSession(
		"new-session", "codex", "gpt-5.4", "startup", "/cwd", "/transcript",
		"2026-05-14T10:00:00Z", "2026-05-14T10:05:00Z", domain.SessionUsage{},
	); err != nil {
		t.Fatalf("UpsertSession new: %v", err)
	}

	all, err := db.ListSessions("")
	if err != nil {
		t.Fatalf("ListSessions all: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("all sessions len = %d, want 2", len(all))
	}

	filtered, err := db.ListSessions("2026-03-01T00:00:00Z")
	if err != nil {
		t.Fatalf("ListSessions filtered: %v", err)
	}
	if len(filtered) != 1 {
		t.Fatalf("filtered sessions len = %d, want 1", len(filtered))
	}
	if filtered[0].SessionID != "new-session" {
		t.Fatalf("filtered[0].SessionID = %q, want %q", filtered[0].SessionID, "new-session")
	}
}
```

- [ ] **Step 7: Run backend tests**

```bash
cd backend && go build ./... && go test ./...
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
cd backend
git add internal/repository/repository.go internal/repository/sqlite/sqlite.go \
  tests/internal/service/event_service_test.go \
  tests/internal/server/router_test.go \
  tests/internal/repository/sqlite/sqlite_test.go
git commit -m "feat(backend): add since param to ListSessions repository interface"
```

---

## Task 2: Backend — service + handler wire-up

**Files:**
- Modify: `backend/internal/service/event_service.go:281-290,303-305`
- Modify: `backend/internal/handler/sessions.go:63-66`
- Test: `backend/tests/internal/handler/projects_sessions_test.go`

- [ ] **Step 1: Update service**

In `backend/internal/service/event_service.go`, replace `ListSessions` and fix `GetDashboardStats`:

```go
// Replace the ListSessions method (was line 281):
func (s *EventService) ListSessionsSince(since string) ([]domain.Session, error) {
	sessions, err := s.repo.ListSessions(since)
	if err != nil {
		return nil, err
	}
	if err := s.backfillSessionUsage(sessions); err != nil {
		return nil, err
	}
	return sessions, nil
}
```

Also update `GetDashboardStats` (line ~304) which calls `s.repo.ListSessions()`:

```go
// Before
sessions, err := s.repo.ListSessions()

// After
sessions, err := s.repo.ListSessions("")
```

- [ ] **Step 2: Update handler non-cwd path**

In `backend/internal/handler/sessions.go`, replace lines 62-66:

```go
// Before
if cwd != "" {
    sessions, err = svc.ListSessionsByCWD(cwd, since)
} else {
    sessions, err = svc.ListSessions()
}

// After
if cwd != "" {
    sessions, err = svc.ListSessionsByCWD(cwd, since)
} else {
    sessions, err = svc.ListSessionsSince(since)
}
```

- [ ] **Step 3: Write failing test**

Append to `backend/tests/internal/handler/projects_sessions_test.go`:

```go
func TestSessionsHandlerFiltersBySince(t *testing.T) {
	svc := newTestService(t)
	addHandlerEvent(t, svc, domain.NormalizedEvent{
		Time:          "2026-01-01T10:00:00Z",
		Agent:         "codex",
		Session:       "old-session",
		CWD:           "/work/argus",
		HookEventName: "SessionStart",
	})
	addHandlerEvent(t, svc, domain.NormalizedEvent{
		Time:          "2026-05-14T10:00:00Z",
		Agent:         "codex",
		Session:       "new-session",
		CWD:           "/work/argus",
		HookEventName: "SessionStart",
	})

	h := handler.Sessions(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/sessions?since=2026-03-01T00%3A00%3A00Z", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	var sessions []domain.Session
	if err := json.Unmarshal(rec.Body.Bytes(), &sessions); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("sessions len = %d, want 1; sessions=%+v", len(sessions), sessions)
	}
	if sessions[0].SessionID != "new-session" {
		t.Fatalf("sessions[0].SessionID = %q, want %q", sessions[0].SessionID, "new-session")
	}
}

func TestSessionsHandlerInvalidSinceReturns400(t *testing.T) {
	svc := newTestService(t)
	h := handler.Sessions(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/sessions?since=not-a-date", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}
```

- [ ] **Step 4: Run backend tests**

```bash
cd backend && go build ./... && go test ./... && golangci-lint run ./...
```

Expected: all tests pass, no lint errors.

- [ ] **Step 5: Commit**

```bash
cd backend
git add internal/service/event_service.go internal/handler/sessions.go \
  tests/internal/handler/projects_sessions_test.go
git commit -m "feat(backend): wire since param to non-cwd GET /api/sessions"
```

---

## Task 3: Frontend — `agentForSession` helper + `sinceISO` export

**Files:**
- Modify: `frontend/src/agents/index.ts`
- Modify: `frontend/src/features/events/hooks/useEventFilters.ts`

- [ ] **Step 1: Add `agentForSession` to agents index**

In `frontend/src/agents/index.ts`, add after the existing `agentForEvent` function:

```ts
import type { Session } from '@/types/sessions'

export { AGENTS, agentForEvent }

export function agentForSession(session: Session): AgentConfig {
  return AGENTS.find((a) => a.id === session.agent) ?? codexAgent
}
```

Full updated file:

```ts
import { claudeCodeAgent } from './claudecode'
import { codexAgent } from './codex'
import type { AgentConfig, EventRecord } from './types'
import type { Session } from '@/types/sessions'

export { claudeCodeAgent, codexAgent }
export type { AgentConfig, EventRecord }
export { AGENTS }

const AGENTS: AgentConfig[] = [claudeCodeAgent, codexAgent]

export function agentForEvent(event: EventRecord): AgentConfig {
  return AGENTS.find((agent) => agent.matchesEvent(event)) ?? codexAgent
}

export function agentForSession(session: Session): AgentConfig {
  return AGENTS.find((a) => a.id === session.agent) ?? codexAgent
}
```

- [ ] **Step 2: Export `sinceISO` from `useEventFilters`**

In `frontend/src/features/events/hooks/useEventFilters.ts`, add after the `rangeStartMs` useMemo block (after line 78):

```ts
const sinceISO = rangeStartMs !== null ? new Date(rangeStartMs).toISOString() : null
```

Then add `sinceISO` to the return object (line ~173):

```ts
return {
  actionFilter,
  setActionFilter,
  agentFilter,
  setAgentFilter,
  availableAgents,
  projectFilter,
  setProjectFilter,
  availableProjects,
  searchQuery,
  setSearchQuery,
  sortOrder,
  setSortOrder,
  timeRange,
  setTimeRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  filteredEvents,
  sessionFilter,
  sinceISO,   // new
}
```

- [ ] **Step 3: Run frontend type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/agents/index.ts src/features/events/hooks/useEventFilters.ts
git commit -m "feat(frontend): add agentForSession helper and export sinceISO from useEventFilters"
```

---

## Task 4: Frontend — `useSessions` accepts `since` param

**Files:**
- Modify: `frontend/src/hooks/useSessions.ts`
- Modify: `frontend/tests/hooks/useSessions.test.ts`

- [ ] **Step 1: Update `useSessions` to accept `since`**

Replace the contents of `frontend/src/hooks/useSessions.ts`:

```ts
import { useEffect, useState } from 'react'
import type { Session } from '@/types/sessions'

export type { Session }

export function useSessions(since?: string) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const fetchSessions = async () => {
      try {
        const url = since ? `/api/sessions?since=${encodeURIComponent(since)}` : '/api/sessions'
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          if (mounted) {
            setSessions(data)
            setLoading(false)
          }
        }
      } catch (err) {
        console.error('Failed to fetch sessions', err)
      }
    }

    fetchSessions()
    const interval = setInterval(fetchSessions, 5000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [since])

  return { sessions, loading }
}
```

- [ ] **Step 2: Add `since` URL test**

In `frontend/tests/hooks/useSessions.test.ts`, add a new test inside the `describe` block:

```ts
it('includes since param in fetch URL when provided', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  })
  vi.stubGlobal('fetch', fetchMock)

  renderHook(() => useSessions('2026-05-01T00:00:00.000Z'))

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sessions?since=2026-05-01T00%3A00%3A00.000Z'
    )
  )
})

it('omits since param when not provided', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  })
  vi.stubGlobal('fetch', fetchMock)

  renderHook(() => useSessions())

  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/sessions'))
})
```

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend && npx tsc --noEmit && npx vitest run tests/hooks/useSessions.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/hooks/useSessions.ts tests/hooks/useSessions.test.ts
git commit -m "feat(frontend): add since param to useSessions hook"
```

---

## Task 5: Frontend — new `useSessionEvents` hook

**Files:**
- Create: `frontend/src/features/events/hooks/useSessionEvents.ts`
- Create: `frontend/tests/features/events/hooks/useSessionEvents.test.ts`

- [ ] **Step 1: Write failing tests**

Create `frontend/tests/features/events/hooks/useSessionEvents.test.ts`:

```ts
import { renderHook, act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionEvents } from '@/features/events/hooks/useSessionEvents'
import type { EventRecord } from '@/types'

const mockEvent: EventRecord = {
  time: '2026-05-14T10:00:00Z',
  action: 'BASH',
  path: '',
  session: 'sess-abc',
  agent: 'claudecode',
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useSessionEvents', () => {
  it('starts with empty state', () => {
    const { result } = renderHook(() => useSessionEvents())
    expect(result.current.sessionEvents.size).toBe(0)
    expect(result.current.loadingIds.size).toBe(0)
  })

  it('fetches events for a session on loadEvents call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [mockEvent] }),
      })
    )

    const { result } = renderHook(() => useSessionEvents())

    act(() => {
      result.current.loadEvents('sess-abc')
    })

    await waitFor(() => {
      const state = result.current.sessionEvents.get('sess-abc')
      expect(state?.events).toHaveLength(1)
      expect(state?.loading).toBe(false)
    })

    expect(fetch).toHaveBeenCalledWith('/api/events?session=sess-abc')
  })

  it('does not fetch again if already loaded', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [mockEvent] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useSessionEvents())

    act(() => { result.current.loadEvents('sess-abc') })
    await waitFor(() => expect(result.current.sessionEvents.get('sess-abc')?.loading).toBe(false))

    act(() => { result.current.loadEvents('sess-abc') })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('stores error per session without affecting other sessions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    )

    const { result } = renderHook(() => useSessionEvents())

    act(() => { result.current.loadEvents('sess-fail') })

    await waitFor(() => {
      const state = result.current.sessionEvents.get('sess-fail')
      expect(state?.error).toBeTruthy()
      expect(state?.loading).toBe(false)
    })

    expect(result.current.sessionEvents.get('sess-other')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run tests/features/events/hooks/useSessionEvents.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useSessionEvents`**

Create `frontend/src/features/events/hooks/useSessionEvents.ts`:

```ts
import { useCallback, useState } from 'react'
import type { EventRecord, EventsResponse } from '@/types'

type SessionEventsState = {
  events: EventRecord[]
  loading: boolean
  error: string | null
}

export function useSessionEvents() {
  const [sessionEvents, setSessionEvents] = useState<Map<string, SessionEventsState>>(new Map())

  const loadEvents = useCallback(async (sessionId: string) => {
    setSessionEvents((prev) => {
      const existing = prev.get(sessionId)
      if (existing && (existing.loading || existing.events.length > 0)) return prev
      const next = new Map(prev)
      next.set(sessionId, { events: [], loading: true, error: null })
      return next
    })

    try {
      const res = await fetch(`/api/events?session=${encodeURIComponent(sessionId)}`)
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
      const data = (await res.json()) as EventsResponse
      setSessionEvents((prev) => {
        const next = new Map(prev)
        next.set(sessionId, { events: data.events ?? [], loading: false, error: null })
        return next
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load events'
      setSessionEvents((prev) => {
        const next = new Map(prev)
        next.set(sessionId, { events: [], loading: false, error: message })
        return next
      })
    }
  }, [])

  const loadingIds = new Set(
    Array.from(sessionEvents.entries())
      .filter(([, v]) => v.loading)
      .map(([k]) => k)
  )

  return { sessionEvents, loadEvents, loadingIds }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx tsc --noEmit && npx vitest run tests/features/events/hooks/useSessionEvents.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/features/events/hooks/useSessionEvents.ts \
  tests/features/events/hooks/useSessionEvents.test.ts
git commit -m "feat(frontend): add useSessionEvents hook for lazy per-session event loading"
```

---

## Task 6: Frontend — `AgentSession` accepts `Session` type

**Files:**
- Modify: `frontend/src/features/events/AgentSession.tsx`
- Modify: `frontend/tests/features/events/AgentSession.test.tsx`

- [ ] **Step 1: Update `AgentSession` component**

Replace the contents of `frontend/src/features/events/AgentSession.tsx`:

```tsx
import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Check, Copy } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { PaginationBar } from '@/components/shared/PaginationBar'
import { cn } from '@/lib/utils'
import { formatTokenCount, highlight, shortId } from '@/lib/format'
import { agentForSession } from '@/agents'
import type { Session } from '@/types/sessions'
import type { EventRecord, SessionUsage, TooltipState } from '@/types/events'
import { buildEventKey } from './eventKey'
import { EventRow } from './EventRow'

const DEFAULT_PAGE_SIZE = 50

type AgentSessionProps = {
  session: Session
  events: EventRecord[]
  loadEvents: () => void
  loadingEvents: boolean
  isCollapsed: boolean
  toggleSession: (id: string) => void
  searchQuery: string
  sessionUsage: Record<string, SessionUsage>
  setTooltip: Dispatch<SetStateAction<TooltipState | null>>
  targetSessionId: string | null
  targetEventKey: string | null
  highlightedEventKey: string | null
  onTargetVisible: () => void
  isEventDraggable?: boolean
}

export function AgentSession({
  session,
  events,
  loadEvents,
  loadingEvents,
  isCollapsed,
  toggleSession,
  searchQuery,
  sessionUsage,
  setTooltip,
  targetSessionId,
  targetEventKey,
  highlightedEventKey,
  onTargetVisible,
  isEventDraggable = false,
}: AgentSessionProps) {
  const { session_id: sessionId, transcript_path: transcriptPath } = session
  const agent = agentForSession(session)
  const { Logo } = agent
  const lastTime = new Date(session.last_seen_at)

  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(id)
  }, [copied])

  // When the session is expanded and has no events, trigger lazy load.
  useEffect(() => {
    if (!isCollapsed && events.length === 0 && !loadingEvents) {
      loadEvents()
    }
  }, [isCollapsed, events.length, loadingEvents, loadEvents])

  const onCopySessionId = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard
      .writeText(sessionId)
      .then(() => setCopied(true))
      .catch(() => {})
  }

  const totalPages = Math.max(1, Math.ceil(events.length / pageSize))
  const clampedPage = Math.min(page, totalPages - 1)
  const pageStart = clampedPage * pageSize
  const pageEnd = Math.min(pageStart + pageSize, events.length)
  const visibleEvents = events.slice(pageStart, pageEnd)
  const needsPagination = events.length > pageSize
  const targetEventIndex =
    targetEventKey && targetSessionId === sessionId
      ? events.findIndex((event) => buildEventKey(event) === targetEventKey)
      : -1

  useEffect(() => {
    if (targetEventIndex < 0) return
    const targetPage = Math.floor(targetEventIndex / pageSize)
    if (clampedPage !== targetPage) {
      queueMicrotask(() => setPage(targetPage))
    }
  }, [clampedPage, pageSize, targetEventIndex])

  return (
    <Collapsible
      open={!isCollapsed}
      onOpenChange={() => toggleSession(sessionId)}
      className="border border-white/[0.06] rounded-lg mb-3 overflow-hidden bg-white/[0.015]"
    >
      <CollapsibleTrigger asChild>
        <div
          draggable
          onDragStart={(ev) => {
            ev.dataTransfer.setData('text/plain', `session:${sessionId}`)
            ev.dataTransfer.effectAllowed = 'move'
          }}
          className={cn(
            'flex flex-col items-start justify-between gap-3 px-3 py-[10px] cursor-grab active:cursor-grabbing sm:flex-row sm:items-center',
            'bg-white/[0.03] border-b border-white/[0.06]',
            isCollapsed && 'border-b-0'
          )}
        >
          <div className="group inline-flex min-w-0 items-center gap-2 text-[0.8rem] font-bold text-[#47ff9c]">
            <span className={cn('agent-badge', `agent-${agent.badgeClass}`)}>
              <Logo size={12} />
            </span>
            <span className="min-w-0 break-words sm:break-all">
              {highlight(sessionId || shortId(transcriptPath), searchQuery)}
            </span>
            <button
              type="button"
              onClick={onCopySessionId}
              className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex h-4 w-4 items-center justify-center rounded text-[#666] hover:text-[#47ff9c]"
              aria-label={copied ? 'Copied session ID' : 'Copy session ID'}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
          <div className="inline-flex w-full flex-wrap items-center gap-2 text-[0.68rem] text-[#666] sm:w-auto sm:justify-end sm:text-right">
            {sessionUsage[sessionId] &&
              agent.buildUsageItems &&
              (() => {
                const u = sessionUsage[sessionId]
                return (
                  <span className="usage-summary">
                    {agent.buildUsageItems(u, formatTokenCount).map(({ cls, label, tip }) => (
                      <span
                        key={cls}
                        className={`usage-item ${cls}`}
                        onMouseEnter={(ev) =>
                          setTooltip({ text: tip, x: ev.clientX, y: ev.clientY })
                        }
                        onMouseMove={(ev) =>
                          setTooltip((t) => (t ? { ...t, x: ev.clientX, y: ev.clientY } : null))
                        }
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {label}
                      </span>
                    ))}
                  </span>
                )
              })()}
            {events.length} events • {lastTime.toLocaleDateString()} •{' '}
            {lastTime.toLocaleTimeString()}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {loadingEvents ? (
          <div className="px-[10px] py-[6px] space-y-2">
            <Skeleton className="h-6 w-full bg-white/[0.04]" />
            <Skeleton className="h-6 w-3/4 bg-white/[0.04]" />
            <Skeleton className="h-6 w-5/6 bg-white/[0.04]" />
          </div>
        ) : (
          <>
            {needsPagination && (
              <PaginationBar
                page={clampedPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={events.length}
                rangeStart={pageStart}
                rangeEnd={pageEnd}
                defaultPageSize={DEFAULT_PAGE_SIZE}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            )}
            <div className="px-[10px] py-[6px]">
              {visibleEvents.map((e) => (
                <EventRow
                  key={buildEventKey(e)}
                  event={e}
                  searchQuery={searchQuery}
                  highlighted={highlightedEventKey === buildEventKey(e)}
                  isPendingTarget={targetEventKey === buildEventKey(e)}
                  onTargetVisible={onTargetVisible}
                  isDraggable={isEventDraggable}
                />
              ))}
            </div>
            {needsPagination && (
              <PaginationBar
                page={clampedPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={events.length}
                rangeStart={pageStart}
                rangeEnd={pageEnd}
                defaultPageSize={DEFAULT_PAGE_SIZE}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
```

- [ ] **Step 2: Update `AgentSession` tests**

Replace the contents of `frontend/tests/features/events/AgentSession.test.tsx`:

```tsx
import { fireEvent, render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest'
import { AgentSession } from '@/features/events/AgentSession'
import type { Session } from '@/types/sessions'

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    session_id: 'test-session-abc123',
    agent: 'claudecode',
    model: 'claude-opus-4-5',
    source: 'startup',
    cwd: '/home/user/project',
    transcript_path: '/home/user/.claude/test',
    started_at: '2026-05-21T09:00:00.000Z',
    last_seen_at: '2026-05-21T10:00:00.000Z',
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_tokens: 0,
      cache_read_tokens: 0,
      turns: 0,
    },
    ...overrides,
  }
}

function renderSession(props: Partial<Parameters<typeof AgentSession>[0]> = {}) {
  const defaults = {
    session: buildSession(),
    events: [],
    loadEvents: vi.fn(),
    loadingEvents: false,
    isCollapsed: false,
    toggleSession: vi.fn(),
    searchQuery: '',
    sessionUsage: {},
    setTooltip: vi.fn(),
    targetSessionId: null,
    targetEventKey: null,
    highlightedEventKey: null,
    onTargetVisible: vi.fn(),
  }
  return render(
    <MemoryRouter>
      <AgentSession {...defaults} {...props} />
    </MemoryRouter>
  )
}

describe('AgentSession', () => {
  it('renders without events (session from API)', () => {
    renderSession({ events: [] })
    expect(screen.getByRole('button', { name: /copy session id/i })).toBeDefined()
    expect(screen.getByText(/0 events/i)).toBeDefined()
  })

  it('shows loading skeleton when loadingEvents=true', () => {
    const { container } = renderSession({ loadingEvents: true, isCollapsed: false })
    // Skeleton renders div elements with animate-pulse class
    const skeletons = container.querySelectorAll('[class*="animate-pulse"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('calls loadEvents when expanded with no events', () => {
    const loadEvents = vi.fn()
    renderSession({ events: [], loadEvents, isCollapsed: false, loadingEvents: false })
    expect(loadEvents).toHaveBeenCalled()
  })

  it('does not call loadEvents when collapsed', () => {
    const loadEvents = vi.fn()
    renderSession({ events: [], loadEvents, isCollapsed: true })
    expect(loadEvents).not.toHaveBeenCalled()
  })

  it('calls navigator.clipboard.writeText with the session_id on click', async () => {
    renderSession()
    const btn = screen.getByRole('button', { name: /copy session id/i })
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-session-abc123')
  })

  it('shows "Copied session ID" aria-label after click for 1500ms then reverts', async () => {
    renderSession()
    const btn = screen.getByRole('button', { name: /copy session id/i })
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(screen.getByRole('button', { name: /copied session id/i })).toBeDefined()
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByRole('button', { name: /copy session id/i })).toBeDefined()
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && npx tsc --noEmit && npx vitest run tests/features/events/AgentSession.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/features/events/AgentSession.tsx tests/features/events/AgentSession.test.tsx
git commit -m "feat(frontend): update AgentSession to accept Session type with lazy event loading"
```

---

## Task 7: Frontend — `SessionList` + `EventsPage` orchestration

**Files:**
- Modify: `frontend/src/features/events/SessionList.tsx`
- Modify: `frontend/src/features/events/EventsPage.tsx`

- [ ] **Step 1: Update `SessionList`**

Replace the contents of `frontend/src/features/events/SessionList.tsx`:

```tsx
import type { Dispatch, SetStateAction } from 'react'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import type { Session } from '@/types/sessions'
import type { EventRecord, SessionUsage, TooltipState } from '@/types/events'
import type { SessionEventsState } from './hooks/useSessionEvents'
import { AgentSession } from './AgentSession'

type SessionListProps = {
  sessions: Session[]
  eventCache: Map<string, EventRecord[]>
  sessionEvents: Map<string, SessionEventsState>
  loadEvents: (sessionId: string) => void
  loadingIds: Set<string>
  sortOrder: string
  searchQuery: string
  collapsedSessions: Set<string>
  toggleSession: (id: string) => void
  sessionUsage: Record<string, SessionUsage>
  setTooltip: Dispatch<SetStateAction<TooltipState | null>>
  targetSessionId: string | null
  targetEventKey: string | null
  highlightedEventKey: string | null
  onTargetVisible: () => void
  isEventDraggable?: boolean
}

export function SessionList({
  sessions,
  eventCache,
  sessionEvents,
  loadEvents,
  loadingIds,
  sortOrder,
  searchQuery,
  collapsedSessions,
  toggleSession,
  sessionUsage,
  setTooltip,
  targetSessionId,
  targetEventKey,
  highlightedEventKey,
  onTargetVisible,
  isEventDraggable = false,
}: SessionListProps) {
  const sorted = [...sessions].sort((a, b) => {
    const ta = new Date(a.last_seen_at).getTime()
    const tb = new Date(b.last_seen_at).getTime()
    return sortOrder === 'newest' ? tb - ta : ta - tb
  })

  if (sorted.length === 0) {
    return (
      <Empty className="min-h-[240px] border-0">
        <EmptyHeader>
          <EmptyTitle>No matching sessions</EmptyTitle>
          <EmptyDescription>Adjust filters or wait for incoming events.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      {sorted.map((session) => {
        const id = session.session_id
        const lazyState = sessionEvents.get(id)
        const events =
          lazyState && lazyState.events.length > 0
            ? lazyState.events
            : (eventCache.get(id) ?? [])
        return (
          <AgentSession
            key={id}
            session={session}
            events={events}
            loadEvents={() => loadEvents(id)}
            loadingEvents={loadingIds.has(id)}
            isCollapsed={collapsedSessions.has(id)}
            toggleSession={toggleSession}
            searchQuery={searchQuery}
            sessionUsage={sessionUsage}
            setTooltip={setTooltip}
            targetSessionId={targetSessionId}
            targetEventKey={targetEventKey}
            highlightedEventKey={highlightedEventKey}
            onTargetVisible={onTargetVisible}
            isEventDraggable={isEventDraggable}
          />
        )
      })}
    </>
  )
}
```

- [ ] **Step 2: Export `SessionEventsState` from `useSessionEvents`**

In `frontend/src/features/events/hooks/useSessionEvents.ts`, add `export` to the `SessionEventsState` type:

```ts
export type SessionEventsState = {
  events: EventRecord[]
  loading: boolean
  error: string | null
}
```

- [ ] **Step 3: Update `EventsPage` to orchestrate both hooks**

Replace the contents of `frontend/src/features/events/EventsPage.tsx`. Key changes:
1. Add `useSessions` and `useSessionEvents` imports
2. Add `sinceISO` from `useEventFilters`
3. Build `eventCache` from the existing SSE events
4. Pass new props to `SessionList`
5. Split view keyed on sessions instead of events

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Columns2, SlidersHorizontal } from 'lucide-react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { cn } from '@/lib/utils'
import { useEvents } from './hooks/useEvents'
import { useEventFilters } from './hooks/useEventFilters'
import { useSessionEvents } from './hooks/useSessionEvents'
import { useSessions } from '@/hooks/useSessions'
import { buildEventKey } from './eventKey'
import { EventFilters } from './EventFilters'
import { SessionList } from './SessionList'
import type { EventRecord, LayoutOutletContext, TooltipState } from '@/types'

type PendingEventLink = {
  sessionId: string
  eventKey: string
}

export function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [pendingEventLink, setPendingEventLink] = useState<PendingEventLink | null>(null)
  const [highlightedEventKey, setHighlightedEventKey] = useState<string | null>(null)
  const { collapsedSessions, setCollapsedSessions, sessionUsage, searchQuery, setSearchQuery } =
    useOutletContext<LayoutOutletContext>()
  const sessionFilterOverride = pendingEventLink?.sessionId ?? ''
  const { events, refreshing, error, reload } = useEvents(sessionFilterOverride)

  const {
    actionFilter,
    setActionFilter,
    agentFilter,
    setAgentFilter,
    availableAgents,
    projectFilter,
    setProjectFilter,
    availableProjects,
    sortOrder,
    setSortOrder,
    timeRange,
    setTimeRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    filteredEvents,
    sinceISO,
  } = useEventFilters(events, searchQuery, setSearchQuery, sessionFilterOverride)

  const { sessions } = useSessions(sinceISO ?? undefined)
  const { sessionEvents, loadEvents, loadingIds } = useSessionEvents()

  // Build event cache from SSE events: sessionId → events[]
  const eventCache = useMemo(() => {
    const cache = new Map<string, EventRecord[]>()
    for (const event of filteredEvents) {
      const key = event.session || event.transcript_path || 'ungrouped'
      const existing = cache.get(key)
      if (existing) {
        existing.push(event)
      } else {
        cache.set(key, [event])
      }
    }
    return cache
  }, [filteredEvents])

  // Filter sessions from API by action/agent/project filters applied to event cache
  const visibleSessions = useMemo(() => {
    if (sessionFilterOverride) {
      return sessions.filter((s) => s.session_id === sessionFilterOverride)
    }
    return sessions.filter((s) => {
      // If we have events in cache for this session, apply filters
      const cached = eventCache.get(s.session_id)
      if (cached && cached.length > 0) return true
      // Sessions with no cached events: show if no action/agent/project filters active
      if (actionFilter !== 'all' || agentFilter !== 'all' || projectFilter !== 'all') return false
      return true
    })
  }, [sessions, sessionFilterOverride, eventCache, actionFilter, agentFilter, projectFilter])

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [splitView, setSplitView] = useState(false)
  const [panel2SessionIds, setPanel2SessionIds] = useState<Set<string>>(new Set())
  const [panel2EventKeys, setPanel2EventKeys] = useState<Set<string>>(new Set())
  const [dragOverPanel, setDragOverPanel] = useState<1 | 2 | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [edgeZoneHover, setEdgeZoneHover] = useState(false)

  const clearPanel2 = () => {
    setPanel2SessionIds(new Set())
    setPanel2EventKeys(new Set())
  }

  useEffect(() => {
    const onStart = () => setIsDragging(true)
    const onEnd = () => {
      setIsDragging(false)
      setEdgeZoneHover(false)
    }
    document.addEventListener('dragstart', onStart)
    document.addEventListener('dragend', onEnd)
    return () => {
      document.removeEventListener('dragstart', onStart)
      document.removeEventListener('dragend', onEnd)
    }
  }, [])

  const panel1Sessions = splitView
    ? visibleSessions.filter((s) => !panel2SessionIds.has(s.session_id))
    : visibleSessions
  const panel2Sessions = visibleSessions.filter((s) => panel2SessionIds.has(s.session_id))

  const addToPanel2 = (data: string) => {
    if (data.startsWith('session:')) {
      const sessionId = data.slice('session:'.length)
      setPanel2SessionIds((prev) => new Set([...prev, sessionId]))
    } else {
      setPanel2EventKeys((prev) => new Set([...prev, data]))
    }
  }

  const removeFromPanel2 = (data: string) => {
    if (data.startsWith('session:')) {
      const sessionId = data.slice('session:'.length)
      setPanel2SessionIds((prev) => {
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
    } else {
      setPanel2EventKeys((prev) => {
        const next = new Set(prev)
        next.delete(data)
        return next
      })
    }
  }

  const handleDropToPanel = (targetPanel: 1 | 2) => (ev: React.DragEvent) => {
    ev.preventDefault()
    const data = ev.dataTransfer.getData('text/plain')
    if (!data) return
    if (targetPanel === 2) addToPanel2(data)
    else removeFromPanel2(data)
    setDragOverPanel(null)
    setIsDragging(false)
  }

  const handleDragOver = (panel: 1 | 2) => (ev: React.DragEvent) => {
    ev.preventDefault()
    ev.dataTransfer.dropEffect = 'move'
    setDragOverPanel(panel)
  }

  const handleDragLeave = (ev: React.DragEvent) => {
    if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
      setDragOverPanel(null)
    }
  }

  const handleDropToEdge = (ev: React.DragEvent) => {
    ev.preventDefault()
    const data = ev.dataTransfer.getData('text/plain')
    if (!data) return
    if (!splitView) clearPanel2()
    setSplitView(true)
    addToPanel2(data)
    setEdgeZoneHover(false)
    setIsDragging(false)
  }

  useEffect(() => {
    const sessionId = searchParams.get('session') ?? ''
    const eventKey = searchParams.get('event') ?? ''
    if (!sessionId || !eventKey) return

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('session')
    nextParams.delete('event')
    queueMicrotask(() => {
      setPendingEventLink({ sessionId, eventKey })
      setHighlightedEventKey(eventKey)
      setCollapsedSessions((prev) => {
        if (!prev.has(sessionId)) return prev
        const next = new Set(prev)
        next.delete(sessionId)
        return next
      })
      setSearchParams(nextParams, { replace: true })
    })
  }, [searchParams, setCollapsedSessions, setSearchParams])

  useEffect(() => {
    if (!highlightedEventKey) return
    const timeoutId = window.setTimeout(() => setHighlightedEventKey(null), 2500)
    return () => window.clearTimeout(timeoutId)
  }, [highlightedEventKey])

  const toggleSession = (id: string) => {
    setCollapsedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearPendingEventLink = () => setPendingEventLink(null)

  const handleActionFilterChange = (value: string) => { clearPendingEventLink(); setActionFilter(value) }
  const handleAgentFilterChange = (value: string) => { clearPendingEventLink(); setAgentFilter(value) }
  const handleProjectFilterChange = (value: string) => { clearPendingEventLink(); setProjectFilter(value) }
  const handleSortOrderChange = (value: string) => { clearPendingEventLink(); setSortOrder(value) }
  const handleTimeRangeChange = (value: string) => { clearPendingEventLink(); setTimeRange(value) }
  const handleCustomStartChange = (value: string) => { clearPendingEventLink(); setCustomStart(value) }
  const handleCustomEndChange = (value: string) => { clearPendingEventLink(); setCustomEnd(value) }
  const handleTargetVisible = () => {}

  const sharedSessionListProps = {
    eventCache,
    sessionEvents,
    loadEvents,
    loadingIds,
    sortOrder,
    searchQuery,
    collapsedSessions,
    toggleSession,
    sessionUsage,
    setTooltip,
    targetSessionId: pendingEventLink?.sessionId ?? null,
    targetEventKey: pendingEventLink?.eventKey ?? null,
    highlightedEventKey,
    onTargetVisible: handleTargetVisible,
    isEventDraggable: true,
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c0c] relative">
      <div className="border-b border-[#333] bg-[#111] px-4 py-2 sm:hidden">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between border-[#333] bg-black text-[#cccccc] hover:bg-white/[0.03] hover:text-[#cccccc]"
          onClick={() => setMobileFiltersOpen((open) => !open)}
          aria-expanded={mobileFiltersOpen}
          aria-controls="event-filters"
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="size-3.5" />
            Filters
          </span>
          <span>{mobileFiltersOpen ? 'Hide' : 'Show'}</span>
        </Button>
      </div>
      <EventFilters
        id="event-filters"
        actionFilter={actionFilter}
        setActionFilter={handleActionFilterChange}
        agentFilter={agentFilter}
        setAgentFilter={handleAgentFilterChange}
        availableAgents={availableAgents}
        projectFilter={projectFilter}
        setProjectFilter={handleProjectFilterChange}
        availableProjects={availableProjects}
        sortOrder={sortOrder}
        setSortOrder={handleSortOrderChange}
        timeRange={timeRange}
        setTimeRange={handleTimeRangeChange}
        customStart={customStart}
        setCustomStart={handleCustomStartChange}
        customEnd={customEnd}
        setCustomEnd={handleCustomEndChange}
        splitView={splitView}
        onToggleSplit={() => {
          if (splitView) {
            setSplitView(false)
            clearPanel2()
          } else {
            setSplitView(true)
          }
        }}
        className={mobileFiltersOpen ? 'sm:flex' : 'hidden sm:flex'}
      />

      {splitView ? (
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel minSize={20} defaultSize={50}>
            <div
              className={cn(
                'relative h-full overflow-y-auto p-3 sm:p-4 lg:p-5 transition-colors',
                dragOverPanel === 1 && 'bg-sky-500/[0.04] ring-1 ring-inset ring-sky-500/20'
              )}
              onDragOver={handleDragOver(1)}
              onDragLeave={handleDragLeave}
              onDrop={handleDropToPanel(1)}
            >
              {sessions.length === 0 && !refreshing && !error ? (
                <div className="text-[#666] text-sm h-full flex flex-col items-center justify-center">
                  No sessions found. Start a session to see events stream here.
                </div>
              ) : (
                <SessionList {...sharedSessionListProps} sessions={panel1Sessions} />
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle className="w-[3px] bg-[#222] hover:bg-[#444] active:bg-[#555] transition-colors cursor-col-resize" />

          <ResizablePanel minSize={20} defaultSize={50}>
            <div
              className={cn(
                'relative h-full overflow-y-auto p-3 sm:p-4 lg:p-5 transition-colors',
                dragOverPanel === 2 && 'bg-sky-500/[0.04] ring-1 ring-inset ring-sky-500/20'
              )}
              onDragOver={handleDragOver(2)}
              onDragLeave={handleDragLeave}
              onDrop={handleDropToPanel(2)}
            >
              {panel2Sessions.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[#2a2a2a] p-10 text-[#444] text-sm transition-colors',
                      dragOverPanel === 2 && 'border-sky-500/40 text-[#666]'
                    )}
                  >
                    <span>Drop events here</span>
                  </div>
                </div>
              ) : (
                <SessionList
                  {...sharedSessionListProps}
                  sessions={panel2Sessions}
                  targetSessionId={null}
                  targetEventKey={null}
                />
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5">
          {error && (
            <Alert variant="destructive" className="mb-4 bg-red-950/50 border-red-900">
              <AlertTitle>Connection Error</AlertTitle>
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={reload}>
                  Retry Connection
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {sessions.length === 0 && !refreshing && !error ? (
            <div className="text-[#666] text-sm h-full flex flex-col items-center justify-center">
              No sessions found. Start a session to see events stream here.
            </div>
          ) : (
            <SessionList {...sharedSessionListProps} sessions={visibleSessions} />
          )}
        </div>
      )}

      {tooltip && (
        <div
          className="fixed pointer-events-none z-[1000] bg-black text-[#ccc] px-2 py-1 text-[0.7rem] rounded border border-white/10"
          style={{ top: tooltip.y + 10, left: tooltip.x + 10 }}
        >
          {tooltip.text}
        </div>
      )}

      {isDragging && (
        <div
          className={cn(
            'absolute right-0 top-0 bottom-0 z-[500] pointer-events-auto transition-all duration-150',
            edgeZoneHover ? 'w-[38%]' : 'w-12'
          )}
          onDragEnter={() => setEdgeZoneHover(true)}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setEdgeZoneHover(false)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }}
          onDrop={handleDropToEdge}
        >
          {edgeZoneHover && (
            <div className="h-full w-full bg-sky-500/10 border-l-2 border-sky-500/40 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-sky-400/90 select-none">
                <Columns2 className="size-10 opacity-80" />
                <span className="text-sm font-medium">Split here</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run full frontend validation**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: no type errors, all tests pass.

- [ ] **Step 5: Run full backend validation**

```bash
cd backend && go build ./... && go test ./... && golangci-lint run ./...
```

Expected: all tests pass, no lint errors.

- [ ] **Step 6: Prettier format**

```bash
cd frontend && npx prettier --write src/features/events/SessionList.tsx \
  src/features/events/EventsPage.tsx
```

- [ ] **Step 7: Commit**

```bash
cd frontend
git add src/features/events/SessionList.tsx \
  src/features/events/EventsPage.tsx \
  src/features/events/hooks/useSessionEvents.ts
git commit -m "feat(frontend): wire session list to API with lazy event loading"
```
