package handler_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"argus/internal/handler"
)

// These cover only the pre-exec error paths — the success path would launch the
// OS file manager, which has no place in a headless test run.

func TestCollectionRevealRejectsGet(t *testing.T) {
	rr := httptest.NewRecorder()
	handler.CollectionReveal(t.TempDir()).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/collection/reveal", nil))
	if rr.Code != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405, got %d", rr.Code)
	}
}

func TestCollectionRevealRejectsTraversal(t *testing.T) {
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/collection/reveal", strings.NewReader(`{"filename":"../evil.sh"}`))
	handler.CollectionReveal(t.TempDir()).ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for traversal, got %d", rr.Code)
	}
}

func TestCollectionRevealMissingFile(t *testing.T) {
	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/collection/reveal", strings.NewReader(`{"filename":"nope.js"}`))
	handler.CollectionReveal(t.TempDir()).ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for missing file, got %d", rr.Code)
	}
}
