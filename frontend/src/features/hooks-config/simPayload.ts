import { getTemplate } from './hookTemplates'
import type { AgentKey } from './types'

type ResolveSimPayloadArgs = {
  agent: AgentKey
  event: string
  currentEventType: string
  currentPayload: string
  // One-shot real payload handed off by "Simulate this event"; always wins.
  handoff: string | null
}

// resolveSimPayload decides which JSON the simulator shows when a deep link
// preselects an event. An existing payload is preserved ONLY when the event
// isn't changing — that keeps the user's edits across a tour re-nav or a
// same-event revisit. A deep link to a DIFFERENT event must regenerate the
// template; otherwise the payload still describes the previously-simulated
// event (e.g. PostToolUse JSON left over when opening a PreToolUse script).
export function resolveSimPayload({
  agent,
  event,
  currentEventType,
  currentPayload,
  handoff,
}: ResolveSimPayloadArgs): string {
  if (handoff) return handoff
  if (event === currentEventType && currentPayload.trim()) return currentPayload
  return JSON.stringify(getTemplate(agent, event), null, 2)
}
