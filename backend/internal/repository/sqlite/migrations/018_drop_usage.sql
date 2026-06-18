-- Argus refocus: remove all token/usage tracking. The sessions table keeps only
-- lifecycle + identity columns (used for per-event model backfill on ingest).
-- SQLite supports ALTER TABLE DROP COLUMN since 3.35; modernc.org/sqlite honors it.
DROP TABLE IF EXISTS session_model_usage;

ALTER TABLE sessions DROP COLUMN input_tokens;
ALTER TABLE sessions DROP COLUMN output_tokens;
ALTER TABLE sessions DROP COLUMN cache_creation_tokens;
ALTER TABLE sessions DROP COLUMN cache_read_tokens;
ALTER TABLE sessions DROP COLUMN turns;
