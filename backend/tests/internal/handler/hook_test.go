package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"hooker/internal/domain"
	"hooker/internal/handler"
	"hooker/internal/notify"
	"hooker/internal/repository/sqlite"
	"hooker/internal/service"
)

// matchAllMatcher implements handler.IgnoreMatcher and matches every event.
type matchAllMatcher struct{}

func (matchAllMatcher) MatchEvent(_ domain.NormalizedEvent) (bool, string) {
	return true, "pattern \"**\" (line 1)"
}

// matchNoneMatcher implements handler.IgnoreMatcher and matches no event.
type matchNoneMatcher struct{}

func (matchNoneMatcher) MatchEvent(_ domain.NormalizedEvent) (bool, string) {
	return false, ""
}

type mockNotifier struct {
	decision notify.Decision
	err      error
	called   bool
}

func (m *mockNotifier) ShowPermissionDialog(_ context.Context, _ domain.NormalizedEvent) (notify.Decision, error) {
	m.called = true
	return m.decision, m.err
}

func newHookWithNotifier(svc *service.EventService, notifier notify.Notifier) http.Handler {
	return handler.Hook(svc, matchNoneMatcher{}, notifier)
}

func newTestService(t *testing.T) *service.EventService {
	t.Helper()
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	return service.New(db)
}

// newHook creates a hook handler with the allow-none (matchNoneMatcher) matcher,
// matching normal production behaviour where no events are ignored by default.
func newHook(svc *service.EventService) http.Handler {
	return handler.Hook(svc, matchNoneMatcher{}, nil)
}

func TestHookHandlerRejectsGET(t *testing.T) {
	h := newHook(newTestService(t))
	req := httptest.NewRequest(http.MethodGet, "/api/hook", nil)
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestHookHandlerAcceptsValidPayload(t *testing.T) {
	h := newHook(newTestService(t))

	body := []byte(`{
		"session_id": "s1",
		"transcript_path": "/home/user/.claude/sessions/abc.jsonl",
		"hook_event_name": "PreToolUse",
		"tool_name": "Edit",
		"tool_use_id": "tu1",
		"turn_id": "t1",
		"cwd": "/tmp",
		"tool_input": {"file_path": "foo.go"}
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
}

func TestHookHandlerRejectsBadJSON(t *testing.T) {
	h := newHook(newTestService(t))
	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader([]byte(`not json`)))
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHookHandlerStoresEventWithoutPath(t *testing.T) {
	svc := newTestService(t)
	h := newHook(svc)

	body := []byte(`{
		"session_id": "s2",
		"transcript_path": "/tmp/codex-session.jsonl",
		"hook_event_name": "SessionStart",
		"tool_name": "SessionStart",
		"tool_use_id": "tu2",
		"turn_id": "t2",
		"cwd": "/tmp"
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events len = %d, want 1", len(events))
	}
	if events[0].HookEventName != "SessionStart" {
		t.Fatalf("hook_event_name = %q, want SessionStart", events[0].HookEventName)
	}
}

func TestHookHandlerAcceptsDegradedPayload(t *testing.T) {
	svc := newTestService(t)
	h := newHook(svc)

	// Valid JSON but no fields that any agent's Normalize() recognises fully —
	// passes json.Unmarshal for meta but results in a degraded store.
	// We use a valid JSON object with unusual top-level fields to trigger
	// the degraded path after the current "if err != nil → 400" is replaced.
	body := []byte(`{"unknown_field":"some_value","another_field":42}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	// Must be 200, not 400 — degraded payloads are stored, not rejected
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (degraded accept); body: %s", rec.Code, rec.Body.String())
	}

	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events len = %d, want 1 (degraded event stored)", len(events))
	}
	if events[0].NormalizationStatus != "degraded" {
		t.Fatalf("normalization_status = %q, want degraded", events[0].NormalizationStatus)
	}
	if events[0].Agent != "unknown" {
		t.Fatalf("agent = %q, want unknown", events[0].Agent)
	}
}

func TestHookHandlerTwoDifferentDegradedPayloadsStoredDistinctly(t *testing.T) {
	svc := newTestService(t)
	h := newHook(svc)

	body1 := []byte(`{"unknown_field":"value_one"}`)
	body2 := []byte(`{"unknown_field":"value_two"}`)

	for _, body := range [][]byte{body1, body2} {
		req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
		}
	}

	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 2 {
		t.Fatalf("events len = %d, want 2 (two distinct degraded payloads)", len(events))
	}
}

func TestHookHandlerValidPayloadHasNormalizationStatusOK(t *testing.T) {
	svc := newTestService(t)
	h := newHook(svc)

	body := []byte(`{
		"session_id": "s-ok",
		"transcript_path": "/home/user/.claude/sessions/abc.jsonl",
		"hook_event_name": "PreToolUse",
		"tool_name": "Edit",
		"tool_use_id": "tu-ok",
		"turn_id": "t-ok",
		"cwd": "/tmp",
		"tool_input": {"file_path": "foo.go"}
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events len = %d, want 1", len(events))
	}
	if events[0].NormalizationStatus != "ok" {
		t.Fatalf("normalization_status = %q, want ok", events[0].NormalizationStatus)
	}
	if events[0].NormalizerVersion != "claudecode/1" {
		t.Fatalf("normalizer_version = %q, want claudecode/1", events[0].NormalizerVersion)
	}
}

func TestHookHandlerAcknowledgesWhenStoreIsTemporarilyLocked(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "hooker-test.db")
	db, err := sqlite.New(dbPath)
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	conn, err := db.RawDB().Conn(context.Background())
	if err != nil {
		t.Fatalf("conn: %v", err)
	}
	defer func() { _ = conn.Close() }()
	if _, err := conn.ExecContext(context.Background(), `BEGIN IMMEDIATE`); err != nil {
		t.Fatalf("begin lock: %v", err)
	}
	defer func() {
		_, _ = conn.ExecContext(context.Background(), `ROLLBACK`)
	}()

	h := handler.Hook(service.New(db), matchNoneMatcher{}, nil)
	body := []byte(`{
		"session_id": "s-locked",
		"hook_event_name": "PreToolUse",
		"tool_name": "Bash",
		"tool_input": {"command": "true"}
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	start := time.Now()
	h.ServeHTTP(rec, req)
	elapsed := time.Since(start)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want 202; body: %s", rec.Code, rec.Body.String())
	}
	if elapsed >= 2*time.Second {
		t.Fatalf("handler returned after %s, want before hook timeout", elapsed)
	}
}

// TestHookIgnoredEventReturns200 verifies a matched (ignored) event returns HTTP 200
// with an empty JSON body {} (D-03).
func TestHookIgnoredEventReturns200(t *testing.T) {
	svc := newTestService(t)
	h := handler.Hook(svc, matchAllMatcher{}, nil)

	body := []byte(`{
		"session_id": "s-ignored",
		"transcript_path": "/home/user/.claude/sessions/abc.jsonl",
		"hook_event_name": "PreToolUse",
		"tool_name": "Edit",
		"cwd": "/secret/project",
		"tool_input": {"file_path": "main.go"}
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 for ignored event; body: %s", rec.Code, rec.Body.String())
	}
	if got := rec.Body.String(); got != "{}" {
		t.Fatalf("body = %q, want {}", got)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
}

// TestHookIgnoredEventStoresNoRows verifies a matched event produces no DB row (D-03).
func TestHookIgnoredEventStoresNoRows(t *testing.T) {
	svc := newTestService(t)
	h := handler.Hook(svc, matchAllMatcher{}, nil)

	body := []byte(`{
		"session_id": "s-ignored-db",
		"transcript_path": "/home/user/.claude/sessions/abc.jsonl",
		"hook_event_name": "PreToolUse",
		"tool_name": "Edit",
		"cwd": "/secret/project",
		"tool_input": {"file_path": "main.go"}
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 0 {
		t.Fatalf("events len = %d, want 0 — ignored event must not be stored", len(events))
	}
}

// TestHookIgnoredEventNoSSEBroadcast verifies a matched event sends nothing to
// an existing subscriber channel (D-03).
func TestHookIgnoredEventNoSSEBroadcast(t *testing.T) {
	svc := newTestService(t)

	// Subscribe BEFORE the POST to ensure the channel is registered.
	ch := svc.Subscribe()
	defer svc.Unsubscribe(ch)

	h := handler.Hook(svc, matchAllMatcher{}, nil)

	body := []byte(`{
		"session_id": "s-ignored-sse",
		"transcript_path": "/home/user/.claude/sessions/abc.jsonl",
		"hook_event_name": "PreToolUse",
		"tool_name": "Edit",
		"cwd": "/secret/project",
		"tool_input": {"file_path": "main.go"}
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	// No event should arrive on the subscriber channel.
	select {
	case e := <-ch:
		t.Fatalf("received unexpected SSE event for ignored hook: agent=%q session=%q", e.Agent, e.Session)
	case <-time.After(50 * time.Millisecond):
		// Pass: no broadcast received.
	}
}

func TestHookHandlerCapturesAskUserQuestionFields(t *testing.T) {
	svc := newTestService(t)
	h := newHook(svc)

	body := []byte(`{
		"session_id": "s-ask",
		"transcript_path": "/home/user/.claude/sessions/ask.jsonl",
		"hook_event_name": "PermissionRequest",
		"tool_name": "AskUserQuestion",
		"tool_use_id": "tu-ask",
		"turn_id": "t-ask",
		"cwd": "/tmp",
		"tool_input": {
			"questions": [
				{
					"question": "What do you mean by 'not live'?",
					"header": "Clarify issue",
					"options": [
						{"label": "Old session", "description": "Session is from hours/days ago"},
						{"label": "Session ended", "description": "Session finished recently"}
					],
					"multiSelect": false
				}
			]
		},
		"permission_suggestions": [
			{
				"type": "addRules",
				"rules": [{"toolName": "Bash", "ruleContent": "xargs cat"}],
				"behavior": "allow",
				"destination": "localSettings"
			}
		]
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events len = %d, want 1", len(events))
	}

	e := events[0]
	if e.ToolInputQuestionsJSON == "" {
		t.Error("ToolInputQuestionsJSON is empty, want non-empty")
	}
	var questions []struct {
		Question string `json:"question"`
		Header   string `json:"header"`
	}
	if err := json.Unmarshal([]byte(e.ToolInputQuestionsJSON), &questions); err != nil {
		t.Fatalf("ToolInputQuestionsJSON is not valid JSON: %v", err)
	}
	if len(questions) != 1 {
		t.Fatalf("questions len = %d, want 1", len(questions))
	}
	if questions[0].Header != "Clarify issue" {
		t.Errorf("header = %q, want %q", questions[0].Header, "Clarify issue")
	}

	if e.PermissionSuggestionsJSON == "" {
		t.Error("PermissionSuggestionsJSON is empty, want non-empty")
	}
	var suggestions []struct {
		Behavior    string `json:"behavior"`
		Destination string `json:"destination"`
	}
	if err := json.Unmarshal([]byte(e.PermissionSuggestionsJSON), &suggestions); err != nil {
		t.Fatalf("PermissionSuggestionsJSON is not valid JSON: %v", err)
	}
	if len(suggestions) != 1 || suggestions[0].Behavior != "allow" {
		t.Errorf("suggestions = %v, want [{behavior:allow ...}]", suggestions)
	}
}

func TestHookHandlerEmptyFieldsWhenMissing(t *testing.T) {
	svc := newTestService(t)
	h := newHook(svc)

	body := []byte(`{
		"session_id": "s-plain",
		"transcript_path": "/home/user/.claude/sessions/plain.jsonl",
		"hook_event_name": "PreToolUse",
		"tool_name": "Bash",
		"tool_use_id": "tu-plain",
		"turn_id": "t-plain",
		"cwd": "/tmp",
		"tool_input": {"command": "ls -la", "description": "List files"}
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
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
		t.Fatalf("events len = %d, want 1", len(events))
	}
	e := events[0]
	if e.ToolInputQuestionsJSON != "" {
		t.Errorf("ToolInputQuestionsJSON = %q, want empty", e.ToolInputQuestionsJSON)
	}
	if e.PermissionSuggestionsJSON != "" {
		t.Errorf("PermissionSuggestionsJSON = %q, want empty", e.PermissionSuggestionsJSON)
	}
	if e.Description != "List files" {
		t.Errorf("Description = %q, want %q", e.Description, "List files")
	}
}

func TestHookHandlerPermissionRequestApprove(t *testing.T) {
	svc := newTestService(t)
	n := &mockNotifier{decision: notify.Decision{Action: "approve"}}
	h := newHookWithNotifier(svc, n)

	body := []byte(`{
		"session_id": "s-perm",
		"transcript_path": "/home/user/.claude/sessions/perm.jsonl",
		"hook_event_name": "PermissionRequest",
		"tool_name": "Bash",
		"cwd": "/tmp"
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var resp struct {
		HookSpecificOutput struct {
			HookEventName string `json:"hookEventName"`
			Decision      struct {
				Behavior string `json:"behavior"`
			} `json:"decision"`
		} `json:"hookSpecificOutput"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.HookSpecificOutput.Decision.Behavior != "allow" {
		t.Errorf("behavior = %q, want %q", resp.HookSpecificOutput.Decision.Behavior, "allow")
	}
	if resp.HookSpecificOutput.HookEventName != "PermissionRequest" {
		t.Errorf("hookEventName = %q, want %q", resp.HookSpecificOutput.HookEventName, "PermissionRequest")
	}
	if !n.called {
		t.Error("notifier was not called")
	}

	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 {
		t.Errorf("stored events = %d, want 1", len(events))
	}
}

func TestHookHandlerPermissionRequestBlock(t *testing.T) {
	svc := newTestService(t)
	n := &mockNotifier{decision: notify.Decision{Action: "block", Reason: "Denied via notification"}}
	h := newHookWithNotifier(svc, n)

	body := []byte(`{
		"session_id": "s-deny",
		"transcript_path": "/home/user/.claude/sessions/deny.jsonl",
		"hook_event_name": "PermissionRequest",
		"tool_name": "Write",
		"cwd": "/tmp"
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var resp struct {
		HookSpecificOutput struct {
			Decision struct {
				Behavior string `json:"behavior"`
				Message  string `json:"message"`
			} `json:"decision"`
		} `json:"hookSpecificOutput"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.HookSpecificOutput.Decision.Behavior != "deny" {
		t.Errorf("behavior = %q, want %q", resp.HookSpecificOutput.Decision.Behavior, "deny")
	}
	if resp.HookSpecificOutput.Decision.Message != "Denied via notification" {
		t.Errorf("message = %q, want %q", resp.HookSpecificOutput.Decision.Message, "Denied via notification")
	}
}

func TestHookHandlerPermissionRequestFallThrough(t *testing.T) {
	svc := newTestService(t)
	n := &mockNotifier{decision: notify.Decision{}}
	h := newHookWithNotifier(svc, n)

	body := []byte(`{
		"session_id": "s-timeout",
		"transcript_path": "/home/user/.claude/sessions/timeout.jsonl",
		"hook_event_name": "PermissionRequest",
		"tool_name": "Bash",
		"cwd": "/tmp"
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	body2 := rec.Body.Bytes()
	if string(bytes.TrimSpace(body2)) != "{}" {
		t.Errorf("body = %q, want %q", string(body2), "{}")
	}
}

func TestHookHandlerPermissionRequestNilNotifier(t *testing.T) {
	svc := newTestService(t)
	h := newHookWithNotifier(svc, nil)

	body := []byte(`{
		"session_id": "s-nil",
		"transcript_path": "/home/user/.claude/sessions/nil.jsonl",
		"hook_event_name": "PermissionRequest",
		"tool_name": "Bash",
		"cwd": "/tmp"
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if string(bytes.TrimSpace(rec.Body.Bytes())) != "{}" {
		t.Errorf("body = %q, want {}", rec.Body.String())
	}
}

func TestHookHandlerNonPermissionEventSkipsNotifier(t *testing.T) {
	svc := newTestService(t)
	n := &mockNotifier{decision: notify.Decision{Action: "approve"}}
	h := newHookWithNotifier(svc, n)

	body := []byte(`{
		"session_id": "s-bash",
		"transcript_path": "/home/user/.claude/sessions/bash.jsonl",
		"hook_event_name": "PreToolUse",
		"tool_name": "Bash",
		"cwd": "/tmp"
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if n.called {
		t.Error("notifier was called for non-PermissionRequest event, want not called")
	}
	if string(bytes.TrimSpace(rec.Body.Bytes())) != "{}" {
		t.Errorf("body = %q, want {}", rec.Body.String())
	}
}
