package codex_test

import (
	"testing"

	"agent-monitor/internal/agents/codex"
)

func TestNormalizeApplyPatchFallsBackToCommandDiff(t *testing.T) {
	raw := []byte(`{
		"session_id":"s2",
		"transcript_path":"/tmp/codex-session.jsonl",
		"cwd":"/tmp",
		"hook_event_name":"PostToolUse",
		"turn_id":"t2",
		"tool_name":"apply_patch",
		"tool_use_id":"u2",
		"tool_input":{
			"file_path":"foo.go",
			"command":"*** Begin Patch\n*** Update File: foo.go\n@@ -1 +1 @@\n-old line\n+new line\n*** End Patch\n"
		}
	}`)

	got, err := codex.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.Agent != "codex" {
		t.Fatalf("Agent = %q, want codex", got.Agent)
	}
	if got.Path != "/tmp/foo.go" {
		t.Fatalf("Path = %q, want /tmp/foo.go", got.Path)
	}
	if got.OldString != "old line" || got.NewString != "new line" {
		t.Fatalf("diff = (%q, %q), want old/new lines", got.OldString, got.NewString)
	}
}
