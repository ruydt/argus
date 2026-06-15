package service_test

import (
	"os"
	"path/filepath"
	"testing"

	"argus/internal/domain"
	"argus/internal/repository"
	"argus/internal/service"
)

// countingUsageRepo records UpsertSession usage values, embedding the
// interface for unused methods.
type countingUsageRepo struct {
	repository.EventRepository
	usages []domain.SessionUsage
}

func (r *countingUsageRepo) Add(domain.NormalizedEvent) error { return nil }
func (r *countingUsageRepo) UpsertSession(_, _, _, _, _, _, _, _ string, usage domain.SessionUsage) error {
	r.usages = append(r.usages, usage)
	return nil
}
func (r *countingUsageRepo) ReplaceSessionModelUsage(string, []domain.ModelUsageBreakdown) error {
	return nil
}

func TestAddEventThrottlesUsageComputation(t *testing.T) {
	dir := filepath.Join(t.TempDir(), ".claude")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	transcript := filepath.Join(dir, "t.jsonl")
	line := `{"type":"assistant","message":{"model":"m","usage":{"input_tokens":10,"output_tokens":5}}}` + "\n"
	if err := os.WriteFile(transcript, []byte(line), 0o644); err != nil {
		t.Fatal(err)
	}

	repo := &countingUsageRepo{}
	svc := service.New(repo)

	mid := domain.NormalizedEvent{
		Time: "2026-06-13T00:00:00Z", Agent: "claudecode", Session: "s1",
		HookEventName: "PostToolUse", TranscriptPath: transcript,
	}
	// First mid-session event computes usage (no record of a prior scan).
	if err := svc.AddEvent(mid); err != nil {
		t.Fatal(err)
	}
	// Second mid-session event within the throttle window skips the scan.
	if err := svc.AddEvent(mid); err != nil {
		t.Fatal(err)
	}
	// Terminal event always computes.
	stop := mid
	stop.HookEventName = "Stop"
	if err := svc.AddEvent(stop); err != nil {
		t.Fatal(err)
	}

	if len(repo.usages) != 3 {
		t.Fatalf("expected 3 upserts, got %d", len(repo.usages))
	}
	if repo.usages[0].InputTokens != 10 {
		t.Fatalf("first event should compute usage, got %+v", repo.usages[0])
	}
	if repo.usages[1].InputTokens != 0 {
		t.Fatalf("second event within throttle window should pass zero usage, got %+v", repo.usages[1])
	}
	if repo.usages[2].InputTokens != 10 {
		t.Fatalf("terminal event should compute usage, got %+v", repo.usages[2])
	}
}
