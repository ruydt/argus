package repository

import "agent-monitor/internal/domain"

// EventRepository is the storage interface. The SQLite implementation lives in
// ./sqlite. Tests use a hand-written mock of this interface.
type EventRepository interface {
	Add(e domain.NormalizedEvent) error
	List(limit int) ([]domain.NormalizedEvent, error)
	SessionModel(sessionID string) (string, error)
	ListSessions() ([]domain.Session, error)
	UpsertSession(sessionID, agent, model, source, cwd, transcriptPath string, usage domain.SessionUsage) error
	GetDashboardStats(since string) (*domain.DashboardStats, error)
}
