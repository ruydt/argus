package codex_test

import (
	"testing"

	"hooker/internal/agents/codex"
)

func TestNormalizeApplyPatchUsesPatchRendering(t *testing.T) {
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
	if got.OldString != "" || got.NewString != "" {
		t.Fatalf("diff = (%q, %q), want empty for patch rendering", got.OldString, got.NewString)
	}
	if got.StartLine != 1 {
		t.Fatalf("StartLine = %d, want 1", got.StartLine)
	}
}

func TestNormalizeApplyPatchDoesNotUseSlashCommentAsPath(t *testing.T) {
	raw := []byte(`{
		"session_id":"s3",
		"transcript_path":"/tmp/codex-session.jsonl",
		"cwd":"/tmp",
		"hook_event_name":"PreToolUse",
		"turn_id":"t3",
		"tool_name":"apply_patch",
		"tool_use_id":"u3",
		"tool_input":{
			"command":"*** Begin Patch\n*** Update File: foo.go\n@@\n-// old line\n+// new line\n*** End Patch\n"
		}
	}`)

	got, err := codex.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.Path != "/tmp/foo.go" {
		t.Fatalf("Path = %q, want /tmp/foo.go", got.Path)
	}
}

func TestNormalizeCommandRelativePathResolvedToCWD(t *testing.T) {
	raw := []byte(`{
		"session_id":"s4",
		"transcript_path":"/tmp/codex-session.jsonl",
		"cwd":"/Users/duytran/GitHub/hooker/frontend/src/features/usage",
		"hook_event_name":"PreToolUse",
		"turn_id":"t4",
		"tool_name":"read_file",
		"tool_use_id":"u4",
		"tool_input":{
			"command":"cat ./hooks/useOpenAIUsage"
		}
	}`)

	got, err := codex.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	want := "/Users/duytran/GitHub/hooker/frontend/src/features/usage/hooks/useOpenAIUsage"
	if got.Path != want {
		t.Fatalf("Path = %q, want %q", got.Path, want)
	}
}

func TestNormalizeCompactEventIncludesTrigger(t *testing.T) {
	raw := []byte(`{
		"session_id":"s5",
		"transcript_path":"/tmp/codex-session.jsonl",
		"cwd":"/tmp",
		"hook_event_name":"PreCompact",
		"turn_id":"t5",
		"trigger":"auto"
	}`)

	got, err := codex.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.Action != "COMPACT" {
		t.Fatalf("Action = %q, want COMPACT", got.Action)
	}
	if got.Trigger != "auto" {
		t.Fatalf("Trigger = %q, want auto", got.Trigger)
	}
}

func TestNormalizeCodexNormalizerVersion(t *testing.T) {
	raw := []byte(`{
		"session_id":"s6",
		"transcript_path":"/tmp/codex-session.jsonl",
		"cwd":"/tmp",
		"hook_event_name":"PreToolUse",
		"turn_id":"t6",
		"tool_name":"read_file",
		"tool_use_id":"u6",
		"tool_input":{"file_path":"foo.go"}
	}`)

	got, err := codex.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.NormalizerVersion != "codex/1" {
		t.Fatalf("NormalizerVersion = %q, want codex/1", got.NormalizerVersion)
	}
}
