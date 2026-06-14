import type { EventRecord } from '@/types/events'

// The key derives only from immutable event fields, so caching it per object is
// safe. buildEventKey is called many times per event (merge, filters, render),
// and the 12-field join is the bulk of that work — a WeakMap memo makes repeat
// lookups free without holding the events alive.
const keyCache = new WeakMap<EventRecord, string>()

export function buildEventKey(event: EventRecord): string {
  const cached = keyCache.get(event)
  if (cached !== undefined) return cached
  const key = [
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
  keyCache.set(event, key)
  return key
}

export function mergeByKey(primary: EventRecord[], secondary: EventRecord[]): EventRecord[] {
  const merged = new Map<string, EventRecord>()

  for (const event of primary) {
    merged.set(buildEventKey(event), event)
  }

  for (const event of secondary) {
    merged.set(buildEventKey(event), event)
  }

  return Array.from(merged.values())
}
