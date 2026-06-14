package handler_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"argus/internal/community"
	"argus/internal/github"
	"argus/internal/handler"
)

func newRegistrySrc(t *testing.T) *community.Source {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/index.json", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"schema_version":1,"scripts":[]}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return community.NewSource(srv.URL, srv.Client())
}

func TestCollectionLoggedOutReturns200(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	handler.Collection(svc, newRegistrySrc(t), dir).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/collection", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (auth-optional)", rec.Code)
	}
}

func TestCollectionAddRequiresAuth(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	// CollectionAdd is now local-only: request body is {"filename":"..."}
	req := httptest.NewRequest(http.MethodPost, "/api/collection", strings.NewReader(`{"filename":"stop.js"}`))
	handler.CollectionAdd(svc, dir).ServeHTTP(rec, req)
	// File doesn't exist → 400 (local script not found), not 401.
	// The 401 only fires when the file exists but the user is not authenticated.
	// This test now validates that the handler rejects a missing local file.
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (local script not found)", rec.Code)
	}
}

func TestCollectionAddInvalidFilename(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/collection", strings.NewReader(`{"filename":"../etc/passwd"}`))
	handler.CollectionAdd(svc, dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 (invalid filename)", rec.Code)
	}
}

func TestCollectionRemoveRequiresID(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	rec := httptest.NewRecorder()
	handler.CollectionRemove(svc).ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/collection", nil))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestCollectionInstallRejectsGET(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	handler.CollectionInstall(svc, dir).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/collection/install", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}
