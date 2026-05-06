package service

import (
	"sync"
	"time"

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
		if err := s.repo.UpsertSession(e.Session, e.Agent, e.Model, e.Source, e.CWD, e.TranscriptPath); err != nil {
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
