package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"hooker/internal/domain"
	"hooker/internal/handler"
	"hooker/internal/repository/sqlite"
	"hooker/internal/service"
)

func TestSessionsTreeHandler_returnsJSON(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	svc := service.New(db)

	if err := db.UpsertSession("s1", "claudecode", "", "", "/tmp", "", domain.SessionUsage{}); err != nil {
		t.Fatalf("UpsertSession: %v", err)
	}

	h := handler.SessionsTree(svc)
	since := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)
	req := httptest.NewRequest(http.MethodGet, "/api/sessions/tree?since="+since, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Sessions []domain.SessionTreeNode `json:"sessions"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(resp.Sessions) != 1 {
		t.Errorf("sessions = %d, want 1", len(resp.Sessions))
	}
}

func TestSessionsTreeHandler_defaultsSince(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	svc := service.New(db)

	h := handler.SessionsTree(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/sessions/tree", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
}
