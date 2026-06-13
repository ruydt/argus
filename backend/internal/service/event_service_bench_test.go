package service_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"argus/internal/domain"
	"argus/internal/repository/sqlite"
	"argus/internal/service"
)

// writeBenchTranscript writes a Claude-Code-shaped JSONL transcript with n
// assistant entries. The "/.claude/" path segment makes agent detection match.
func writeBenchTranscript(b *testing.B, dir string, n int) string {
	b.Helper()
	var sb strings.Builder
	for i := 0; i < n; i++ {
		sb.WriteString(`{"type":"assistant","message":{"model":"claude-sonnet-4-6","usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":10,"cache_read_input_tokens":500}}}` + "\n")
	}
	path := filepath.Join(dir, "transcript.jsonl")
	if err := os.WriteFile(path, []byte(sb.String()), 0o644); err != nil {
		b.Fatal(err)
	}
	return path
}

func BenchmarkGetDashboardStats(b *testing.B) {
	repo, err := sqlite.New(":memory:")
	if err != nil {
		b.Fatal(err)
	}
	defer func() { _ = repo.Close() }()
	svc := service.New(repo)

	dir := filepath.Join(b.TempDir(), ".claude")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		b.Fatal(err)
	}
	transcript := writeBenchTranscript(b, dir, 500)

	for i := 0; i < 100; i++ {
		e := domain.NormalizedEvent{
			Time:           fmt.Sprintf("2026-06-12T%02d:%02d:00Z", i/60, i%60),
			Agent:          "claudecode",
			Session:        fmt.Sprintf("bench-session-%03d", i),
			HookEventName:  "PostToolUse",
			Tool:           "Edit",
			Action:         "EDIT",
			CWD:            "/tmp/bench",
			TranscriptPath: transcript,
		}
		if err := svc.AddEvent(e); err != nil {
			b.Fatal(err)
		}
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := svc.GetDashboardStats("", ""); err != nil {
			b.Fatal(err)
		}
	}
}
