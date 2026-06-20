package handler_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"argus/internal/domain"
	"argus/internal/handler"
	"argus/internal/repository/sqlite"
	"argus/internal/service"
)

func TestDeleteSessionsRemovesSelectedSessions(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	svc := service.New(db)

	now := time.Now().UTC().Format(time.RFC3339)
	rows := []struct{ session, hook string }{
		{"keep", "SessionStart"},
		{"drop-a", "SessionStart"},
		{"drop-a", "PreToolUse"}, // distinct event, same session → two rows
		{"drop-b", "SessionStart"},
	}
	for _, r := range rows {
		if err := db.Add(domain.NormalizedEvent{
			Time: now, Agent: "claudecode", Session: r.session,
			HookEventName: r.hook, CWD: "/x", RawPayload: []byte(`{}`),
		}); err != nil {
			t.Fatalf("Add: %v", err)
		}
	}

	req := httptest.NewRequest(http.MethodDelete, "/api/sessions",
		bytes.NewBufferString(`{"sessions":["drop-a","drop-b"," "]}`))
	rec := httptest.NewRecorder()
	handler.DeleteSessions(svc).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %q)", rec.Code, rec.Body.String())
	}
	if got := rec.Body.String(); got == "" || !bytes.Contains(rec.Body.Bytes(), []byte(`"deleted":3`)) {
		t.Fatalf("body = %q, want deleted:3", got)
	}

	kept, err := db.ListBySession("keep", 10)
	if err != nil {
		t.Fatalf("ListBySession: %v", err)
	}
	if len(kept) != 1 {
		t.Fatalf("keep events = %d, want 1", len(kept))
	}
	gone, _ := db.ListBySession("drop-a", 10)
	if len(gone) != 0 {
		t.Fatalf("drop-a events = %d, want 0", len(gone))
	}
}

func TestDeleteSessionsRejectsEmptySet(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	svc := service.New(db)

	for _, body := range []string{`{"sessions":[]}`, `{"sessions":["  "]}`, `not json`} {
		req := httptest.NewRequest(http.MethodDelete, "/api/sessions", bytes.NewBufferString(body))
		rec := httptest.NewRecorder()
		handler.DeleteSessions(svc).ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("body %q: status = %d, want 400", body, rec.Code)
		}
	}
}
