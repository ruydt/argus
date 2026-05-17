package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"hooker/internal/domain"
	"hooker/internal/server"
	"hooker/internal/service"
)

type noopRepo struct{}

func (noopRepo) Add(domain.NormalizedEvent) error { return nil }

func (noopRepo) List(int) ([]domain.NormalizedEvent, error) { return nil, nil }

func (noopRepo) ListBySession(string, int) ([]domain.NormalizedEvent, error) { return nil, nil }

func (noopRepo) SessionModel(string) (string, error) { return "", nil }

func (noopRepo) ListProjects() ([]domain.Project, error) { return nil, nil }

func (noopRepo) ListSessions() ([]domain.Session, error) { return nil, nil }

func (noopRepo) ListSessionsByCWD(string, string) ([]domain.Session, error) { return nil, nil }

func (noopRepo) GetDashboardStats(string, string) (*domain.DashboardStats, error) { return nil, nil }

func (noopRepo) GetSessionTree(string) ([]domain.SessionTreeNode, error) { return nil, nil }

func (noopRepo) GetTraces(string, string) ([]domain.NormalizedEvent, error) { return nil, nil }

func (noopRepo) ListSessionsByCWDPage(string, string, int, int) ([]domain.Session, int, error) {
	return nil, 0, nil
}

func (noopRepo) GetTracesPage(string, string, int, int) ([]domain.NormalizedEvent, int, error) {
	return nil, 0, nil
}

func (noopRepo) UpsertSession(string, string, string, string, string, string, string, string, domain.SessionUsage) error {
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

func TestNewRouterAnthropicRouteIsGETOnly(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/anthropic/organizations/usage_report/messages", nil)
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestNewRouterVersionReturnsAppVersion(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var payload struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode version response: %v", err)
	}
	if payload.Version != "0.0.0-dev" {
		t.Fatalf("version = %q, want 0.0.0-dev", payload.Version)
	}
}
