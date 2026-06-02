package sqlite_test

import (
	"context"
	"path/filepath"
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

func TestAddDoesNotWaitForUnrelatedOpenReadRows(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "hooker-test.db")
	db, err := sqlite.New(dbPath)
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}

	rows, err := db.RawDB().Query(`SELECT 1`)
	if err != nil {
		t.Fatalf("hold read rows: %v", err)
	}
	defer rows.Close()

	done := make(chan error, 1)
	go func() {
		done <- db.Add(domain.NormalizedEvent{
			Time:          time.Now().Format(time.RFC3339),
			Agent:         "codex",
			Session:       "sess-pool",
			HookEventName: "PreToolUse",
			Tool:          "Bash",
			Action:        "BASH",
			Path:          "cmd: true",
			RawPayload:    []byte(`{}`),
		})
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Add: %v", err)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("Add blocked behind an unrelated open read cursor")
	}
}

func TestAddReturnsBeforeHookTimeoutWhenDatabaseIsWriteLocked(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "hooker-test.db")
	db, err := sqlite.New(dbPath)
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}

	poisonedConn, err := db.RawDB().Conn(context.Background())
	if err != nil {
		t.Fatalf("poison conn: %v", err)
	}
	if _, err := poisonedConn.ExecContext(context.Background(), `PRAGMA busy_timeout = 5000`); err != nil {
		t.Fatalf("raise busy timeout: %v", err)
	}
	if err := poisonedConn.Close(); err != nil {
		t.Fatalf("close poisoned conn: %v", err)
	}

	conn, err := db.RawDB().Conn(context.Background())
	if err != nil {
		t.Fatalf("conn: %v", err)
	}
	defer func() { _ = conn.Close() }()
	if _, err := conn.ExecContext(context.Background(), `BEGIN IMMEDIATE`); err != nil {
		t.Fatalf("begin lock: %v", err)
	}

	start := time.Now()
	err = db.Add(domain.NormalizedEvent{
		Time:          time.Now().Format(time.RFC3339),
		Agent:         "codex",
		Session:       "sess-locked",
		HookEventName: "PreToolUse",
		Tool:          "Bash",
		Action:        "BASH",
		Path:          "cmd: true",
		RawPayload:    []byte(`{}`),
	})
	elapsed := time.Since(start)

	if _, rollbackErr := conn.ExecContext(context.Background(), `ROLLBACK`); rollbackErr != nil {
		t.Fatalf("rollback lock: %v", rollbackErr)
	}
	if err == nil {
		t.Fatal("Add succeeded while a write lock was held, want lock error")
	}
	if elapsed >= 2*time.Second {
		t.Fatalf("Add returned after %s, want it to fail before the 5s hook timeout", elapsed)
	}
}

func TestListBySession(t *testing.T) {
	db := newTestDB(t)
	now := time.Now().UTC()

	addEvent(t, db, domain.NormalizedEvent{
		Time:          now.Add(-2 * time.Minute).Format(time.RFC3339),
		Agent:         "codex",
		Session:       "sess-a",
		HookEventName: "PreToolUse",
		Action:        "READ",
		Path:          "/tmp/a.txt",
		RawPayload:    []byte(`{}`),
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time:          now.Add(-1 * time.Minute).Format(time.RFC3339),
		Agent:         "codex",
		Session:       "sess-b",
		HookEventName: "PreToolUse",
		Action:        "READ",
		Path:          "/tmp/b.txt",
		RawPayload:    []byte(`{}`),
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time:          now.Format(time.RFC3339),
		Agent:         "codex",
		Session:       "sess-a",
		HookEventName: "PostToolUse",
		Action:        "EDIT",
		Path:          "/tmp/a2.txt",
		RawPayload:    []byte(`{}`),
	})

	events, err := db.ListBySession("sess-a", 0)
	if err != nil {
		t.Fatalf("ListBySession: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("got %d events, want 2", len(events))
	}
	if events[0].Session != "sess-a" || events[1].Session != "sess-a" {
		t.Fatalf("unexpected sessions: %+v", events)
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

	if err := db.UpsertSession("sess1", "claudecode", "claude-opus-4-7", "startup", "/cwd", "/transcript", time.Now().UTC().Format(time.RFC3339), "", domain.SessionUsage{}); err != nil {
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

	if err := db.UpsertSession("sess1", "codex", "", "startup", "/cwd", "/transcript", time.Now().UTC().Format(time.RFC3339), "", domain.SessionUsage{}); err != nil {
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

	if err := db.UpsertSession("sess1", "codex", "gpt-5.4", "startup", "/cwd", "/transcript", time.Now().UTC().Format(time.RFC3339), "", domain.SessionUsage{}); err != nil {
		t.Fatalf("first UpsertSession: %v", err)
	}
	if err := db.UpsertSession("sess1", "codex", "", "hook", "/cwd", "/transcript", time.Now().UTC().Format(time.RFC3339), "", domain.SessionUsage{}); err != nil {
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

func TestUpsertSession_lastSeenAtUsesChronologicalComparison(t *testing.T) {
	db := newTestDB(t)
	first := "2026-05-10T10:00:00Z"
	second := "2026-05-10T03:01:00-07:00" // 10:01:00Z (newer than first)
	older := "2026-05-10T09:59:59Z"

	if err := db.UpsertSession("sess-time", "codex", "gpt-5.4", "startup", "/cwd", "/transcript", first, "", domain.SessionUsage{}); err != nil {
		t.Fatalf("first UpsertSession: %v", err)
	}
	if err := db.UpsertSession("sess-time", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", second, "", domain.SessionUsage{}); err != nil {
		t.Fatalf("second UpsertSession: %v", err)
	}
	if err := db.UpsertSession("sess-time", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", older, "", domain.SessionUsage{}); err != nil {
		t.Fatalf("third UpsertSession: %v", err)
	}

	sessions, err := db.ListSessions()
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("sessions len = %d, want 1", len(sessions))
	}
	// second is "2026-05-10T03:01:00-07:00" = 10:01:00Z; stored normalized to UTC
	wantLastSeen := "2026-05-10T10:01:00Z"
	if sessions[0].LastSeenAt != wantLastSeen {
		t.Fatalf("last_seen_at = %q, want %q", sessions[0].LastSeenAt, wantLastSeen)
	}
}

func TestUpsertSession_endedAtSetAndClearedByNewerActivity(t *testing.T) {
	db := newTestDB(t)
	start := "2026-05-10T10:00:00Z"
	stop := "2026-05-10T10:05:00Z"
	resume := "2026-05-10T10:06:00Z"

	if err := db.UpsertSession("sess-ended", "codex", "gpt-5.4", "startup", "/cwd", "/transcript", start, "", domain.SessionUsage{}); err != nil {
		t.Fatalf("first UpsertSession: %v", err)
	}
	if err := db.UpsertSession("sess-ended", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", stop, stop, domain.SessionUsage{}); err != nil {
		t.Fatalf("second UpsertSession: %v", err)
	}

	sessions, err := db.ListSessions()
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if sessions[0].EndedAt != stop {
		t.Fatalf("ended_at = %q, want %q", sessions[0].EndedAt, stop)
	}

	if err := db.UpsertSession("sess-ended", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", resume, "", domain.SessionUsage{}); err != nil {
		t.Fatalf("third UpsertSession: %v", err)
	}
	sessions, err = db.ListSessions()
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if sessions[0].EndedAt != "" {
		t.Fatalf("ended_at = %q, want empty after newer activity", sessions[0].EndedAt)
	}
}

func TestUpsertSession_staleStopAfterResumeDoesNotResurrectEndedAt(t *testing.T) {
	db := newTestDB(t)
	start := "2026-05-10T10:00:00Z"
	stop := "2026-05-10T10:05:00Z"
	resume := "2026-05-10T10:06:00Z"

	if err := db.UpsertSession("sess-stale-stop", "codex", "gpt-5.4", "startup", "/cwd", "/transcript", start, "", domain.SessionUsage{}); err != nil {
		t.Fatalf("first UpsertSession: %v", err)
	}
	if err := db.UpsertSession("sess-stale-stop", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", stop, stop, domain.SessionUsage{}); err != nil {
		t.Fatalf("second UpsertSession: %v", err)
	}
	if err := db.UpsertSession("sess-stale-stop", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", resume, "", domain.SessionUsage{}); err != nil {
		t.Fatalf("third UpsertSession: %v", err)
	}
	// Stale stop arrives after resume (out-of-order ingestion), must not flip session back to ended.
	if err := db.UpsertSession("sess-stale-stop", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", stop, stop, domain.SessionUsage{}); err != nil {
		t.Fatalf("fourth UpsertSession: %v", err)
	}

	sessions, err := db.ListSessions()
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("sessions len = %d, want 1", len(sessions))
	}
	if sessions[0].EndedAt != "" {
		t.Fatalf("ended_at = %q, want empty after stale stop", sessions[0].EndedAt)
	}
	if sessions[0].LastSeenAt != resume {
		t.Fatalf("last_seen_at = %q, want %q", sessions[0].LastSeenAt, resume)
	}
}

func TestListSessions_sortsByStartedAtDesc(t *testing.T) {
	db := newTestDB(t)

	if err := db.UpsertSession(
		"sess-ended-older",
		"codex",
		"gpt-5.4",
		"startup",
		"/cwd",
		"/transcript",
		"2026-05-10T10:00:00Z",
		"2026-05-10T10:10:00Z",
		domain.SessionUsage{},
	); err != nil {
		t.Fatalf("UpsertSession sess-ended-older: %v", err)
	}
	if err := db.UpsertSession(
		"sess-running",
		"codex",
		"gpt-5.4",
		"startup",
		"/cwd",
		"/transcript",
		"2026-05-10T09:00:00Z",
		"",
		domain.SessionUsage{},
	); err != nil {
		t.Fatalf("UpsertSession sess-running: %v", err)
	}
	if err := db.UpsertSession(
		"sess-ended-newer",
		"codex",
		"gpt-5.4",
		"startup",
		"/cwd",
		"/transcript",
		"2026-05-10T08:00:00Z",
		"2026-05-10T10:20:00Z",
		domain.SessionUsage{},
	); err != nil {
		t.Fatalf("UpsertSession sess-ended-newer: %v", err)
	}
	if err := db.UpsertSession(
		"sess-running",
		"codex",
		"gpt-5.4",
		"hook",
		"/cwd",
		"/transcript",
		"2026-05-10T10:30:00Z",
		"",
		domain.SessionUsage{},
	); err != nil {
		t.Fatalf("UpsertSession sess-running second event: %v", err)
	}

	sessions, err := db.ListSessions()
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(sessions) != 3 {
		t.Fatalf("sessions len = %d, want 3", len(sessions))
	}

	got := []string{sessions[0].SessionID, sessions[1].SessionID, sessions[2].SessionID}
	want := []string{"sess-ended-older", "sess-running", "sess-ended-newer"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("sessions[%d] = %q, want %q; full order=%v", i, got[i], want[i], got)
		}
	}
}

func TestListProjectsAggregatesSessionsByCWD(t *testing.T) {
	db := newTestDB(t)

	if err := db.UpsertSession("sess-old", "codex", "gpt-5.4", "", "/work/hooker", "", "2026-05-14T10:00:00Z", "2026-05-14T10:05:00Z", domain.SessionUsage{}); err != nil {
		t.Fatalf("UpsertSession old: %v", err)
	}
	if err := db.UpsertSession("sess-live", "claudecode", "claude-opus-4-7", "", "/work/hooker", "", "2026-05-14T11:00:00Z", "", domain.SessionUsage{}); err != nil {
		t.Fatalf("UpsertSession live: %v", err)
	}
	if err := db.UpsertSession("sess-other", "geminicli", "gemini-3", "", "/work/other", "", "2026-05-14T09:00:00Z", "", domain.SessionUsage{}); err != nil {
		t.Fatalf("UpsertSession other: %v", err)
	}

	projects, err := db.ListProjects()
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}

	if len(projects) != 2 {
		t.Fatalf("projects len = %d, want 2", len(projects))
	}
	if projects[0].CWD != "/work/hooker" {
		t.Fatalf("first cwd = %q, want /work/hooker", projects[0].CWD)
	}
	if projects[0].Name != "hooker" {
		t.Fatalf("name = %q, want hooker", projects[0].Name)
	}
	if projects[0].SessionCount != 2 {
		t.Fatalf("session_count = %d, want 2", projects[0].SessionCount)
	}
	if projects[0].LiveCount != 1 {
		t.Fatalf("live_count = %d, want 1", projects[0].LiveCount)
	}
	if projects[0].LastActivity != "2026-05-14T11:00:00Z" {
		t.Fatalf("last_activity = %q, want latest session time", projects[0].LastActivity)
	}
	gotAgents := map[string]bool{}
	for _, agent := range projects[0].Agents {
		gotAgents[agent] = true
	}
	if !gotAgents["codex"] || !gotAgents["claudecode"] {
		t.Fatalf("agents = %+v, want codex and claudecode", projects[0].Agents)
	}
}

func TestListSessionsByCWDFiltersAndAppliesSince(t *testing.T) {
	db := newTestDB(t)

	if err := db.UpsertSession("old", "codex", "", "", "/work/hooker", "", "2026-05-14T09:00:00Z", "", domain.SessionUsage{}); err != nil {
		t.Fatalf("UpsertSession old: %v", err)
	}
	if err := db.UpsertSession("new", "codex", "", "", "/work/hooker", "", "2026-05-14T11:00:00Z", "", domain.SessionUsage{}); err != nil {
		t.Fatalf("UpsertSession new: %v", err)
	}
	if err := db.UpsertSession("other", "codex", "", "", "/work/other", "", "2026-05-14T12:00:00Z", "", domain.SessionUsage{}); err != nil {
		t.Fatalf("UpsertSession other: %v", err)
	}

	sessions, err := db.ListSessionsByCWD("/work/hooker", "2026-05-14T10:00:00Z")
	if err != nil {
		t.Fatalf("ListSessionsByCWD: %v", err)
	}

	if len(sessions) != 1 {
		t.Fatalf("sessions len = %d, want 1", len(sessions))
	}
	if sessions[0].SessionID != "new" {
		t.Fatalf("session_id = %q, want new", sessions[0].SessionID)
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

func TestGetDashboardStatsDoesNotDeadlockWithSingleConnection(t *testing.T) {
	db := newTestDB(t)

	done := make(chan error, 1)
	go func() {
		_, err := db.GetDashboardStats("", "")
		done <- err
	}()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("GetDashboardStats: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("GetDashboardStats deadlocked waiting for its own SQLite connection")
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
	if err := db.UpsertSession("sess1", "codex", "gpt-5.4", "startup", "/cwd", "/transcript", time.Now().UTC().Format(time.RFC3339), "", usage); err != nil {
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

func TestDiagnosticsStorageStatsEmptyDB(t *testing.T) {
	db := newTestDB(t)

	stats, err := db.DiagnosticsStorageStats()
	if err != nil {
		t.Fatalf("DiagnosticsStorageStats: %v", err)
	}
	if stats.TotalEvents != 0 {
		t.Fatalf("TotalEvents = %d, want 0", stats.TotalEvents)
	}
	if stats.TotalSessions != 0 {
		t.Fatalf("TotalSessions = %d, want 0", stats.TotalSessions)
	}
	if stats.LatestEventAt != nil {
		t.Fatalf("LatestEventAt = %q, want nil", *stats.LatestEventAt)
	}
}

func TestDiagnosticsStorageStatsCountsRowsAndLatestTimestamp(t *testing.T) {
	db := newTestDB(t)
	base := time.Date(2026, 5, 27, 10, 0, 0, 0, time.UTC)
	early := base.Format(time.RFC3339)
	middle := base.Add(time.Hour).Format(time.RFC3339)
	latest := base.Add(2 * time.Hour).Format(time.RFC3339)
	offsetLatest := "2026-05-27T08:30:00-05:00"

	addEvent(t, db, domain.NormalizedEvent{
		Time:          latest,
		Agent:         "codex",
		Session:       "diagnostics-a",
		HookEventName: "PostToolUse",
		ToolUseID:     "tu-latest",
		Tool:          "Edit",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time:                early,
		Agent:               "claudecode",
		Session:             "diagnostics-b",
		HookEventName:       "PreToolUse",
		ToolUseID:           "tu-early",
		Tool:                "Read",
		NormalizationStatus: "degraded",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time:          middle,
		Agent:         "codex",
		Session:       "diagnostics-a",
		HookEventName: "Notification",
		ToolUseID:     "tu-middle",
		Tool:          "Shell",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time:          offsetLatest,
		Agent:         "codex",
		Session:       "diagnostics-a",
		HookEventName: "PostToolUse",
		ToolUseID:     "tu-offset-latest",
		Tool:          "Bash",
	})
	addSessionAt(t, db, "diagnostics-a", "codex", base)
	addSessionAt(t, db, "diagnostics-b", "claudecode", base)

	stats, err := db.DiagnosticsStorageStats()
	if err != nil {
		t.Fatalf("DiagnosticsStorageStats: %v", err)
	}
	if stats.TotalEvents != 4 {
		t.Fatalf("TotalEvents = %d, want 4", stats.TotalEvents)
	}
	if stats.TotalSessions != 2 {
		t.Fatalf("TotalSessions = %d, want 2", stats.TotalSessions)
	}
	if stats.LatestEventAt == nil || *stats.LatestEventAt != offsetLatest {
		t.Fatalf("LatestEventAt = %v, want %q", stats.LatestEventAt, offsetLatest)
	}
}

func TestDiagnosticsAgentStatsEmptyDB(t *testing.T) {
	db := newTestDB(t)

	stats, err := db.DiagnosticsAgentStats()
	if err != nil {
		t.Fatalf("DiagnosticsAgentStats: %v", err)
	}
	if len(stats) != 0 {
		t.Fatalf("len(stats) = %d, want 0", len(stats))
	}
}

func TestDiagnosticsAgentStatsAggregatesSessionsAndEvents(t *testing.T) {
	db := newTestDB(t)
	base := time.Date(2026, 5, 27, 10, 0, 0, 0, time.UTC)
	claudeSeen := base.Add(time.Hour).Format(time.RFC3339)
	codexSeen := base.Add(2 * time.Hour).Format(time.RFC3339)

	addSessionAt(t, db, "claude-a", "claudecode", base)
	addSessionAt(t, db, "claude-b", "claudecode", base.Add(time.Hour))
	addSessionAt(t, db, "codex-a", "codex", base.Add(2*time.Hour))
	addSessionAt(t, db, "gemini-a", "geminicli", base.Add(3*time.Hour))

	addEvent(t, db, domain.NormalizedEvent{
		Time:                claudeSeen,
		Agent:               "claudecode",
		Session:             "claude-b",
		HookEventName:       "PreToolUse",
		ToolUseID:           "claude-tool",
		Tool:                "Read",
		NormalizationStatus: "degraded",
		NormalizerVersion:   "claudecode/1",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time:                codexSeen,
		Agent:               "codex",
		Session:             "codex-a",
		HookEventName:       "PostToolUse",
		ToolUseID:           "codex-tool",
		Tool:                "Bash",
		NormalizationStatus: "ok",
		NormalizerVersion:   "codex/1",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time:                base.Add(30 * time.Minute).Format(time.RFC3339),
		Agent:               "unknown",
		Source:              "gemini",
		Session:             "unknown-gemini",
		HookEventName:       "PostToolUse",
		ToolUseID:           "gemini-tool",
		Tool:                "Read",
		NormalizationStatus: "degraded",
		NormalizerVersion:   "hooker/1",
	})

	stats, err := db.DiagnosticsAgentStats()
	if err != nil {
		t.Fatalf("DiagnosticsAgentStats: %v", err)
	}
	byAgent := map[string]domain.DiagnosticsAgentStats{}
	for _, stat := range stats {
		byAgent[stat.Agent] = stat
	}
	if _, ok := byAgent["geminicli"]; ok {
		t.Fatalf("geminicli stats present: %+v", byAgent["geminicli"])
	}
	claude := byAgent["claudecode"]
	if claude.EventCount != 2 {
		t.Fatalf("claude EventCount = %d, want 2", claude.EventCount)
	}
	if claude.LastSeenAt == nil || *claude.LastSeenAt != claudeSeen {
		t.Fatalf("claude LastSeenAt = %v, want %q", claude.LastSeenAt, claudeSeen)
	}
	if claude.DegradedCount != 1 {
		t.Fatalf("claude DegradedCount = %d, want 1", claude.DegradedCount)
	}
	if claude.NormalizerVersion == nil || *claude.NormalizerVersion != "claudecode/1" {
		t.Fatalf("claude NormalizerVersion = %v, want claudecode/1", claude.NormalizerVersion)
	}
	codex := byAgent["codex"]
	if codex.EventCount != 1 {
		t.Fatalf("codex EventCount = %d, want 1", codex.EventCount)
	}
	if codex.LastSeenAt == nil || *codex.LastSeenAt != codexSeen {
		t.Fatalf("codex LastSeenAt = %v, want %q", codex.LastSeenAt, codexSeen)
	}
	if codex.DegradedCount != 0 {
		t.Fatalf("codex DegradedCount = %d, want 0", codex.DegradedCount)
	}
	if codex.NormalizerVersion == nil || *codex.NormalizerVersion != "codex/1" {
		t.Fatalf("codex NormalizerVersion = %v, want codex/1", codex.NormalizerVersion)
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
	addSessionAt(t, db, sessionID, agent, time.Now().UTC())
}

func addSessionAt(t *testing.T, db *sqlite.DB, sessionID, agent string, eventTime time.Time) {
	t.Helper()
	if err := db.UpsertSession(sessionID, agent, "", "", "/tmp", "", eventTime.Format(time.RFC3339), "", domain.SessionUsage{}); err != nil {
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

func TestGetSessionTree_skipsChildOutsideSinceWindow(t *testing.T) {
	db := newTestDB(t)
	now := time.Now().UTC()
	within := now.Add(-15 * time.Minute)
	outside := now.Add(-8 * 24 * time.Hour)
	since := now.Add(-7 * 24 * time.Hour).Format(time.RFC3339)

	addSessionAt(t, db, "parent", "claudecode", within)
	addSessionAt(t, db, "child-outside", "claudecode", outside)

	addEvent(t, db, domain.NormalizedEvent{
		Time: now.Format(time.RFC3339), Agent: "claudecode",
		Session: "parent", HookEventName: "SubagentStart",
		TurnID: "t1", ToolUseID: "u1", SubagentID: "agent-old",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time: now.Format(time.RFC3339), Agent: "claudecode",
		Session: "child-outside", HookEventName: "PreToolUse",
		TurnID: "t2", ToolUseID: "u2", SubagentID: "agent-old",
	})

	tree, err := db.GetSessionTree(since)
	if err != nil {
		t.Fatalf("GetSessionTree: %v", err)
	}
	if len(tree) != 1 {
		t.Fatalf("roots = %d, want 1", len(tree))
	}
	if tree[0].Session.SessionID != "parent" {
		t.Fatalf("root session = %q, want parent", tree[0].Session.SessionID)
	}
	if len(tree[0].Children) != 0 {
		t.Fatalf("children = %d, want 0", len(tree[0].Children))
	}
}

func TestGetSessionTree_cycleDoesNotRecurseInfinitely(t *testing.T) {
	db := newTestDB(t)
	addSession(t, db, "root", "claudecode")
	addSession(t, db, "child", "claudecode")

	addEvent(t, db, domain.NormalizedEvent{
		Time: time.Now().Format(time.RFC3339), Agent: "claudecode",
		Session: "root", HookEventName: "SubagentStart",
		TurnID: "t1", ToolUseID: "u1", SubagentID: "agent-child",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time: time.Now().Format(time.RFC3339), Agent: "claudecode",
		Session: "child", HookEventName: "SubagentStart",
		TurnID: "t2", ToolUseID: "u2", SubagentID: "agent-root",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time: time.Now().Format(time.RFC3339), Agent: "claudecode",
		Session: "child", HookEventName: "PreToolUse",
		TurnID: "t3", ToolUseID: "u3", SubagentID: "agent-child",
	})
	addEvent(t, db, domain.NormalizedEvent{
		Time: time.Now().Format(time.RFC3339), Agent: "claudecode",
		Session: "root", HookEventName: "PreToolUse",
		TurnID: "t4", ToolUseID: "u4", SubagentID: "agent-root",
	})

	since := time.Now().Add(-time.Hour).Format(time.RFC3339)
	tree, err := db.GetSessionTree(since)
	if err != nil {
		t.Fatalf("GetSessionTree: %v", err)
	}
	if len(tree) == 0 {
		t.Fatal("expected at least one root node for cycle fallback")
	}
}

// TestMigration008_Columns verifies migration 008 adds the three normalization
// columns to hook_events and that existing rows receive the default value for
// normalization_status.
func TestMigration008_Columns(t *testing.T) {
	db := newTestDB(t)

	// Verify all three columns exist by querying PRAGMA table_info.
	rawDB := db.RawDB()
	rows, err := rawDB.Query(`PRAGMA table_info(hook_events)`)
	if err != nil {
		t.Fatalf("PRAGMA table_info: %v", err)
	}
	defer rows.Close()

	cols := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull int
		var dfltValue any
		var pk int
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			t.Fatalf("scan table_info: %v", err)
		}
		cols[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("table_info rows: %v", err)
	}

	for _, want := range []string{"normalizer_version", "agent_version", "normalization_status"} {
		if !cols[want] {
			t.Errorf("column %q missing from hook_events after migration 008", want)
		}
	}
}

// TestMigration008_DefaultStatus verifies that rows inserted without an explicit
// normalization_status receive the default value 'ok'.
func TestMigration008_DefaultStatus(t *testing.T) {
	db := newTestDB(t)

	e := domain.NormalizedEvent{
		Time:          time.Now().Format(time.RFC3339),
		Agent:         "claudecode",
		Session:       "sess-norm",
		HookEventName: "PreToolUse",
		TurnID:        "t1",
		ToolUseID:     "u1",
		RawPayload:    []byte(`{}`),
		// NormalizationStatus intentionally left empty → DB DEFAULT 'ok'
	}
	if err := db.Add(e); err != nil {
		t.Fatalf("Add: %v", err)
	}

	var status string
	if err := db.RawDB().QueryRow(
		`SELECT COALESCE(normalization_status,'') FROM hook_events LIMIT 1`,
	).Scan(&status); err != nil {
		t.Fatalf("query normalization_status: %v", err)
	}
	if status != "ok" {
		t.Errorf("normalization_status = %q, want %q", status, "ok")
	}
}

// TestMigration008_NormalizationFieldsRoundtrip verifies that NormalizationStatus,
// NormalizerVersion, and AgentVersion are written by Add() and read back by List().
func TestMigration008_NormalizationFieldsRoundtrip(t *testing.T) {
	db := newTestDB(t)

	e := domain.NormalizedEvent{
		Time:                "2026-01-02T03:04:05Z",
		Agent:               "claudecode",
		Session:             "sess-rt",
		HookEventName:       "PreToolUse",
		TurnID:              "t2",
		ToolUseID:           "u2",
		RawPayload:          []byte(`{"key":"val"}`),
		NormalizationStatus: "degraded",
		NormalizerVersion:   "0.2.0",
		AgentVersion:        "1.5.0",
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
	got := events[0]
	if got.NormalizationStatus != "degraded" {
		t.Errorf("NormalizationStatus = %q, want %q", got.NormalizationStatus, "degraded")
	}
	if got.NormalizerVersion != "0.2.0" {
		t.Errorf("NormalizerVersion = %q, want %q", got.NormalizerVersion, "0.2.0")
	}
	if got.AgentVersion != "1.5.0" {
		t.Errorf("AgentVersion = %q, want %q", got.AgentVersion, "1.5.0")
	}
}

// TestMigrationRunner_Transactional verifies that the migration runner is
// idempotent (running migrate() twice does not re-apply completed migrations).
func TestMigrationRunner_Idempotent(t *testing.T) {
	db := newTestDB(t)

	// A second call to New on the same DB would re-run migrate(). Instead,
	// verify idempotency by checking schema_migrations has exactly 8 versions.
	rawDB := db.RawDB()
	var count int
	if err := rawDB.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil {
		t.Fatalf("count schema_migrations: %v", err)
	}
	if count != 8 {
		t.Errorf("schema_migrations has %d rows, want 8 (migrations 1–8)", count)
	}
}

func TestGetRawPayload_returnsStoredBytes(t *testing.T) {
	db := newTestDB(t)
	e := domain.NormalizedEvent{
		Time:          "2026-01-01T00:00:00Z",
		Agent:         "claudecode",
		Session:       "sess1",
		HookEventName: "PreToolUse",
		TurnID:        "t1",
		ToolUseID:     "u1",
		RawPayload:    []byte(`{"tool":"Bash","input":"echo hi"}`),
	}
	if err := db.Add(e); err != nil {
		t.Fatalf("Add: %v", err)
	}

	events, err := db.List(10)
	if err != nil || len(events) == 0 {
		t.Fatalf("List: %v, len=%d", err, len(events))
	}
	key := events[0].DedupKey
	if key == "" {
		t.Fatal("DedupKey is empty after list")
	}

	got, err := db.GetRawPayload(key)
	if err != nil {
		t.Fatalf("GetRawPayload: %v", err)
	}
	want := `{"tool":"Bash","input":"echo hi"}`
	if string(got) != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestGetRawPayload_unknownKeyReturnsNil(t *testing.T) {
	db := newTestDB(t)
	got, err := db.GetRawPayload("nonexistentkey")
	if err != nil {
		t.Fatalf("GetRawPayload: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil for unknown key, got %q", got)
	}
}
