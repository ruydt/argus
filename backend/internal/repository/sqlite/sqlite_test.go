package sqlite_test

import (
	"testing"
	"time"

	"hooker/internal/domain"
	"hooker/internal/repository/sqlite"
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
		Trigger:       "manual",
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
	if events[0].Trigger != "manual" {
		t.Errorf("Trigger = %q, want manual", events[0].Trigger)
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

func TestAdd_emptyModelStaysEmpty(t *testing.T) {
	db := newTestDB(t)

	e := domain.NormalizedEvent{
		Time:          time.Now().Format(time.RFC3339),
		Agent:         "codex",
		Session:       "sess1",
		HookEventName: "PreToolUse",
		TurnID:        "turn1",
		ToolUseID:     "tool1",
		Action:        "BASH",
		Path:          "cmd: true",
		RawPayload:    []byte(`{}`),
	}

	if err := db.Add(e); err != nil {
		t.Fatalf("Add: %v", err)
	}

	events, err := db.List(10)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if events[0].Model != "" {
		t.Errorf("model = %q, want empty", events[0].Model)
	}
}

func TestUpsertSession_and_SessionModel(t *testing.T) {
	db := newTestDB(t)

	if err := db.UpsertSession("sess1", "claudecode", "claude-opus-4-7", "startup", "/cwd", "/transcript", domain.SessionUsage{}); err != nil {
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

func TestUpsertSession_emptyModelStaysEmpty(t *testing.T) {
	db := newTestDB(t)

	if err := db.UpsertSession("sess1", "codex", "", "startup", "/cwd", "/transcript", domain.SessionUsage{}); err != nil {
		t.Fatalf("UpsertSession: %v", err)
	}

	model, err := db.SessionModel("sess1")
	if err != nil {
		t.Fatalf("SessionModel: %v", err)
	}
	if model != "" {
		t.Errorf("model = %q, want empty", model)
	}
}

func TestUpsertSession_emptyModelDoesNotOverwriteRealModel(t *testing.T) {
	db := newTestDB(t)

	if err := db.UpsertSession("sess1", "codex", "gpt-5.4", "startup", "/cwd", "/transcript", domain.SessionUsage{}); err != nil {
		t.Fatalf("first UpsertSession: %v", err)
	}
	if err := db.UpsertSession("sess1", "codex", "", "hook", "/cwd", "/transcript", domain.SessionUsage{}); err != nil {
		t.Fatalf("second UpsertSession: %v", err)
	}

	model, err := db.SessionModel("sess1")
	if err != nil {
		t.Fatalf("SessionModel: %v", err)
	}
	if model != "gpt-5.4" {
		t.Errorf("model = %q, want gpt-5.4", model)
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
		_ = db.Add(e)
	}

	events, _ := db.List(3)
	if len(events) != 3 {
		t.Errorf("got %d events, want 3", len(events))
	}
}

func TestGetDashboardStats_filtersEventsAcrossTimezoneOffsets(t *testing.T) {
	db := newTestDB(t)

	usage := domain.SessionUsage{
		InputTokens:         10,
		OutputTokens:        2,
		CacheCreationTokens: 0,
		CacheReadTokens:     0,
		Turns:               1,
	}
	if err := db.UpsertSession("sess1", "codex", "gpt-5.4", "startup", "/cwd", "/transcript", usage); err != nil {
		t.Fatalf("UpsertSession: %v", err)
	}

	e := domain.NormalizedEvent{
		Time:          "2026-05-09T23:50:00+07:00",
		Agent:         "codex",
		Session:       "sess1",
		HookEventName: "PostToolUse",
		TurnID:        "turn1",
		ToolUseID:     "tool1",
		Action:        "BASH",
		RawPayload:    []byte(`{}`),
	}
	if err := db.Add(e); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if err := db.Add(domain.NormalizedEvent{
		Time:          "2026-05-09T23:51:00+07:00",
		Agent:         "claudecode",
		Session:       "sess2",
		HookEventName: "PreToolUse",
		TurnID:        "turn2",
		ToolUseID:     "tool2",
		Action:        "EDIT",
		RawPayload:    []byte(`{}`),
	}); err != nil {
		t.Fatalf("Add second event: %v", err)
	}

	stats, err := db.GetDashboardStats("2026-04-25T17:00:00.000Z", "2026-05-09T16:59:59.999Z")
	if err != nil {
		t.Fatalf("GetDashboardStats: %v", err)
	}
	if stats.TotalEvents != 2 {
		t.Fatalf("TotalEvents = %d, want 2", stats.TotalEvents)
	}
	if len(stats.TimelineByAgent) != 2 {
		t.Fatalf("len(TimelineByAgent) = %d, want 2", len(stats.TimelineByAgent))
	}

	agentCounts := map[string]int{}
	for _, row := range stats.TimelineByAgent {
		agentCounts[row.Agent] += row.Count
	}
	if agentCounts["codex"] != 1 {
		t.Fatalf("codex count = %d, want 1", agentCounts["codex"])
	}
	if agentCounts["claudecode"] != 1 {
		t.Fatalf("claudecode count = %d, want 1", agentCounts["claudecode"])
	}
}

func addEvent(t *testing.T, db *sqlite.DB, e domain.NormalizedEvent) {
	t.Helper()
	e.RawPayload = []byte(`{}`)
	if err := db.Add(e); err != nil {
		t.Fatalf("Add: %v", err)
	}
}

func addSession(t *testing.T, db *sqlite.DB, sessionID, agent string) {
	t.Helper()
	if err := db.UpsertSession(sessionID, agent, "", "", "/tmp", "", domain.SessionUsage{}); err != nil {
		t.Fatalf("UpsertSession: %v", err)
	}
}

func TestGetSessionTree_noSubagents(t *testing.T) {
	db := newTestDB(t)
	addSession(t, db, "root1", "claudecode")

	since := time.Now().Add(-time.Hour).Format(time.RFC3339)
	tree, err := db.GetSessionTree(since)
	if err != nil {
		t.Fatalf("GetSessionTree: %v", err)
	}
	if len(tree) != 1 {
		t.Fatalf("got %d roots, want 1", len(tree))
	}
	if tree[0].Session.SessionID != "root1" {
		t.Errorf("root session = %q, want root1", tree[0].Session.SessionID)
	}
	if len(tree[0].Children) != 0 {
		t.Errorf("children = %d, want 0", len(tree[0].Children))
	}
}

func TestGetSessionTree_withSubagents(t *testing.T) {
	db := newTestDB(t)
	addSession(t, db, "parent", "claudecode")
	addSession(t, db, "child1", "claudecode")
	addSession(t, db, "child2", "claudecode")

	addEvent(t, db, domain.NormalizedEvent{
		Time: time.Now().Format(time.RFC3339), Agent: "claudecode",
		Session: "parent", HookEventName: "SubagentStart",
		TurnID: "t1", ToolUseID: "u1", SubagentID: "agent-aaa",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time: time.Now().Format(time.RFC3339), Agent: "claudecode",
		Session: "parent", HookEventName: "SubagentStart",
		TurnID: "t2", ToolUseID: "u2", SubagentID: "agent-bbb",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time: time.Now().Format(time.RFC3339), Agent: "claudecode",
		Session: "child1", HookEventName: "PreToolUse",
		TurnID: "t3", ToolUseID: "u3", SubagentID: "agent-aaa",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time: time.Now().Format(time.RFC3339), Agent: "claudecode",
		Session: "child2", HookEventName: "PreToolUse",
		TurnID: "t4", ToolUseID: "u4", SubagentID: "agent-bbb",
	})

	since := time.Now().Add(-time.Hour).Format(time.RFC3339)
	tree, err := db.GetSessionTree(since)
	if err != nil {
		t.Fatalf("GetSessionTree: %v", err)
	}
	if len(tree) != 1 {
		t.Fatalf("got %d roots, want 1", len(tree))
	}
	if len(tree[0].Children) != 2 {
		t.Errorf("children = %d, want 2", len(tree[0].Children))
	}
}

func TestGetSessionTree_sinceFilter(t *testing.T) {
	db := newTestDB(t)
	addSession(t, db, "old-session", "claudecode")

	since := time.Now().Add(time.Hour).Format(time.RFC3339)
	tree, err := db.GetSessionTree(since)
	if err != nil {
		t.Fatalf("GetSessionTree: %v", err)
	}
	if len(tree) != 0 {
		t.Errorf("got %d roots, want 0", len(tree))
	}
}

func TestGetSessionTree_nested(t *testing.T) {
	db := newTestDB(t)
	addSession(t, db, "root", "claudecode")
	addSession(t, db, "child", "claudecode")
	addSession(t, db, "grandchild", "claudecode")

	addEvent(t, db, domain.NormalizedEvent{
		Time: time.Now().Format(time.RFC3339), Agent: "claudecode",
		Session: "root", HookEventName: "SubagentStart",
		TurnID: "t1", ToolUseID: "u1", SubagentID: "agent-child",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time: time.Now().Format(time.RFC3339), Agent: "claudecode",
		Session: "child", HookEventName: "SubagentStart",
		TurnID: "t2", ToolUseID: "u2", SubagentID: "agent-gc",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time: time.Now().Format(time.RFC3339), Agent: "claudecode",
		Session: "child", HookEventName: "PreToolUse",
		TurnID: "t3", ToolUseID: "u3", SubagentID: "agent-child",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time: time.Now().Format(time.RFC3339), Agent: "claudecode",
		Session: "grandchild", HookEventName: "PreToolUse",
		TurnID: "t4", ToolUseID: "u4", SubagentID: "agent-gc",
	})

	since := time.Now().Add(-time.Hour).Format(time.RFC3339)
	tree, err := db.GetSessionTree(since)
	if err != nil {
		t.Fatalf("GetSessionTree: %v", err)
	}
	if len(tree) != 1 {
		t.Fatalf("roots = %d, want 1", len(tree))
	}
	if len(tree[0].Children) != 1 {
		t.Fatalf("children = %d, want 1", len(tree[0].Children))
	}
	if len(tree[0].Children[0].Children) != 1 {
		t.Fatalf("grandchildren = %d, want 1", len(tree[0].Children[0].Children))
	}
}
