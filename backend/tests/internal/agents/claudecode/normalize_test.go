package claudecode_test

import (
	"testing"

	"argus/internal/agents/claudecode"
)

func TestNormalizeEdgeCases(t *testing.T) {
	// Invalid JSON must return an error (degraded-mode contract), never panic.
	if _, err := claudecode.Normalize([]byte(`{not json`)); err == nil {
		t.Error("invalid JSON: expected error, got nil")
	}
	// Empty object is valid JSON — must normalize without panic.
	if _, err := claudecode.Normalize([]byte(`{}`)); err != nil {
		t.Errorf("empty object: unexpected error %v", err)
	}
	// Wrong-typed field must not panic.
	if _, err := claudecode.Normalize([]byte(`{"session_id": 123}`)); err == nil {
		t.Error("wrong-typed field: expected error, got nil")
	}
}

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

func TestNormalizeCommandRelativePathResolvedToCWD(t *testing.T) {
	raw := []byte(`{
		"session_id":"s2",
		"transcript_path":"/tmp/claude-session.jsonl",
		"cwd":"/Users/duytran/GitHub/argus/frontend/src/features/usage",
		"hook_event_name":"PreToolUse",
		"tool_name":"Read",
		"tool_use_id":"u2",
		"tool_input":{
			"command":"cat ./hooks/useOpenAIUsage"
		}
	}`)

	got, err := claudecode.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	want := "/Users/duytran/GitHub/argus/frontend/src/features/usage/hooks/useOpenAIUsage"
	if got.Path != want {
		t.Fatalf("Path = %q, want %q", got.Path, want)
	}
}

func TestNormalizeClaudecodeNormalizerVersion(t *testing.T) {
	raw := []byte(`{
		"session_id":"s3",
		"transcript_path":"/home/user/.claude/sessions/abc.jsonl",
		"cwd":"/tmp",
		"hook_event_name":"PreToolUse",
		"tool_name":"Read",
		"tool_use_id":"u3",
		"turn_id":"t3",
		"tool_input":{"file_path":"foo.go"}
	}`)

	got, err := claudecode.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.NormalizerVersion != "claudecode/1" {
		t.Fatalf("NormalizerVersion = %q, want claudecode/1", got.NormalizerVersion)
	}
}

// TestNormalizeSetsMeta asserts that a valid Claude Code PreToolUse payload
// produces NormalizationStatus="ok" and NormalizerVersion="claudecode/1".
func TestNormalizeSetsMeta(t *testing.T) {
	payload := []byte(`{
		"session_id": "sess-meta-01",
		"transcript_path": "/home/user/.claude/projects/test/transcript.jsonl",
		"hook_event_name": "PreToolUse",
		"turn_id": "turn-01",
		"tool_use_id": "tuse-01",
		"cwd": "/tmp",
		"tool_name": "Bash",
		"tool_input": {"command": "true"}
	}`)

	e, err := claudecode.Normalize(payload)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if e.NormalizationStatus != "ok" {
		t.Errorf("NormalizationStatus: want 'ok', got %q", e.NormalizationStatus)
	}
	if e.NormalizerVersion != "claudecode/1" {
		t.Errorf("NormalizerVersion: want 'claudecode/1', got %q", e.NormalizerVersion)
	}
}

// TestNormalizePostToolUseSetsMeta asserts that a valid PostToolUse payload
// produces NormalizationStatus="ok" and NormalizerVersion="claudecode/1".
func TestNormalizePostToolUseSetsMeta(t *testing.T) {
	payload := []byte(`{
		"session_id": "sess-post-01",
		"transcript_path": "/home/user/.claude/projects/test/transcript.jsonl",
		"hook_event_name": "PostToolUse",
		"turn_id": "turn-02",
		"tool_use_id": "tuse-02",
		"cwd": "/tmp",
		"tool_name": "Edit",
		"tool_input": {"file_path": "main.go", "old_string": "a", "new_string": "b"}
	}`)

	e, err := claudecode.Normalize(payload)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if e.NormalizationStatus != "ok" {
		t.Errorf("NormalizationStatus: want 'ok', got %q", e.NormalizationStatus)
	}
	if e.NormalizerVersion != "claudecode/1" {
		t.Errorf("NormalizerVersion: want 'claudecode/1', got %q", e.NormalizerVersion)
	}
}

func TestNormalizeUserPromptExpansionFields(t *testing.T) {
	raw := []byte(`{
		"session_id": "s-exp-01",
		"transcript_path": "/home/user/.claude/sessions/abc.jsonl",
		"cwd": "/tmp",
		"hook_event_name": "UserPromptExpansion",
		"expansion_type": "slash_command",
		"command_name": "/brainstorming"
	}`)

	got, err := claudecode.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.Action != "PROMPT" {
		t.Errorf("Action = %q, want PROMPT", got.Action)
	}
	if got.ExpansionType != "slash_command" {
		t.Errorf("ExpansionType = %q, want slash_command", got.ExpansionType)
	}
	if got.CommandName != "/brainstorming" {
		t.Errorf("CommandName = %q, want /brainstorming", got.CommandName)
	}
}

func TestNormalizeElicitationFields(t *testing.T) {
	raw := []byte(`{
		"session_id": "s-elicit-01",
		"transcript_path": "/home/user/.claude/sessions/abc.jsonl",
		"cwd": "/tmp",
		"hook_event_name": "Elicitation",
		"server_name": "memory",
		"prompt": "Should I delete these files?"
	}`)

	got, err := claudecode.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.Action != "ELICIT" {
		t.Errorf("Action = %q, want ELICIT", got.Action)
	}
	if got.ServerName != "memory" {
		t.Errorf("ServerName = %q, want memory", got.ServerName)
	}
}

func TestNormalizeInstructionsLoadedFields(t *testing.T) {
	raw := []byte(`{
		"session_id": "s-instruct-01",
		"transcript_path": "/home/user/.claude/sessions/abc.jsonl",
		"cwd": "/tmp",
		"hook_event_name": "InstructionsLoaded",
		"memory_type": "project",
		"load_reason": "startup"
	}`)

	got, err := claudecode.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.Action != "INSTRUCT" {
		t.Errorf("Action = %q, want INSTRUCT", got.Action)
	}
	if got.MemoryType != "project" {
		t.Errorf("MemoryType = %q, want project", got.MemoryType)
	}
	if got.LoadReason != "startup" {
		t.Errorf("LoadReason = %q, want startup", got.LoadReason)
	}
}

func TestNormalizeWorktreeFields(t *testing.T) {
	raw := []byte(`{
		"session_id": "s-worktree-01",
		"transcript_path": "/home/user/.claude/sessions/abc.jsonl",
		"cwd": "/tmp",
		"hook_event_name": "WorktreeCreate",
		"branch": "feature/foo"
	}`)

	got, err := claudecode.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.Action != "WORKTREE" {
		t.Errorf("Action = %q, want WORKTREE", got.Action)
	}
	if got.Branch != "feature/foo" {
		t.Errorf("Branch = %q, want feature/foo", got.Branch)
	}
}
