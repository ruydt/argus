package handler_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

// An explicit ?agent=<id> for a non-Claude/Codex agent routes through the
// generic normalizer and stamps that agent on the stored event.
func TestHookHandlerAgentParamStampsAgent(t *testing.T) {
	svc := newTestService(t)
	h := newHook(svc)

	body := `{"hook_event_name":"beforeShellExecution","conversation_id":"c1","tool_name":"Shell","cwd":"/x"}`
	req := httptest.NewRequest(http.MethodPost, "/api/hook?agent=cursor", bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events = %d, want 1", len(events))
	}
	if events[0].Agent != "cursor" {
		t.Errorf("Agent = %q, want cursor", events[0].Agent)
	}
	if events[0].HookEventName != "beforeShellExecution" {
		t.Errorf("HookEventName = %q", events[0].HookEventName)
	}
	if events[0].Session != "c1" {
		t.Errorf("Session = %q, want c1", events[0].Session)
	}
}

// An unknown ?agent= value is ignored and ingestion falls back to the existing
// transcript heuristic (Codex by default).
func TestHookHandlerUnknownAgentParamFallsBack(t *testing.T) {
	svc := newTestService(t)
	h := newHook(svc)

	body := `{"hook_event_name":"PreToolUse","session_id":"s1","tool_name":"shell"}`
	req := httptest.NewRequest(http.MethodPost, "/api/hook?agent=bogus", bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events = %d, want 1", len(events))
	}
	if events[0].Agent != "codex" {
		t.Errorf("Agent = %q, want codex (heuristic fallback)", events[0].Agent)
	}
	if events[0].HookEventName != "PreToolUse" {
		t.Errorf("HookEventName = %q", events[0].HookEventName)
	}
}
