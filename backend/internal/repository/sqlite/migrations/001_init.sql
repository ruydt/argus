PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS hook_events (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at       TEXT    NOT NULL,
    agent            TEXT    NOT NULL,
    session_id       TEXT    NOT NULL,
    hook_event_name  TEXT    NOT NULL,
    turn_id          TEXT,
    tool_use_id      TEXT,
    tool_name        TEXT,
    model            TEXT,
    source           TEXT,
    cwd              TEXT,
    transcript_path  TEXT,
    action           TEXT,
    path             TEXT,
    command          TEXT,
    old_string       TEXT,
    new_string       TEXT,
    start_line       INTEGER,
    ctx_before       TEXT    NOT NULL DEFAULT '[]',
    ctx_after        TEXT    NOT NULL DEFAULT '[]',
    raw_payload      TEXT    NOT NULL DEFAULT '',
    dedup_key        TEXT    NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_hook_events_session   ON hook_events(session_id);
CREATE INDEX IF NOT EXISTS idx_hook_events_agent     ON hook_events(agent);
CREATE INDEX IF NOT EXISTS idx_hook_events_action    ON hook_events(action);
CREATE INDEX IF NOT EXISTS idx_hook_events_created   ON hook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hook_events_hook_name ON hook_events(hook_event_name);

CREATE TABLE IF NOT EXISTS sessions (
    session_id      TEXT PRIMARY KEY,
    agent           TEXT NOT NULL,
    model           TEXT,
    source          TEXT,
    cwd             TEXT,
    transcript_path TEXT,
    started_at      TEXT NOT NULL,
    last_seen_at    TEXT NOT NULL
);
