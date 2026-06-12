# Event Visibility Fixes

**Date:** 2026-06-05
**Status:** Approved

## Problem

Two distinct bugs cause events to silently disappear from the live events view:

1. **Dedup collision** — `UserPromptSubmit` and `Stop` events have no `turn_id` or `tool_use_id`. The dedup key (`session|turn_id|tool_use_id|hook_event_name|time`) collapses two such events in the same second into one. The second is silently dropped at both `INSERT OR IGNORE` (backend) and `buildEventKey` (frontend).

2. **SSE backfill too shallow** — Live mode replaces the full historical REST feed with an SSE stream that backfills only the last 100 events. Any `Stop` (or other event) older than 100 positions is invisible in live mode but visible after switching to historical mode and refreshing.

## Fix 1 — Extend dedup key with payload differentiators

### Scope

- `backend/internal/domain/event.go` — `ComputeDedupKey`
- `frontend/src/features/events/eventKey.ts` — `buildEventKey`

### Backend

Add `prompt` and `response` to the SHA-256 input in `ComputeDedupKey`:

```go
h := sha256.Sum256([]byte(
    e.Session + "|" + e.TurnID + "|" + e.ToolUseID + "|" +
    e.HookEventName + "|" + e.Time + "|" + e.Prompt + "|" + e.Response,
))
```

- `UserPromptSubmit` — `Prompt` field carries the user's text → distinct prompts in the same second produce distinct keys.
- `Stop` — `Response` field carries the last assistant message → distinct stop events produce distinct keys.
- All other event types — both fields are empty string → hash input unchanged → zero behavior change.

Existing rows in SQLite are unaffected (their stored `dedup_key` values are not recomputed). New events ingested after deploy use the extended key.

### Frontend

Add `prompt` and `response` to the key array in `buildEventKey`:

```ts
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
```

Frontend key must stay consistent with backend dedup semantics so the live merge (`mergeByKey`) deduplicates correctly.

### Testing

- Unit test `ComputeDedupKey`: two `UserPromptSubmit` events same session/time but different `Prompt` → different keys.
- Unit test `ComputeDedupKey`: two `Stop` events same session/time but different `Response` → different keys.
- Unit test: non-prompt event (e.g. `PostToolUse`) with empty `Prompt`/`Response` → key identical to current behavior.

## Fix 2 — Live mode uses historical events as baseline

### Problem root cause

`EventsPage.tsx` currently selects events exclusively from one source:

```ts
const activeEvents = isLive ? liveState.events : histState.events
```

`histState` is disabled when live is on (`enabled: !isLive`). The SSE stream backfills only 100 events. Events outside that window are invisible in live mode.

### Scope

- `frontend/src/features/events/EventsPage.tsx`
- `frontend/src/features/events/hooks/useHistoricalEvents.ts` (minor: no-op when already enabled)
- `frontend/src/features/events/eventKey.ts` (already updated by Fix 1)

### Design

`histState` always runs. `activeEvents` merges both sources when live is on:

```ts
const histState = useHistoricalEvents(fetchSince, fetchUntil, sessionFilterOverride, true)

const activeEvents = useMemo(() => {
  if (!isLive) return histState.events
  return mergeByKey(histState.events, liveState.events)
}, [isLive, histState.events, liveState.events])
```

`mergeByKey` deduplicates by `buildEventKey`. Live events win on conflict (fresher data from SSE broadcast). Historical events provide the full baseline.

```ts
function mergeByKey(base: EventRecord[], live: EventRecord[]): EventRecord[] {
  const seen = new Map<string, EventRecord>()
  for (const e of base) seen.set(buildEventKey(e), e)
  for (const e of live) seen.set(buildEventKey(e), e)  // live overwrites base on collision
  return Array.from(seen.values())
}
```

### SSE backfill

`sseBackfillLimit = 100` stays unchanged. Its sole purpose narrows to covering the race window between the REST response completing and the SSE connection opening. Historical coverage is now owned by `histState`.

### Load-more in live mode

Load-more (`histState.hasMore`) is already gated by `!isLive` in the render. This stays as-is — pagination is disabled in live mode. `histState` internally tracks cursor state so toggling live off restores the correct pagination position.

### Testing

- Toggle live ON from a session with >100 events — all events visible, not just last 100.
- Stop event from an old session appears in live mode.
- Toggle live OFF → same events visible (no flicker, no reorder).
- Load-more button absent in live mode, present in historical mode.

## Non-goals

- Retroactively recomputing `dedup_key` for existing SQLite rows.
- Changing `sseBackfillLimit` value.
- Enabling load-more pagination in live mode.
- Fixing Codex `turn_id` population at the source (separate concern).

## Files changed

| File | Change |
|------|--------|
| `backend/internal/domain/event.go` | Extend `ComputeDedupKey` with `Prompt` and `Response` |
| `frontend/src/features/events/eventKey.ts` | Add `prompt` and `response` to key array |
| `frontend/src/features/events/EventsPage.tsx` | Always enable `histState`; merge with `liveState` when live |
