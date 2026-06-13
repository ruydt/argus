package handler_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"argus/internal/handler"
)

func TestCollectionLocalGetReturnsBody(t *testing.T) {
	dir := t.TempDir()
	writeLocal(t, dir, "x.sh", "echo hi\n")
	rr := httptest.NewRecorder()
	handler.CollectionLocal(dir).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/collection/local?filename=x.sh", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d", rr.Code)
	}
	if want := `"body":"echo hi\n"`; !contains(rr.Body.String(), want) {
		t.Fatalf("body %q missing %q", rr.Body.String(), want)
	}
}

func TestCollectionLocalDeleteRemovesFile(t *testing.T) {
	dir := t.TempDir()
	writeLocal(t, dir, "x.sh", "echo hi\n")
	rr := httptest.NewRecorder()
	handler.CollectionLocal(dir).ServeHTTP(rr, httptest.NewRequest(http.MethodDelete, "/api/collection/local?filename=x.sh", nil))
	if rr.Code != http.StatusNoContent {
		t.Fatalf("status %d", rr.Code)
	}
	if _, err := os.Stat(filepath.Join(dir, "hooks", "x.sh")); !os.IsNotExist(err) {
		t.Fatalf("expected file removed, stat err=%v", err)
	}
}

func TestCollectionLocalRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	rr := httptest.NewRecorder()
	handler.CollectionLocal(dir).ServeHTTP(rr, httptest.NewRequest(http.MethodDelete, "/api/collection/local?filename=../evil.sh", nil))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for traversal, got %d", rr.Code)
	}
}

func contains(s, sub string) bool { return indexOf(s, sub) >= 0 }

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
