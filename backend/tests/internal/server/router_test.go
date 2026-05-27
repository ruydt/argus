package server_test

import (
	"context"
	"encoding/json"
	"io"
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

func (noopRepo) GetFileChanges(string) ([]domain.FileChangeGroup, error) { return nil, nil }

func (noopRepo) GetSessionFileChangeCounts([]string) (map[string]int, error) {
	return map[string]int{}, nil
}

func (noopRepo) UpsertSession(string, string, string, string, string, string, string, string, domain.SessionUsage) error {
	return nil
}

func (noopRepo) ExportEvents(_ context.Context, _ io.Writer) error { return nil }

func (noopRepo) ExportSnapshot(_ context.Context, _ string) error { return nil }

func (noopRepo) Ready() bool { return true }

func newTestRouter() http.Handler {
	repo := noopRepo{}
	return server.NewRouter(service.New(repo), repo, repo.Ready, server.Options{})
}

func localRequest(method, target string) *http.Request {
	req := httptest.NewRequest(method, target, nil)
	req.Host = "127.0.0.1:8765"
	return req
}

func TestNewRouterOptionsReturnsCORSHeaders(t *testing.T) {
	req := localRequest(http.MethodOptions, "/api/hook")
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
	req := localRequest(http.MethodPost, "/api/openai/models")
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestNewRouterAnthropicRouteIsGETOnly(t *testing.T) {
	req := localRequest(http.MethodPost, "/api/anthropic/organizations/usage_report/messages")
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestNewRouterVersionReturnsAppVersion(t *testing.T) {
	req := localRequest(http.MethodGet, "/api/version")
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var payload struct {
		Version   string `json:"version"`
		Commit    string `json:"commit"`
		BuildDate string `json:"buildDate"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode version response: %v", err)
	}
	if payload.Version != "0.0.0-dev" {
		t.Fatalf("version = %q, want 0.0.0-dev", payload.Version)
	}
	if payload.Commit != "none" {
		t.Fatalf("commit = %q, want none", payload.Commit)
	}
	if payload.BuildDate != "unknown" {
		t.Fatalf("buildDate = %q, want unknown", payload.BuildDate)
	}
}
