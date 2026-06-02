package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"hooker/internal/handler"
)

func TestHooksConfigGetUnknownAgent(t *testing.T) {
	h := handler.HooksConfig("/tmp/noop-settings.json", "/tmp/noop-hooks.json")
	req := httptest.NewRequest(http.MethodGet, "/api/hooks-config?agent=unknown", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHooksConfigPutUnknownAgent(t *testing.T) {
	h := handler.HooksConfig("/tmp/noop-settings.json", "/tmp/noop-hooks.json")
	req := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=unknown",
		bytes.NewBufferString(`{"hooks":{}}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHooksConfigUnsupportedMethod(t *testing.T) {
	h := handler.HooksConfig("/tmp/noop-settings.json", "/tmp/noop-hooks.json")
	req := httptest.NewRequest(http.MethodPost, "/api/hooks-config?agent=claudecode", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestHooksConfigGetMissingFile(t *testing.T) {
	dir := t.TempDir()
	h := handler.HooksConfig(
		filepath.Join(dir, "settings.json"),
		filepath.Join(dir, "hooks.json"),
	)
	for _, agent := range []string{"claudecode", "codex"} {
		req := httptest.NewRequest(http.MethodGet, "/api/hooks-config?agent="+agent, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("agent=%s: status = %d, want 200", agent, rec.Code)
		}
		var payload map[string]any
		if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
			t.Fatalf("agent=%s: decode: %v", agent, err)
		}
		hooks, ok := payload["hooks"].(map[string]any)
		if !ok {
			t.Fatalf("agent=%s: hooks is not object: %#v", agent, payload["hooks"])
		}
		if len(hooks) != 0 {
			t.Fatalf("agent=%s: hooks = %v, want empty", agent, hooks)
		}
	}
}

func TestHooksConfigPutInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	h := handler.HooksConfig(
		filepath.Join(dir, "settings.json"),
		filepath.Join(dir, "hooks.json"),
	)
	req := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=claudecode",
		bytes.NewBufferString("not json"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHooksConfigClaudeCodeRoundtrip(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")
	h := handler.HooksConfig(settingsPath, filepath.Join(dir, "hooks.json"))

	putBody := `{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"curl http://localhost:8765/api/hook","timeout":5}]}]}}`
	putReq := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=claudecode",
		bytes.NewBufferString(putBody))
	putRec := httptest.NewRecorder()
	h.ServeHTTP(putRec, putReq)
	if putRec.Code != http.StatusOK {
		t.Fatalf("PUT status = %d, want 200: %s", putRec.Code, putRec.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/hooks-config?agent=claudecode", nil)
	getRec := httptest.NewRecorder()
	h.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", getRec.Code)
	}
	var got map[string]any
	if err := json.NewDecoder(getRec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	hooks := got["hooks"].(map[string]any)
	if _, ok := hooks["SessionStart"]; !ok {
		t.Fatalf("hooks missing SessionStart: %v", hooks)
	}
}

func TestHooksConfigClaudeCodePreservesOtherKeys(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")
	initial := `{"theme":"dark","hooks":{},"model":"claude-3"}`
	if err := os.WriteFile(settingsPath, []byte(initial), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	h := handler.HooksConfig(settingsPath, filepath.Join(dir, "hooks.json"))

	putBody := `{"hooks":{"PreToolUse":[{"matcher":".*","hooks":[{"type":"command","command":"echo hi"}]}]}}`
	req := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=claudecode",
		bytes.NewBufferString(putBody))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	var settings map[string]any
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatalf("unmarshal written file: %v", err)
	}
	if settings["theme"] != "dark" {
		t.Fatalf("theme = %v, want dark", settings["theme"])
	}
	if settings["model"] != "claude-3" {
		t.Fatalf("model = %v, want claude-3", settings["model"])
	}
}

func TestHooksConfigCodexRoundtrip(t *testing.T) {
	dir := t.TempDir()
	hooksPath := filepath.Join(dir, "hooks.json")
	h := handler.HooksConfig(filepath.Join(dir, "settings.json"), hooksPath)

	putBody := `{"hooks":{"PreToolUse":[{"matcher":".*","hooks":[{"type":"command","command":"curl http://localhost:8765/api/hook"}]}]}}`
	putReq := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=codex",
		bytes.NewBufferString(putBody))
	putRec := httptest.NewRecorder()
	h.ServeHTTP(putRec, putReq)
	if putRec.Code != http.StatusOK {
		t.Fatalf("PUT status = %d, want 200", putRec.Code)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/hooks-config?agent=codex", nil)
	getRec := httptest.NewRecorder()
	h.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", getRec.Code)
	}
	var got map[string]any
	if err := json.NewDecoder(getRec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if _, ok := got["hooks"].(map[string]any)["PreToolUse"]; !ok {
		t.Fatalf("missing PreToolUse in hooks: %v", got)
	}
}

func TestHooksConfigPutCreatesParentDirs(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "nested", "dir", "settings.json")
	h := handler.HooksConfig(settingsPath, filepath.Join(dir, "hooks.json"))

	req := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=claudecode",
		bytes.NewBufferString(`{"hooks":{}}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(settingsPath); err != nil {
		t.Fatalf("file not created: %v", err)
	}
}
