package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"argus/internal/domain"
	"argus/internal/handler"
	"argus/internal/scriptcatalog"
)

func newSrc() scriptcatalog.ScriptSource { return scriptcatalog.NewBundledSource() }

func TestScriptsCatalogReturnsPackagesWithState(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "hooks"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "hooks", "stop.js"), []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	handler.ScriptsCatalog(newSrc(), dir).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/scripts/catalog", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var cat domain.ScriptCatalog
	if err := json.Unmarshal(rec.Body.Bytes(), &cat); err != nil {
		t.Fatal(err)
	}
	if len(cat.Packages) != 12 {
		t.Fatalf("packages = %d, want 12", len(cat.Packages))
	}
	var stop domain.ScriptPackage
	for _, p := range cat.Packages {
		if p.ID == "stop" {
			stop = p
		}
	}
	if !stop.Installed {
		t.Error("stop.Installed = false, want true (pre-installed)")
	}
}

func TestScriptsInstallWritesFile(t *testing.T) {
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/scripts/install", strings.NewReader(`{"id":"block-dangerous"}`))
	handler.ScriptsInstall(newSrc(), dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	info, err := os.Stat(filepath.Join(dir, "hooks", "block-dangerous.js"))
	if err != nil {
		t.Fatalf("script not written: %v", err)
	}
	if info.Mode().Perm() != 0o755 {
		t.Errorf("perm = %v, want 0755", info.Mode().Perm())
	}
}

func TestScriptsInstallExistingReturns409(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "hooks"), 0o755); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(dir, "hooks", "block-dangerous.js")
	if err := os.WriteFile(target, []byte("ORIGINAL"), 0o644); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/scripts/install", strings.NewReader(`{"id":"block-dangerous"}`))
	handler.ScriptsInstall(newSrc(), dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
	got, _ := os.ReadFile(target)
	if string(got) != "ORIGINAL" {
		t.Error("existing file was overwritten")
	}
}

func TestScriptsInstallUnknownReturns400(t *testing.T) {
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/scripts/install", strings.NewReader(`{"id":"../etc/passwd"}`))
	handler.ScriptsInstall(newSrc(), dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Error("unknown install wrote something to argus dir")
	}
}

func TestScriptsInstallBundleInstallsMissingSkipsExisting(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "hooks"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "hooks", "block-dangerous.js"), []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/scripts/install-bundle", strings.NewReader(`{"id":"safety-starter"}`))
	handler.ScriptsInstallBundle(newSrc(), dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var results []struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &results); err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, r := range results {
		got[r.ID] = r.Status
	}
	if got["block-dangerous"] != "skipped" {
		t.Errorf("block-dangerous = %q, want skipped", got["block-dangerous"])
	}
	if got["protect-secrets"] != "installed" {
		t.Errorf("protect-secrets = %q, want installed", got["protect-secrets"])
	}
}

func TestScriptsDeleteRemovesAndIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "hooks"), 0o755); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(dir, "hooks", "stop.js")
	if err := os.WriteFile(target, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	del := handler.ScriptsDelete(newSrc(), dir)

	rec := httptest.NewRecorder()
	del.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/scripts/installed?id=stop", nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Error("file not removed")
	}
	rec2 := httptest.NewRecorder()
	del.ServeHTTP(rec2, httptest.NewRequest(http.MethodDelete, "/api/scripts/installed?id=stop", nil))
	if rec2.Code != http.StatusNoContent {
		t.Fatalf("second delete status = %d, want 204", rec2.Code)
	}
}
