package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"argus/internal/handler"
)

func TestDashboardStatsReturns200(t *testing.T) {
	svc := newTestService(t)
	h := handler.DashboardStats(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/dashboard/stats", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var payload any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
}

func TestDashboardStatsValidRFC3339Range(t *testing.T) {
	svc := newTestService(t)
	h := handler.DashboardStats(svc)
	req := httptest.NewRequest(http.MethodGet,
		"/api/dashboard/stats?start=2026-01-01T00:00:00Z&end=2026-01-02T00:00:00Z", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var payload any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
}

func TestDashboardStatsEndBeforeStartReturns400(t *testing.T) {
	svc := newTestService(t)
	h := handler.DashboardStats(svc)
	// end is before start — must be rejected with 400
	req := httptest.NewRequest(http.MethodGet,
		"/api/dashboard/stats?start=2026-01-02T00:00:00Z&end=2026-01-01T00:00:00Z", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body: %s", rec.Code, rec.Body.String())
	}
}

func TestDashboardStatsBadRFC3339Returns400(t *testing.T) {
	svc := newTestService(t)
	h := handler.DashboardStats(svc)
	// start is unparseable RFC3339
	req := httptest.NewRequest(http.MethodGet,
		"/api/dashboard/stats?start=not-a-date&end=2026-01-02T00:00:00Z", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body: %s", rec.Code, rec.Body.String())
	}
}

func TestDashboardStatsRange24h(t *testing.T) {
	svc := newTestService(t)
	h := handler.DashboardStats(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/dashboard/stats?range=24h", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var payload any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
}

func TestDashboardStatsRangeGarbageFallsToAllTime(t *testing.T) {
	svc := newTestService(t)
	h := handler.DashboardStats(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/dashboard/stats?range=garbage", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var payload any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
}

func TestFileChangesReturnsEmptyArrayForUnknownSession(t *testing.T) {
	svc := newTestService(t)
	h := handler.FileChanges(svc)
	req := httptest.NewRequest(http.MethodGet,
		"/api/file-changes?session_id=nonexistent-session", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	if strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatalf("body = %q, want []", rec.Body.String())
	}
}

func TestFileChangesReturnsBadRequestWithoutSessionID(t *testing.T) {
	svc := newTestService(t)
	h := handler.FileChanges(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/file-changes", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body: %s", rec.Code, rec.Body.String())
	}
}

func TestHealthzReturns200(t *testing.T) {
	h := handler.Healthz()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

func TestReadyzReturns200WhenReady(t *testing.T) {
	h := handler.Readyz(func() bool { return true })
	req := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

func TestVersionReturns200WithJSON(t *testing.T) {
	h := handler.Version()
	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var payload struct {
		Version   string `json:"version"`
		Commit    string `json:"commit"`
		BuildDate string `json:"buildDate"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
}
