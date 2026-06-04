import type { EventRecord } from '@/types/events'

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
