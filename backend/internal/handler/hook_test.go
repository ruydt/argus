package handler_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"agent-monitor/internal/handler"
	"agent-monitor/internal/repository/sqlite"
	"agent-monitor/internal/service"
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
