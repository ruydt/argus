package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"runtime"
	"testing"

	"hooker/internal/handler"
)

func TestHooksSimulateRejectsGET(t *testing.T) {
	h := handler.HooksSimulate()
	req := httptest.NewRequest(http.MethodGet, "/api/hooks/simulate", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestHooksSimulateEmptyCommand(t *testing.T) {
	h := handler.HooksSimulate()
	body := `{"command":"","payload":{"hook_event_name":"SessionStart"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/hooks/simulate",
		bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHooksSimulateInvalidRequestJSON(t *testing.T) {
	h := handler.HooksSimulate()
	req := httptest.NewRequest(http.MethodPost, "/api/hooks/simulate",
		bytes.NewBufferString("not json"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHooksSimulateSuccess(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("sh not available on Windows")
	}
	h := handler.HooksSimulate()
	body := `{"command":"echo hello","payload":{"hook_event_name":"SessionStart","session_id":"sim-abc123"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/hooks/simulate",
		bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Stdout     string `json:"stdout"`
		Stderr     string `json:"stderr"`
		ExitCode   int    `json:"exit_code"`
		DurationMs int64  `json:"duration_ms"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.ExitCode != 0 {
		t.Fatalf("exit_code = %d, want 0", resp.ExitCode)
	}
	if resp.Stdout != "hello\n" {
		t.Fatalf("stdout = %q, want %q", resp.Stdout, "hello\n")
	}
	if resp.DurationMs < 0 {
		t.Fatalf("duration_ms = %d, want >= 0", resp.DurationMs)
	}
}

func TestHooksSimulateNonZeroExit(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("sh not available on Windows")
	}
	h := handler.HooksSimulate()
	body := `{"command":"exit 2","payload":{"hook_event_name":"Stop"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/hooks/simulate",
		bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (non-zero exit is not a server error)", rec.Code)
	}
	var resp struct {
		ExitCode int `json:"exit_code"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.ExitCode != 2 {
		t.Fatalf("exit_code = %d, want 2", resp.ExitCode)
	}
}

func TestHooksSimulatePayloadArrivesOnStdin(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("sh not available on Windows")
	}
	h := handler.HooksSimulate()
	body := `{"command":"cat","payload":{"hook_event_name":"PreToolUse","tool_name":"Bash"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/hooks/simulate",
		bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Stdout string `json:"stdout"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal([]byte(resp.Stdout), &got); err != nil {
		t.Fatalf("stdout is not valid JSON: %v — got %q", err, resp.Stdout)
	}
	if got["hook_event_name"] != "PreToolUse" {
		t.Fatalf("hook_event_name = %v, want PreToolUse", got["hook_event_name"])
	}
	if got["tool_name"] != "Bash" {
		t.Fatalf("tool_name = %v, want Bash", got["tool_name"])
	}
}

func TestHooksSimulateStderrCaptured(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("sh not available on Windows")
	}
	h := handler.HooksSimulate()
	body := `{"command":"echo err-msg >&2; exit 1","payload":{"hook_event_name":"Stop"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/hooks/simulate",
		bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var resp struct {
		Stderr   string `json:"stderr"`
		ExitCode int    `json:"exit_code"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.ExitCode != 1 {
		t.Fatalf("exit_code = %d, want 1", resp.ExitCode)
	}
	if resp.Stderr != "err-msg\n" {
		t.Fatalf("stderr = %q, want %q", resp.Stderr, "err-msg\n")
	}
}

func TestHooksSimulateUsesRequestedTimeout(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("sh not available on Windows")
	}
	h := handler.HooksSimulate()
	body := `{"command":"sleep 2","payload":{"hook_event_name":"PermissionRequest"},"timeout_seconds":1}`
	req := httptest.NewRequest(http.MethodPost, "/api/hooks/simulate",
		bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var resp struct {
		Stderr   string `json:"stderr"`
		ExitCode int    `json:"exit_code"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.ExitCode != -1 {
		t.Fatalf("exit_code = %d, want -1", resp.ExitCode)
	}
	if resp.Stderr != "hook timed out after 1s" {
		t.Fatalf("stderr = %q, want requested timeout message", resp.Stderr)
	}
}
