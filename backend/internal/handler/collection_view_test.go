package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"argus/internal/github"
	"argus/internal/handler"
	"argus/internal/scriptcatalog"
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

func TestCollectionViewLoggedOutListsLocalOnly(t *testing.T) {
	dir := t.TempDir()
	writeLocal(t, dir, "block-dangerous.js", "// hi\n")
	svc := github.NewService("test-client-id", dir)

	rr := httptest.NewRecorder()
	h := handler.Collection(svc, scriptcatalog.NewBundledSource(), dir)
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
	if e.Title != "Block dangerous commands" {
		t.Fatalf("expected enriched title, got %q", e.Title)
	}
}
