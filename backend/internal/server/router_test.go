package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"agent-monitor/internal/domain"
	"agent-monitor/internal/server"
	"agent-monitor/internal/service"
)

type noopRepo struct{}

func (noopRepo) Add(domain.NormalizedEvent) error { return nil }

func (noopRepo) List(int) ([]domain.NormalizedEvent, error) { return nil, nil }

func (noopRepo) SessionModel(string) (string, error) { return "", nil }

func (noopRepo) ListSessions() ([]domain.Session, error) { return nil, nil }

func (noopRepo) GetDashboardStats() (*domain.DashboardStats, error) { return nil, nil }

func (noopRepo) UpsertSession(string, string, string, string, string, string, domain.SessionUsage) error {
	return nil
}

func newTestRouter() http.Handler {
	return server.NewRouter(service.New(noopRepo{}))
}

func TestNewRouterOptionsReturnsCORSHeaders(t *testing.T) {
	req := httptest.NewRequest(http.MethodOptions, "/api/hook", nil)
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("allow-origin = %q, want *", rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestNewRouterOpenAIRouteIsGETOnly(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/openai/models", nil)
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}
