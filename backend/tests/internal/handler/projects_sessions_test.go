package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"argus/internal/domain"
	"argus/internal/handler"
)

func TestProjectsHandlerReturnsProjectSummary(t *testing.T) {
	svc := newTestService(t)
	addHandlerEvent(t, svc, domain.NormalizedEvent{
		Time:          "2026-05-14T10:00:00Z",
		Agent:         "codex",
		Session:       "s1",
		CWD:           "/work/argus",
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
	if payload.Projects[0].Name != "argus" || payload.Projects[0].CWD != "/work/argus" {
		t.Fatalf("project = %+v, want argus cwd", payload.Projects[0])
	}
}

func TestProjectsHandlerPaginatesAndSearches(t *testing.T) {
	svc := newTestService(t)
	seeds := []struct {
		session, cwd, ts string
	}{
		{"a", "/work/alpha", "2026-05-14T10:00:00Z"},
		{"b", "/work/beta", "2026-05-14T11:00:00Z"},
		{"c", "/other/gamma", "2026-05-14T12:00:00Z"},
	}
	for _, s := range seeds {
		addHandlerEvent(t, svc, domain.NormalizedEvent{
			Time: s.ts, Agent: "codex", Session: s.session, CWD: s.cwd, HookEventName: "SessionStart",
		})
	}

	h := handler.Projects(svc)

	type pageResp struct {
		Projects []domain.Project `json:"projects"`
		Total    int              `json:"total"`
		HasMore  bool             `json:"has_more"`
	}
	get := func(query string) pageResp {
		t.Helper()
		req := httptest.NewRequest(http.MethodGet, "/api/projects"+query, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
		}
		var p pageResp
		if err := json.Unmarshal(rec.Body.Bytes(), &p); err != nil {
			t.Fatalf("decode: %v", err)
		}
		return p
	}

	// First page of size 2: most-recent two, has_more=true.
	page1 := get("?page=1&size=2")
	if page1.Total != 3 || !page1.HasMore || len(page1.Projects) != 2 {
		t.Fatalf("page1 = %+v, want total 3 hasMore true len 2", page1)
	}
	if page1.Projects[0].CWD != "/other/gamma" {
		t.Fatalf("page1[0] = %q, want /other/gamma", page1.Projects[0].CWD)
	}

	// Last page: one item, has_more=false.
	page2 := get("?page=2&size=2")
	if page2.HasMore || len(page2.Projects) != 1 {
		t.Fatalf("page2 = %+v, want hasMore false len 1", page2)
	}

	// Server-side search on cwd substring.
	search := get("?q=work")
	if search.Total != 2 || len(search.Projects) != 2 {
		t.Fatalf("search = %+v, want 2 matches", search)
	}
}

func TestSessionsHandlerFiltersByCWDQuery(t *testing.T) {
	svc := newTestService(t)
	addHandlerEvent(t, svc, domain.NormalizedEvent{
		Time:          "2026-05-14T10:00:00Z",
		Agent:         "codex",
		Session:       "target",
		CWD:           "/work/argus",
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
	req := httptest.NewRequest(http.MethodGet, "/api/sessions?cwd="+url.QueryEscape("/work/argus"), nil)
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

func TestProjectsHandlerDeleteRequiresCWD(t *testing.T) {
	svc := newTestService(t)
	h := handler.Projects(svc)

	req := httptest.NewRequest(http.MethodDelete, "/api/projects", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body: %s", rec.Code, rec.Body.String())
	}
}

func TestProjectsHandlerDeleteCascades(t *testing.T) {
	svc := newTestService(t)
	addHandlerEvent(t, svc, domain.NormalizedEvent{
		Time:          "2026-06-11T10:00:00Z",
		Agent:         "claudecode",
		Session:       "doomed",
		CWD:           "/work/doomed",
		HookEventName: "SessionStart",
	})
	addHandlerEvent(t, svc, domain.NormalizedEvent{
		Time:          "2026-06-11T10:05:00Z",
		Agent:         "claudecode",
		Session:       "survivor",
		CWD:           "/work/keep",
		HookEventName: "SessionStart",
	})

	h := handler.Projects(svc)
	req := httptest.NewRequest(http.MethodDelete,
		"/api/projects?cwd="+url.QueryEscape("/work/doomed"), nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		SessionsDeleted int64 `json:"sessions_deleted"`
		EventsDeleted   int64 `json:"events_deleted"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.SessionsDeleted != 1 || resp.EventsDeleted != 1 {
		t.Fatalf("deleted = %+v, want 1 session 1 event", resp)
	}

	// Survivor project still listed; doomed gone.
	listReq := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	listRec := httptest.NewRecorder()
	h.ServeHTTP(listRec, listReq)
	var payload struct {
		Projects []domain.Project `json:"projects"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(payload.Projects) != 1 || payload.Projects[0].CWD != "/work/keep" {
		t.Fatalf("projects after delete = %+v, want only /work/keep", payload.Projects)
	}
}
