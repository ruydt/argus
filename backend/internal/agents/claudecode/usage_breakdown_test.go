package claudecode_test

import (
	"os"
	"testing"

	"agent-monitor/internal/agents/claudecode"
)

func TestComputeUsageBreakdownGroupsAssistantUsageByModel(t *testing.T) {
	transcript := t.TempDir() + "/claude-session.jsonl"
	data := "" +
		`{"type":"assistant","message":{"model":"claude-sonnet-4-6","usage":{"input_tokens":12,"output_tokens":3,"cache_creation_input_tokens":2,"cache_read_input_tokens":20}}}` + "\n" +
		`{"type":"assistant","message":{"model":"claude-opus-4-1","usage":{"input_tokens":7,"output_tokens":5,"cache_creation_input_tokens":1,"cache_read_input_tokens":11}}}` + "\n"
	if err := os.WriteFile(transcript, []byte(data), 0o600); err != nil {
		t.Fatalf("write transcript: %v", err)
	}

	got := claudecode.ComputeUsageBreakdown(transcript)

	if got.Total.InputTokens != 19 || got.Total.OutputTokens != 8 {
		t.Fatalf("total = %+v, want input=19 output=8", got.Total)
	}
	if got.Total.CacheCreationTokens != 3 || got.Total.CacheReadTokens != 31 || got.Total.Turns != 2 {
		t.Fatalf("total = %+v, want cache_creation=3 cache_read=31 turns=2", got.Total)
	}
	if len(got.Models) != 2 {
		t.Fatalf("models len = %d, want 2", len(got.Models))
	}

	byModel := map[string]struct {
		input       int
		output      int
		cacheCreate int
		cacheRead   int
		turns       int
	}{}
	for _, usage := range got.Models {
		byModel[usage.Model] = struct {
			input       int
			output      int
			cacheCreate int
			cacheRead   int
			turns       int
		}{
			input:       usage.InputTokens,
			output:      usage.OutputTokens,
			cacheCreate: usage.CacheCreationTokens,
			cacheRead:   usage.CacheReadTokens,
			turns:       usage.Turns,
		}
	}

	if got := byModel["claude-sonnet-4-6"]; got.input != 12 || got.output != 3 || got.cacheCreate != 2 || got.cacheRead != 20 || got.turns != 1 {
		t.Fatalf("claude-sonnet-4-6 = %+v, want input=12 output=3 cacheCreate=2 cacheRead=20 turns=1", got)
	}
	if got := byModel["claude-opus-4-1"]; got.input != 7 || got.output != 5 || got.cacheCreate != 1 || got.cacheRead != 11 || got.turns != 1 {
		t.Fatalf("claude-opus-4-1 = %+v, want input=7 output=5 cacheCreate=1 cacheRead=11 turns=1", got)
	}
}
