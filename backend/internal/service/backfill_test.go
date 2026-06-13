package service_test

import (
	"os"
	"path/filepath"
	"testing"

	"argus/internal/domain"
	"argus/internal/repository"
	"argus/internal/service"
)

// trackingListRepo serves canned sessions and records upserts.
type trackingListRepo struct {
	repository.EventRepository
	sessions []domain.Session
	upserts  int
}

func (r *trackingListRepo) ListSessions() ([]domain.Session, error) {
	out := make([]domain.Session, len(r.sessions))
	copy(out, r.sessions)
	return out, nil
}
func (r *trackingListRepo) ListSessionsByCWD(string, string) ([]domain.Session, error) {
	return r.ListSessions()
}
func (r *trackingListRepo) UpsertSession(_, _, _, _, _, _, _, _ string, _ domain.SessionUsage) error {
	r.upserts++
	return nil
}

func writeUsageTranscript(t *testing.T) string {
	t.Helper()
	dir := filepath.Join(t.TempDir(), ".claude")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	transcript := filepath.Join(dir, "t.jsonl")
	line := `{"type":"assistant","message":{"model":"m","usage":{"input_tokens":10,"output_tokens":5}}}` + "\n"
	if err := os.WriteFile(transcript, []byte(line), 0o644); err != nil {
		t.Fatal(err)
	}
	return transcript
}

func TestListSessionsDoesNotScanTranscripts(t *testing.T) {
	transcript := writeUsageTranscript(t)
	repo := &trackingListRepo{sessions: []domain.Session{
		{SessionID: "s1", Agent: "claudecode", TranscriptPath: transcript}, // no usage stored
	}}
	svc := service.New(repo)

	if _, err := svc.ListSessions(); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ListSessionsByCWD("/tmp", ""); err != nil {
		t.Fatal(err)
	}
	if repo.upserts != 0 {
		t.Fatalf("read paths should not upsert/backfill, got %d upserts", repo.upserts)
	}
}

func TestBackfillMissingSessionUsage(t *testing.T) {
	transcript := writeUsageTranscript(t)
	repo := &trackingListRepo{sessions: []domain.Session{
		{SessionID: "s1", Agent: "claudecode", TranscriptPath: transcript},
		{SessionID: "s2", Agent: "claudecode", TranscriptPath: transcript,
			Usage: domain.SessionUsage{InputTokens: 1}}, // already has usage — skipped
	}}
	svc := service.New(repo)

	svc.BackfillMissingSessionUsage()
	if repo.upserts != 1 {
		t.Fatalf("expected exactly 1 backfill upsert, got %d", repo.upserts)
	}
}
