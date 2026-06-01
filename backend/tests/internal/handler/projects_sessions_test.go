package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"hooker/internal/domain"
	"hooker/internal/handler"
)

func TestProjectsHandlerReturnsProjectSummary(t *testing.T) {
	svc := newTestService(t)
	addHandlerEvent(t, svc, domain.NormalizedEvent{
		Time:          "2026-05-14T10:00:00Z",
		Agent:         "codex",
		Session:       "s1",
		CWD:           "/work/hooker",
		HookEventName: "SessionStart",
	})

	h := handler.Projects(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	var payload struct {
		Projects []domain.Project `json:"projects"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.Projects) != 1 {
		t.Fatalf("projects len = %d, want 1", len(payload.Projects))
	}
	if payload.Projects[0].Name != "hooker" || payload.Projects[0].CWD != "/work/hooker" {
		t.Fatalf("project = %+v, want hooker cwd", payload.Projects[0])
	}
}

func TestSessionsHandlerFiltersByCWDQuery(t *testing.T) {
	svc := newTestService(t)
	addHandlerEvent(t, svc, domain.NormalizedEvent{
		Time:          "2026-05-14T10:00:00Z",
		Agent:         "codex",
		Session:       "target",
		CWD:           "/work/hooker",
		HookEventName: "SessionStart",
	})
	addHandlerEvent(t, svc, domain.NormalizedEvent{
		Time:          "2026-05-14T11:00:00Z",
		Agent:         "codex",
		Session:       "other",
		CWD:           "/work/other",
		HookEventName: "SessionStart",
	})

	h := handler.Sessions(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/sessions?cwd="+url.QueryEscape("/work/hooker"), nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	var sessions []domain.Session
	if err := json.Unmarshal(rec.Body.Bytes(), &sessions); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("sessions len = %d, want 1", len(sessions))
	}
	if sessions[0].SessionID != "target" {
		t.Fatalf("session_id = %q, want target", sessions[0].SessionID)
	}
}

func addHandlerEvent(t *testing.T, svc interface {
	AddEvent(domain.NormalizedEvent) error
}, e domain.NormalizedEvent) {
	t.Helper()
	e.RawPayload = []byte(`{}`)
	if err := svc.AddEvent(e); err != nil {
		t.Fatalf("AddEvent: %v", err)
	}
}
