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
