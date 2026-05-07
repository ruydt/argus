package service

import (
	"sync"
	"time"

	"agent-monitor/internal/agents/claudecode"
	"agent-monitor/internal/agents/codex"
	"agent-monitor/internal/domain"
	"agent-monitor/internal/repository"
)

type EventService struct {
	repo        repository.EventRepository
	subscribers sync.Map
}

func New(repo repository.EventRepository) *EventService {
	return &EventService{repo: repo}
}

func (s *EventService) AddEvent(e domain.NormalizedEvent) error {
	if e.Time == "" {
		e.Time = time.Now().Format(time.RFC3339)
	}
	if err := s.repo.Add(e); err != nil {
		return err
	}
	if e.Session != "" {
		var usage domain.SessionUsage
		if e.Agent == "claudecode" {
			usage = claudecode.ComputeUsage(e.TranscriptPath)
		} else {
			usage = codex.ComputeUsage(e.TranscriptPath)
		}
		if err := s.repo.UpsertSession(e.Session, e.Agent, e.Model, e.Source, e.CWD, e.TranscriptPath, usage); err != nil {
			return err
		}
	}
	s.broadcast(e)
	return nil
}

func (s *EventService) ListEvents(limit int) ([]domain.NormalizedEvent, error) {
	return s.repo.List(limit)
}

func (s *EventService) SessionModel(sessionID string) (string, error) {
	return s.repo.SessionModel(sessionID)
}

func (s *EventService) ListSessions() ([]domain.Session, error) {
	sessions, err := s.repo.ListSessions()
	if err != nil {
		return nil, err
	}
	if err := s.backfillSessionUsage(sessions); err != nil {
		return nil, err
	}
	return sessions, nil
}

func (s *EventService) GetDashboardStats(since string) (*domain.DashboardStats, error) {
	sessions, err := s.repo.ListSessions()
	if err != nil {
		return nil, err
	}
	if err := s.backfillSessionUsage(sessions); err != nil {
		return nil, err
	}
	return s.repo.GetDashboardStats(since)
}

func (s *EventService) backfillSessionUsage(sessions []domain.Session) error {
	for i := range sessions {
		if hasUsage(sessions[i].Usage) || sessions[i].TranscriptPath == "" {
			continue
		}
		usage := computeUsage(sessions[i].Agent, sessions[i].TranscriptPath)
		if !hasUsage(usage) {
			continue
		}
		sessions[i].Usage = usage
		if err := s.repo.UpsertSession(
			sessions[i].SessionID,
			sessions[i].Agent,
			sessions[i].Model,
			sessions[i].Source,
			sessions[i].CWD,
			sessions[i].TranscriptPath,
			usage,
		); err != nil {
			return err
		}
	}
	return nil
}

func computeUsage(agent, transcriptPath string) domain.SessionUsage {
	if agent == "claudecode" || claudecode.MatchesTranscript(transcriptPath) {
		return claudecode.ComputeUsage(transcriptPath)
	}
	return codex.ComputeUsage(transcriptPath)
}

func hasUsage(usage domain.SessionUsage) bool {
	return usage.InputTokens > 0 ||
		usage.OutputTokens > 0 ||
		usage.CacheCreationTokens > 0 ||
		usage.CacheReadTokens > 0 ||
		usage.Turns > 0
}

func (s *EventService) Subscribe() <-chan domain.NormalizedEvent {
	ch := make(chan domain.NormalizedEvent, 64)
	recv := (<-chan domain.NormalizedEvent)(ch)
	s.subscribers.Store(recv, ch)
	return recv
}

func (s *EventService) Unsubscribe(ch <-chan domain.NormalizedEvent) {
	if v, ok := s.subscribers.LoadAndDelete(ch); ok {
		close(v.(chan domain.NormalizedEvent))
	}
}

func (s *EventService) broadcast(e domain.NormalizedEvent) {
	s.subscribers.Range(func(_, v any) bool {
		ch := v.(chan domain.NormalizedEvent)
		select {
		case ch <- e:
		default:
		}
		return true
	})
}
