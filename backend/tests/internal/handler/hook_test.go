package handler_test

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"hooker/internal/handler"
	"hooker/internal/repository/sqlite"
	"hooker/internal/service"
)

func newTestService(t *testing.T) *service.EventService {
	t.Helper()
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	return service.New(db)
}

func TestHookHandlerRejectsGET(t *testing.T) {
	h := handler.Hook(newTestService(t))
	req := httptest.NewRequest(http.MethodGet, "/api/hook", nil)
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestHookHandlerAcceptsValidPayload(t *testing.T) {
	h := handler.Hook(newTestService(t))

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
	h := handler.Hook(newTestService(t))
	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader([]byte(`not json`)))
	rec := httptest.NewRecorder()

	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHookHandlerStoresEventWithoutPath(t *testing.T) {
	svc := newTestService(t)
	h := handler.Hook(svc)

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
	h := handler.Hook(svc)

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
	h := handler.Hook(svc)

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
	h := handler.Hook(svc)

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

	h := handler.Hook(service.New(db))
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
