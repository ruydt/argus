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
  ].join('|')
}
