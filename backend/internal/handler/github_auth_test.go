package handler_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"argus/internal/github"
	"argus/internal/handler"
)

func TestGitHubStatusUnauthenticated(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	rec := httptest.NewRecorder()
	handler.GitHubStatus(svc).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/github/status", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"authenticated":false`) {
		t.Fatalf("body = %q, want authenticated:false", rec.Body.String())
	}
}

func TestGitHubLogoutRejectsGET(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	rec := httptest.NewRecorder()
	handler.GitHubLogout(svc).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/github/logout", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestGitHubLogoutSucceeds(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	rec := httptest.NewRecorder()
	handler.GitHubLogout(svc).ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/github/logout", nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
}
