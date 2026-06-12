# Event Visibility Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs that cause events (especially `UserPromptSubmit` and `Stop`) to silently disappear from the live events view.

**Architecture:** Bug 1 extends the SHA-256 dedup key with `Prompt` and `Response` fields so two events of the same type in the same second are no longer conflated. Bug 2 makes `histState` always fetch so historical events serve as the live-mode baseline, with SSE delivering only new arrivals on top.

**Tech Stack:** Go 1.25 (backend domain), React 19 + TypeScript 6 + Vitest 4 (frontend)

---

## File Map

| File | Change |
|------|--------|
| `backend/internal/domain/event.go` | Extend `ComputeDedupKey` — add `Prompt` and `Response` to hash |
| `backend/tests/internal/domain/event_test.go` | New — unit tests for extended dedup key |
| `frontend/src/features/events/eventKey.ts` | Add `prompt`/`response` to `buildEventKey`; export `mergeByKey` |
| `frontend/tests/features/events/eventKey.test.ts` | New — unit tests for `buildEventKey` and `mergeByKey` |
| `frontend/src/features/events/EventsPage.tsx` | Always enable `histState`; merge with `liveState` when live is on |
| `frontend/tests/features/events/EventsPage.test.tsx` | Add test asserting `histState` always enabled |

---

## Task 1: Backend — extend dedup key

**Files:**
- Create: `backend/tests/internal/domain/event_test.go`
- Modify: `backend/internal/domain/event.go`

- [ ] **Step 1: Create the failing test file**

```go
// backend/tests/internal/domain/event_test.go
package domain_test

import (
	"testing"

	"argus/internal/domain"
)

func TestComputeDedupKey_UserPromptSubmit_DifferentPrompts(t *testing.T) {
	base := domain.NormalizedEvent{
		Session:       "sess1",
		HookEventName: "UserPromptSubmit",
		Time:          "2026-06-05T10:00:00Z",
	}
	e1 := base
	e1.Prompt = "first prompt"
	e2 := base
	e2.Prompt = "second prompt"

	if domain.ComputeDedupKey(e1) == domain.ComputeDedupKey(e2) {
		t.Error("want different keys for different prompts, got same")
	}
}

func TestComputeDedupKey_Stop_DifferentResponses(t *testing.T) {
	base := domain.NormalizedEvent{
		Session:       "sess1",
		HookEventName: "Stop",
		Time:          "2026-06-05T10:00:00Z",
	}
	e1 := base
	e1.Response = "response A"
	e2 := base
	e2.Response = "response B"

	if domain.ComputeDedupKey(e1) == domain.ComputeDedupKey(e2) {
		t.Error("want different keys for different responses, got same")
	}
}

func TestComputeDedupKey_PostToolUse_EmptyPromptResponse_DifferentTurnIDs(t *testing.T) {
	base := domain.NormalizedEvent{
		Session:       "sess1",
		HookEventName: "PostToolUse",
		Time:          "2026-06-05T10:00:00Z",
		// Prompt and Response intentionally empty — must not affect non-prompt events
	}
	e1 := base
	e1.TurnID = "turn1"
	e2 := base
	e2.TurnID = "turn2"

	if domain.ComputeDedupKey(e1) == domain.ComputeDedupKey(e2) {
		t.Error("want different keys for different turn IDs, got same")
	}
	if domain.ComputeDedupKey(e1) != domain.ComputeDedupKey(e1) {
		t.Error("want deterministic key for identical input, got different")
	}
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend
go test ./tests/internal/domain/... -v -run TestComputeDedupKey
```

Expected: FAIL — the first two tests fail because `Prompt` and `Response` are not yet in the hash.

- [ ] **Step 3: Extend ComputeDedupKey in `backend/internal/domain/event.go`**

Find `ComputeDedupKey` (currently around line 71–78) and replace it:

```go
// ComputeDedupKey returns the SHA-256-based dedup key for an event.
// Used by both the repository (insert) and service (broadcast).
func ComputeDedupKey(e NormalizedEvent) string {
	h := sha256.Sum256([]byte(
		e.Session + "|" + e.TurnID + "|" + e.ToolUseID + "|" + e.HookEventName + "|" + e.Time + "|" + e.Prompt + "|" + e.Response,
	))
	return fmt.Sprintf("%x", h)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
go test ./tests/internal/domain/... -v -run TestComputeDedupKey
```

Expected: PASS — all three tests green.

- [ ] **Step 5: Run full backend test suite and lint**

```bash
cd backend
go build ./...
go test ./...
golangci-lint run ./...
```

Expected: all pass, no lint errors.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/domain/event.go backend/tests/internal/domain/event_test.go
git commit -m "fix(dedup): include prompt and response in dedup key"
```

---

## Task 2: Frontend — extend buildEventKey and add mergeByKey

**Files:**
- Create: `frontend/tests/features/events/eventKey.test.ts`
- Modify: `frontend/src/features/events/eventKey.ts`

- [ ] **Step 1: Create the failing test file**

```ts
// frontend/tests/features/events/eventKey.test.ts
import { describe, expect, it } from 'vitest'
import { buildEventKey, mergeByKey } from '../../../src/features/events/eventKey'
import type { EventRecord } from '../../../src/types'

const baseEvent: EventRecord = {
  time: '2026-06-05T10:00:00Z',
  action: 'PROMPT',
  path: '',
  session: 'sess1',
  hook_event_name: 'UserPromptSubmit',
}

describe('buildEventKey', () => {
  it('distinguishes UserPromptSubmit events with different prompts', () => {
    const e1 = { ...baseEvent, prompt: 'first prompt' }
    const e2 = { ...baseEvent, prompt: 'second prompt' }
    expect(buildEventKey(e1)).not.toBe(buildEventKey(e2))
  })

  it('distinguishes Stop events with different responses', () => {
    const e1 = { ...baseEvent, action: 'STOP', hook_event_name: 'Stop', response: 'resp A' }
    const e2 = { ...baseEvent, action: 'STOP', hook_event_name: 'Stop', response: 'resp B' }
    expect(buildEventKey(e1)).not.toBe(buildEventKey(e2))
  })

  it('produces same key for identical events', () => {
    expect(buildEventKey(baseEvent)).toBe(buildEventKey(baseEvent))
  })
})

describe('mergeByKey', () => {
  it('includes events from both sources when keys differ', () => {
    const e1 = { ...baseEvent, prompt: 'first' }
    const e2 = { ...baseEvent, prompt: 'second' }
    expect(mergeByKey([e1], [e2])).toHaveLength(2)
  })

  it('live event overwrites base event with same key', () => {
    const e = { ...baseEvent }
    const eLive = { ...e, model: 'updated-model' }
    const result = mergeByKey([e], [eLive])
    expect(result).toHaveLength(1)
    expect(result[0].model).toBe('updated-model')
  })

  it('returns empty array when both inputs empty', () => {
    expect(mergeByKey([], [])).toEqual([])
  })

  it('returns base events when live is empty', () => {
    const e = { ...baseEvent, prompt: 'hello' }
    expect(mergeByKey([e], [])).toHaveLength(1)
  })

  it('returns live events when base is empty', () => {
    const e = { ...baseEvent, prompt: 'hello' }
    expect(mergeByKey([], [e])).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend
npx vitest run tests/features/events/eventKey.test.ts
```

Expected: FAIL — `mergeByKey` is not exported (doesn't exist yet), `buildEventKey` tests for `prompt`/`response` fail.

- [ ] **Step 3: Update `frontend/src/features/events/eventKey.ts`**

Replace the entire file:

```ts
import type { EventRecord } from '@/types'

export function buildEventKey(event: EventRecord): string {
  return [
    event.session ?? '',
    event.time,
    event.action,
    event.path ?? '',
    event.hook_event_name ?? '',
    event.tool ?? '',
    event.turn_id ?? '',
    event.tool_use_id ?? '',
    event.task_id ?? '',
    event.subagent_id ?? '',
    event.prompt ?? '',
    event.response ?? '',
  ].join('|')
}

export function mergeByKey(base: EventRecord[], live: EventRecord[]): EventRecord[] {
  const seen = new Map<string, EventRecord>()
  for (const e of base) seen.set(buildEventKey(e), e)
  for (const e of live) seen.set(buildEventKey(e), e) // live overwrites base on collision
  return Array.from(seen.values())
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
npx vitest run tests/features/events/eventKey.test.ts
```

Expected: PASS — all tests green.

- [ ] **Step 5: Run type check to catch any regressions**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/events/eventKey.ts frontend/tests/features/events/eventKey.test.ts
git commit -m "fix(dedup): extend buildEventKey with prompt/response; add mergeByKey"
```

---

## Task 3: Frontend — live mode uses historical events as baseline

**Files:**
- Modify: `frontend/tests/features/events/EventsPage.test.tsx`
- Modify: `frontend/src/features/events/EventsPage.tsx`

- [ ] **Step 1: Add a failing test to `EventsPage.test.tsx`**

First, upgrade the `useHistoricalEvents` mock at the top of the file so it's spyable. Find the existing `vi.hoisted` block for `historicalState` and the `vi.mock` for `useHistoricalEvents`, and replace them:

```ts
// Replace the existing historicalState hoisted value with this:
const historicalState = vi.hoisted(() => ({
  events: [] as EventRecord[],
  error: null as string | null,
  loading: false,
  hasMore: false,
  refresh: vi.fn(),
  loadMore: vi.fn(),
}))

// Replace the existing useHistoricalEvents mock with this:
const useHistoricalEventsMock = vi.hoisted(() => vi.fn())
vi.mock('@/features/events/hooks/useHistoricalEvents', () => ({
  useHistoricalEvents: useHistoricalEventsMock,
}))
```

In the `beforeEach` block, add a line to reset the mock return value:

```ts
beforeEach(() => {
  vi.stubGlobal('localStorage', localStorageMock)
  vi.clearAllMocks()
  useHistoricalEventsMock.mockReturnValue(historicalState)
  // ... rest of existing beforeEach
})
```

Then add this test case to the existing `describe` block:

```ts
it('always enables histState regardless of isLive', () => {
  renderEventsPage({ isLive: true })
  expect(useHistoricalEventsMock).toHaveBeenCalledWith(
    expect.any(String), // since
    expect.any(String), // until
    expect.any(String), // sessionFilter
    true,               // enabled — must be true, not !isLive
  )
})

it('also enables histState when isLive is false', () => {
  renderEventsPage({ isLive: false })
  expect(useHistoricalEventsMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(String),
    expect.any(String),
    true,
  )
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
cd frontend
npx vitest run tests/features/events/EventsPage.test.tsx -t 'always enables histState'
```

Expected: FAIL — current code passes `!isLive` (i.e. `false` when live is on).

- [ ] **Step 3: Update `EventsPage.tsx`**

Find line `208` (the `useHistoricalEvents` call). Change `!isLive` to `true`:

```ts
// Before:
const histState = useHistoricalEvents(fetchSince, fetchUntil, sessionFilterOverride, !isLive)

// After:
const histState = useHistoricalEvents(fetchSince, fetchUntil, sessionFilterOverride, true)
```

Find lines `209–210` (the `activeEvents` / `activeError` assignments). Replace:

```ts
// Before:
const activeEvents = isLive ? liveState.events : histState.events
const activeError = isLive ? liveState.error : histState.error

// After:
const activeEvents = useMemo(
  () => (isLive ? mergeByKey(histState.events, liveState.events) : histState.events),
  [isLive, histState.events, liveState.events],
)
const activeError = isLive ? liveState.error : histState.error
```

Make sure `mergeByKey` is imported. The existing import on line 11 is:

```ts
import { buildEventKey } from './eventKey'
```

Change it to:

```ts
import { buildEventKey, mergeByKey } from './eventKey'
```

- [ ] **Step 4: Run all EventsPage tests**

```bash
cd frontend
npx vitest run tests/features/events/EventsPage.test.tsx
```

Expected: all tests green (new tests pass, existing tests unaffected).

- [ ] **Step 5: Run full frontend test suite and type check**

```bash
cd frontend
npx tsc --noEmit
npx vitest run
```

Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/events/EventsPage.tsx frontend/tests/features/events/EventsPage.test.tsx
git commit -m "fix(live): always load histState as baseline; merge with live events"
```

---

## Task 4: Final verification

- [ ] **Step 1: Run full backend suite one more time**

```bash
cd backend
go test ./...
golangci-lint run ./...
```

Expected: all pass.

- [ ] **Step 2: Run full frontend suite one more time**

```bash
cd frontend
npx vitest run
npx tsc --noEmit
```

Expected: all pass, no type errors.

- [ ] **Step 3: Manual smoke test**

1. Start argus (`make dev` or `go run ./cmd/server/main.go` + `cd frontend && pnpm dev`).
2. Enable live mode on EventsPage.
3. Run Claude Code (or send a manual curl with `UserPromptSubmit` payload) for a session with >100 events.
4. Verify the `Stop` event from that session is visible in live mode.
5. Send two rapid `UserPromptSubmit` events with different prompt text in the same second:
   ```bash
   curl -s -X POST http://localhost:8765/api/hook \
     -H 'Content-Type: application/json' \
     -d '{"hook_event_name":"UserPromptSubmit","session_id":"test-sess","prompt":"first prompt","transcript_path":"/tmp/.claude/test"}'
   curl -s -X POST http://localhost:8765/api/hook \
     -H 'Content-Type: application/json' \
     -d '{"hook_event_name":"UserPromptSubmit","session_id":"test-sess","prompt":"second prompt","transcript_path":"/tmp/.claude/test"}'
   ```
6. Verify both events appear in the live stream.
