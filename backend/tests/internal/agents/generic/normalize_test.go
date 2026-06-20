package generic_test

import (
	"testing"

	"argus/internal/agents/generic"
)

func TestNormalizeCursorLike(t *testing.T) {
	raw := []byte(`{"hook_event_name":"beforeShellExecution","conversation_id":"c1","tool_name":"Shell","cwd":"/x","model":"gpt"}`)
	e, err := generic.Normalize(raw, "cursor")
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if e.Agent != "cursor" {
		t.Errorf("Agent = %q, want cursor", e.Agent)
	}
	if e.HookEventName != "beforeShellExecution" {
		t.Errorf("HookEventName = %q", e.HookEventName)
	}
	if e.Session != "c1" {
		t.Errorf("Session = %q, want c1 (from conversation_id)", e.Session)
	}
	if e.Tool != "Shell" {
		t.Errorf("Tool = %q", e.Tool)
	}
	if e.CWD != "/x" {
		t.Errorf("CWD = %q", e.CWD)
	}
	if e.Model != "gpt" {
		t.Errorf("Model = %q", e.Model)
	}
	if string(e.RawPayload) != string(raw) {
		t.Errorf("RawPayload not preserved")
	}
	if e.NormalizationStatus != "ok" {
		t.Errorf("NormalizationStatus = %q", e.NormalizationStatus)
	}
}

func TestNormalizePluginNestedEvent(t *testing.T) {
	raw := []byte(`{"event":{"type":"tool.execute.before"},"sessionID":"s1","tool":"bash","directory":"/y"}`)
	e, err := generic.Normalize(raw, "opencode")
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if e.HookEventName != "tool.execute.before" {
		t.Errorf("HookEventName = %q, want tool.execute.before (from event.type)", e.HookEventName)
	}
	if e.Session != "s1" {
		t.Errorf("Session = %q, want s1 (from sessionID)", e.Session)
	}
	if e.Tool != "bash" {
		t.Errorf("Tool = %q", e.Tool)
	}
	if e.CWD != "/y" {
		t.Errorf("CWD = %q, want /y (from directory)", e.CWD)
	}
}

func TestNormalizeWorkspaceRoots(t *testing.T) {
	raw := []byte(`{"hookName":"PreToolUse","taskId":"t1","workspaceRoots":["/root","/b"]}`)
	e, err := generic.Normalize(raw, "cline")
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if e.HookEventName != "PreToolUse" {
		t.Errorf("HookEventName = %q, want PreToolUse (from hookName)", e.HookEventName)
	}
	if e.Session != "t1" {
		t.Errorf("Session = %q, want t1 (from taskId)", e.Session)
	}
	if e.CWD != "/root" {
		t.Errorf("CWD = %q, want /root (from workspaceRoots[0])", e.CWD)
	}
}

func TestNormalizeInvalidJSON(t *testing.T) {
	if _, err := generic.Normalize([]byte("not json"), "x"); err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}
