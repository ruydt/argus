package service_test

import (
	"context"
	"errors"
	"io"
	"os"
	"sync"
	"testing"
	"time"

	"hooker/internal/domain"
	"hooker/internal/repository/sqlite"
	"hooker/internal/service"
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

func (m *mockRepo) GetSessionTree(_ string) ([]domain.SessionTreeNode, error) {
	return nil, nil
}

func (m *mockRepo) GetTraces(sessionID, since string) ([]domain.NormalizedEvent, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var filtered []domain.NormalizedEvent
	for _, event := range m.events {
		if sessionID != "" && event.Session != sessionID {
			continue
		}
		if since != "" && event.Time < since {
			continue
		}
		filtered = append(filtered, event)
	}
	return filtered, nil
}

func (m *mockRepo) ListSessionsByCWDPage(_ string, _ string, _ int, _ int) ([]domain.Session, int, error) {
	return nil, 0, nil
}

func (m *mockRepo) GetTracesPage(_ string, _ string, _ int, _ int) ([]domain.NormalizedEvent, int, error) {
	return nil, 0, nil
}

func (m *mockRepo) GetFileChanges(string) ([]domain.FileChangeGroup, error) { return nil, nil }

func (m *mockRepo) GetSessionFileChangeCounts([]string) (map[string]int, error) {
	return map[string]int{}, nil
}

func (m *mockRepo) ExportEvents(_ context.Context, _ io.Writer) error { return nil }

func (m *mockRepo) ExportSnapshot(_ context.Context, _ string) error { return nil }

func (m *mockRepo) Ready() bool { return true }

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
