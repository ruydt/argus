package repository

import (
	"context"
	"io"

	"hooker/internal/domain"
)

// EventRepository is the storage interface. The SQLite implementation lives in
// ./sqlite. Tests use a hand-written mock of this interface.
type EventRepository interface {
	Add(e domain.NormalizedEvent) error
	List(limit int) ([]domain.NormalizedEvent, error)
	ListBySession(sessionID string, limit int) ([]domain.NormalizedEvent, error)
	ListByTimeRange(since, until, sessionID string, beforeID int64, limit int) (events []domain.NormalizedEvent, minID int64, hasMore bool, err error)
	ListBySessionsTimeRange(since, until string, beforeCursor int64, sessionLimit int) (events []domain.NormalizedEvent, nextCursor int64, hasMore bool, err error)
	SessionModel(sessionID string) (string, error)
	ListProjects() ([]domain.Project, error)
	ListSessions() ([]domain.Session, error)
	ListSessionsByCWD(cwd, since string) ([]domain.Session, error)
	UpsertSession(sessionID, agent, model, source, cwd, transcriptPath, eventTime, endedAt string, usage domain.SessionUsage) error
	DiagnosticsStorageStats() (domain.DiagnosticsStorageStats, error)
	DiagnosticsAgentStats() ([]domain.DiagnosticsAgentStats, error)
	GetDashboardStats(since, until string) (*domain.DashboardStats, error)
	GetSessionTree(since string) ([]domain.SessionTreeNode, error)
	ListSessionsByCWDPage(cwd, since string, page, size int) ([]domain.Session, int, error)
	GetFileChanges(sessionID string) ([]domain.FileChangeGroup, error)
	GetSessionFileChangeCounts(ids []string) (map[string]int, error)
	ExportEvents(ctx context.Context, w io.Writer) error
	ExportSnapshot(ctx context.Context, destPath string) error
	GetRawPayload(dedupKey string) ([]byte, error)
	Ready() bool
}
