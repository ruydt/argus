package codex_test

import (
	"os"
	"testing"

	"agent-monitor/internal/agents/codex"
)

func TestComputeUsageBreakdownTracksModelSwitches(t *testing.T) {
	transcript := t.TempDir() + "/codex-session.jsonl"
	data := "" +
		`{"type":"turn_context","payload":{"model":"gpt-5.5"}}` + "\n" +
		`{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":10,"cached_input_tokens":4,"output_tokens":2}}}}` + "\n" +
		`{"type":"turn_context","payload":{"model":"gpt-5.4"}}` + "\n" +
		`{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":25,"cached_input_tokens":10,"output_tokens":5}}}}` + "\n"
	if err := os.WriteFile(transcript, []byte(data), 0o600); err != nil {
		t.Fatalf("write transcript: %v", err)
	}

	got := codex.ComputeUsageBreakdown(transcript)

	if got.Total.InputTokens != 25 || got.Total.OutputTokens != 5 || got.Total.CacheReadTokens != 10 {
		t.Fatalf("total = %+v, want input=25 output=5 cache_read=10", got.Total)
	}
	if got.Total.Turns != 2 {
		t.Fatalf("turns = %d, want 2", got.Total.Turns)
	}
	if len(got.Models) != 2 {
		t.Fatalf("models len = %d, want 2", len(got.Models))
	}

	byModel := map[string]struct {
		input  int
		output int
		cache  int
		turns  int
	}{}
	for _, usage := range got.Models {
		byModel[usage.Model] = struct {
			input  int
			output int
			cache  int
			turns  int
		}{
			input:  usage.InputTokens,
			output: usage.OutputTokens,
			cache:  usage.CacheReadTokens,
			turns:  usage.Turns,
		}
	}

	if got := byModel["gpt-5.5"]; got.input != 10 || got.output != 2 || got.cache != 4 || got.turns != 1 {
		t.Fatalf("gpt-5.5 = %+v, want input=10 output=2 cache=4 turns=1", got)
	}
	if got := byModel["gpt-5.4"]; got.input != 15 || got.output != 3 || got.cache != 6 || got.turns != 1 {
		t.Fatalf("gpt-5.4 = %+v, want input=15 output=3 cache=6 turns=1", got)
	}
}
