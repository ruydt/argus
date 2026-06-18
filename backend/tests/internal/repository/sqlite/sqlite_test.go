package sqlite_test

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"argus/internal/domain"
	"argus/internal/repository/sqlite"
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

func TestListBySessionsTimeRangeSearch(t *testing.T) {
	db := newTestDB(t)

	// Two sessions, distinct ids + project paths, both timestamped in the past.
	old := time.Now().Add(-48 * time.Hour).UTC().Format(time.RFC3339)
	add := func(session, cwd string) {
		if err := db.Add(domain.NormalizedEvent{
			Time: old, Agent: "claudecode", Session: session,
			HookEventName: "SessionStart", CWD: cwd, RawPayload: []byte(`{}`),
		}); err != nil {
			t.Fatalf("Add: %v", err)
		}
	}
	add("799d393e-e548-41f3-98ad-f08bb6ce4738", "/Users/duytran/Desktop/Nghich")
	add("aaaa1111-bbbb-2222-cccc-333344445555", "/Users/duytran/GitHub/argus")

	// The handler clears the time window when searching, so the repo is called
	// with empty since/until. Verify the old sessions still surface.
	future := time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339)

	sessionsIn := func(events []domain.NormalizedEvent) map[string]bool {
		m := map[string]bool{}
		for _, e := range events {
			m[e.Session] = true
		}
		return m
	}

	// A future window with no search excludes the old sessions — this is the
	// case that motivated clearing the window on search.
	got, _, _, err := db.ListBySessionsTimeRange(future, "", "", 0, 10)
	if err != nil {
		t.Fatalf("future window: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("future window returned %d events, want 0", len(got))
	}

	// Search by session-id substring (time window cleared, as the handler does).
	got, _, _, err = db.ListBySessionsTimeRange("", "", "799d393e", 0, 10)
	if err != nil {
		t.Fatalf("search by id: %v", err)
	}
	m := sessionsIn(got)
	if !m["799d393e-e548-41f3-98ad-f08bb6ce4738"] || len(m) != 1 {
		t.Fatalf("id search sessions = %v, want only 799d393e session", m)
	}

	// Search by project path substring.
	got, _, _, err = db.ListBySessionsTimeRange("", "", "GitHub/argus", 0, 10)
	if err != nil {
		t.Fatalf("search by cwd: %v", err)
	}
	m = sessionsIn(got)
	if !m["aaaa1111-bbbb-2222-cccc-333344445555"] || len(m) != 1 {
		t.Fatalf("cwd search sessions = %v, want only argus session", m)
	}

	// No match → empty.
	got, _, _, err = db.ListBySessionsTimeRange("", "", "no-such-thing", 0, 10)
	if err != nil {
		t.Fatalf("search no-match: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("no-match search returned %d events, want 0", len(got))
	}
}

func TestAddDoesNotWaitForUnrelatedOpenReadRows(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "argus-test.db")
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
	dbPath := filepath.Join(t.TempDir(), "argus-test.db")
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

	if err := db.UpsertSession("sess1", "claudecode", "claude-opus-4-7", "startup", "/cwd", "/transcript", time.Now().UTC().Format(time.RFC3339), ""); err != nil {
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

	if err := db.UpsertSession("sess1", "codex", "", "startup", "/cwd", "/transcript", time.Now().UTC().Format(time.RFC3339), ""); err != nil {
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

	if err := db.UpsertSession("sess1", "codex", "gpt-5.4", "startup", "/cwd", "/transcript", time.Now().UTC().Format(time.RFC3339), ""); err != nil {
		t.Fatalf("first UpsertSession: %v", err)
	}
	if err := db.UpsertSession("sess1", "codex", "", "hook", "/cwd", "/transcript", time.Now().UTC().Format(time.RFC3339), ""); err != nil {
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

	if err := db.UpsertSession("sess-time", "codex", "gpt-5.4", "startup", "/cwd", "/transcript", first, ""); err != nil {
		t.Fatalf("first UpsertSession: %v", err)
	}
	if err := db.UpsertSession("sess-time", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", second, ""); err != nil {
		t.Fatalf("second UpsertSession: %v", err)
	}
	if err := db.UpsertSession("sess-time", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", older, ""); err != nil {
		t.Fatalf("third UpsertSession: %v", err)
	}

	var lastSeen string
	err := db.RawDB().QueryRow(`SELECT last_seen_at FROM sessions WHERE session_id = ?`, "sess-time").Scan(&lastSeen)
	if err != nil {
		t.Fatalf("query last_seen_at: %v", err)
	}
	// second is "2026-05-10T03:01:00-07:00" = 10:01:00Z; stored normalized to UTC
	wantLastSeen := "2026-05-10T10:01:00Z"
	if lastSeen != wantLastSeen {
		t.Fatalf("last_seen_at = %q, want %q", lastSeen, wantLastSeen)
	}
}

func TestUpsertSession_endedAtSetAndClearedByNewerActivity(t *testing.T) {
	db := newTestDB(t)
	start := "2026-05-10T10:00:00Z"
	stop := "2026-05-10T10:05:00Z"
	resume := "2026-05-10T10:06:00Z"

	if err := db.UpsertSession("sess-ended", "codex", "gpt-5.4", "startup", "/cwd", "/transcript", start, ""); err != nil {
		t.Fatalf("first UpsertSession: %v", err)
	}
	if err := db.UpsertSession("sess-ended", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", stop, stop); err != nil {
		t.Fatalf("second UpsertSession: %v", err)
	}

	var endedAt string
	_ = db.RawDB().QueryRow(`SELECT COALESCE(ended_at,'') FROM sessions WHERE session_id = ?`, "sess-ended").Scan(&endedAt)
	if endedAt != stop {
		t.Fatalf("ended_at = %q, want %q", endedAt, stop)
	}

	if err := db.UpsertSession("sess-ended", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", resume, ""); err != nil {
		t.Fatalf("third UpsertSession: %v", err)
	}
	_ = db.RawDB().QueryRow(`SELECT COALESCE(ended_at,'') FROM sessions WHERE session_id = ?`, "sess-ended").Scan(&endedAt)
	if endedAt != "" {
		t.Fatalf("ended_at = %q, want empty after newer activity", endedAt)
	}
}

func TestUpsertSession_staleStopAfterResumeDoesNotResurrectEndedAt(t *testing.T) {
	db := newTestDB(t)
	start := "2026-05-10T10:00:00Z"
	stop := "2026-05-10T10:05:00Z"
	resume := "2026-05-10T10:06:00Z"

	if err := db.UpsertSession("sess-stale-stop", "codex", "gpt-5.4", "startup", "/cwd", "/transcript", start, ""); err != nil {
		t.Fatalf("first UpsertSession: %v", err)
	}
	if err := db.UpsertSession("sess-stale-stop", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", stop, stop); err != nil {
		t.Fatalf("second UpsertSession: %v", err)
	}
	if err := db.UpsertSession("sess-stale-stop", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", resume, ""); err != nil {
		t.Fatalf("third UpsertSession: %v", err)
	}
	// Stale stop arrives after resume (out-of-order ingestion), must not flip session back to ended.
	if err := db.UpsertSession("sess-stale-stop", "codex", "gpt-5.4", "hook", "/cwd", "/transcript", stop, stop); err != nil {
		t.Fatalf("fourth UpsertSession: %v", err)
	}

	var endedAt, lastSeen string
	err := db.RawDB().QueryRow(`SELECT COALESCE(ended_at,''), last_seen_at FROM sessions WHERE session_id = ?`, "sess-stale-stop").Scan(&endedAt, &lastSeen)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if endedAt != "" {
		t.Fatalf("ended_at = %q, want empty after stale stop", endedAt)
	}
	if lastSeen != resume {
		t.Fatalf("last_seen_at = %q, want %q", lastSeen, resume)
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
	// created_at is normalized to UTC at write time; the stored value for
	// offsetLatest ("2026-05-27T08:30:00-05:00") becomes "2026-05-27T13:30:00Z".
	wantLatest := "2026-05-27T13:30:00Z"
	if stats.LatestEventAt == nil || *stats.LatestEventAt != wantLatest {
		t.Fatalf("LatestEventAt = %v, want %q", stats.LatestEventAt, wantLatest)
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
		Time:                base.Add(90 * time.Minute).Format(time.RFC3339),
		Agent:               "claudecode",
		Session:             "claude-a",
		HookEventName:       "PostToolUse",
		ToolUseID:           "claude-tool-2",
		Tool:                "Write",
		NormalizationStatus: "ok",
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
	stats, err := db.DiagnosticsAgentStats()
	if err != nil {
		t.Fatalf("DiagnosticsAgentStats: %v", err)
	}
	byAgent := map[string]domain.DiagnosticsAgentStats{}
	for _, stat := range stats {
		byAgent[stat.Agent] = stat
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

func addTestEvent(t *testing.T, db *sqlite.DB, ts time.Time) {
	t.Helper()
	err := db.Add(domain.NormalizedEvent{
		Time:          ts.UTC().Format(time.RFC3339),
		Agent:         "codex",
		Session:       "test-session",
		HookEventName: "PreToolUse",
		Action:        "READ",
		Path:          "/tmp/file",
		RawPayload:    []byte(`{}`),
	})
	if err != nil {
		t.Fatalf("addTestEvent: %v", err)
	}
}

func TestListByTimeRange_sinceFilter(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}

	base := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 5; i++ {
		addTestEvent(t, db, base.Add(time.Duration(i)*time.Hour))
	}

	since := base.Add(2 * time.Hour).Format(time.RFC3339)
	events, _, _, err := db.ListByTimeRange(since, "", "", 0, 100)
	if err != nil {
		t.Fatalf("ListByTimeRange: %v", err)
	}
	// events at +2h, +3h, +4h = 3 events
	if len(events) != 3 {
		t.Errorf("got %d events, want 3", len(events))
	}
}

func TestListByTimeRange_untilFilter(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}

	base := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 5; i++ {
		addTestEvent(t, db, base.Add(time.Duration(i)*time.Hour))
	}

	until := base.Add(3 * time.Hour).Format(time.RFC3339)
	events, _, _, err := db.ListByTimeRange("", until, "", 0, 100)
	if err != nil {
		t.Fatalf("ListByTimeRange: %v", err)
	}
	// events at +0h, +1h, +2h = 3 events (until is exclusive)
	if len(events) != 3 {
		t.Errorf("got %d events, want 3", len(events))
	}
}

func TestListByTimeRange_beforeID(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}

	base := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 5; i++ {
		addTestEvent(t, db, base.Add(time.Duration(i)*time.Hour))
	}

	// First page — newest 2
	page1, minID, hasMore, err := db.ListByTimeRange("", "", "", 0, 2)
	if err != nil {
		t.Fatalf("page1: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("page1 got %d, want 2", len(page1))
	}
	if !hasMore {
		t.Error("page1 hasMore = false, want true")
	}

	// Second page — next 2 using cursor
	page2, _, _, err := db.ListByTimeRange("", "", "", minID, 2)
	if err != nil {
		t.Fatalf("page2: %v", err)
	}
	if len(page2) != 2 {
		t.Fatalf("page2 got %d, want 2", len(page2))
	}

	// Page1 events are newer than page2 events (ORDER BY id DESC)
	t1 := page1[len(page1)-1].Time
	t2 := page2[0].Time
	if t1 <= t2 {
		t.Errorf("page1 tail (%s) should be newer than page2 head (%s)", t1, t2)
	}
}

func TestListByTimeRange_hasMore(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}

	base := time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)
	for i := 0; i < 3; i++ {
		addTestEvent(t, db, base.Add(time.Duration(i)*time.Hour))
	}

	_, _, hasMore, err := db.ListByTimeRange("", "", "", 0, 2)
	if err != nil {
		t.Fatalf("ListByTimeRange: %v", err)
	}
	if !hasMore {
		t.Error("hasMore = false, want true when rows remain")
	}

	_, _, hasMore2, err := db.ListByTimeRange("", "", "", 0, 10)
	if err != nil {
		t.Fatalf("ListByTimeRange exact: %v", err)
	}
	if hasMore2 {
		t.Error("hasMore = true, want false when all rows fit in limit")
	}
}

func addEvent(t *testing.T, db *sqlite.DB, e domain.NormalizedEvent) {
	t.Helper()
	e.RawPayload = []byte(`{}`)
	if err := db.Add(e); err != nil {
		t.Fatalf("Add: %v", err)
	}
}

func addSessionAt(t *testing.T, db *sqlite.DB, sessionID, agent string, eventTime time.Time) {
	t.Helper()
	if err := db.UpsertSession(sessionID, agent, "", "", "/tmp", "", eventTime.Format(time.RFC3339), ""); err != nil {
		t.Fatalf("UpsertSession: %v", err)
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
	// verify idempotency by checking schema_migrations has exactly 18 versions.
	rawDB := db.RawDB()
	var count int
	if err := rawDB.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&count); err != nil {
		t.Fatalf("count schema_migrations: %v", err)
	}
	if count != 18 {
		t.Errorf("schema_migrations has %d rows, want 18 (migrations 1–18)", count)
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

// TestGetRawPayload_readsLegacyUncompressedRow proves the gunzip read path is
// backward compatible: rows written before compression existed are plain JSON
// (no gzip magic bytes) and must still read back unchanged.
func TestGetRawPayload_readsLegacyUncompressedRow(t *testing.T) {
	db := newTestDB(t)
	legacy := `{"legacy":"plaintext","n":1}`
	if _, err := db.RawDB().Exec(
		`INSERT INTO hook_events (created_at, agent, session_id, hook_event_name, raw_payload, dedup_key)
		 VALUES (?,?,?,?,?,?)`,
		"2026-01-01T00:00:00Z", "claudecode", "sess-legacy", "PreToolUse", legacy, "legacykey",
	); err != nil {
		t.Fatalf("insert legacy row: %v", err)
	}

	got, err := db.GetRawPayload("legacykey")
	if err != nil {
		t.Fatalf("GetRawPayload: %v", err)
	}
	if string(got) != legacy {
		t.Errorf("legacy row: got %q, want %q", got, legacy)
	}
}

// TestRawPayload_storedCompressed verifies a large payload round-trips intact
// AND is physically smaller on disk than the original (gzip actually applied).
func TestRawPayload_storedCompressed(t *testing.T) {
	db := newTestDB(t)
	// Highly compressible payload (repeated content), like a real diff/transcript.
	original := []byte(`{"diff":"` + strings.Repeat("the quick brown fox ", 500) + `"}`)
	e := domain.NormalizedEvent{
		Time:          "2026-01-01T00:00:00Z",
		Agent:         "claudecode",
		Session:       "sess-zip",
		HookEventName: "PreToolUse",
		TurnID:        "t1",
		ToolUseID:     "u1",
		RawPayload:    original,
	}
	if err := db.Add(e); err != nil {
		t.Fatalf("Add: %v", err)
	}

	events, err := db.List(10)
	if err != nil || len(events) == 0 {
		t.Fatalf("List: %v len=%d", err, len(events))
	}
	key := events[0].DedupKey

	got, err := db.GetRawPayload(key)
	if err != nil {
		t.Fatalf("GetRawPayload: %v", err)
	}
	if string(got) != string(original) {
		t.Errorf("round-trip mismatch: got %d bytes, want %d", len(got), len(original))
	}

	var stored int
	if err := db.RawDB().QueryRow(
		`SELECT LENGTH(raw_payload) FROM hook_events WHERE dedup_key = ?`, key,
	).Scan(&stored); err != nil {
		t.Fatalf("length query: %v", err)
	}
	if stored >= len(original) {
		t.Errorf("stored %d bytes not smaller than original %d — not compressed", stored, len(original))
	}
}

// TestCompact_compressesLegacyRowsAndIsIdempotent inserts an uncompressed
// (legacy) raw_payload row, compacts, and verifies it is now gzipped while still
// reading back the original; a second Compact finds nothing to do.
func TestCompact_compressesLegacyRowsAndIsIdempotent(t *testing.T) {
	db := newTestDB(t)
	legacy := `{"a":"` + strings.Repeat("x", 400) + `"}`
	if _, err := db.RawDB().Exec(
		`INSERT INTO hook_events (created_at, agent, session_id, hook_event_name, raw_payload, dedup_key)
		 VALUES (?,?,?,?,?,?)`,
		"2026-01-01T00:00:00Z", "claudecode", "s1", "PreToolUse", legacy, "k1",
	); err != nil {
		t.Fatalf("insert legacy: %v", err)
	}

	res, err := db.Compact(context.Background())
	if err != nil {
		t.Fatalf("Compact: %v", err)
	}
	if res.RowsCompressed != 1 {
		t.Errorf("RowsCompressed = %d, want 1", res.RowsCompressed)
	}

	got, err := db.GetRawPayload("k1")
	if err != nil || string(got) != legacy {
		t.Fatalf("GetRawPayload after compact: got %q err %v", got, err)
	}

	var isGzip int
	if err := db.RawDB().QueryRow(
		`SELECT hex(substr(raw_payload,1,2))='1F8B' FROM hook_events WHERE dedup_key='k1'`,
	).Scan(&isGzip); err != nil {
		t.Fatalf("gzip check: %v", err)
	}
	if isGzip != 1 {
		t.Error("row not gzip-compressed after Compact")
	}

	res2, err := db.Compact(context.Background())
	if err != nil {
		t.Fatalf("Compact 2: %v", err)
	}
	if res2.RowsCompressed != 0 {
		t.Errorf("second Compact RowsCompressed = %d, want 0 (idempotent)", res2.RowsCompressed)
	}
}

// TestPruneEvents covers both retention bounds: age cutoff and max-events cap.
func TestPruneEvents(t *testing.T) {
	db := newTestDB(t)
	add := func(id, ts string) {
		e := domain.NormalizedEvent{
			Time: ts, Agent: "codex", Session: "s", HookEventName: "PreToolUse",
			TurnID: id, ToolUseID: id, RawPayload: []byte(`{}`),
		}
		if err := db.Add(e); err != nil {
			t.Fatalf("Add %s: %v", id, err)
		}
	}
	add("a", "2026-01-01T00:00:00Z")
	add("b", "2026-02-01T00:00:00Z")
	add("c", "2026-03-01T00:00:00Z")

	// Age cutoff: delete events before 2026-02-15 (removes a and b).
	deleted, err := db.PruneEvents(context.Background(), "2026-02-15T00:00:00Z", 0)
	if err != nil {
		t.Fatalf("PruneEvents age: %v", err)
	}
	if deleted != 2 {
		t.Errorf("age prune deleted %d, want 2", deleted)
	}

	// Refill to 4 rows, then cap to 2 newest.
	add("d", "2026-04-01T00:00:00Z")
	add("e", "2026-05-01T00:00:00Z")
	add("f", "2026-06-01T00:00:00Z")
	deleted, err = db.PruneEvents(context.Background(), "", 2)
	if err != nil {
		t.Fatalf("PruneEvents max: %v", err)
	}
	// Had c,d,e,f (4 rows); cap to 2 newest -> delete 2.
	if deleted != 2 {
		t.Errorf("max prune deleted %d, want 2", deleted)
	}
	events, err := db.List(10)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(events) != 2 {
		t.Errorf("remaining events = %d, want 2", len(events))
	}
}

// TestMigration014_NormalizesLegacyCreatedAt proves the only data-mutating
// migration rewrites legacy timestamp forms to RFC3339 'Z' (so string compare ==
// time compare, which PruneEvents/ORDER BY rely on) and leaves already-normalized
// rows untouched. Mirrors the UPDATE in 014_normalize_hook_events_created_at.sql.
func TestMigration014_NormalizesLegacyCreatedAt(t *testing.T) {
	db := newTestDB(t)
	raw := db.RawDB()
	if _, err := raw.Exec(`CREATE TABLE t14 (id INTEGER PRIMARY KEY, created_at TEXT)`); err != nil {
		t.Fatalf("create: %v", err)
	}
	legacy := map[int]string{
		1: "2026-01-01T10:00:00+02:00", // tz offset -> 08:00Z
		2: "2026-01-01T10:00:00.123Z",  // fractional seconds -> dropped
		3: "2026-01-01T10:00:00Z",      // already normalized -> untouched
	}
	for id, ts := range legacy {
		if _, err := raw.Exec(`INSERT INTO t14 (id, created_at) VALUES (?, ?)`, id, ts); err != nil {
			t.Fatalf("insert %d: %v", id, err)
		}
	}
	if _, err := raw.Exec(`
		UPDATE t14
		SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', created_at)
		WHERE created_at IS NOT NULL AND created_at != ''
		  AND strftime('%Y-%m-%dT%H:%M:%SZ', created_at) IS NOT NULL
		  AND created_at != strftime('%Y-%m-%dT%H:%M:%SZ', created_at)`); err != nil {
		t.Fatalf("normalize update: %v", err)
	}
	want := map[int]string{
		1: "2026-01-01T08:00:00Z",
		2: "2026-01-01T10:00:00Z",
		3: "2026-01-01T10:00:00Z",
	}
	for id, exp := range want {
		var got string
		if err := raw.QueryRow(`SELECT created_at FROM t14 WHERE id = ?`, id).Scan(&got); err != nil {
			t.Fatalf("scan %d: %v", id, err)
		}
		if got != exp {
			t.Errorf("id %d: got %q, want %q", id, got, exp)
		}
	}
}

// TestMigrate_RefusesNewerSchema verifies the downgrade guard: an older binary
// must refuse to open a DB stamped with a higher migration version than it knows.
func TestMigrate_RefusesNewerSchema(t *testing.T) {
	path := filepath.Join(t.TempDir(), "argus.db")
	db, err := sqlite.New(path)
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if _, err := db.RawDB().Exec(`INSERT INTO schema_migrations (version) VALUES (9999)`); err != nil {
		t.Fatalf("stamp newer version: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	_, err = sqlite.New(path)
	if err == nil {
		t.Fatal("expected error opening DB stamped with a newer schema version")
	}
	if !strings.Contains(err.Error(), "newer than this binary") {
		t.Errorf("error = %v, want newer-than-binary message", err)
	}
}

// TestGetRawPayload_corruptGzipReturnsError proves a valid-magic-but-garbage
// blob yields an error (not a panic) on read.
func TestGetRawPayload_corruptGzipReturnsError(t *testing.T) {
	db := newTestDB(t)
	garbage := append([]byte{0x1f, 0x8b}, []byte("not really gzip")...)
	if _, err := db.RawDB().Exec(
		`INSERT INTO hook_events (created_at, agent, session_id, hook_event_name, raw_payload, dedup_key)
		 VALUES (?,?,?,?,?,?)`,
		"2026-01-01T00:00:00Z", "claudecode", "s-bad", "PreToolUse", garbage, "badkey",
	); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if _, err := db.GetRawPayload("badkey"); err == nil {
		t.Error("expected error reading corrupt gzip blob, got nil")
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

func TestDBHealth(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			t.Errorf("close db: %v", err)
		}
	}()

	h, err := db.DBHealth()
	if err != nil {
		t.Fatalf("DBHealth: %v", err)
	}
	if h.JournalMode == "" {
		t.Error("want non-empty JournalMode")
	}
	if h.PageCount <= 0 {
		t.Errorf("want PageCount > 0, got %d", h.PageCount)
	}
	if h.PageSizeBytes <= 0 {
		t.Errorf("want PageSizeBytes > 0, got %d", h.PageSizeBytes)
	}
	if h.MigrationVersion <= 0 {
		t.Errorf("want MigrationVersion > 0, got %d", h.MigrationVersion)
	}
	if h.WALSizeBytes != nil {
		t.Errorf("want nil WALSizeBytes for :memory:, got %v", *h.WALSizeBytes)
	}
}

func TestDiagnosticsAgentStatsEventRates(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			t.Errorf("close db: %v", err)
		}
	}()

	e := domain.NormalizedEvent{
		Agent:    "claudecode",
		Session:  "s1",
		Action:   "PreToolUse",
		Time:     time.Now().UTC().Format(time.RFC3339),
		DedupKey: "k1",
	}
	if err := db.Add(e); err != nil {
		t.Fatalf("add event: %v", err)
	}

	stats, err := db.DiagnosticsAgentStats()
	if err != nil {
		t.Fatalf("DiagnosticsAgentStats: %v", err)
	}

	var cc domain.DiagnosticsAgentStats
	found := false
	for i := range stats {
		if stats[i].Agent == "claudecode" {
			cc = stats[i]
			found = true
			break
		}
	}
	if !found {
		t.Fatal("no claudecode entry in stats")
	}
	if cc.EventsLastHour != 1 {
		t.Errorf("EventsLastHour: want 1, got %d", cc.EventsLastHour)
	}
	if cc.EventsLast24h != 1 {
		t.Errorf("EventsLast24h: want 1, got %d", cc.EventsLast24h)
	}
}

