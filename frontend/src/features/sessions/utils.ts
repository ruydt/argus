import type { SessionSummary } from '@/types'

// Events that mean a session wants the user's attention: the agent finished its
// turn (Stop) or is blocked waiting on a permission decision (PermissionRequest).
// Matched by canonical hook_event_name, which Claude Code and Codex both emit
// verbatim — other agents match too as long as they use these names.
const ATTENTION_EVENTS = new Set(['Stop', 'PermissionRequest'])

// A session "needs attention" when its newest event is one of ATTENTION_EVENTS
// and the user hasn't opened it since — i.e. the last event is newer than the
// last time the session was viewed. The sidebar bolds these.
export function isUnreadStop(session: SessionSummary, seen: Record<string, number>): boolean {
  const event = session.sample?.hook_event_name
  if (!event || !ATTENTION_EVENTS.has(event)) return false
  return session.lastTimeMs > (seen[session.sessionId] ?? 0)
}

export function projectName(cwd: string): string {
  const segments = cwd.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? cwd
}

// The badge a session shows: an explicit user tag wins; otherwise it defaults to
// the session's working folder name so every session is labelled out of the box.
export function effectiveTag(
  explicitTag: string | undefined,
  cwd: string | undefined
): string | undefined {
  if (explicitTag) return explicitTag
  return cwd ? projectName(cwd) : undefined
}
