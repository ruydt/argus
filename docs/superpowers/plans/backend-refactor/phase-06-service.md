# Phase 6 — Service Layer + SSE Broadcaster

> **Status:** ⬜ Pending — update STATUS.md to ✅ when done

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

**Repo:** `/Users/duytran/GitHub/codex-test` | **Backend:** `backend/` | **Module:** `agent-monitor` | **Go:** 1.23

**Goal:** `EventService` owns: persist events, track session models, propagate repository errors, broadcast new events to SSE subscribers. Tested with a hand-written mock repo (no mockgen needed).

**Depends on:** Phase 1 (domain), Phase 4 (repository interface)

**Next phase:** [phase-07-agent-adapters.md](phase-07-agent-adapters.md)

---

## Files

| Action | Path |
|--------|------|
| Create | `backend/internal/service/event_service.go` |
| Create | `backend/internal/service/event_service_test.go` |

---

## Steps

- [ ] **Step 1: Write the failing tests**

```go
// backend/internal/service/event_service_test.go
package service_test

import (
	"errors"
	"sync"
	"testing"
	"time"

	"agent-monitor/internal/domain"
	"agent-monitor/internal/service"
)

// mockRepo is a hand-written test double for repository.EventRepository.
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

func TestAddEvent_persists(t *testing.T) {
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

	events, _ := svc.ListEvents(10)
	if len(events) != 1 {
		t.Fatalf("got %d events, want 1", len(events))
	}
}

func TestAddEvent_setsTime(t *testing.T) {
	svc := service.New(&mockRepo{})

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

func TestAddEvent_upsertsSessionModel(t *testing.T) {
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
		t.Errorf("model = %q, want claude-opus-4-1", model)
	}
}

func TestAddEvent_returnsUpsertError(t *testing.T) {
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

func TestSubscribe_receivesNewEvents(t *testing.T) {
	svc := service.New(&mockRepo{})

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

func TestUnsubscribe_closesChannel(t *testing.T) {
	svc := service.New(&mockRepo{})

	ch := svc.Subscribe()
	svc.Unsubscribe(ch)

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
		if err := s.repo.UpsertSession(e.Session, e.Agent, e.Model, e.Source, e.CWD, e.TranscriptPath); err != nil {
			return err
		}
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

- [ ] **Step 6: Mark complete — update STATUS.md phase 6 to ✅**
