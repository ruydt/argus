package repository

import (
	"context"
	"io"
	"time"

	"argus/internal/domain"
)

// EventRepository is the storage interface. The SQLite implementation lives in
// ./sqlite. Tests use a hand-written mock of this interface.
type EventRepository interface {
	Add(e domain.NormalizedEvent) error
	List(limit int) ([]domain.NormalizedEvent, error)
	ListBySession(sessionID string, limit int) ([]domain.NormalizedEvent, error)
	ListByTimeRange(since, until, sessionID string, beforeID int64, limit int) (events []domain.NormalizedEvent, minID int64, hasMore bool, err error)
	ListBySessionsTimeRange(since, until, search string, beforeCursor int64, sessionLimit int) (events []domain.NormalizedEvent, nextCursor int64, hasMore bool, err error)
	SessionModel(sessionID string) (string, error)
	UpsertSession(sessionID, agent, model, source, cwd, transcriptPath, eventTime, endedAt string) error
	DiagnosticsStorageStats() (domain.DiagnosticsStorageStats, error)
	DiagnosticsAgentStats() ([]domain.DiagnosticsAgentStats, error)
	ExportEvents(ctx context.Context, w io.Writer) error
	ExportSnapshot(ctx context.Context, destPath string) error
	GetRawPayload(dedupKey string) ([]byte, error)
	Compact(ctx context.Context) (domain.CompactResult, error)
	PruneEvents(ctx context.Context, before string, maxEvents int) (int64, error)
	MarkStaleSessions(cutoff time.Time) (int64, error)
	Ready() bool
	DBHealth() (domain.DiagnosticsDBHealth, error)
}
