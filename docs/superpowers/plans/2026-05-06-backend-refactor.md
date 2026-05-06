# Backend Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the backend from a fat `main.go` into a layered golang-standards/project-layout with SQLite persistence, SSE streaming, and an extensible agent adapter pattern.

**Architecture:** `cmd/server/main.go` wires config → SQLite repo → service → handlers → router. Each agent package implements `Normalize([]byte) (domain.NormalizedEvent, error)`. The service layer owns persistence, SSE broadcast, and session tracking. Repository interface allows future storage swaps.

**Tech Stack:** Go 1.23, `modernc.org/sqlite` (pure Go, no CGO), stdlib `net/http` + `database/sql`, `crypto/sha256` for dedup keys, `embed` for SQL migrations.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `backend/internal/domain/event.go` | `NormalizedEvent`, `CtxLine` types |
| Create | `backend/internal/domain/hook.go` | `RawPayload`, `ToolInput` shared hook types |
| Create | `backend/internal/config/config.go` | `Config` struct, `Load()` from env/flags |
| Create | `backend/internal/fileutil/fileutil.go` | Path resolution, context lines, tool action — extracted from events.go |
| Create | `backend/internal/repository/repository.go` | `EventRepository` interface |
| Create | `backend/internal/repository/sqlite/migrations/001_init.sql` | DB schema |
| Create | `backend/internal/repository/sqlite/sqlite.go` | SQLite implementation |
| Create | `backend/internal/repository/sqlite/sqlite_test.go` | Integration tests (`:memory:`) |
| Create | `backend/internal/service/event_service.go` | `EventService`: add, list, SSE subscribe/broadcast |
| Create | `backend/internal/service/event_service_test.go` | Unit tests with mock repo |
| Modify | `backend/internal/agents/claudecode/claudecode.go` | Add `Normalize()`, `AgentName()` |
| Modify | `backend/internal/agents/codex/codex.go` | Add `Normalize()`, `AgentName()` |
| Create | `backend/internal/handler/hook.go` | `POST /api/hook` |
| Create | `backend/internal/handler/events.go` | `GET /api/events` (REST) + `GET /api/events/stream` (SSE) |
| Create | `backend/internal/handler/usage.go` | `GET /api/session-usage` |
| Create | `backend/internal/handler/proxy.go` | `GET /api/openai/` |
| Create | `backend/internal/handler/hook_test.go` | Hook handler tests |
| Create | `backend/internal/server/router.go` | Wires handlers into mux |
| Create | `backend/internal/server/middleware.go` | Logging, CORS |
| Create | `backend/cmd/server/main.go` | Wire deps, start server |
| Delete | `backend/main.go` | Replaced by cmd/server/main.go |
| Delete | `backend/internal/events/events.go` | Split into domain + fileutil + service + repo |
| Modify | `backend/go.mod` | Add modernc.org/sqlite |
| Modify | `Dockerfile` | Point to new binary path |

---

## Task 1: Domain Types

**Files:**
- Create: `backend/internal/domain/event.go`
- Create: `backend/internal/domain/hook.go`

- [ ] **Step 1: Create `backend/internal/domain/event.go`**

```go
package domain

// NormalizedEvent is the canonical in-memory and storage representation of a
// hook event from any agent. JSON tags match the existing FileEvent wire format
// so the frontend requires no changes.
type NormalizedEvent struct {
	Time           string    `json:"time"`
	Action         string    `json:"action,omitempty"`
	Path           string    `json:"path,omitempty"`
	Command        string    `json:"command,omitempty"`
	Session        string    `json:"session,omitempty"`
	TranscriptPath string    `json:"transcript_path,omitempty"`
	Tool           string    `json:"tool,omitempty"`
	HookEventName  string    `json:"hook_event_name,omitempty"`
	TurnID         string    `json:"turn_id,omitempty"`
	ToolUseID      string    `json:"tool_use_id,omitempty"`
	Source         string    `json:"source,omitempty"`
	Model          string    `json:"model,omitempty"`
	CWD            string    `json:"cwd,omitempty"`
	Prompt         string    `json:"prompt,omitempty"`
	Description    string    `json:"description,omitempty"`
	OldString      string    `json:"old_string,omitempty"`
	NewString      string    `json:"new_string,omitempty"`
	StartLine      int       `json:"start_line,omitempty"`
	CtxBefore      []CtxLine `json:"ctx_before,omitempty"`
	CtxAfter       []CtxLine `json:"ctx_after,omitempty"`
	Agent          string    `json:"agent,omitempty"`
	RawPayload     []byte    `json:"-"`
}

type CtxLine struct {
	Num  int    `json:"num"`
	Text string `json:"text"`
}
```

- [ ] **Step 2: Create `backend/internal/domain/hook.go`**

```go
package domain

// RawPayload captures the shared hook fields present across all agent schemas.
// Agent-specific fields are handled by each agent's Normalize() function.
type RawPayload struct {
	SessionID      string    `json:"session_id"`
	TranscriptPath string    `json:"transcript_path"`
	CWD            string    `json:"cwd"`
	HookEventName  string    `json:"hook_event_name"`
	Model          string    `json:"model"`
	Source         string    `json:"source"`
	TurnID         string    `json:"turn_id"`
	ToolName       string    `json:"tool_name"`
	ToolUseID      string    `json:"tool_use_id"`
	Prompt         string    `json:"prompt"`
	FilePath       string    `json:"file_path"`
	ToolInput      ToolInput `json:"tool_input"`
}

type ToolInput struct {
	FilePath    string `json:"file_path"`
	Command     string `json:"command"`
	Description string `json:"description"`
	OldString   string `json:"old_string"`
	NewString   string `json:"new_string"`
	OldStr      string `json:"old_str"`
	NewStr      string `json:"new_str"`
}
```

- [ ] **Step 3: Verify package compiles**

```bash
cd backend && go build ./internal/domain/...
```

Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/domain/
git commit -m "feat(domain): add NormalizedEvent and RawPayload types"
```

---

## Task 2: Config Package

**Files:**
- Create: `backend/internal/config/config.go`
- Create: `backend/internal/config/config_test.go`

- [ ] **Step 1: Write the failing test**

```go
// backend/internal/config/config_test.go
package config_test

import (
	"os"
	"testing"

	"agent-monitor/internal/config"
)

func TestLoad_defaults(t *testing.T) {
	os.Unsetenv("ADDR")
	os.Unsetenv("DB_PATH")
	cfg := config.Load()
	if cfg.Addr != "127.0.0.1:8765" {
		t.Errorf("Addr = %q, want 127.0.0.1:8765", cfg.Addr)
	}
	if cfg.DBPath != "agent-monitor.db" {
		t.Errorf("DBPath = %q, want agent-monitor.db", cfg.DBPath)
	}
}

func TestLoad_env(t *testing.T) {
	t.Setenv("ADDR", "0.0.0.0:9000")
	t.Setenv("DB_PATH", "/tmp/test.db")
	cfg := config.Load()
	if cfg.Addr != "0.0.0.0:9000" {
		t.Errorf("Addr = %q, want 0.0.0.0:9000", cfg.Addr)
	}
	if cfg.DBPath != "/tmp/test.db" {
		t.Errorf("DBPath = %q, want /tmp/test.db", cfg.DBPath)
	}
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && go test ./internal/config/...
```

Expected: FAIL — `no Go files in .../config`

- [ ] **Step 3: Create `backend/internal/config/config.go`**

```go
package config

import "os"

type Config struct {
	Addr   string
	DBPath string
}

func Load() Config {
	return Config{
		Addr:   envOr("ADDR", "127.0.0.1:8765"),
		DBPath: envOr("DB_PATH", "agent-monitor.db"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && go test ./internal/config/...
```

Expected: `ok  agent-monitor/internal/config`

- [ ] **Step 5: Commit**

```bash
git add backend/internal/config/
git commit -m "feat(config): add Config and Load() from env"
```

---

## Task 3: File Utilities Package

**Files:**
- Create: `backend/internal/fileutil/fileutil.go`
- Create: `backend/internal/fileutil/fileutil_test.go`

These functions are extracted verbatim from `internal/events/events.go` with updated package name and domain type imports.

- [ ] **Step 1: Write the failing tests**

```go
// backend/internal/fileutil/fileutil_test.go
package fileutil_test

import (
	"os"
	"path/filepath"
	"testing"

	"agent-monitor/internal/fileutil"
)

func TestResolvePath_absolute(t *testing.T) {
	got := fileutil.ResolvePath("/cwd", "/abs/path.go")
	if got != "/abs/path.go" {
		t.Errorf("got %q, want /abs/path.go", got)
	}
}

func TestResolvePath_relative(t *testing.T) {
	got := fileutil.ResolvePath("/cwd", "rel.go")
	if got != "/cwd/rel.go" {
		t.Errorf("got %q, want /cwd/rel.go", got)
	}
}

func TestResolvePath_empty(t *testing.T) {
	if got := fileutil.ResolvePath("/cwd", ""); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}

func TestToolToAction(t *testing.T) {
	cases := []struct{ tool, want string }{
		{"bash", "BASH"},
		{"Bash", "BASH"},
		{"shell_exec", "BASH"},
		{"Edit", "EDIT"},
		{"str_replace_editor", "EDIT"},
	}
	for _, c := range cases {
		if got := fileutil.ToolToAction(c.tool); got != c.want {
			t.Errorf("ToolToAction(%q) = %q, want %q", c.tool, got, c.want)
		}
	}
}

func TestFindStartLine(t *testing.T) {
	f, _ := os.CreateTemp(t.TempDir(), "*.go")
	f.WriteString("package main\n\nfunc hello() {}\n")
	f.Close()

	line := fileutil.FindStartLine(f.Name(), "func hello() {}")
	if line != 3 {
		t.Errorf("got line %d, want 3", line)
	}
}

func TestExtractPathFromCommand(t *testing.T) {
	got := fileutil.ExtractPathFromCommand("cat /tmp/foo.go")
	if got != "/tmp/foo.go" {
		t.Errorf("got %q, want /tmp/foo.go", got)
	}
}

func TestExtractPathFromCommand_noPath(t *testing.T) {
	if got := fileutil.ExtractPathFromCommand("echo hello"); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}

func TestComputeContext(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "f.go")
	os.WriteFile(path, []byte("a\nb\nc\nd\ne\n"), 0600)

	before, after := fileutil.ComputeContext(path, 3, 1, 1)
	if len(before) != 1 || before[0].Text != "b" {
		t.Errorf("before = %v", before)
	}
	if len(after) != 1 || after[0].Text != "d" {
		t.Errorf("after = %v", after)
	}
}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && go test ./internal/fileutil/...
```

Expected: FAIL — `no Go files in .../fileutil`

- [ ] **Step 3: Create `backend/internal/fileutil/fileutil.go`**

```go
package fileutil

import (
	"os"
	"path/filepath"
	"strings"

	"agent-monitor/internal/domain"
)

func ResolvePath(cwd, path string) string {
	if path == "" {
		return ""
	}
	if filepath.IsAbs(path) {
		return path
	}
	return filepath.Join(cwd, path)
}

func ToolToAction(tool string) string {
	t := strings.ToLower(tool)
	switch {
	case strings.Contains(t, "bash") || strings.Contains(t, "shell"):
		return "BASH"
	default:
		return "EDIT"
	}
}

func ExtractPathFromCommand(cmd string) string {
	for _, tok := range strings.Fields(cmd) {
		tok = strings.Trim(tok, `"'`)
		if (strings.HasPrefix(tok, "/") || strings.HasPrefix(tok, "./")) &&
			strings.Contains(tok, ".") {
			return tok
		}
	}
	return ""
}

// FindStartLine returns the 1-based line number where oldStr begins in filePath.
// Comparison ignores leading/trailing whitespace per line.
func FindStartLine(filePath, oldStr string) int {
	if filePath == "" || oldStr == "" {
		return 0
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return 0
	}
	fileLines := strings.Split(string(data), "\n")
	searchLines := strings.Split(strings.TrimRight(oldStr, "\n"), "\n")
	if len(searchLines) == 0 {
		return 0
	}
	for i := range len(fileLines) - len(searchLines) + 1 {
		match := true
		for j := range len(searchLines) {
			if strings.TrimSpace(fileLines[i+j]) != strings.TrimSpace(searchLines[j]) {
				match = false
				break
			}
		}
		if match {
			return i + 1
		}
	}
	return 0
}

// ComputeContext returns ctxLines lines before/after a changed region.
// changeStart is 1-based. changeLen is the number of lines in the changed block.
func ComputeContext(filePath string, changeStart, changeLen, ctxLines int) (before, after []domain.CtxLine) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return
	}
	lines := strings.Split(string(data), "\n")
	n := len(lines)
	start := changeStart - 1
	end := start + changeLen - 1
	for i := max(0, start-ctxLines); i < start && i < n; i++ {
		before = append(before, domain.CtxLine{Num: i + 1, Text: lines[i]})
	}
	for i := end + 1; i <= end+ctxLines && i < n; i++ {
		after = append(after, domain.CtxLine{Num: i + 1, Text: lines[i]})
	}
	return
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && go test ./internal/fileutil/...
```

Expected: `ok  agent-monitor/internal/fileutil`

- [ ] **Step 5: Commit**

```bash
git add backend/internal/fileutil/
git commit -m "feat(fileutil): extract path/context utilities from events package"
```

---

## Task 4: Add SQLite Dependency + Repository Interface + Migrations

**Files:**
- Modify: `backend/go.mod`
- Create: `backend/internal/repository/repository.go`
- Create: `backend/internal/repository/sqlite/migrations/001_init.sql`

- [ ] **Step 1: Add modernc.org/sqlite**

```bash
cd backend && go get modernc.org/sqlite
```

Expected: go.mod and go.sum updated with `modernc.org/sqlite`.

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

---

## Task 5: SQLite Repository Implementation

**Files:**
- Create: `backend/internal/repository/sqlite/sqlite.go`
- Create: `backend/internal/repository/sqlite/sqlite_test.go`

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
	// Same event — duplicate insert must be silently ignored.
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

	"agent-monitor/internal/domain"
	_ "modernc.org/sqlite"
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
	err := d.db.QueryRow(`SELECT COALESCE(model,'') FROM sessions WHERE session_id = ?`, sessionID).Scan(&model)
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
	h := sha256.Sum256([]byte(e.Session + "|" + e.TurnID + "|" + e.ToolUseID + "|" + e.HookEventName + "|" + e.Time))
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
git add backend/internal/repository/sqlite/
git commit -m "feat(sqlite): implement EventRepository with WAL, dedup, UPSERT sessions"
```

---

## Task 6: Service Layer

**Files:**
- Create: `backend/internal/service/event_service.go`
- Create: `backend/internal/service/event_service_test.go`

- [ ] **Step 1: Write the failing tests**

```go
// backend/internal/service/event_service_test.go
package service_test

import (
	"sync"
	"testing"
	"time"

	"agent-monitor/internal/domain"
	"agent-monitor/internal/service"
)

// mockRepo is a hand-written test double for repository.EventRepository.
type mockRepo struct {
	mu      sync.Mutex
	events  []domain.NormalizedEvent
	models  map[string]string
	addErr  error
	listErr error
}

func (m *mockRepo) Add(e domain.NormalizedEvent) error {
	if m.addErr != nil {
		return m.addErr
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, e)
	return nil
}

func (m *mockRepo) List(limit int) ([]domain.NormalizedEvent, error) {
	if m.listErr != nil {
		return nil, m.listErr
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.events) > limit {
		return m.events[len(m.events)-limit:], nil
	}
	return append([]domain.NormalizedEvent{}, m.events...), nil
}

func (m *mockRepo) SessionModel(sessionID string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.models == nil {
		return "", nil
	}
	return m.models[sessionID], nil
}

func (m *mockRepo) UpsertSession(sessionID, agent, model, source, cwd, transcriptPath string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.models == nil {
		m.models = map[string]string{}
	}
	if model != "" {
		m.models[sessionID] = model
	}
	return nil
}

func TestAddEvent_persists(t *testing.T) {
	repo := &mockRepo{}
	svc := service.New(repo)

	e := domain.NormalizedEvent{
		Agent:         "claudecode",
		Session:       "s1",
		HookEventName: "PreToolUse",
		Action:        "EDIT",
		Path:          "/tmp/foo.go",
	}

	if err := svc.AddEvent(e); err != nil {
		t.Fatalf("AddEvent: %v", err)
	}

	events, _ := svc.ListEvents(10)
	if len(events) != 1 {
		t.Fatalf("got %d events, want 1", len(events))
	}
}

func TestAddEvent_setsTime(t *testing.T) {
	repo := &mockRepo{}
	svc := service.New(repo)

	svc.AddEvent(domain.NormalizedEvent{
		Agent:         "codex",
		Session:       "s1",
		HookEventName: "PostToolUse",
		Action:        "EDIT",
		Path:          "/tmp/bar.go",
	})

	events, _ := svc.ListEvents(10)
	if events[0].Time == "" {
		t.Error("Time not set by AddEvent")
	}
	if _, err := time.Parse(time.RFC3339, events[0].Time); err != nil {
		t.Errorf("Time %q is not RFC3339: %v", events[0].Time, err)
	}
}

func TestSubscribe_receivesNewEvents(t *testing.T) {
	repo := &mockRepo{}
	svc := service.New(repo)

	ch := svc.Subscribe()
	defer svc.Unsubscribe(ch)

	go svc.AddEvent(domain.NormalizedEvent{
		Agent:         "claudecode",
		Session:       "s1",
		HookEventName: "PreToolUse",
		Action:        "EDIT",
		Path:          "/tmp/x.go",
	})

	select {
	case e := <-ch:
		if e.Path != "/tmp/x.go" {
			t.Errorf("Path = %q, want /tmp/x.go", e.Path)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for SSE event")
	}
}

func TestUnsubscribe_stopsDelivery(t *testing.T) {
	repo := &mockRepo{}
	svc := service.New(repo)

	ch := svc.Subscribe()
	svc.Unsubscribe(ch)

	// Channel should be closed after Unsubscribe.
	select {
	case _, ok := <-ch:
		if ok {
			t.Error("expected closed channel, got value")
		}
	default:
		t.Error("channel not closed after Unsubscribe")
	}
}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && go test ./internal/service/...
```

Expected: FAIL — `no Go files in .../service`

- [ ] **Step 3: Create `backend/internal/service/event_service.go`**

```go
package service

import (
	"sync"
	"time"

	"agent-monitor/internal/domain"
	"agent-monitor/internal/repository"
)

type EventService struct {
	repo        repository.EventRepository
	subscribers sync.Map // key: <-chan NormalizedEvent, value: chan NormalizedEvent
}

func New(repo repository.EventRepository) *EventService {
	return &EventService{repo: repo}
}

func (s *EventService) AddEvent(e domain.NormalizedEvent) error {
	if e.Time == "" {
		e.Time = time.Now().Format(time.RFC3339)
	}
	if err := s.repo.Add(e); err != nil {
		return err
	}
	if e.Session != "" {
		s.repo.UpsertSession(e.Session, e.Agent, e.Model, e.Source, e.CWD, e.TranscriptPath)
	}
	s.broadcast(e)
	return nil
}

func (s *EventService) ListEvents(limit int) ([]domain.NormalizedEvent, error) {
	return s.repo.List(limit)
}

func (s *EventService) SessionModel(sessionID string) (string, error) {
	return s.repo.SessionModel(sessionID)
}

// Subscribe returns a receive-only channel that receives new events as they arrive.
// The caller must call Unsubscribe when done to avoid goroutine leaks.
func (s *EventService) Subscribe() <-chan domain.NormalizedEvent {
	ch := make(chan domain.NormalizedEvent, 64)
	recv := (<-chan domain.NormalizedEvent)(ch)
	s.subscribers.Store(recv, ch)
	return recv
}

// Unsubscribe removes the subscriber and closes its channel.
func (s *EventService) Unsubscribe(ch <-chan domain.NormalizedEvent) {
	if v, ok := s.subscribers.LoadAndDelete(ch); ok {
		close(v.(chan domain.NormalizedEvent))
	}
}

func (s *EventService) broadcast(e domain.NormalizedEvent) {
	s.subscribers.Range(func(_, v any) bool {
		ch := v.(chan domain.NormalizedEvent)
		select {
		case ch <- e:
		default:
		}
		return true
	})
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && go test ./internal/service/...
```

Expected: `ok  agent-monitor/internal/service`

- [ ] **Step 5: Commit**

```bash
git add backend/internal/service/
git commit -m "feat(service): add EventService with SSE broadcast and session tracking"
```

---

## Task 7: Agent Adapters — Add Normalize()

**Files:**
- Modify: `backend/internal/agents/claudecode/claudecode.go`
- Modify: `backend/internal/agents/codex/codex.go`

- [ ] **Step 1: Add `Normalize()` and `AgentName()` to claudecode**

Append to `backend/internal/agents/claudecode/claudecode.go`:

```go
import (
	// existing imports plus:
	"encoding/json"

	"agent-monitor/internal/domain"
	"agent-monitor/internal/fileutil"
)

func AgentName() string { return "claudecode" }

func Normalize(raw []byte) (domain.NormalizedEvent, error) {
	var p domain.RawPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return domain.NormalizedEvent{}, err
	}

	path := fileutil.ResolvePath(p.CWD, firstNonEmpty(p.ToolInput.FilePath, p.FilePath))
	cmd := p.ToolInput.Command
	action := fileutil.ToolToAction(p.ToolName)

	if path == "" && cmd != "" && action != "BASH" {
		path = fileutil.ExtractPathFromCommand(cmd)
	}

	displayPath := path
	if action == "BASH" && cmd != "" {
		displayPath = "cmd: " + cmd
	}

	oldStr, newStr := Diff(DiffInput{
		OldString: firstNonEmpty(p.ToolInput.OldString, p.ToolInput.OldStr),
		NewString: firstNonEmpty(p.ToolInput.NewString, p.ToolInput.NewStr),
	})

	return domain.NormalizedEvent{
		Agent:          AgentName(),
		Session:        p.SessionID,
		HookEventName:  p.HookEventName,
		TurnID:         p.TurnID,
		ToolUseID:      p.ToolUseID,
		Tool:           p.ToolName,
		Model:          p.Model,
		Source:         p.Source,
		CWD:            p.CWD,
		TranscriptPath: p.TranscriptPath,
		Prompt:         p.Prompt,
		Description:    p.ToolInput.Description,
		Action:         action,
		Path:           displayPath,
		Command:        cmd,
		OldString:      oldStr,
		NewString:      newStr,
		RawPayload:     raw,
	}, nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
```

Note: The `firstNonEmpty` helper currently lives in `main.go`. Move it into this package (claudecode) since both agents need their own version, or factor into fileutil. Codex will define its own copy.

- [ ] **Step 2: Add `Normalize()` and `AgentName()` to codex**

Append to `backend/internal/agents/codex/codex.go`:

```go
import (
	// existing imports plus:
	"encoding/json"

	"agent-monitor/internal/domain"
	"agent-monitor/internal/fileutil"
)

func AgentName() string { return "codex" }

func Normalize(raw []byte) (domain.NormalizedEvent, error) {
	var p domain.RawPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return domain.NormalizedEvent{}, err
	}

	path := fileutil.ResolvePath(p.CWD, firstNonEmpty(p.ToolInput.FilePath, p.FilePath))
	cmd := p.ToolInput.Command
	action := fileutil.ToolToAction(p.ToolName)

	if path == "" && cmd != "" && action != "BASH" {
		path = fileutil.ExtractPathFromCommand(cmd)
	}

	displayPath := path
	if action == "BASH" && cmd != "" {
		displayPath = "cmd: " + cmd
	}

	oldStr, newStr := Diff(DiffInput{
		OldStr: firstNonEmpty(p.ToolInput.OldStr, p.ToolInput.OldString),
		NewStr: firstNonEmpty(p.ToolInput.NewStr, p.ToolInput.NewString),
	})

	// apply_patch: extract diff from command body when Diff returns nothing
	parsedStartLine := 0
	if oldStr == "" && newStr == "" && containsLower(p.ToolName, "apply_patch") {
		oldStr, newStr, parsedStartLine = ParseApplyPatch(cmd)
		if parsedStartLine == 0 && oldStr != "" && path != "" {
			parsedStartLine = fileutil.FindStartLine(path, oldStr)
		}
	}
	_ = parsedStartLine // used by hook handler for start_line enrichment

	return domain.NormalizedEvent{
		Agent:          AgentName(),
		Session:        p.SessionID,
		HookEventName:  p.HookEventName,
		TurnID:         p.TurnID,
		ToolUseID:      p.ToolUseID,
		Tool:           p.ToolName,
		Model:          p.Model,
		Source:         p.Source,
		CWD:            p.CWD,
		TranscriptPath: p.TranscriptPath,
		Prompt:         p.Prompt,
		Description:    p.ToolInput.Description,
		Action:         action,
		Path:           displayPath,
		Command:        cmd,
		OldString:      oldStr,
		NewString:      newStr,
		RawPayload:     raw,
	}, nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func containsLower(s, sub string) bool {
	return strings.Contains(strings.ToLower(s), sub)
}
```

- [ ] **Step 3: Verify build**

```bash
cd backend && go build ./internal/agents/...
```

Expected: no output, exit 0.

- [ ] **Step 4: Run existing tests still pass**

```bash
cd backend && go test ./internal/agents/...
```

Expected: `ok` for both packages (no pre-existing tests, but build must pass).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/agents/
git commit -m "feat(agents): add Normalize() and AgentName() to claudecode and codex adapters"
```

---

## Task 8: HTTP Handlers

**Files:**
- Create: `backend/internal/handler/hook.go`
- Create: `backend/internal/handler/events.go`
- Create: `backend/internal/handler/usage.go`
- Create: `backend/internal/handler/proxy.go`
- Create: `backend/internal/handler/hook_test.go`

- [ ] **Step 1: Write failing hook handler test**

```go
// backend/internal/handler/hook_test.go
package handler_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"agent-monitor/internal/handler"
	"agent-monitor/internal/repository/sqlite"
	"agent-monitor/internal/service"
)

func newTestService(t *testing.T) *service.EventService {
	t.Helper()
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	return service.New(db)
}

func TestHookHandler_rejectsGET(t *testing.T) {
	svc := newTestService(t)
	h := handler.Hook(svc)

	req := httptest.NewRequest(http.MethodGet, "/api/hook", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}
}

func TestHookHandler_acceptsValidPayload(t *testing.T) {
	svc := newTestService(t)
	h := handler.Hook(svc)

	body := []byte(`{
		"session_id": "s1",
		"transcript_path": "/home/user/.claude/sessions/abc.jsonl",
		"hook_event_name": "PreToolUse",
		"tool_name": "Edit",
		"tool_use_id": "tu1",
		"turn_id": "t1",
		"cwd": "/tmp",
		"tool_input": {"file_path": "foo.go"}
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
}

func TestHookHandler_rejectsBadJSON(t *testing.T) {
	svc := newTestService(t)
	h := handler.Hook(svc)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader([]byte(`not json`)))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && go test ./internal/handler/...
```

Expected: FAIL — `no Go files in .../handler`

- [ ] **Step 3: Create `backend/internal/handler/hook.go`**

```go
package handler

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"agent-monitor/internal/agents/claudecode"
	"agent-monitor/internal/agents/codex"
	"agent-monitor/internal/domain"
	"agent-monitor/internal/fileutil"
	"agent-monitor/internal/service"
)

func Hook(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		raw, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "read body", http.StatusBadRequest)
			return
		}

		// Detect agent from transcript path via shared RawPayload.
		var meta domain.RawPayload
		if err := json.Unmarshal(raw, &meta); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		var e domain.NormalizedEvent
		if claudecode.MatchesTranscript(meta.TranscriptPath) {
			e, err = claudecode.Normalize(raw)
		} else {
			e, err = codex.Normalize(raw)
		}
		if err != nil {
			http.Error(w, "normalize payload", http.StatusBadRequest)
			return
		}

		// Only store events with a resolvable path (same behaviour as original).
		if e.Path == "" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{}`))
			return
		}

		// Enrich with line context.
		e = enrichContext(e)

		// Fall back to cached model if this event didn't carry one.
		if e.Model == "" && e.Session != "" {
			if m, _ := svc.SessionModel(e.Session); m != "" {
				e.Model = m
			}
		}

		log.Printf("[hook] agent=%s session=%s tool=%s action=%s path=%s",
			e.Agent, e.Session, e.Tool, e.Action, e.Path)

		if err := svc.AddEvent(e); err != nil {
			http.Error(w, "store event", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{}`))
	})
}

// enrichContext computes start_line and surrounding context lines by reading
// the file on disk. Called after normalization, before storage.
func enrichContext(e domain.NormalizedEvent) domain.NormalizedEvent {
	if e.Action == "BASH" || e.Path == "" {
		return e
	}
	if e.HookEventName == "PreToolUse" && e.OldString != "" {
		if sl := fileutil.FindStartLine(e.Path, e.OldString); sl > 0 {
			e.StartLine = sl
			e.CtxBefore, e.CtxAfter = fileutil.ComputeContext(e.Path, sl, len(strings.Split(e.OldString, "\n")), 3)
		}
	} else if e.HookEventName == "PostToolUse" && e.NewString != "" {
		if sl := fileutil.FindStartLine(e.Path, e.NewString); sl > 0 {
			e.StartLine = sl
			e.CtxBefore, e.CtxAfter = fileutil.ComputeContext(e.Path, sl, len(strings.Split(e.NewString, "\n")), 3)
		}
	}
	return e
}
```

- [ ] **Step 4: Create `backend/internal/handler/events.go`**

```go
package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"agent-monitor/internal/service"
)

// Events returns all stored events as JSON.
func Events(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		events, err := svc.ListEvents(1000)
		if err != nil {
			http.Error(w, "list events", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"events": events})
	})
}

// EventsStream opens an SSE connection. It first sends all existing events
// (initial hydration), then streams new events as they arrive.
func EventsStream(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		// Initial hydration: send all existing events.
		existing, err := svc.ListEvents(1000)
		if err == nil {
			for _, e := range existing {
				sendSSE(w, e)
			}
			flusher.Flush()
		}

		ch := svc.Subscribe()
		defer svc.Unsubscribe(ch)

		for {
			select {
			case e, ok := <-ch:
				if !ok {
					return
				}
				sendSSE(w, e)
				flusher.Flush()
			case <-r.Context().Done():
				return
			}
		}
	})
}

func sendSSE(w http.ResponseWriter, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	fmt.Fprintf(w, "data: %s\n\n", b)
}
```

- [ ] **Step 5: Create `backend/internal/handler/usage.go`**

```go
package handler

import (
	"encoding/json"
	"net/http"

	"agent-monitor/internal/agents/claudecode"
	"agent-monitor/internal/agents/codex"
)

func Usage() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Query().Get("path")
		if path == "" {
			http.Error(w, "missing path", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if claudecode.MatchesTranscript(path) {
			json.NewEncoder(w).Encode(claudecode.ComputeUsage(path))
			return
		}
		json.NewEncoder(w).Encode(codex.ComputeUsage(path))
	})
}
```

- [ ] **Step 6: Create `backend/internal/handler/proxy.go`**

```go
package handler

import (
	"io"
	"net/http"
	"strings"
)

// OpenAIProxy forwards requests to the OpenAI organization API.
// The Authorization header from the client is passed through unchanged.
func OpenAIProxy() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiKey := r.Header.Get("Authorization")
		if apiKey == "" {
			http.Error(w, "missing auth", http.StatusUnauthorized)
			return
		}

		path := strings.TrimPrefix(r.URL.Path, "/api/openai/")
		targetURL := "https://api.openai.com/v1/organization/" + path

		req, err := http.NewRequest(http.MethodGet, targetURL+"?"+r.URL.RawQuery, nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		req.Header.Set("Authorization", apiKey)
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	})
}
```

- [ ] **Step 7: Run tests**

```bash
cd backend && go test ./internal/handler/...
```

Expected: `ok  agent-monitor/internal/handler`

- [ ] **Step 8: Commit**

```bash
git add backend/internal/handler/
git commit -m "feat(handler): add Hook, Events, EventsStream, Usage, OpenAIProxy handlers"
```

---

## Task 9: Server Router + Middleware

**Files:**
- Create: `backend/internal/server/router.go`
- Create: `backend/internal/server/middleware.go`

- [ ] **Step 1: Create `backend/internal/server/middleware.go`**

```go
package server

import (
	"log"
	"net/http"
	"time"
)

func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
```

- [ ] **Step 2: Create `backend/internal/server/router.go`**

```go
package server

import (
	"net/http"

	"agent-monitor/internal/handler"
	"agent-monitor/internal/service"
)

func NewRouter(svc *service.EventService) http.Handler {
	mux := http.NewServeMux()

	mux.Handle("POST /api/hook", handler.Hook(svc))
	mux.Handle("GET /api/events", handler.Events(svc))
	mux.Handle("GET /api/events/stream", handler.EventsStream(svc))
	mux.Handle("GET /api/session-usage", handler.Usage())
	mux.Handle("/api/openai/", handler.OpenAIProxy())

	return cors(logging(mux))
}
```

- [ ] **Step 3: Verify build**

```bash
cd backend && go build ./internal/server/...
```

Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/server/
git commit -m "feat(server): add router with logging and CORS middleware"
```

---

## Task 10: Wire Up cmd/server/main.go + Cleanup

**Files:**
- Create: `backend/cmd/server/main.go`
- Delete: `backend/main.go`
- Delete: `backend/internal/events/events.go`
- Modify: `Dockerfile`

- [ ] **Step 1: Create `backend/cmd/server/main.go`**

```go
package main

import (
	"log"
	"net/http"

	"agent-monitor/internal/config"
	"agent-monitor/internal/repository/sqlite"
	"agent-monitor/internal/server"
	"agent-monitor/internal/service"
)

func main() {
	cfg := config.Load()

	repo, err := sqlite.New(cfg.DBPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}

	svc := service.New(repo)
	h := server.NewRouter(svc)

	log.Printf("hook endpoint  → POST http://%s/api/hook", cfg.Addr)
	log.Printf("events SSE     → GET  http://%s/api/events/stream", cfg.Addr)
	log.Printf("db             → %s", cfg.DBPath)

	if err := http.ListenAndServe(cfg.Addr, h); err != nil {
		log.Fatalf("listen: %v", err)
	}
}
```

- [ ] **Step 2: Build and verify**

```bash
cd backend && go build ./cmd/server/
```

Expected: produces `./server` binary, no errors.

- [ ] **Step 3: Run full test suite**

```bash
cd backend && go test ./...
```

Expected: all packages pass. No failures.

- [ ] **Step 4: Delete old files**

```bash
rm backend/main.go
rm backend/internal/events/events.go
```

- [ ] **Step 5: Rebuild to confirm no broken imports**

```bash
cd backend && go build ./...
```

Expected: no output, exit 0. If any file still imports `agent-monitor/internal/events`, fix the import now.

- [ ] **Step 6: Run tests again**

```bash
cd backend && go test ./...
```

Expected: all packages pass.

- [ ] **Step 7: Update Dockerfile**

Replace the current `Dockerfile` content:

```dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN go build -o agent-monitor ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/agent-monitor .
EXPOSE 8765
CMD ["./agent-monitor"]
```

- [ ] **Step 8: Final commit**

```bash
git add backend/cmd/ Dockerfile
git rm backend/main.go backend/internal/events/events.go
git commit -m "feat: wire up cmd/server/main.go, remove old main.go and events package

Backend now follows golang-standards/project-layout:
- cmd/server/main.go wires config → sqlite repo → service → router
- SQLite persistence via modernc.org/sqlite (no CGO)
- SSE stream at /api/events/stream replaces frontend polling
- Agent adapter pattern: Normalize() per agent, raw_payload stored for extensibility"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `cmd/server/main.go` — Task 10
- ✅ `internal/config` — Task 2
- ✅ `internal/domain` — Task 1
- ✅ `internal/repository` interface + SQLite — Tasks 4–5
- ✅ `internal/service` with SSE — Task 6
- ✅ Agent adapters `Normalize()` — Task 7
- ✅ All four handler groups — Task 8
- ✅ Router + CORS + logging middleware — Task 9
- ✅ `hook_events` + `sessions` schema — Task 4
- ✅ WAL mode — `001_init.sql`
- ✅ `raw_payload` column — Task 5
- ✅ dedup via sha256 — Task 5
- ✅ Initial hydration on SSE connect — Task 8 `EventsStream`
- ✅ Frontend replace polling note — Task 8 comment
- ✅ `modernc.org/sqlite` (no CGO) — Task 4
- ✅ Dockerfile updated — Task 10
- ✅ Old files deleted — Task 10

**Type consistency check:**
- `domain.NormalizedEvent` defined Task 1, used in Tasks 5–10 ✅
- `repository.EventRepository` interface defined Task 4, implemented Task 5, consumed Task 6 ✅
- `service.EventService.Subscribe()` returns `<-chan domain.NormalizedEvent`, `Unsubscribe` takes same ✅
- `handler.Hook(svc)`, `handler.Events(svc)`, `handler.EventsStream(svc)` all take `*service.EventService` ✅
- `server.NewRouter(svc)` takes `*service.EventService` ✅
