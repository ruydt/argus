package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"argus/internal/handler"
)

type agentsResp struct {
	Agents []struct {
		ID               string `json:"id"`
		Installed        bool   `json:"installed"`
		EditingSupported bool   `json:"editing_supported"`
	} `json:"agents"`
	Enabled []string `json:"enabled"`
}

func TestAgentsGetDefaults(t *testing.T) {
	h := handler.Agents(t.TempDir(), t.TempDir())
	req := httptest.NewRequest(http.MethodGet, "/api/agents", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var got agentsResp
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got.Agents) < 11 {
		t.Fatalf("agents = %d, want >= 11", len(got.Agents))
	}
	if len(got.Enabled) != 2 || got.Enabled[0] != "claudecode" || got.Enabled[1] != "codex" {
		t.Fatalf("enabled = %v, want [claudecode codex]", got.Enabled)
	}
}

func TestAgentsEnableNotInstalled(t *testing.T) {
	h := handler.AgentsEnabled(t.TempDir(), t.TempDir())
	req := httptest.NewRequest(http.MethodPost, "/api/agents/enabled",
		bytes.NewBufferString(`{"id":"cursor"}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
}

func TestAgentsEnableUnknown(t *testing.T) {
	h := handler.AgentsEnabled(t.TempDir(), t.TempDir())
	req := httptest.NewRequest(http.MethodPost, "/api/agents/enabled",
		bytes.NewBufferString(`{"id":"nope"}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestAgentsEnableThenDisable(t *testing.T) {
	home := t.TempDir()
	argusDir := t.TempDir()
	// Make cursor "installed" by creating its config dir.
	if err := os.MkdirAll(filepath.Join(home, ".cursor"), 0o700); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	h := handler.AgentsEnabled(home, argusDir)

	// Enable.
	postReq := httptest.NewRequest(http.MethodPost, "/api/agents/enabled",
		bytes.NewBufferString(`{"id":"cursor"}`))
	postRec := httptest.NewRecorder()
	h.ServeHTTP(postRec, postReq)
	if postRec.Code != http.StatusOK {
		t.Fatalf("POST status = %d, want 200: %s", postRec.Code, postRec.Body.String())
	}
	var enabled struct {
		Enabled []string `json:"enabled"`
	}
	if err := json.NewDecoder(postRec.Body).Decode(&enabled); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !containsStr(enabled.Enabled, "cursor") {
		t.Fatalf("enabled = %v, want cursor present", enabled.Enabled)
	}
	// Persisted to disk.
	if _, err := os.Stat(filepath.Join(argusDir, "agents.json")); err != nil {
		t.Fatalf("agents.json not written: %v", err)
	}

	// Disable.
	delReq := httptest.NewRequest(http.MethodDelete, "/api/agents/enabled?id=cursor", nil)
	delRec := httptest.NewRecorder()
	h.ServeHTTP(delRec, delReq)
	if delRec.Code != http.StatusOK {
		t.Fatalf("DELETE status = %d, want 200", delRec.Code)
	}
	if err := json.NewDecoder(delRec.Body).Decode(&enabled); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if containsStr(enabled.Enabled, "cursor") {
		t.Fatalf("enabled = %v, want cursor removed", enabled.Enabled)
	}
}

func TestAgentsEnabledMethodNotAllowed(t *testing.T) {
	h := handler.AgentsEnabled(t.TempDir(), t.TempDir())
	req := httptest.NewRequest(http.MethodPut, "/api/agents/enabled", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func containsStr(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
