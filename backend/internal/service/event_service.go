package service

import (
	"log/slog"
	"os"
	"slices"
	"strings"
	"sync"
	"time"

	"hooker/internal/agents/claudecode"
	"hooker/internal/agents/codex"
	"hooker/internal/agents/geminicli"
	"hooker/internal/domain"
	"hooker/internal/repository"
	"hooker/internal/version"
)

type EventService struct {
	repo        repository.EventRepository
	subscribers sync.Map
}

type DiagnosticsOptions struct {
	DBPath      string
	HookConfig  []domain.DiagnosticsHookConfig
	IgnoreFile  domain.DiagnosticsIgnoreFile
	Addr        string
	AllowRemote bool
	CORSOrigins []string
}

const exportSensitivityWarning = "Exports may include prompts, diffs, file paths, tool outputs, raw payloads, and exports; handle exported data as sensitive."

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
		switch e.Agent {
		case "claudecode":
			usage = claudecode.ComputeUsage(e.TranscriptPath)
		case "geminicli":
			usage = geminicli.ComputeUsage(e.TranscriptPath)
		default:
			usage = codex.ComputeUsage(e.TranscriptPath)
		}
		if err := s.repo.UpsertSession(
			e.Session,
			e.Agent,
			e.Model,
			e.Source,
			e.CWD,
			e.TranscriptPath,
			e.Time,
			endedAtForEvent(e),
			usage,
		); err != nil {
			return err
		}
	}
	s.broadcast(e)
	return nil
}

func (s *EventService) ListEvents(limit int) ([]domain.NormalizedEvent, error) {
	return s.repo.List(limit)
}

func (s *EventService) ListEventsBySession(sessionID string, limit int) ([]domain.NormalizedEvent, error) {
	return s.repo.ListBySession(sessionID, limit)
}

func (s *EventService) SessionModel(sessionID string) (string, error) {
	return s.repo.SessionModel(sessionID)
}

func (s *EventService) Diagnostics(dbPath string, ready bool, hookConfigs ...[]domain.DiagnosticsHookConfig) (domain.Diagnostics, error) {
	return s.DiagnosticsWithOptions(DiagnosticsOptions{
		DBPath:     dbPath,
		HookConfig: hookConfigSlice(hookConfigs),
	}, ready)
}

func (s *EventService) DiagnosticsWithOptions(opts DiagnosticsOptions, ready bool) (domain.Diagnostics, error) {
	stats, err := s.repo.DiagnosticsStorageStats()
	if err != nil {
		return domain.Diagnostics{}, err
	}
	agentStats, err := s.repo.DiagnosticsAgentStats()
	if err != nil {
		return domain.Diagnostics{}, err
	}

	health := domain.DiagnosticsHealth{
		Live:  true,
		Ready: ready,
	}
	if !ready {
		health.Reason = "database not ready"
	}

	storage := domain.DiagnosticsStorage{
		DBPath:        opts.DBPath,
		TotalEvents:   stats.TotalEvents,
		TotalSessions: stats.TotalSessions,
		LatestEventAt: stats.LatestEventAt,
	}
	if opts.DBPath == ":memory:" {
		storage.DBSizeReason = "unavailable"
	} else if info, err := os.Stat(opts.DBPath); err == nil {
		size := info.Size()
		storage.DBSizeBytes = &size
	} else {
		storage.DBSizeReason = "unavailable"
	}

	return domain.Diagnostics{
		Version: domain.DiagnosticsVersion{
			Version:   version.Version,
			Commit:    version.Commit,
			BuildDate: version.BuildDate,
		},
		Health:  health,
		Storage: storage,
		Agents:  diagnosticsAgents(agentStats, opts.HookConfig),
		Privacy: domain.DiagnosticsPrivacy{
			IgnoreFile:    opts.IgnoreFile,
			ExportWarning: exportSensitivityWarning,
		},
		Security: domain.DiagnosticsSecurity{
			RemoteBind: diagnosticsRemoteBind(opts),
			CORS:       diagnosticsCORS(opts.CORSOrigins),
		},
	}, nil
}

func diagnosticsRemoteBind(opts DiagnosticsOptions) domain.DiagnosticsRemoteBind {
	status := "loopback"
	if opts.AllowRemote {
		status = "remote_enabled"
	}
	return domain.DiagnosticsRemoteBind{
		Addr:        opts.Addr,
		Status:      status,
		AllowRemote: opts.AllowRemote,
	}
}

func diagnosticsCORS(origins []string) domain.DiagnosticsCORS {
	counts := domain.DiagnosticsCORS{TotalOrigins: len(origins)}
	for _, origin := range origins {
		if isLocalOrigin(origin) {
			counts.LocalOrigins++
		} else {
			counts.ExtraOrigins++
		}
	}
	return counts
}

func isLocalOrigin(origin string) bool {
	return strings.Contains(origin, "localhost") ||
		strings.Contains(origin, "127.0.0.1") ||
		strings.Contains(origin, "[::1]")
}

func hookConfigSlice(hookConfigs [][]domain.DiagnosticsHookConfig) []domain.DiagnosticsHookConfig {
	if len(hookConfigs) == 0 {
		return nil
	}
	return hookConfigs[0]
}

func diagnosticsAgents(stats []domain.DiagnosticsAgentStats, hookConfigs []domain.DiagnosticsHookConfig) []domain.DiagnosticsAgent {
	byAgent := map[string]domain.DiagnosticsAgentStats{}
	for _, stat := range stats {
		byAgent[stat.Agent] = stat
	}
	hookByAgent := map[string]domain.DiagnosticsHookConfig{}
	for _, hookConfig := range hookConfigs {
		hookByAgent[hookConfig.Agent] = hookConfig
	}
	defs := []struct {
		id    string
		label string
	}{
		{id: "claudecode", label: "Claude Code"},
		{id: "codex", label: "Codex"},
	}
	agents := make([]domain.DiagnosticsAgent, 0, len(defs))
	for _, def := range defs {
		stat := byAgent[def.id]
		row := domain.DiagnosticsAgent{
			ID:                def.id,
			Label:             def.label,
			EventCount:        stat.EventCount,
			LastSeenAt:        stat.LastSeenAt,
			DegradedCount:     stat.DegradedCount,
			NormalizerVersion: stat.NormalizerVersion,
			HookConfigStatus:  "unknown",
			Status:            "ok",
			Warnings:          []string{},
		}
		if hookConfig, ok := hookByAgent[def.id]; ok {
			row.HookConfigStatus = hookConfig.Status
			row.HookConfigReason = hookConfig.Reason
		}
		switch {
		case row.DegradedCount > 0:
			row.Status = "degraded"
			row.Warnings = append(row.Warnings, "degraded events")
		case row.EventCount == 0:
			row.Status = "no events"
			row.Warnings = append(row.Warnings, "no events")
		}
		agents = append(agents, row)
	}
	return agents
}

func (s *EventService) ListProjects() ([]domain.Project, error) {
	return s.repo.ListProjects()
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

func (s *EventService) ListSessionsByCWD(cwd, since string) ([]domain.Session, error) {
	sessions, err := s.repo.ListSessionsByCWD(cwd, since)
	if err != nil {
		return nil, err
	}
	if err := s.backfillSessionUsage(sessions); err != nil {
		return nil, err
	}
	return sessions, nil
}

func (s *EventService) GetDashboardStats(since, until string) (*domain.DashboardStats, error) {
	sessions, err := s.repo.ListSessions()
	if err != nil {
		return nil, err
	}
	if err := s.backfillSessionUsage(sessions); err != nil {
		return nil, err
	}
	stats, err := s.repo.GetDashboardStats(since, until)
	if err != nil {
		return nil, err
	}
	if stats == nil {
		stats = &domain.DashboardStats{
			TimelineGranularity: "day",
			Timeline:            []domain.TimelineBucket{},
			TimelineByAgent:     []domain.AgentTimelineBucket{},
			TopActions:          []domain.ActionCount{},
			AgentUsage:          []domain.AgentModelUsage{},
			SessionUsage:        []domain.DashboardSessionUsage{},
		}
	}
	enrichDashboardStats(stats, sessions, since, until)
	return stats, nil
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
			sessions[i].LastSeenAt,
			sessions[i].EndedAt,
			usage,
		); err != nil {
			return err
		}
	}
	return nil
}

func computeUsage(agent, transcriptPath string) domain.SessionUsage {
	return computeUsageBreakdown(agent, transcriptPath).Total
}

func computeUsageBreakdown(agent, transcriptPath string) domain.UsageBreakdown {
	if agent == "claudecode" || claudecode.MatchesTranscript(transcriptPath) {
		return claudecode.ComputeUsageBreakdown(transcriptPath)
	}
	if agent == "geminicli" || geminicli.MatchesTranscript(transcriptPath) {
		return geminicli.ComputeUsageBreakdown(transcriptPath)
	}
	return codex.ComputeUsageBreakdown(transcriptPath)
}

func hasUsage(usage domain.SessionUsage) bool {
	return usage.InputTokens > 0 ||
		usage.OutputTokens > 0 ||
		usage.CacheCreationTokens > 0 ||
		usage.CacheReadTokens > 0 ||
		usage.Turns > 0
}

func enrichDashboardStats(stats *domain.DashboardStats, sessions []domain.Session, since, until string) {
	filteredSessions := make([]domain.Session, 0, len(sessions))
	for _, session := range sessions {
		if sessionOutsideRange(session, since, until) {
			continue
		}
		filteredSessions = append(filteredSessions, session)
	}

	stats.TotalSessions = len(filteredSessions)
	stats.TotalInputTokens = 0
	stats.TotalOutputTokens = 0
	stats.AgentUsage = []domain.AgentModelUsage{}
	stats.SessionUsage = make([]domain.DashboardSessionUsage, 0, len(filteredSessions))

	agentUsage := map[string]*domain.AgentModelUsage{}
	for _, session := range filteredSessions {
		breakdown := computeUsageBreakdown(session.Agent, session.TranscriptPath)
		if !hasUsage(breakdown.Total) {
			breakdown.Total = session.Usage
		}
		sessionModels := dashboardModels(session, breakdown)
		if len(sessionModels) == 0 && hasUsage(session.Usage) {
			sessionModels = []domain.DashboardModelUsage{fallbackDashboardModel(session)}
		}

		stats.TotalInputTokens += breakdown.Total.InputTokens
		stats.TotalOutputTokens += breakdown.Total.OutputTokens

		stats.SessionUsage = append(stats.SessionUsage, domain.DashboardSessionUsage{
			SessionID:  session.SessionID,
			Agent:      session.Agent,
			Provider:   providerForAgent(session.Agent),
			Model:      session.Model,
			StartedAt:  session.StartedAt,
			LastSeenAt: session.LastSeenAt,
			Input:      breakdown.Total.InputTokens,
			Output:     breakdown.Total.OutputTokens,
			Models:     sessionModels,
		})

		for _, model := range sessionModels {
			key := strings.Join([]string{model.Provider, model.Agent, model.Model}, "|")
			if agentUsage[key] == nil {
				agentUsage[key] = &domain.AgentModelUsage{
					Provider: model.Provider,
					Agent:    model.Agent,
					Model:    model.Model,
				}
			}
			agentUsage[key].Input += model.Input
			agentUsage[key].Output += model.Output
			agentUsage[key].CacheCreation += model.CacheCreation
			agentUsage[key].CacheRead += model.CacheRead
		}
	}

	for _, usage := range agentUsage {
		stats.AgentUsage = append(stats.AgentUsage, *usage)
	}
	slices.SortFunc(stats.AgentUsage, func(a, b domain.AgentModelUsage) int {
		at := a.Input + a.Output
		bt := b.Input + b.Output
		if at != bt {
			return bt - at
		}
		if a.Provider != b.Provider {
			return strings.Compare(a.Provider, b.Provider)
		}
		return strings.Compare(a.Model, b.Model)
	})
	slices.SortFunc(stats.SessionUsage, func(a, b domain.DashboardSessionUsage) int {
		return strings.Compare(b.LastSeenAt, a.LastSeenAt)
	})
}

func sessionOutsideRange(session domain.Session, since, until string) bool {
	if session.StartedAt == "" {
		return false
	}
	startedAt, err := time.Parse(time.RFC3339, session.StartedAt)
	if err != nil {
		if since == "" {
			return until != "" && session.StartedAt > until
		}
		if session.StartedAt < since {
			return true
		}
		return until != "" && session.StartedAt > until
	}

	if since != "" {
		sinceAt, err := time.Parse(time.RFC3339, since)
		if err != nil {
			if session.StartedAt < since {
				return true
			}
		} else if startedAt.Before(sinceAt) {
			return true
		}
	}
	if until != "" {
		untilAt, err := time.Parse(time.RFC3339, until)
		if err != nil {
			return session.StartedAt > until
		}
		return startedAt.After(untilAt)
	}
	return false
}

func dashboardModels(session domain.Session, breakdown domain.UsageBreakdown) []domain.DashboardModelUsage {
	models := make([]domain.DashboardModelUsage, 0, len(breakdown.Models))
	for _, usage := range breakdown.Models {
		models = append(models, domain.DashboardModelUsage{
			Provider:      providerForAgent(session.Agent),
			Agent:         session.Agent,
			Model:         usage.Model,
			Input:         usage.InputTokens,
			Output:        usage.OutputTokens,
			CacheCreation: usage.CacheCreationTokens,
			CacheRead:     usage.CacheReadTokens,
			Turns:         usage.Turns,
		})
	}
	return models
}

func fallbackDashboardModel(session domain.Session) domain.DashboardModelUsage {
	return domain.DashboardModelUsage{
		Provider:      providerForAgent(session.Agent),
		Agent:         session.Agent,
		Model:         session.Model,
		Input:         session.Usage.InputTokens,
		Output:        session.Usage.OutputTokens,
		CacheCreation: session.Usage.CacheCreationTokens,
		CacheRead:     session.Usage.CacheReadTokens,
		Turns:         session.Usage.Turns,
	}
}

func providerForAgent(agent string) string {
	switch agent {
	case "codex":
		return "openai"
	case "claudecode":
		return "anthropic"
	case "geminicli":
		return "google"
	default:
		return agent
	}
}

func endedAtForEvent(e domain.NormalizedEvent) string {
	if e.Time == "" {
		return ""
	}
	if e.Action == "STOP" {
		return e.Time
	}
	switch e.HookEventName {
	case "SessionEnd", "Stop", "StopFailure":
		return e.Time
	default:
		return ""
	}
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

func (s *EventService) GetSessionTree(since string) ([]domain.SessionTreeNode, error) {
	return s.repo.GetSessionTree(since)
}

func (s *EventService) GetTraces(sessionID, since string) ([]domain.NormalizedEvent, error) {
	return s.repo.GetTraces(sessionID, since)
}

func (s *EventService) ListSessionsByCWDPage(cwd, since string, page, size int) ([]domain.Session, int, error) {
	sessions, total, err := s.repo.ListSessionsByCWDPage(cwd, since, page, size)
	if err != nil {
		return nil, 0, err
	}
	if len(sessions) > 0 {
		ids := make([]string, len(sessions))
		for i, sess := range sessions {
			ids[i] = sess.SessionID
		}
		counts, countErr := s.repo.GetSessionFileChangeCounts(ids)
		if countErr != nil {
			slog.Warn("GetSessionFileChangeCounts", "err", countErr)
		} else {
			for i, sess := range sessions {
				sessions[i].FileChangeCount = counts[sess.SessionID]
			}
		}
	}
	return sessions, total, nil
}

func (s *EventService) GetFileChanges(sessionID string) ([]domain.FileChangeGroup, error) {
	return s.repo.GetFileChanges(sessionID)
}

func (s *EventService) GetTracesPage(sessionID, since string, page, size int) ([]domain.NormalizedEvent, int, error) {
	return s.repo.GetTracesPage(sessionID, since, page, size)
}
