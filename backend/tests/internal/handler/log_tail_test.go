package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"argus/internal/handler"
)

func TestLogTailRejectsInvalidFile(t *testing.T) {
	h := handler.LogTail(handler.LogTailOptions{ArgusDir: t.TempDir()})
	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics/log-tail?file=../../etc/passwd", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestLogTailMissingFileReturnsEmptyLines(t *testing.T) {
	dir := t.TempDir()
	h := handler.LogTail(handler.LogTailOptions{ArgusDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics/log-tail?file=argus&lines=10", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	lines, ok := payload["lines"].([]any)
	if !ok {
		t.Fatalf("lines = %#v, want array", payload["lines"])
	}
	if len(lines) != 0 {
		t.Errorf("len(lines) = %d, want 0", len(lines))
	}
}

func TestLogTailReturnsLastNLines(t *testing.T) {
	dir := t.TempDir()
	content := "line1\nline2\nline3\nline4\nline5\n"
	if err := os.WriteFile(filepath.Join(dir, "argus.log"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	h := handler.LogTail(handler.LogTailOptions{ArgusDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics/log-tail?file=argus&lines=3", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload struct {
		File  string   `json:"file"`
		Lines []string `json:"lines"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload.File != "argus.log" {
		t.Errorf("file = %q, want argus.log", payload.File)
	}
	if len(payload.Lines) != 3 {
		t.Fatalf("len(lines) = %d, want 3", len(payload.Lines))
	}
	if payload.Lines[0] != "line3" || payload.Lines[2] != "line5" {
		t.Errorf("lines = %v, want [line3 line4 line5]", payload.Lines)
	}
}

// build.log was retired; the param is no longer accepted.
func TestLogTailBuildFileParamRejected(t *testing.T) {
	dir := t.TempDir()
	h := handler.LogTail(handler.LogTailOptions{ArgusDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics/log-tail?file=build", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestLogClearTruncatesFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "argus.log")
	if err := os.WriteFile(path, []byte("line1\nline2\nline3\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := handler.LogClear(handler.LogTailOptions{ArgusDir: dir})
	req := httptest.NewRequest(http.MethodPost, "/api/diagnostics/log-clear?file=argus", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat: %v", err)
	}
	if info.Size() != 0 {
		t.Errorf("size = %d, want 0", info.Size())
	}
}

func TestLogClearRejectsInvalidFile(t *testing.T) {
	h := handler.LogClear(handler.LogTailOptions{ArgusDir: t.TempDir()})
	req := httptest.NewRequest(http.MethodPost, "/api/diagnostics/log-clear?file=../../etc/passwd", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestLogClearMissingFileIsNoOp(t *testing.T) {
	h := handler.LogClear(handler.LogTailOptions{ArgusDir: t.TempDir()})
	req := httptest.NewRequest(http.MethodPost, "/api/diagnostics/log-clear?file=argus", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
}

func TestLogTailHookScriptsFileParam(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "hook-scripts.log"), []byte("script output\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := handler.LogTail(handler.LogTailOptions{ArgusDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics/log-tail?file=hook-scripts", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload struct {
		File  string   `json:"file"`
		Lines []string `json:"lines"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload.File != "hook-scripts.log" {
		t.Errorf("file = %q, want hook-scripts.log", payload.File)
	}
	if len(payload.Lines) != 1 || payload.Lines[0] != "script output" {
		t.Errorf("lines = %v, want [script output]", payload.Lines)
	}
}
