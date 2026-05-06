# Phase 4 — Repository Interface + SQLite Dependency + Migrations

> **Status:** ⬜ Pending — update STATUS.md to ✅ when done

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

**Repo:** `/Users/duytran/GitHub/codex-test` | **Backend:** `backend/` | **Module:** `agent-monitor` | **Go:** 1.23

**Goal:** Define the `EventRepository` interface, add `modernc.org/sqlite` dependency, and write the DB schema migration SQL.

**Depends on:** Phase 1 (domain types)

**Next phase:** [phase-05-sqlite-impl.md](phase-05-sqlite-impl.md)

---

## Files

| Action | Path |
|--------|------|
| Modify | `backend/go.mod` (via go get) |
| Create | `backend/internal/repository/repository.go` |
| Create | `backend/internal/repository/sqlite/migrations/001_init.sql` |

---

## Steps

- [ ] **Step 1: Add modernc.org/sqlite dependency**

```bash
cd backend && go get modernc.org/sqlite
```

Expected: `go.mod` and `go.sum` updated. No errors.

- [ ] **Step 2: Create `backend/internal/repository/repository.go`**

```go
package repository

import "agent-monitor/internal/domain"

// EventRepository is the storage interface. The SQLite implementation lives in
// ./sqlite. Tests use a hand-written mock of this interface.
type EventRepository interface {
	Add(e domain.NormalizedEvent) error
	List(limit int) ([]domain.NormalizedEvent, error)
	SessionModel(sessionID string) (string, error)
	UpsertSession(sessionID, agent, model, source, cwd, transcriptPath string) error
}
```

- [ ] **Step 3: Create `backend/internal/repository/sqlite/migrations/001_init.sql`**

```sql
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
```

- [ ] **Step 4: Verify build**

```bash
cd backend && go build ./internal/repository/...
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/go.mod backend/go.sum backend/internal/repository/
git commit -m "feat(repository): add EventRepository interface, SQLite migrations, modernc.org/sqlite dep"
```

- [ ] **Step 6: Mark complete — update STATUS.md phase 4 to ✅**
