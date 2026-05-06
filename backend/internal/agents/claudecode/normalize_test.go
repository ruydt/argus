package claudecode_test

import (
	"testing"

	"agent-monitor/internal/agents/claudecode"
)

func TestNormalizeEditPayload(t *testing.T) {
	raw := []byte(`{
		"session_id":"s1",
		"transcript_path":"/home/user/.claude/sessions/abc.jsonl",
		"cwd":"/tmp",
		"hook_event_name":"PreToolUse",
		"model":"claude-opus-4-1",
		"source":"startup",
		"turn_id":"t1",
		"tool_name":"Edit",
		"tool_use_id":"u1",
		"prompt":"p",
		"tool_input":{
			"file_path":"foo.go",
			"description":"edit foo",
			"old_string":"old line",
			"new_string":"new line"
		}
	}`)

	got, err := claudecode.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.Agent != "claudecode" {
		t.Fatalf("Agent = %q, want claudecode", got.Agent)
	}
	if got.Path != "/tmp/foo.go" {
		t.Fatalf("Path = %q, want /tmp/foo.go", got.Path)
	}
	if got.Action != "EDIT" {
		t.Fatalf("Action = %q, want EDIT", got.Action)
	}
	if got.OldString != "old line" || got.NewString != "new line" {
		t.Fatalf("diff = (%q, %q), want old/new lines", got.OldString, got.NewString)
	}
}
