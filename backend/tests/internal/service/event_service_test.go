package service_test

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"argus/internal/domain"
	"argus/internal/repository/sqlite"
	"argus/internal/service"
)

type mockRepo struct {
	mu        sync.Mutex
	events    []domain.NormalizedEvent
	sessions  []domain.Session
	models    map[string]string
	addErr    error
	upsertErr error
	upserts   int
	lastUsage domain.SessionUsage
	lastEnded string

	diagnosticsStats domain.DiagnosticsStorageStats
	agentStats       []domain.DiagnosticsAgentStats
	diagnosticsErr   error
	diagnosticsCalls int
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
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.events) > limit {
		return m.events[len(m.events)-limit:], nil
	}
	return append([]domain.NormalizedEvent{}, m.events...), nil
}

func (m *mockRepo) ListBySession(sessionID string, limit int) ([]domain.NormalizedEvent, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	filtered := make([]domain.NormalizedEvent, 0)
	for _, e := range m.events {
		if e.Session == sessionID {
			filtered = append(filtered, e)
		}
	}
	if limit > 0 && len(filtered) > limit {
		return filtered[len(filtered)-limit:], nil
	}
	return append([]domain.NormalizedEvent{}, filtered...), nil
}

func (m *mockRepo) SessionModel(sessionID string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.models == nil {
		return "", nil
	}
	return m.models[sessionID], nil
}

func (m *mockRepo) ListProjects() ([]domain.Project, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return nil, nil
}

func (m *mockRepo) ListSessions() ([]domain.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]domain.Session{}, m.sessions...), nil
}

func (m *mockRepo) ListSessionsByCWD(cwd, since string) ([]domain.Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var filtered []domain.Session
	for _, session := range m.sessions {
		if session.CWD != cwd {
			continue
		}
		if since != "" && session.LastSeenAt < since {
			continue
		}
		filtered = append(filtered, session)
	}
	return filtered, nil
}

func (m *mockRepo) GetDashboardStats(_, _ string) (*domain.DashboardStats, error) {
	return nil, nil
}

func (m *mockRepo) DiagnosticsStorageStats() (domain.DiagnosticsStorageStats, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.diagnosticsCalls++
	return m.diagnosticsStats, m.diagnosticsErr
}

func (m *mockRepo) DiagnosticsAgentStats() ([]domain.DiagnosticsAgentStats, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]domain.DiagnosticsAgentStats{}, m.agentStats...), m.diagnosticsErr
}

func (m *mockRepo) GetSessionTree(_ string) ([]domain.SessionTreeNode, error) {
	return nil, nil
}

func (m *mockRepo) ListSessionsByCWDPage(_ string, _ string, _ int, _ int) ([]domain.Session, int, error) {
	return nil, 0, nil
}

func (m *mockRepo) GetFileChanges(string) ([]domain.FileChangeGroup, error) { return nil, nil }

func (m *mockRepo) GetSessionFileChangeCounts([]string) (map[string]int, error) {
	return map[string]int{}, nil
}

func (m *mockRepo) ExportEvents(_ context.Context, _ io.Writer) error { return nil }

func (m *mockRepo) ExportSnapshot(_ context.Context, _ string) error { return nil }

func (m *mockRepo) GetRawPayload(_ string) ([]byte, error) { return nil, nil }

func (m *mockRepo) ListByTimeRange(_, _, _ string, _ int64, _ int) ([]domain.NormalizedEvent, int64, bool, error) {
	return nil, 0, false, nil
}

func (m *mockRepo) ListBySessionsTimeRange(_, _ string, _ int64, _ int) ([]domain.NormalizedEvent, int64, bool, error) {
	return nil, 0, false, nil
}

func (m *mockRepo) MarkStaleSessions(_ time.Time) (int64, error) { return 0, nil }

func (m *mockRepo) Ready() bool { return true }

func (m *mockRepo) DBHealth() (domain.DiagnosticsDBHealth, error) {
	return domain.DiagnosticsDBHealth{JournalMode: "wal", PageCount: 10, PageSizeBytes: 4096, MigrationVersion: 13}, nil
}

func (m *mockRepo) UpsertSession(sessionID, _, model, _, _, _, _, endedAt string, usage domain.SessionUsage) error {
	if m.upsertErr != nil {
		return m.upsertErr
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.models == nil {
		m.models = map[string]string{}
	}
	m.upserts++
	m.lastUsage = usage
	m.lastEnded = endedAt
	if model != "" {
		m.models[sessionID] = model
	}
	return nil
}

func TestDiagnosticsReportsNotReadyAndUnavailableMemoryDB(t *testing.T) {
	latest := "2026-05-27T10:00:00Z"
	repo := &mockRepo{
		diagnosticsStats: domain.DiagnosticsStorageStats{
			TotalEvents:   7,
			TotalSessions: 3,
			LatestEventAt: &latest,
		},
	}
	svc := service.New(repo)

	got, err := svc.Diagnostics(":memory:", false)
	if err != nil {
		t.Fatalf("Diagnostics: %v", err)
	}
	if repo.diagnosticsCalls != 1 {
		t.Fatalf("diagnosticsCalls = %d, want 1", repo.diagnosticsCalls)
	}
	if !got.Health.Live {
		t.Fatal("Health.Live = false, want true")
	}
	if got.Health.Ready {
		t.Fatal("Health.Ready = true, want false")
	}
	if got.Health.Reason != "database not ready" {
		t.Fatalf("Health.Reason = %q, want database not ready", got.Health.Reason)
	}
	if got.Storage.DBPath != ":memory:" {
		t.Fatalf("Storage.DBPath = %q, want :memory:", got.Storage.DBPath)
	}
	if got.Storage.DBSizeBytes != nil {
		t.Fatalf("Storage.DBSizeBytes = %d, want nil", *got.Storage.DBSizeBytes)
	}
	if got.Storage.DBSizeReason != "unavailable" {
		t.Fatalf("Storage.DBSizeReason = %q, want unavailable", got.Storage.DBSizeReason)
	}
	if got.Storage.TotalEvents != 7 {
		t.Fatalf("Storage.TotalEvents = %d, want 7", got.Storage.TotalEvents)
	}
	if got.Storage.TotalSessions != 3 {
		t.Fatalf("Storage.TotalSessions = %d, want 3", got.Storage.TotalSessions)
	}
	if got.Storage.LatestEventAt == nil || *got.Storage.LatestEventAt != latest {
		t.Fatalf("Storage.LatestEventAt = %v, want %q", got.Storage.LatestEventAt, latest)
	}
}

func TestDiagnosticsReportsRealDBSizeAndStats(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "argus.db")
	if err := os.WriteFile(dbPath, []byte("abcd"), 0o644); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	svc := service.New(&mockRepo{
		diagnosticsStats: domain.DiagnosticsStorageStats{
			TotalEvents:   2,
			TotalSessions: 1,
		},
	})

	got, err := svc.Diagnostics(dbPath, true)
	if err != nil {
		t.Fatalf("Diagnostics: %v", err)
	}
	if !got.Health.Live || !got.Health.Ready {
		t.Fatalf("Health = %+v, want live and ready", got.Health)
	}
	if got.Health.Reason != "" {
		t.Fatalf("Health.Reason = %q, want empty", got.Health.Reason)
	}
	if got.Storage.DBSizeBytes == nil || *got.Storage.DBSizeBytes != 4 {
		t.Fatalf("Storage.DBSizeBytes = %v, want 4", got.Storage.DBSizeBytes)
	}
	if got.Storage.DBSizeReason != "" {
		t.Fatalf("Storage.DBSizeReason = %q, want empty", got.Storage.DBSizeReason)
	}
	if got.Storage.TotalEvents != 2 {
		t.Fatalf("Storage.TotalEvents = %d, want 2", got.Storage.TotalEvents)
	}
	if got.Storage.TotalSessions != 1 {
		t.Fatalf("Storage.TotalSessions = %d, want 1", got.Storage.TotalSessions)
	}
}

func TestDiagnosticsReturnsStorageStatsError(t *testing.T) {
	wantErr := errors.New("stats failed")
	svc := service.New(&mockRepo{diagnosticsErr: wantErr})

	if _, err := svc.Diagnostics(":memory:", true); !errors.Is(err, wantErr) {
		t.Fatalf("Diagnostics error = %v, want %v", err, wantErr)
	}
}

func TestDiagnosticsIncludesClaudeCodeAndCodexAgentRows(t *testing.T) {
	claudeSeen := "2026-05-27T11:00:00Z"
	claudeVersion := "claudecode/1"
	svc := service.New(&mockRepo{
		agentStats: []domain.DiagnosticsAgentStats{
			{
				Agent:             "claudecode",
				EventCount:        2,
				LastSeenAt:        &claudeSeen,
				DegradedCount:     1,
				NormalizerVersion: &claudeVersion,
			},
		},
	})

	got, err := svc.Diagnostics(":memory:", true)
	if err != nil {
		t.Fatalf("Diagnostics: %v", err)
	}
	if len(got.Agents) != 2 {
		t.Fatalf("len(Agents) = %d, want 2: %+v", len(got.Agents), got.Agents)
	}
	if got.Agents[0].ID != "claudecode" || got.Agents[0].Label != "Claude Code" {
		t.Fatalf("first agent = %+v, want Claude Code row", got.Agents[0])
	}
	if got.Agents[0].EventCount != 2 || got.Agents[0].LastSeenAt == nil || *got.Agents[0].LastSeenAt != claudeSeen {
		t.Fatalf("Claude row activity = %+v, want count=2 lastSeenAt=%s", got.Agents[0], claudeSeen)
	}
	if got.Agents[0].DegradedCount != 1 || got.Agents[0].Status != "degraded" {
		t.Fatalf("Claude row degraded status = %+v, want degraded count/status", got.Agents[0])
	}
	if got.Agents[0].NormalizerVersion == nil || *got.Agents[0].NormalizerVersion != claudeVersion {
		t.Fatalf("Claude normalizer version = %v, want %s", got.Agents[0].NormalizerVersion, claudeVersion)
	}
	if got.Agents[1].ID != "codex" || got.Agents[1].EventCount != 0 || got.Agents[1].Status != "no events" {
		t.Fatalf("Codex zero row = %+v, want no events", got.Agents[1])
	}
	if !got.Health.Ready {
		t.Fatalf("health should remain ready despite agent warnings: %+v", got.Health)
	}
}

func TestDiagnosticsMergesHookConfigStatuses(t *testing.T) {
	svc := service.New(&mockRepo{})

	got, err := svc.Diagnostics(":memory:", true, []domain.DiagnosticsHookConfig{
		{Agent: "claudecode", Status: "configured"},
		{Agent: "codex", Status: "unknown", Reason: "invalid_json"},
	})
	if err != nil {
		t.Fatalf("Diagnostics: %v", err)
	}
	if got.Agents[0].HookConfigStatus != "configured" {
		t.Fatalf("Claude hook status = %q, want configured", got.Agents[0].HookConfigStatus)
	}
	if got.Agents[0].Status != "no events" {
		t.Fatalf("Claude status = %q, want no events", got.Agents[0].Status)
	}
	if got.Agents[1].HookConfigStatus != "unknown" || got.Agents[1].HookConfigReason != "invalid_json" {
		t.Fatalf("Codex hook config = %+v, want unknown invalid_json", got.Agents[1])
	}
	if !got.Health.Ready {
		t.Fatalf("health should stay ready for hook config warnings: %+v", got.Health)
	}
}

func TestDiagnosticsIncludesPrivacyAndSecurityPosture(t *testing.T) {
	svc := service.New(&mockRepo{})

	got, err := svc.DiagnosticsWithOptions(service.DiagnosticsOptions{
		DBPath: ":memory:",
		IgnoreFile: domain.DiagnosticsIgnoreFile{
			Path:               "/tmp/argus-ignore",
			Status:             "loaded",
			ActivePatternCount: 2,
		},
		Addr:        "0.0.0.0:10804",
		AllowRemote: true,
		CORSOrigins: []string{
			"http://localhost:10804",
			"http://127.0.0.1:10804",
			"https://ops.example.test",
		},
	}, true)
	if err != nil {
		t.Fatalf("DiagnosticsWithOptions: %v", err)
	}
	if got.Privacy.IgnoreFile.Path != "/tmp/argus-ignore" {
		t.Fatalf("ignore path = %q, want /tmp/argus-ignore", got.Privacy.IgnoreFile.Path)
	}
	if got.Privacy.IgnoreFile.Status != "loaded" {
		t.Fatalf("ignore status = %q, want loaded", got.Privacy.IgnoreFile.Status)
	}
	if got.Privacy.IgnoreFile.ActivePatternCount != 2 {
		t.Fatalf("ignore active count = %d, want 2", got.Privacy.IgnoreFile.ActivePatternCount)
	}
	for _, want := range []string{"prompts", "diffs", "file paths", "tool outputs", "raw payloads", "exports"} {
		if !strings.Contains(got.Privacy.ExportWarning, want) {
			t.Fatalf("export warning %q missing %q", got.Privacy.ExportWarning, want)
		}
	}
	if got.Security.RemoteBind.Addr != "0.0.0.0:10804" {
		t.Fatalf("remote bind addr = %q, want 0.0.0.0:10804", got.Security.RemoteBind.Addr)
	}
	if !got.Security.RemoteBind.AllowRemote || got.Security.RemoteBind.Status != "remote_enabled" {
		t.Fatalf("remote bind = %+v, want remote enabled", got.Security.RemoteBind)
	}
	if got.Security.CORS.TotalOrigins != 3 || got.Security.CORS.LocalOrigins != 2 || got.Security.CORS.ExtraOrigins != 1 {
		t.Fatalf("cors = %+v, want total=3 local=2 extra=1", got.Security.CORS)
	}
}

func TestDiagnosticsDefaultsMissingIgnoreAndLoopbackPosture(t *testing.T) {
	svc := service.New(&mockRepo{})

	got, err := svc.DiagnosticsWithOptions(service.DiagnosticsOptions{
		DBPath: ":memory:",
		IgnoreFile: domain.DiagnosticsIgnoreFile{
			Path:   "/tmp/missing-ignore",
			Status: "missing_ok",
		},
		Addr:        "127.0.0.1:10804",
		AllowRemote: false,
		CORSOrigins: nil,
	}, true)
	if err != nil {
		t.Fatalf("DiagnosticsWithOptions: %v", err)
	}
	if got.Privacy.IgnoreFile.Status != "missing_ok" || got.Privacy.IgnoreFile.ActivePatternCount != 0 {
		t.Fatalf("ignore file = %+v, want missing_ok with zero active rules", got.Privacy.IgnoreFile)
	}
	if got.Security.RemoteBind.Status != "loopback" || got.Security.RemoteBind.AllowRemote {
		t.Fatalf("remote bind = %+v, want loopback with allowRemote=false", got.Security.RemoteBind)
	}
	if got.Security.CORS.TotalOrigins != 0 || got.Security.CORS.ExtraOrigins != 0 {
		t.Fatalf("cors = %+v, want zero counts when no origins are passed", got.Security.CORS)
	}
}

func TestAddEventPersists(t *testing.T) {
	svc := service.New(&mockRepo{})

	if err := svc.AddEvent(domain.NormalizedEvent{
		Agent:         "claudecode",
		Session:       "s1",
		HookEventName: "PreToolUse",
		Action:        "EDIT",
		Path:          "/tmp/foo.go",
	}); err != nil {
		t.Fatalf("AddEvent: %v", err)
	}

	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("got %d events, want 1", len(events))
	}
}

func TestAddEventSetsTime(t *testing.T) {
	svc := service.New(&mockRepo{})

	if err := svc.AddEvent(domain.NormalizedEvent{
		Agent:         "codex",
		Session:       "s1",
		HookEventName: "PostToolUse",
		Action:        "EDIT",
		Path:          "/tmp/bar.go",
	}); err != nil {
		t.Fatalf("AddEvent: %v", err)
	}

	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if events[0].Time == "" {
		t.Fatal("Time not set by AddEvent")
	}
	if _, err := time.Parse(time.RFC3339, events[0].Time); err != nil {
		t.Fatalf("Time %q is not RFC3339: %v", events[0].Time, err)
	}
}

func TestAddEventUpsertsSessionModel(t *testing.T) {
	repo := &mockRepo{}
	svc := service.New(repo)

	if err := svc.AddEvent(domain.NormalizedEvent{
		Agent:          "claudecode",
		Session:        "s1",
		HookEventName:  "SessionStart",
		Model:          "claude-opus-4-1",
		Source:         "startup",
		CWD:            "/tmp",
		TranscriptPath: "/tmp/session.jsonl",
	}); err != nil {
		t.Fatalf("AddEvent: %v", err)
	}

	if repo.upserts != 1 {
		t.Fatalf("upserts = %d, want 1", repo.upserts)
	}
	model, err := repo.SessionModel("s1")
	if err != nil {
		t.Fatalf("SessionModel: %v", err)
	}
	if model != "claude-opus-4-1" {
		t.Fatalf("model = %q, want claude-opus-4-1", model)
	}
}

func TestAddEventReturnsUpsertError(t *testing.T) {
	repo := &mockRepo{upsertErr: errors.New("boom")}
	svc := service.New(repo)

	err := svc.AddEvent(domain.NormalizedEvent{
		Agent:         "codex",
		Session:       "s1",
		HookEventName: "PreToolUse",
	})
	if err == nil || err.Error() != "boom" {
		t.Fatalf("err = %v, want boom", err)
	}
}

func TestAddEventStopSetsEndedAt(t *testing.T) {
	repo := &mockRepo{}
	svc := service.New(repo)

	eventTime := "2026-05-13T10:00:00Z"
	if err := svc.AddEvent(domain.NormalizedEvent{
		Time:          eventTime,
		Agent:         "codex",
		Session:       "s1",
		HookEventName: "Stop",
		Action:        "STOP",
	}); err != nil {
		t.Fatalf("AddEvent: %v", err)
	}

	if repo.lastEnded != eventTime {
		t.Fatalf("ended_at = %q, want %q", repo.lastEnded, eventTime)
	}
}

func TestListSessionsBackfillsZeroUsageFromTranscript(t *testing.T) {
	transcript := t.TempDir() + "/session.jsonl"
	data := `{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":120,"cached_input_tokens":40,"output_tokens":8}}}}` + "\n"
	if err := os.WriteFile(transcript, []byte(data), 0o600); err != nil {
		t.Fatalf("write transcript: %v", err)
	}
	repo := &mockRepo{sessions: []domain.Session{{
		SessionID:      "s1",
		Agent:          "codex",
		TranscriptPath: transcript,
	}}}
	svc := service.New(repo)

	sessions, err := svc.ListSessions()
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}

	if got := sessions[0].Usage.InputTokens; got != 120 {
		t.Fatalf("input tokens = %d, want 120", got)
	}
	if repo.upserts != 1 {
		t.Fatalf("upserts = %d, want 1", repo.upserts)
	}
	if repo.lastUsage.OutputTokens != 8 || repo.lastUsage.CacheReadTokens != 40 {
		t.Fatalf("persisted usage = %+v, want output=8 cache_read=40", repo.lastUsage)
	}
}

func TestGetDashboardStatsBackfillsZeroUsageFromTranscript(t *testing.T) {
	transcript := t.TempDir() + "/codex-session.jsonl"
	data := `{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":120,"cached_input_tokens":40,"output_tokens":8}}}}` + "\n"
	if err := os.WriteFile(transcript, []byte(data), 0o600); err != nil {
		t.Fatalf("write transcript: %v", err)
	}

	repo, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	if err := repo.UpsertSession(
		"s1", "codex", "gpt-5.4", "startup", "/tmp", transcript, time.Now().UTC().Format(time.RFC3339), "", domain.SessionUsage{},
	); err != nil {
		t.Fatalf("UpsertSession: %v", err)
	}

	svc := service.New(repo)
	stats, err := svc.GetDashboardStats("", "")
	if err != nil {
		t.Fatalf("GetDashboardStats: %v", err)
	}

	if stats.TotalInputTokens != 120 {
		t.Fatalf("total input tokens = %d, want 120", stats.TotalInputTokens)
	}
	if stats.TotalOutputTokens != 8 {
		t.Fatalf("total output tokens = %d, want 8", stats.TotalOutputTokens)
	}
	if len(stats.AgentUsage) != 1 {
		t.Fatalf("agent usage len = %d, want 1", len(stats.AgentUsage))
	}
	if stats.AgentUsage[0].Agent != "codex" ||
		stats.AgentUsage[0].Input != 120 ||
		stats.AgentUsage[0].Output != 8 ||
		stats.AgentUsage[0].CacheRead != 40 ||
		stats.AgentUsage[0].CacheCreation != 0 {
		t.Fatalf("agent usage = %+v, want codex input=120 output=8 cache_read=40 cache_creation=0", stats.AgentUsage[0])
	}
}

func TestGetDashboardStatsIncludesClaudeCodeCacheTokensInAgentUsage(t *testing.T) {
	transcript := t.TempDir() + "/claude-session.jsonl"
	data := `{"type":"assistant","message":{"model":"claude-sonnet-4-6","usage":{"input_tokens":12,"output_tokens":3,"cache_creation_input_tokens":2,"cache_read_input_tokens":20}}}` + "\n"
	if err := os.WriteFile(transcript, []byte(data), 0o600); err != nil {
		t.Fatalf("write transcript: %v", err)
	}

	repo, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	if err := repo.UpsertSession(
		"s-cc", "claudecode", "claude-sonnet-4-6", "startup", "/tmp", transcript, time.Now().UTC().Format(time.RFC3339), "", domain.SessionUsage{},
	); err != nil {
		t.Fatalf("UpsertSession: %v", err)
	}

	svc := service.New(repo)
	stats, err := svc.GetDashboardStats("", "")
	if err != nil {
		t.Fatalf("GetDashboardStats: %v", err)
	}
	if len(stats.AgentUsage) != 1 {
		t.Fatalf("agent usage len = %d, want 1", len(stats.AgentUsage))
	}
	got := stats.AgentUsage[0]
	if got.Agent != "claudecode" ||
		got.Model != "claude-sonnet-4-6" ||
		got.Input != 12 ||
		got.Output != 3 ||
		got.CacheCreation != 2 ||
		got.CacheRead != 20 {
		t.Fatalf("agent usage = %+v, want claudecode model=claude-sonnet-4-6 input=12 output=3 cache_creation=2 cache_read=20", got)
	}
}

func TestGetDashboardStatsReturnsSessionUsageBreakdown(t *testing.T) {
	transcript := t.TempDir() + "/codex-switch-session.jsonl"
	data := "" +
		`{"type":"turn_context","payload":{"model":"gpt-5.5"}}` + "\n" +
		`{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"cached_input_tokens":4,"output_tokens":2}}}}` + "\n" +
		`{"type":"turn_context","payload":{"model":"gpt-5.4"}}` + "\n" +
		`{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":25,"cached_input_tokens":10,"output_tokens":5}}}}` + "\n"
	if err := os.WriteFile(transcript, []byte(data), 0o600); err != nil {
		t.Fatalf("write transcript: %v", err)
	}

	repo, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	if err := repo.UpsertSession(
		"s1", "codex", "gpt-5.4", "startup", "/tmp", transcript, time.Now().UTC().Format(time.RFC3339), "", domain.SessionUsage{},
	); err != nil {
		t.Fatalf("UpsertSession: %v", err)
	}

	svc := service.New(repo)
	stats, err := svc.GetDashboardStats("", "")
	if err != nil {
		t.Fatalf("GetDashboardStats: %v", err)
	}

	if len(stats.SessionUsage) != 1 {
		t.Fatalf("session usage len = %d, want 1", len(stats.SessionUsage))
	}
	sessionUsage := stats.SessionUsage[0]
	if sessionUsage.SessionID != "s1" || sessionUsage.Agent != "codex" || sessionUsage.Provider != "openai" {
		t.Fatalf("session usage = %+v, want session_id=s1 agent=codex provider=openai", sessionUsage)
	}
	if sessionUsage.Input != 25 || sessionUsage.Output != 5 {
		t.Fatalf("session usage totals = %+v, want input=25 output=5", sessionUsage)
	}
	if len(sessionUsage.Models) != 2 {
		t.Fatalf("session usage models len = %d, want 2", len(sessionUsage.Models))
	}

	if len(stats.AgentUsage) != 2 {
		t.Fatalf("agent usage len = %d, want 2", len(stats.AgentUsage))
	}
}

func TestGetDashboardStatsIncludesOffsetSessionInsideUTCRange(t *testing.T) {
	repo, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	usage := domain.SessionUsage{
		InputTokens:     100,
		OutputTokens:    10,
		CacheReadTokens: 50,
		Turns:           1,
	}
	if err := repo.UpsertSession(
		"codex-offset",
		"codex",
		"gpt-5.5",
		"startup",
		"/tmp",
		"",
		"2026-05-14T21:00:34+07:00", // 2026-05-14T14:00:34Z
		"",
		usage,
	); err != nil {
		t.Fatalf("UpsertSession: %v", err)
	}

	svc := service.New(repo)
	stats, err := svc.GetDashboardStats("2026-05-14T00:00:00Z", "2026-05-14T16:59:59Z")
	if err != nil {
		t.Fatalf("GetDashboardStats: %v", err)
	}

	if len(stats.AgentUsage) != 1 {
		t.Fatalf("agent usage len = %d, want 1", len(stats.AgentUsage))
	}
	got := stats.AgentUsage[0]
	if got.Agent != "codex" || got.Model != "gpt-5.5" || got.Input != 100 || got.Output != 10 || got.CacheRead != 50 {
		t.Fatalf("agent usage = %+v, want codex gpt-5.5 tokens", got)
	}
	if len(stats.SessionUsage) != 1 || stats.SessionUsage[0].SessionID != "codex-offset" {
		t.Fatalf("session usage = %+v, want codex-offset", stats.SessionUsage)
	}
}

func TestSubscribeReceivesNewEvents(t *testing.T) {
	svc := service.New(&mockRepo{})

	ch := svc.Subscribe()
	defer svc.Unsubscribe(ch)

	go func() {
		_ = svc.AddEvent(domain.NormalizedEvent{
			Agent:         "claudecode",
			Session:       "s1",
			HookEventName: "PreToolUse",
			Action:        "EDIT",
			Path:          "/tmp/x.go",
		})
	}()

	select {
	case e := <-ch:
		if e.Path != "/tmp/x.go" {
			t.Fatalf("Path = %q, want /tmp/x.go", e.Path)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for event")
	}
}

func TestUnsubscribeClosesChannel(t *testing.T) {
	svc := service.New(&mockRepo{})

	ch := svc.Subscribe()
	svc.Unsubscribe(ch)

	select {
	case _, ok := <-ch:
		if ok {
			t.Fatal("expected closed channel")
		}
	default:
		t.Fatal("channel not closed after Unsubscribe")
	}
}

func TestDiagnosticsCache(t *testing.T) {
	repo := &mockRepo{}
	svc := service.New(repo)
	opts := service.DiagnosticsOptions{DBPath: ":memory:"}

	_, err := svc.DiagnosticsWithOptions(opts, true)
	if err != nil {
		t.Fatalf("first call: %v", err)
	}
	repo.mu.Lock()
	firstCalls := repo.diagnosticsCalls
	repo.mu.Unlock()

	_, err = svc.DiagnosticsWithOptions(opts, true)
	if err != nil {
		t.Fatalf("second call: %v", err)
	}
	repo.mu.Lock()
	secondCalls := repo.diagnosticsCalls
	repo.mu.Unlock()

	if secondCalls != firstCalls {
		t.Errorf("expected cache hit on second call: diagnosticsCalls=%d, want %d", secondCalls, firstCalls)
	}
}

func TestDiagnosticsCacheTTL(t *testing.T) {
	repo := &mockRepo{}
	svc := service.New(repo)
	opts := service.DiagnosticsOptions{DBPath: ":memory:"}

	// First call — populates cache
	if _, err := svc.DiagnosticsWithOptions(opts, true); err != nil {
		t.Fatalf("first call: %v", err)
	}

	// Artificially expire the cache by setting diagCachedAt 31s in the past
	svc.SetDiagCachedAt(time.Now().Add(-31 * time.Second))

	repo.mu.Lock()
	callsBefore := repo.diagnosticsCalls
	repo.mu.Unlock()

	// Second call after TTL — must hit repo again
	if _, err := svc.DiagnosticsWithOptions(opts, true); err != nil {
		t.Fatalf("second call: %v", err)
	}

	repo.mu.Lock()
	callsAfter := repo.diagnosticsCalls
	repo.mu.Unlock()

	if callsAfter <= callsBefore {
		t.Errorf("expected cache miss after TTL: diagnosticsCalls=%d, want >%d", callsAfter, callsBefore)
	}
}
