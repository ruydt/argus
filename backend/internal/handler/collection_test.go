package handler_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"argus/internal/github"
	"argus/internal/handler"
	"argus/internal/scriptcatalog"
)

func TestCollectionLoggedOutReturns200(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	handler.Collection(svc, scriptcatalog.NewBundledSource(), dir).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/collection", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (auth-optional)", rec.Code)
	}
}

func TestCollectionAddRequiresAuth(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/collection", strings.NewReader(`{"origin":"bundled","id":"stop"}`))
	handler.CollectionAdd(svc, scriptcatalog.NewBundledSource(), dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestCollectionAddUnknownOrigin(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/collection", strings.NewReader(`{"origin":"bogus"}`))
	handler.CollectionAdd(svc, scriptcatalog.NewBundledSource(), dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
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
