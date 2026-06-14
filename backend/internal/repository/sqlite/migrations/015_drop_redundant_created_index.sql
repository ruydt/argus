-- idx_hook_events_created (created_at DESC, migration 001) and
-- idx_hook_events_created_at (created_at, migration 010) both index created_at.
-- SQLite can scan a single index in either direction, so the second is pure
-- storage overhead with no query benefit. Drop it; keep the DESC index, which
-- matches the read paths' ORDER BY created_at DESC.
DROP INDEX IF EXISTS idx_hook_events_created_at;
