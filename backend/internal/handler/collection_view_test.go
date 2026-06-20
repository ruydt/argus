package handler_test

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"argus/internal/community"
	"argus/internal/github"
	"argus/internal/handler"
)

// writeLocal drops a fake installed hook script into <argusDir>/hooks.
func writeLocal(t *testing.T, argusDir, filename, body string) {
	t.Helper()
	dir := filepath.Join(argusDir, "hooks")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, filename), []byte(body), 0o755); err != nil {
		t.Fatal(err)
	}
}

func TestCollectionViewPrefersLocalMetaOverRegistry(t *testing.T) {
	dir := t.TempDir()
	body := "// @argus-meta\n" +
		"// title: Local title\n" +
		"// author: local-author\n" +
		"// event: Stop\n" +
		"// runtime: node\n" +
		"// @end\n\nconsole.log('local')\n"
	writeLocal(t, dir, "guard.js", body)
	svc := github.NewService("test-client-id", dir)

	sum := sha256.Sum256([]byte(body))
	mux := http.NewServeMux()
	mux.HandleFunc("/index.json", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprintf(w, `{"schema_version":1,"scripts":[{"id":"guard","author":"registry-author","title":"Registry title","event":"PreToolUse","runtime":"sh","sha256":"%x","source":"scripts/registry/guard.js"}]}`, sum)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	rr := httptest.NewRecorder()
	handler.Collection(svc, community.NewSource(srv.URL, srv.Client()), dir).
		ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/collection", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rr.Code, rr.Body.String())
	}

	var view struct {
		Entries []struct {
			Filename string   `json:"filename"`
			Title    string   `json:"title"`
			Author   string   `json:"author"`
			Events   []string `json:"events"`
			Runtime  string   `json:"runtime"`
		} `json:"entries"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &view); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(view.Entries) != 1 {
		t.Fatalf("entries len = %d, want 1", len(view.Entries))
	}
	e := view.Entries[0]
	gotEvent := ""
	if len(e.Events) == 1 {
		gotEvent = e.Events[0]
	}
	if e.Filename != "guard.js" || e.Title != "Local title" || e.Author != "local-author" || gotEvent != "Stop" || e.Runtime != "node" {
		t.Fatalf("entry = %+v, want local meta to override registry fields", e)
	}
}

func TestCollectionViewLoggedOutListsLocalOnly(t *testing.T) {
	dir := t.TempDir()
	writeLocal(t, dir, "block-dangerous.js", "// hi\n")
	svc := github.NewService("test-client-id", dir)

	mux := http.NewServeMux()
	mux.HandleFunc("/index.json", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"schema_version":1,"scripts":[]}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	registrySrc := community.NewSource(srv.URL, srv.Client())

	rr := httptest.NewRecorder()
	h := handler.Collection(svc, registrySrc, dir)
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/collection", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 (no 401 when logged out), got %d", rr.Code)
	}
	var view struct {
		Authenticated bool `json:"authenticated"`
		Entries       []struct {
			Filename string `json:"filename"`
			Title    string `json:"title"`
			Local    bool   `json:"local"`
			Gist     bool   `json:"gist"`
		} `json:"entries"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &view); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if view.Authenticated {
		t.Fatal("expected authenticated=false")
	}
	if len(view.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(view.Entries))
	}
	e := view.Entries[0]
	if e.Filename != "block-dangerous.js" || !e.Local || e.Gist {
		t.Fatalf("unexpected entry: %+v", e)
	}
	// Registry returns empty index → falls back to filename as title.
	if e.Title != "block-dangerous.js" {
		t.Fatalf("expected filename-fallback title, got %q", e.Title)
	}
}
