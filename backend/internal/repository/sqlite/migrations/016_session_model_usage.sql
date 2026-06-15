-- Per-model token usage per session, persisted on ingest so the dashboard reads
-- the breakdown from the DB instead of re-scanning every session transcript on
-- each load. The scalar totals stay on the sessions row; this table holds the
-- model-level split that the per-model dashboard charts need.
CREATE TABLE IF NOT EXISTS session_model_usage (
    session_id            TEXT    NOT NULL,
    model                 TEXT    NOT NULL,
    input_tokens          INTEGER NOT NULL DEFAULT 0,
    output_tokens         INTEGER NOT NULL DEFAULT 0,
    cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
    turns                 INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, model)
);
