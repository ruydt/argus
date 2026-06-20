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

// claudeSettings returns the path the registry resolves for Claude Code under home.
func claudeSettings(home string) string {
	return filepath.Join(home, ".claude", "settings.json")
}

func TestHooksConfigGetUnknownAgent(t *testing.T) {
	h := handler.HooksConfig(t.TempDir())
	req := httptest.NewRequest(http.MethodGet, "/api/hooks-config?agent=unknown", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHooksConfigPutUnknownAgent(t *testing.T) {
	h := handler.HooksConfig(t.TempDir())
	req := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=unknown",
		bytes.NewBufferString(`{"hooks":{}}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

// A known agent whose config format argus cannot edit in-app (e.g. Cursor)
// returns 409 so the frontend falls back to guided setup.
func TestHooksConfigNonEditableAgent(t *testing.T) {
	h := handler.HooksConfig(t.TempDir())
	req := httptest.NewRequest(http.MethodGet, "/api/hooks-config?agent=cursor", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
}

func TestHooksConfigUnsupportedMethod(t *testing.T) {
	h := handler.HooksConfig(t.TempDir())
	req := httptest.NewRequest(http.MethodPost, "/api/hooks-config?agent=claudecode", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestHooksConfigGetMissingFile(t *testing.T) {
	h := handler.HooksConfig(t.TempDir())
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
	h := handler.HooksConfig(t.TempDir())
	req := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=claudecode",
		bytes.NewBufferString("not json"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHooksConfigClaudeCodeRoundtrip(t *testing.T) {
	h := handler.HooksConfig(t.TempDir())

	putBody := `{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"curl http://localhost:10804/api/hook","timeout":5}]}]}}`
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
	home := t.TempDir()
	settingsPath := claudeSettings(home)
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o700); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	initial := `{"theme":"dark","hooks":{},"model":"claude-3"}`
	if err := os.WriteFile(settingsPath, []byte(initial), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	h := handler.HooksConfig(home)

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
	h := handler.HooksConfig(t.TempDir())

	putBody := `{"hooks":{"PreToolUse":[{"matcher":".*","hooks":[{"type":"command","command":"curl http://localhost:10804/api/hook"}]}]}}`
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
	home := t.TempDir()
	h := handler.HooksConfig(home)

	req := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=claudecode",
		bytes.NewBufferString(`{"hooks":{}}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(claudeSettings(home)); err != nil {
		t.Fatalf("file not created: %v", err)
	}
}
