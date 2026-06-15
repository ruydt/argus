package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"argus/internal/domain"
	"argus/internal/handler"
)

func TestEventsHandlerSessionQueryReturnsOldSessionEvents(t *testing.T) {
	svc := newTestService(t)

	targetSession := "target-session"
	for i := 0; i < 3; i++ {
		if err := svc.AddEvent(domain.NormalizedEvent{
			Time:          time.Now().UTC().Add(time.Duration(i) * time.Second).Format(time.RFC3339),
			Agent:         "codex",
			Session:       targetSession,
			HookEventName: "PreToolUse",
			Action:        "READ",
			Path:          "/tmp/target",
			RawPayload:    []byte(`{}`),
		}); err != nil {
			t.Fatalf("AddEvent target: %v", err)
		}
	}

	for i := 0; i < 1200; i++ {
		if err := svc.AddEvent(domain.NormalizedEvent{
			Time:          time.Now().UTC().Add(time.Duration(10+i) * time.Second).Format(time.RFC3339),
			Agent:         "codex",
			Session:       "other-session",
			HookEventName: "PreToolUse",
			Action:        "READ",
			Path:          "/tmp/other",
			RawPayload:    []byte(`{}`),
		}); err != nil {
			t.Fatalf("AddEvent other: %v", err)
		}
	}

	h := handler.Events(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/events?session="+targetSession, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var payload struct {
		Events []domain.NormalizedEvent `json:"events"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if len(payload.Events) != 3 {
		t.Fatalf("events len = %d, want 3", len(payload.Events))
	}
	for _, e := range payload.Events {
		if e.Session != targetSession {
			t.Fatalf("session = %q, want %q", e.Session, targetSession)
		}
	}
}

func TestEventsHandlerSearchIgnoresTimeWindow(t *testing.T) {
	svc := newTestService(t)
	old := time.Now().UTC().Add(-48 * time.Hour).Format(time.RFC3339)
	if err := svc.AddEvent(domain.NormalizedEvent{
		Time: old, Agent: "codex", Session: "needle-session", CWD: "/work/needle-project",
		HookEventName: "SessionStart", RawPayload: []byte(`{}`),
	}); err != nil {
		t.Fatalf("AddEvent target: %v", err)
	}
	if err := svc.AddEvent(domain.NormalizedEvent{
		Time: old, Agent: "codex", Session: "other-session", CWD: "/work/other",
		HookEventName: "SessionStart", RawPayload: []byte(`{}`),
	}); err != nil {
		t.Fatalf("AddEvent other: %v", err)
	}

	future := time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339)
	h := handler.Events(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/events?since="+future+"&q=needle-project", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var payload struct {
		Events []domain.NormalizedEvent `json:"events"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.Events) != 1 {
		t.Fatalf("events len = %d, want 1", len(payload.Events))
	}
	if payload.Events[0].Session != "needle-session" {
		t.Fatalf("session = %q, want needle-session", payload.Events[0].Session)
	}
}

func TestEventsHandlerSessionQueryIsBounded(t *testing.T) {
	svc := newTestService(t)
	base := time.Now().UTC()
	sessionID := "heavy-session"

	for i := 0; i < 6000; i++ {
		if err := svc.AddEvent(domain.NormalizedEvent{
			Time:          base.Add(time.Duration(i) * time.Second).Format(time.RFC3339),
			Agent:         "codex",
			Session:       sessionID,
			HookEventName: "PreToolUse",
			Action:        "READ",
			Path:          fmt.Sprintf("/tmp/%04d", i),
			RawPayload:    []byte(`{}`),
		}); err != nil {
			t.Fatalf("AddEvent: %v", err)
		}
	}

	h := handler.Events(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/events?session="+sessionID, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var payload struct {
		Events []domain.NormalizedEvent `json:"events"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if len(payload.Events) != 5000 {
		t.Fatalf("events len = %d, want 5000", len(payload.Events))
	}
	if payload.Events[0].Path != "/tmp/1000" {
		t.Fatalf("first path = %q, want /tmp/1000", payload.Events[0].Path)
	}
	if payload.Events[len(payload.Events)-1].Path != "/tmp/5999" {
		t.Fatalf("last path = %q, want /tmp/5999", payload.Events[len(payload.Events)-1].Path)
	}
}

func TestEventRawPayloadHandler_returnsPayload(t *testing.T) {
	svc := newTestService(t)
	e := domain.NormalizedEvent{
		Time:          "2026-01-01T00:00:00Z",
		Agent:         "claudecode",
		Session:       "sess-raw",
		HookEventName: "PreToolUse",
		TurnID:        "t1",
		ToolUseID:     "u1",
		RawPayload:    []byte(`{"tool":"Bash","input":"echo hi"}`),
	}
	if err := svc.AddEvent(e); err != nil {
		t.Fatalf("AddEvent: %v", err)
	}

	events, err := svc.ListEvents(10)
	if err != nil || len(events) == 0 {
		t.Fatalf("ListEvents: %v, len=%d", err, len(events))
	}
	key := events[0].DedupKey
	if key == "" {
		t.Fatal("DedupKey empty")
	}

	h := handler.EventRawPayload(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/events/raw?key="+key, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		RawPayload map[string]any `json:"raw_payload"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.RawPayload["tool"] != "Bash" {
		t.Errorf("tool = %v, want Bash", resp.RawPayload["tool"])
	}
}

func TestEventRawPayloadHandler_missingKeyReturns400(t *testing.T) {
	h := handler.EventRawPayload(newTestService(t))
	req := httptest.NewRequest(http.MethodGet, "/api/events/raw", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestEventRawPayloadHandler_unknownKeyReturns404(t *testing.T) {
	h := handler.EventRawPayload(newTestService(t))
	req := httptest.NewRequest(http.MethodGet, "/api/events/raw?key=doesnotexist", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestEventsHandler_timeRangeParams(t *testing.T) {
	svc := newTestService(t)

	base := time.Now().UTC()
	for i := 0; i < 5; i++ {
		if err := svc.AddEvent(domain.NormalizedEvent{
			Time:          base.Add(time.Duration(i) * time.Hour).Format(time.RFC3339),
			Agent:         "codex",
			Session:       "s1",
			HookEventName: "PreToolUse",
			Action:        "READ",
			Path:          "/tmp/f",
			RawPayload:    []byte(`{}`),
		}); err != nil {
			t.Fatalf("AddEvent: %v", err)
		}
	}

	since := base.Add(2 * time.Hour).Format(time.RFC3339)
	h := handler.Events(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/events?since="+since, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var payload struct {
		Events  []domain.NormalizedEvent `json:"events"`
		HasMore bool                     `json:"has_more"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// events at +2h, +3h, +4h = 3 events
	if len(payload.Events) != 3 {
		t.Errorf("got %d events, want 3", len(payload.Events))
	}
}

func TestEventsHandler_backwardCompat(t *testing.T) {
	svc := newTestService(t)

	// Insert fewer than defaultEventsLimit events.
	for i := 0; i < 5; i++ {
		if err := svc.AddEvent(domain.NormalizedEvent{
			Time:          time.Now().UTC().Add(time.Duration(i) * time.Second).Format(time.RFC3339),
			Agent:         "codex",
			Session:       "s1",
			HookEventName: "PreToolUse",
			Action:        "READ",
			Path:          "/tmp/f",
			RawPayload:    []byte(`{}`),
		}); err != nil {
			t.Fatalf("AddEvent: %v", err)
		}
	}

	h := handler.Events(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/events", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var payload struct {
		Events  []domain.NormalizedEvent `json:"events"`
		HasMore bool                     `json:"has_more"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(payload.Events) != 5 {
		t.Errorf("got %d events, want 5", len(payload.Events))
	}
	if payload.HasMore {
		t.Error("has_more = true, want false")
	}
}

func TestEventsHandler_limitClamped(t *testing.T) {
	svc := newTestService(t)

	h := handler.Events(svc)
	// Request limit=9999, should be clamped to 500.
	req := httptest.NewRequest(http.MethodGet, "/api/events?limit=9999", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

func TestEventsStream_backfillHonorsTimeRange(t *testing.T) {
	svc := newTestService(t)
	base := time.Now().UTC().Add(-2 * time.Hour)

	oldEvent := domain.NormalizedEvent{
		Time:          base.Format(time.RFC3339),
		Agent:         "codex",
		Session:       "old-session",
		HookEventName: "PreToolUse",
		Action:        "READ",
		Path:          "/tmp/old",
		RawPayload:    []byte(`{}`),
	}
	recentEvent := domain.NormalizedEvent{
		Time:          base.Add(90 * time.Minute).Format(time.RFC3339),
		Agent:         "codex",
		Session:       "recent-session",
		HookEventName: "PreToolUse",
		Action:        "READ",
		Path:          "/tmp/recent",
		RawPayload:    []byte(`{}`),
	}

	if err := svc.AddEvent(oldEvent); err != nil {
		t.Fatalf("AddEvent old: %v", err)
	}
	if err := svc.AddEvent(recentEvent); err != nil {
		t.Fatalf("AddEvent recent: %v", err)
	}

	h := handler.EventsStream(svc)
	since := base.Add(60 * time.Minute).Format(time.RFC3339)
	ctx, cancel := context.WithCancel(context.Background())
	req := httptest.NewRequest(http.MethodGet, "/api/events/stream?since="+since, nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	done := make(chan struct{})
	go func() {
		h.ServeHTTP(rec, req)
		close(done)
	}()

	time.Sleep(20 * time.Millisecond)
	cancel()

	select {
	case <-done:
	case <-time.After(1 * time.Second):
		t.Fatal("stream handler did not exit after context cancel")
	}

	body := rec.Body.String()
	if !strings.Contains(body, "recent-session") {
		t.Fatalf("expected recent session in SSE backfill, body = %q", body)
	}
	if strings.Contains(body, "old-session") {
		t.Fatalf("expected old session to be excluded from SSE backfill, body = %q", body)
	}
}
