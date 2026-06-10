package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"argus/internal/domain"
	"argus/internal/handler"
)

func TestFileChangesReturnsOldNewAndStartLine(t *testing.T) {
	svc := newTestService(t)
	addHandlerEvent(t, svc, domain.NormalizedEvent{
		Time:          time.Date(2026, 5, 14, 10, 0, 0, 0, time.UTC).Format(time.RFC3339),
		Agent:         "codex",
		Session:       "sess-file-change",
		HookEventName: "PostToolUse",
		Tool:          "Edit",
		Action:        "UPDATE",
		Path:          "/tmp/app.ts",
		OldString:     "const title = \"Trace\"",
		NewString:     "const title = \"File changes\"",
		StartLine:     42,
	})

	h := handler.FileChanges(svc)
	req := httptest.NewRequest(
		http.MethodGet,
		"/api/file-changes?session_id=sess-file-change",
		nil,
	)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var groups []domain.FileChangeGroup
	if err := json.Unmarshal(rec.Body.Bytes(), &groups); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if len(groups) != 1 {
		t.Fatalf("groups len = %d, want 1; payload: %s", len(groups), rec.Body.String())
	}
	change := groups[0].Changes[0]
	if change.OldString != "const title = \"Trace\"" {
		t.Fatalf("old_string = %q", change.OldString)
	}
	if change.NewString != "const title = \"File changes\"" {
		t.Fatalf("new_string = %q", change.NewString)
	}
	if change.StartLine != 42 {
		t.Fatalf("start_line = %d, want 42", change.StartLine)
	}
}

func TestFileChangesIncludesCodexApplyPatchEdits(t *testing.T) {
	svc := newTestService(t)
	hook := newHook(svc)
	body := []byte(`{
		"session_id":"sess-codex-patch",
		"transcript_path":"/tmp/codex-session.jsonl",
		"cwd":"/tmp",
		"hook_event_name":"PostToolUse",
		"turn_id":"t2",
		"tool_name":"apply_patch",
		"tool_use_id":"u2",
		"tool_input":{
			"file_path":"app.ts",
			"command":"*** Begin Patch\n*** Update File: app.ts\n@@ -1 +1 @@\n-const title = \"Trace\"\n+const title = \"File changes\"\n*** End Patch\n"
		}
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	hook.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("hook status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	h := handler.FileChanges(svc)
	req = httptest.NewRequest(
		http.MethodGet,
		"/api/file-changes?session_id=sess-codex-patch",
		nil,
	)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("file changes status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	var groups []domain.FileChangeGroup
	if err := json.Unmarshal(rec.Body.Bytes(), &groups); err != nil {
		t.Fatalf("response is not valid JSON: %v", err)
	}
	if len(groups) != 1 {
		t.Fatalf("groups len = %d, want 1; payload: %s", len(groups), rec.Body.String())
	}
	if groups[0].Path != "/tmp/app.ts" {
		t.Fatalf("path = %q, want /tmp/app.ts", groups[0].Path)
	}
	change := groups[0].Changes[0]
	if change.Tool != "apply_patch" {
		t.Fatalf("tool = %q, want apply_patch", change.Tool)
	}
	if change.OldString != "const title = \"Trace\"" {
		t.Fatalf("old_string = %q", change.OldString)
	}
	if change.NewString != "const title = \"File changes\"" {
		t.Fatalf("new_string = %q", change.NewString)
	}
	if change.StartLine != 1 {
		t.Fatalf("start_line = %d, want 1", change.StartLine)
	}
}
