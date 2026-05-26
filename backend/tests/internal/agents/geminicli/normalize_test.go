package geminicli_test

import (
	"testing"
	"hooker/internal/agents/geminicli"
)

func TestNormalizeGeminiPayload(t *testing.T) {
	raw := []byte(`{
		"session_id":"gemini-1",
		"transcript_path":"/home/user/.gemini/history/proj/session.jsonl",
		"cwd":"/tmp",
		"hook_event_name":"PreToolUse",
		"model":"gemini-1.5-pro",
		"tool_name":"run_shell_command",
		"tool_input":{
			"command":"ls -al"
		}
	}`)

	got, err := geminicli.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.Agent != "geminicli" {
		t.Errorf("Agent = %q, want geminicli", got.Agent)
	}
	if got.Action != "BASH" {
		t.Errorf("Action = %q, want BASH", got.Action)
	}
}

func TestNormalizeGeminicliNormalizerVersion(t *testing.T) {
	raw := []byte(`{
		"session_id":"gemini-2",
		"transcript_path":"/home/user/.gemini/history/proj/session.jsonl",
		"cwd":"/tmp",
		"hook_event_name":"PreToolUse",
		"model":"gemini-1.5-pro",
		"tool_name":"run_shell_command",
		"tool_input":{"command":"ls"}
	}`)

	got, err := geminicli.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.NormalizerVersion != "geminicli/1" {
		t.Fatalf("NormalizerVersion = %q, want geminicli/1", got.NormalizerVersion)
	}
}
