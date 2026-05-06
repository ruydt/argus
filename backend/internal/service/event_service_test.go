package service_test

import (
	"errors"
	"sync"
	"testing"
	"time"

	"agent-monitor/internal/domain"
	"agent-monitor/internal/service"
)

type mockRepo struct {
	mu        sync.Mutex
	events    []domain.NormalizedEvent
	models    map[string]string
	addErr    error
	upsertErr error
	upserts   int
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

func (m *mockRepo) SessionModel(sessionID string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.models == nil {
		return "", nil
	}
	return m.models[sessionID], nil
}

func (m *mockRepo) UpsertSession(sessionID, agent, model, source, cwd, transcriptPath string) error {
	if m.upsertErr != nil {
		return m.upsertErr
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.models == nil {
		m.models = map[string]string{}
	}
	m.upserts++
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
