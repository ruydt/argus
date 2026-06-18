package handler

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestRevealRejectsNonPOST(t *testing.T) {
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	Reveal(dir).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/diagnostics/reveal", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestRevealRequiresPath(t *testing.T) {
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/diagnostics/reveal", strings.NewReader(`{}`))
	Reveal(dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestRevealMissingFile(t *testing.T) {
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	// A nonexistent path inside the argus root — passes confinement, fails Stat.
	req := httptest.NewRequest(http.MethodPost, "/api/diagnostics/reveal",
		strings.NewReader(`{"path":"`+filepath.Join(dir, "nope")+`"}`))
	Reveal(dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestRevealLaunchesFileManager(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("reveal unsupported on this platform")
	}

	dir := t.TempDir()
	file := filepath.Join(dir, "argus.log")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}

	orig := revealExec
	defer func() { revealExec = orig }()
	var gotName string
	var gotArgs []string
	revealExec = func(name string, args ...string) error {
		gotName = name
		gotArgs = args
		return nil
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/diagnostics/reveal",
		strings.NewReader(`{"path":"`+file+`"}`))
	Reveal(dir).ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204; body: %s", rec.Code, rec.Body.String())
	}
	switch runtime.GOOS {
	case "darwin":
		if gotName != "open" || len(gotArgs) != 2 || gotArgs[0] != "-R" || gotArgs[1] != file {
			t.Errorf("exec = %s %v, want open -R %s", gotName, gotArgs, file)
		}
	case "linux":
		if gotName != "xdg-open" || len(gotArgs) != 1 || gotArgs[0] != filepath.Dir(file) {
			t.Errorf("exec = %s %v, want xdg-open %s", gotName, gotArgs, filepath.Dir(file))
		}
	}
}

func TestRevealRejectsPathOutsideRoots(t *testing.T) {
	dir := t.TempDir()      // argus root
	outside := t.TempDir() // a separate dir not under argusDir, ~/.claude, or ~/.codex

	// Create a real file in the outside dir to confirm it exists.
	file := filepath.Join(outside, "secret.txt")
	if err := os.WriteFile(file, []byte("secret"), 0o644); err != nil {
		t.Fatal(err)
	}

	orig := revealExec
	defer func() { revealExec = orig }()
	called := false
	revealExec = func(name string, args ...string) error {
		called = true
		return nil
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/diagnostics/reveal",
		strings.NewReader(`{"path":"`+file+`"}`))
	Reveal(dir).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for out-of-root path; body: %s", rec.Code, rec.Body.String())
	}
	if called {
		t.Error("revealExec should NOT have been called for an out-of-root path")
	}
}

func TestRevealRejectsTraversal(t *testing.T) {
	dir := t.TempDir()

	orig := revealExec
	defer func() { revealExec = orig }()
	called := false
	revealExec = func(name string, args ...string) error {
		called = true
		return nil
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/diagnostics/reveal",
		strings.NewReader(`{"path":"../../etc/hosts"}`))
	Reveal(dir).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400 for traversal path; body: %s", rec.Code, rec.Body.String())
	}
	if called {
		t.Error("revealExec should NOT have been called for a traversal path")
	}
}
