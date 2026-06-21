-- idx_hook_events_action (action) and idx_hook_events_hook_name (hook_event_name)
-- were created in migration 001 but no query ever filters or joins on either
-- column — both appear only in COALESCE projections, never in a WHERE/JOIN
-- predicate. On hook_events (the highest-volume table) they are pure
-- write-amplification: every INSERT maintains two indexes that no reader uses.
-- Drop both.
DROP INDEX IF EXISTS idx_hook_events_action;
DROP INDEX IF EXISTS idx_hook_events_hook_name;
