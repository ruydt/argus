# Phase 5 — SQLite Repository Implementation

> **Status:** ⬜ Pending — update STATUS.md to ✅ when done

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

**Repo:** `/Users/duytran/GitHub/codex-test` | **Backend:** `backend/` | **Module:** `agent-monitor` | **Go:** 1.23

**Goal:** Implement `EventRepository` against SQLite using `modernc.org/sqlite` (pure Go driver, registered as `"sqlite"`). Schema is embedded from `migrations/001_init.sql` via `//go:embed`.

**Depends on:** Phase 1 (domain types), Phase 4 (interface + migrations + dep)

**Next phase:** [phase-06-service.md](phase-06-service.md)

---

## Files

| Action | Path |
|--------|------|
| Create | `backend/internal/repository/sqlite/sqlite.go` |
| Create | `backend/internal/repository/sqlite/sqlite_test.go` |

---

## Steps

- [ ] **Step 1: Write the failing tests**

```go
// backend/internal/repository/sqlite/sqlite_test.go
package sqlite_test

import (
	"testing"
	"time"

	"agent-monitor/internal/domain"
	"agent-monitor/internal/repository/sqlite"
)

func newTestDB(t *testing.T) *sqlite.DB {
	t.Helper()
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	return db
}

func TestAdd_and_List(t *testing.T) {
	db := newTestDB(t)

	e := domain.NormalizedEvent{
		Time:          time.Now().Format(time.RFC3339),
		Agent:         "claudecode",
		Session:       "sess1",
		HookEventName: "PreToolUse",
		TurnID:        "turn1",
		ToolUseID:     "tool1",
		Action:        "EDIT",
		Path:          "/tmp/foo.go",
		RawPayload:    []byte(`{}`),
	}

	if err := db.Add(e); err != nil {
		t.Fatalf("Add: %v", err)
	}

	events, err := db.List(10)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("got %d events, want 1", len(events))
	}
	if events[0].Path != "/tmp/foo.go" {
		t.Errorf("Path = %q, want /tmp/foo.go", events[0].Path)
	}
	if events[0].Agent != "claudecode" {
		t.Errorf("Agent = %q, want claudecode", events[0].Agent)
	}
}

func TestAdd_dedup(t *testing.T) {
	db := newTestDB(t)

	e := domain.NormalizedEvent{
		Time:          time.Now().Format(time.RFC3339),
		Agent:         "codex",
		Session:       "sess1",
		HookEventName: "PostToolUse",
		TurnID:        "turn1",
		ToolUseID:     "tool1",
		Action:        "EDIT",
		Path:          "/tmp/bar.go",
		RawPayload:    []byte(`{}`),
	}

	if err := db.Add(e); err != nil {
		t.Fatalf("first Add: %v", err)
	}
	// Duplicate insert must be silently ignored.
	if err := db.Add(e); err != nil {
		t.Fatalf("duplicate Add: %v", err)
	}

	events, _ := db.List(10)
	if len(events) != 1 {
		t.Errorf("got %d events after dedup, want 1", len(events))
	}
}

func TestUpsertSession_and_SessionModel(t *testing.T) {
	db := newTestDB(t)

	if err := db.UpsertSession("sess1", "claudecode", "claude-opus-4-7", "startup", "/cwd", "/transcript"); err != nil {
		t.Fatalf("UpsertSession: %v", err)
	}

	model, err := db.SessionModel("sess1")
	if err != nil {
		t.Fatalf("SessionModel: %v", err)
	}
	if model != "claude-opus-4-7" {
		t.Errorf("model = %q, want claude-opus-4-7", model)
	}
}

func TestSessionModel_missing(t *testing.T) {
	db := newTestDB(t)
	model, err := db.SessionModel("nonexistent")
	if err != nil {
		t.Fatalf("SessionModel: %v", err)
	}
	if model != "" {
		t.Errorf("model = %q, want empty", model)
	}
}

func TestList_respectsLimit(t *testing.T) {
	db := newTestDB(t)

	for i := range 5 {
		e := domain.NormalizedEvent{
			Time:          time.Now().Format(time.RFC3339),
			Agent:         "codex",
			Session:       "sess1",
			HookEventName: "PreToolUse",
			TurnID:        "t" + string(rune('0'+i)),
			ToolUseID:     "u" + string(rune('0'+i)),
			Action:        "EDIT",
			Path:          "/tmp/f.go",
			RawPayload:    []byte(`{}`),
		}
		db.Add(e)
	}

	events, _ := db.List(3)
	if len(events) != 3 {
		t.Errorf("got %d events, want 3", len(events))
	}
}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && go test ./internal/repository/sqlite/...
```

Expected: FAIL — `no Go files in .../sqlite`

- [ ] **Step 3: Create `backend/internal/repository/sqlite/sqlite.go`**

```go
package sqlite

import (
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/json"
	"fmt"
	"slices"
	"time"

	_ "modernc.org/sqlite"

	"agent-monitor/internal/domain"
)

//go:embed migrations/001_init.sql
var schema string

type DB struct {
	db *sql.DB
}

func New(path string) (*DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	if _, err := db.Exec(schema); err != nil {
		return nil, fmt.Errorf("run migrations: %w", err)
	}
	return &DB{db: db}, nil
}

func (d *DB) Add(e domain.NormalizedEvent) error {
	_, err := d.db.Exec(`
		INSERT OR IGNORE INTO hook_events (
			created_at, agent, session_id, hook_event_name, turn_id, tool_use_id,
			tool_name, model, source, cwd, transcript_path,
			action, path, command, old_string, new_string, start_line,
			ctx_before, ctx_after, raw_payload, dedup_key
		) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		e.Time, e.Agent, e.Session, e.HookEventName, e.TurnID, e.ToolUseID,
		e.Tool, e.Model, e.Source, e.CWD, e.TranscriptPath,
		nullStr(e.Action), nullStr(e.Path), nullStr(e.Command),
		nullStr(e.OldString), nullStr(e.NewString), nullInt(e.StartLine),
		jsonSlice(e.CtxBefore), jsonSlice(e.CtxAfter),
		string(e.RawPayload), dedupKey(e),
	)
	return err
}

func (d *DB) List(limit int) ([]domain.NormalizedEvent, error) {
	rows, err := d.db.Query(`
		SELECT created_at, agent, session_id, hook_event_name,
		       COALESCE(turn_id,''), COALESCE(tool_use_id,''),
		       COALESCE(tool_name,''), COALESCE(model,''), COALESCE(source,''),
		       COALESCE(cwd,''), COALESCE(transcript_path,''),
		       COALESCE(action,''), COALESCE(path,''), COALESCE(command,''),
		       COALESCE(old_string,''), COALESCE(new_string,''),
		       COALESCE(start_line,0), ctx_before, ctx_after
		FROM hook_events
		ORDER BY id DESC
		LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []domain.NormalizedEvent
	for rows.Next() {
		var e domain.NormalizedEvent
		var ctxBefore, ctxAfter string
		if err := rows.Scan(
			&e.Time, &e.Agent, &e.Session, &e.HookEventName,
			&e.TurnID, &e.ToolUseID, &e.Tool, &e.Model, &e.Source,
			&e.CWD, &e.TranscriptPath,
			&e.Action, &e.Path, &e.Command,
			&e.OldString, &e.NewString, &e.StartLine,
			&ctxBefore, &ctxAfter,
		); err != nil {
			return nil, err
		}
		json.Unmarshal([]byte(ctxBefore), &e.CtxBefore)
		json.Unmarshal([]byte(ctxAfter), &e.CtxAfter)
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	slices.Reverse(events)
	return events, nil
}

func (d *DB) SessionModel(sessionID string) (string, error) {
	var model string
	err := d.db.QueryRow(
		`SELECT COALESCE(model,'') FROM sessions WHERE session_id = ?`, sessionID,
	).Scan(&model)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return model, err
}

func (d *DB) UpsertSession(sessionID, agent, model, source, cwd, transcriptPath string) error {
	now := time.Now().Format(time.RFC3339)
	_, err := d.db.Exec(`
		INSERT INTO sessions (session_id, agent, model, source, cwd, transcript_path, started_at, last_seen_at)
		VALUES (?,?,?,?,?,?,?,?)
		ON CONFLICT(session_id) DO UPDATE SET
			model        = COALESCE(NULLIF(excluded.model,''), sessions.model),
			last_seen_at = excluded.last_seen_at`,
		sessionID, agent, model, source, cwd, transcriptPath, now, now,
	)
	return err
}

func dedupKey(e domain.NormalizedEvent) string {
	h := sha256.Sum256([]byte(
		e.Session + "|" + e.TurnID + "|" + e.ToolUseID + "|" + e.HookEventName + "|" + e.Time,
	))
	return fmt.Sprintf("%x", h)
}

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func nullInt(n int) any {
	if n == 0 {
		return nil
	}
	return n
}

func jsonSlice[T any](v []T) string {
	if v == nil {
		return "[]"
	}
	b, _ := json.Marshal(v)
	return string(b)
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && go test ./internal/repository/sqlite/...
```

Expected: `ok  agent-monitor/internal/repository/sqlite`

- [ ] **Step 5: Commit**

```bash
git add backend/internal/repository/sqlite/sqlite.go backend/internal/repository/sqlite/sqlite_test.go
git commit -m "feat(sqlite): implement EventRepository with WAL, dedup, UPSERT sessions"
```

- [ ] **Step 6: Mark complete — update STATUS.md phase 5 to ✅**
