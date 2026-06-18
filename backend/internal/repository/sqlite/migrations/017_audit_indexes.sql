-- 017_audit_indexes.sql
-- Add indexes on the hottest read paths surfaced by the v1.0.0 audit.
-- All additive (CREATE INDEX IF NOT EXISTS) — no data change, safe to re-run.
--
-- Before this migration the sessions table had only its PRIMARY KEY, yet the
-- Projects page and dashboard filter/group/order on cwd, started_at and
-- last_seen_at (full scan + filesort). hook_events.cwd was likewise unindexed,
-- so DeleteProjectByCWD scanned the highest-volume table inside a write
-- transaction, blocking concurrent ingestion.

-- Project delete-with-cascade + any cwd filter on the event stream.
CREATE INDEX IF NOT EXISTS idx_hook_events_cwd ON hook_events(cwd);

-- GetFileChanges groups events by (session_id, tool_use_id); the existing
-- idx_hook_events_session covers session_id only.
CREATE INDEX IF NOT EXISTS idx_hook_events_session_tooluse ON hook_events(session_id, tool_use_id);

-- Projects page lists sessions by cwd ordered by recency; dashboard windows by time.
CREATE INDEX IF NOT EXISTS idx_sessions_cwd ON sessions(cwd);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at ON sessions(last_seen_at);

-- Composite for the common "sessions in this project, newest first" query.
CREATE INDEX IF NOT EXISTS idx_sessions_cwd_last_seen ON sessions(cwd, last_seen_at);
