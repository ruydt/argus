---
phase: 02-reliable-daily-use
plan: 05
subsystem: ui
tags: [react, typescript, events, badge, normalization]

requires:
  - phase: 02-reliable-daily-use
    plan: 01
    provides: "Backend domain.NormalizedEvent with normalization_status, normalizer_version, agent_version fields + migration 008"

provides:
  - "EventRecord TypeScript interface with normalization_status, normalizer_version, agent_version optional fields"
  - "EventBadges component renders amber 'degraded' badge as first badge when normalization_status='degraded'"
  - "hasAny guard updated to include normalization_status === 'degraded' check"

affects: [02-06, 02-07, 02-08]

tech-stack:
  added: []
  patterns:
    - "Amber badge style: border-[rgba(245,166,35,0.35)] bg-[rgba(245,166,35,0.08)] text-[#f5a623] — reuses --bash CSS token color for degraded signal"

key-files:
  created: []
  modified:
    - frontend/src/types/events.ts
    - frontend/src/features/events/EventBadges.tsx

key-decisions:
  - "Degraded badge is visual indicator only — no onClick, no Tooltip, no icon (D-05)"
  - "Badge uses strict equality check (=== 'degraded') so any unknown status value renders no badge — no XSS vector"
  - "Three new fields are optional to support pre-migration 008 events returning NULL from SQLite"

patterns-established:
  - "Status badges: per-row visual indicator before data badges, using amber color for degraded/warning state"

requirements-completed:
  - MODEL-04

duration: 5min
completed: 2026-05-26
---

# Phase 02 Plan 05: Degraded Badge Summary

**EventRecord gains normalization_status/version fields and EventBadges renders an amber 'degraded' badge as the first badge for events with degraded normalization**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-26T09:07:00Z
- **Completed:** 2026-05-26T09:11:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added `normalization_status?: 'ok' | 'degraded'`, `normalizer_version?: string`, and `agent_version?: string` optional fields to `EventRecord` TypeScript interface, mirroring backend `domain.NormalizedEvent` JSON tags
- Added amber degraded badge as first item in EventBadges badge container, using prescriptive DOM from UI-SPEC.md (color `#f5a623`, border `rgba(245,166,35,0.35)`, bg `rgba(245,166,35,0.08)`)
- Updated `hasAny` guard to include `e.normalization_status === 'degraded'` as first condition so degraded-only events (no other badges) still render the badge container

## Task Commits

1. **Task 1: Add normalization fields to EventRecord and degraded badge to EventBadges** - `03fc8b2` (feat)

## Files Created/Modified
- `frontend/src/types/events.ts` - Added normalization_status, normalizer_version, agent_version optional fields to EventRecord interface
- `frontend/src/features/events/EventBadges.tsx` - Added degraded badge as first badge item, updated hasAny guard

## Decisions Made
- Followed plan exactly as specified — no architectural decisions required beyond what was prescribed in UI-SPEC.md and the plan interfaces
- Fields are optional (not required) because pre-migration 008 events stored in SQLite will return NULL, which serializes as absent in JSON

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Frontend type contract now matches backend domain model for normalization fields
- EventBadges renders degraded indicator — visual contract from UI-SPEC.md fulfilled
- Ready for 02-06 (session reliability improvements) and remaining wave 2 plans

---
*Phase: 02-reliable-daily-use*
*Completed: 2026-05-26*
