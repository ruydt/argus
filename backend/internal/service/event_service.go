package service

import (
	"bufio"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"argus/internal/agents/claudecode"
	"argus/internal/agents/codex"
	"argus/internal/domain"
	"argus/internal/repository"
	"argus/internal/version"
)

type EventService struct {
	repo            repository.EventRepository
	subscribers     sync.Map
	startTime       time.Time
	hookRequests    atomic.Int64
	ingestionErrors atomic.Int64

	diagMu         sync.RWMutex
	diagCache      *domain.Diagnostics
	diagCachedAt   time.Time
	diagAgentStats []domain.DiagnosticsAgentStats
}

type DiagnosticsOptions struct {
	DBPath             string
	HookConfigDetector func() []domain.DiagnosticsHookConfig
	IgnoreFile         domain.DiagnosticsIgnoreFile
	Addr               string
	AllowRemote        bool
	CORSOrigins        []string
	ArgusDir          string
}

const exportSensitivityWarning = "Exports may include prompts, diffs, file paths, tool outputs, raw payloads, and exports; handle exported data as sensitive."

func New(repo repository.EventRepository) *EventService {
	return &EventService{
		repo:      repo,
		startTime: time.Now(),
	}
}

func (s *EventService) IncrementHookRequests() {
	s.hookRequests.Add(1)
}

func (s *EventService) IncrementIngestionErrors() {
	s.ingestionErrors.Add(1)
}

func (s *EventService) buildRuntime() domain.DiagnosticsRuntime {
	return domain.DiagnosticsRuntime{
		StartedAt:       s.startTime.UTC().Format(time.RFC3339),
		UptimeSeconds:   int64(time.Since(s.startTime).Seconds()),
		HookRequests:    s.hookRequests.Load(),
		IngestionErrors: s.ingestionErrors.Load(),
	}
}

func (s *EventService) AddEvent(e domain.NormalizedEvent) error {
	if e.Time == "" {
		e.Time = time.Now().UTC().Format(time.RFC3339)
	} else if t, err := time.Parse(time.RFC3339, e.Time); err == nil {
		e.Time = t.UTC().Format(time.RFC3339)
	}
	if e.DedupKey == "" {
		e.DedupKey = domain.ComputeDedupKey(e)
	}
	if err := s.repo.Add(e); err != nil {
		return err
	}
	if e.Session != "" {
		var usage domain.SessionUsage
		switch e.Agent {
		case "claudecode":
			usage = claudecode.ComputeUsage(e.TranscriptPath)
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

func (s *EventService) ListEventsByTimeRange(since, until, sessionID string, beforeID int64, limit int) ([]domain.NormalizedEvent, int64, bool, error) {
	return s.repo.ListByTimeRange(since, until, sessionID, beforeID, limit)
}

func (s *EventService) ListEventsBySessionsTimeRange(since, until string, beforeCursor int64, sessionLimit int) ([]domain.NormalizedEvent, int64, bool, error) {
	return s.repo.ListBySessionsTimeRange(since, until, beforeCursor, sessionLimit)
}

func (s *EventService) GetRawPayload(dedupKey string) ([]byte, error) {
	return s.repo.GetRawPayload(dedupKey)
}

func (s *EventService) SessionModel(sessionID string) (string, error) {
	return s.repo.SessionModel(sessionID)
}

func (s *EventService) Diagnostics(dbPath string, ready bool, hookConfigs ...[]domain.DiagnosticsHookConfig) (domain.Diagnostics, error) {
	configs := hookConfigSlice(hookConfigs)
	return s.DiagnosticsWithOptions(DiagnosticsOptions{
		DBPath:             dbPath,
		HookConfigDetector: func() []domain.DiagnosticsHookConfig { return configs },
	}, ready)
}

func (s *EventService) DiagnosticsWithOptions(opts DiagnosticsOptions, ready bool) (domain.Diagnostics, error) {
	const ttl = 30 * time.Second

	// Hook config detection is always live (file reads only — cheap, no DB).
	hookConfigs := detectHookConfigs(opts.HookConfigDetector)

	s.diagMu.RLock()
	if s.diagCache != nil && time.Since(s.diagCachedAt) < ttl {
		result := *s.diagCache // shallow copy — safe, cached value is never mutated after store
		// Overlay fresh hook config statuses onto the cached agent rows.
		result.Agents = diagnosticsAgents(s.diagAgentStats, hookConfigs)
		result.Runtime = s.buildRuntime()
		s.diagMu.RUnlock()
		return result, nil
	}
	s.diagMu.RUnlock()

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

	dbHealth, _ := s.repo.DBHealth()
	if opts.DBPath != "" && opts.DBPath != ":memory:" {
		walPath := opts.DBPath + "-wal"
		if info, err := os.Stat(walPath); err == nil {
			size := info.Size()
			dbHealth.WALSizeBytes = &size
		}
	}

	result := domain.Diagnostics{
		Version: domain.DiagnosticsVersion{
			Version:   version.Version,
			Commit:    version.Commit,
			BuildDate: version.BuildDate,
		},
		Health:  health,
		Storage: storage,
		Agents:  diagnosticsAgents(agentStats, hookConfigs),
		Privacy: domain.DiagnosticsPrivacy{
			IgnoreFile:    opts.IgnoreFile,
			ExportWarning: exportSensitivityWarning,
		},
		Security: domain.DiagnosticsSecurity{
			RemoteBind: diagnosticsRemoteBind(opts),
			CORS:       diagnosticsCORS(opts.CORSOrigins),
		},
		FileSystem: scanFileSystem(opts.ArgusDir),
		Runtime:    s.buildRuntime(),
		DBHealth:   dbHealth,
	}

	s.diagMu.Lock()
	s.diagCache = &result
	s.diagCachedAt = time.Now()
	s.diagAgentStats = agentStats
	s.diagMu.Unlock()
	return result, nil
}

// SetDiagCachedAt sets the cache timestamp for testing TTL expiry.
// This method exists for testing only — do not call in production code.
func (s *EventService) SetDiagCachedAt(t time.Time) {
	s.diagMu.Lock()
	s.diagCachedAt = t
	s.diagMu.Unlock()
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

func detectHookConfigs(detector func() []domain.DiagnosticsHookConfig) []domain.DiagnosticsHookConfig {
	if detector == nil {
		return nil
	}
	return detector()
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
			Status:            "healthy",
			Warnings:          []string{},
			EventsLastHour:    stat.EventsLastHour,
			EventsLast24h:     stat.EventsLast24h,
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

// DeleteProject removes all sessions and events recorded under cwd.
func (s *EventService) DeleteProject(cwd string) (sessionsDeleted, eventsDeleted int64, err error) {
	return s.repo.DeleteProjectByCWD(cwd)
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

func (s *EventService) SweepStaleSessions(cutoff time.Time) error {
	n, err := s.repo.MarkStaleSessions(cutoff)
	if err != nil {
		return err
	}
	if n > 0 {
		slog.Info("stale session sweep", "marked", n)
	}
	return nil
}

// BroadcastEvent is a pre-marshaled event delivered to SSE subscribers.
// Marshaling happens once in broadcast() instead of once per subscriber.
// Session is carried alongside so the SSE handler can filter without
// re-decoding the payload.
type BroadcastEvent struct {
	Session string
	Payload []byte
}

func (s *EventService) Subscribe() <-chan BroadcastEvent {
	ch := make(chan BroadcastEvent, 64)
	recv := (<-chan BroadcastEvent)(ch)
	s.subscribers.Store(recv, ch)
	return recv
}

func (s *EventService) Unsubscribe(ch <-chan BroadcastEvent) {
	if v, ok := s.subscribers.LoadAndDelete(ch); ok {
		close(v.(chan BroadcastEvent))
	}
}

func (s *EventService) broadcast(e domain.NormalizedEvent) {
	payload, err := json.Marshal(e)
	if err != nil {
		// Event is already persisted; only the live push is dropped.
		slog.Error("broadcast marshal", "err", err)
		return
	}
	ev := BroadcastEvent{Session: e.Session, Payload: payload}
	s.subscribers.Range(func(_, v any) bool {
		ch := v.(chan BroadcastEvent)
		select {
		case ch <- ev:
		default:
		}
		return true
	})
}

func (s *EventService) GetSessionTree(since string) ([]domain.SessionTreeNode, error) {
	return s.repo.GetSessionTree(since)
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

func pathExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func countLines(path string) *int64 {
	f, err := os.Open(path) //nolint:gosec
	if err != nil {
		return nil
	}
	defer f.Close()
	var count int64
	scanner := bufio.NewScanner(f)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 2*1024*1024)
	for scanner.Scan() {
		if scanner.Text() != "" {
			count++
		}
	}
	if scanner.Err() != nil {
		return nil
	}
	return &count
}

func statEntryWithLineCount(name, path string) domain.DiagnosticsFileEntry {
	entry := statEntry(name, path)
	if entry.Exists {
		entry.LineCount = countLines(path)
	}
	return entry
}

// maxDirEntries caps directory listings in diagnostics responses so a runaway
// directory (thousands of loose files) cannot bloat the JSON payload or the UI.
// The full count is still reported alongside the capped list.
const maxDirEntries = 200

// scanDir lists regular files in dir, newest first, capped at maxDirEntries.
// The second return value is the uncapped total.
func scanDir(dir string) ([]domain.DiagnosticsFileEntry, int) {
	return scanDirMatching(dir, func(string) bool { return true })
}

// scanDirFiltered is scanDir restricted to names ending in suffix.
func scanDirFiltered(dir string, suffix string) ([]domain.DiagnosticsFileEntry, int) {
	return scanDirMatching(dir, func(name string) bool { return strings.HasSuffix(name, suffix) })
}

func scanDirMatching(dir string, match func(string) bool) ([]domain.DiagnosticsFileEntry, int) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return []domain.DiagnosticsFileEntry{}, 0
	}
	var result []domain.DiagnosticsFileEntry
	for _, e := range entries {
		if e.IsDir() || !match(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		size := info.Size()
		mod := info.ModTime().UTC().Format(time.RFC3339)
		result = append(result, domain.DiagnosticsFileEntry{
			Name:         e.Name(),
			Path:         filepath.Join(dir, e.Name()),
			SizeBytes:    &size,
			LastModified: &mod,
			Exists:       true,
		})
	}
	total := len(result)
	// Newest first so the capped window keeps the most relevant files.
	// LastModified is RFC3339 UTC, so string order == time order.
	slices.SortFunc(result, func(a, b domain.DiagnosticsFileEntry) int {
		return strings.Compare(*b.LastModified, *a.LastModified)
	})
	if len(result) > maxDirEntries {
		result = result[:maxDirEntries]
	}
	return result, total
}

func scanFileSystem(argusDir string) domain.DiagnosticsFileSystem {
	fs := domain.DiagnosticsFileSystem{
		ArgusDir: argusDir,
		Binary:    statEntry("argus", filepath.Join(argusDir, "bin", "argus")),
		Logs: []domain.DiagnosticsFileEntry{
			statEntry("argus.log", filepath.Join(argusDir, "argus.log")),
			statEntry("build.log", filepath.Join(argusDir, "build.log")),
			statEntry("hook-scripts.log", filepath.Join(argusDir, "hook-scripts.log")),
		},
		ClaudeHooks: []domain.DiagnosticsFileEntry{},
		CodexHooks:  []domain.DiagnosticsFileEntry{},
		CodexDBs:    []domain.DiagnosticsFileEntry{},
	}
	fs.Hooks, fs.HooksTotal = scanDir(filepath.Join(argusDir, "hooks"))

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fs
	}

	claudeDir := filepath.Join(homeDir, ".claude")
	fs.ClaudeDir = claudeDir
	fs.ClaudeDirExists = pathExists(claudeDir)
	claudeHooksDir := filepath.Join(claudeDir, "hooks")
	fs.ClaudeHooksDirExists = pathExists(claudeHooksDir)
	fs.ClaudeHooks, fs.ClaudeHooksTotal = scanDir(claudeHooksDir)
	fs.ClaudeHistory = statEntryWithLineCount("history.jsonl", filepath.Join(claudeDir, "history.jsonl"))

	codexDir := filepath.Join(homeDir, ".codex")
	fs.CodexDir = codexDir
	fs.CodexDirExists = pathExists(codexDir)
	codexHooksDir := filepath.Join(codexDir, "hooks")
	fs.CodexHooksDirExists = pathExists(codexHooksDir)
	fs.CodexHooks, fs.CodexHooksTotal = scanDir(codexHooksDir)
	fs.CodexDBsDirExists = pathExists(codexDir)
	fs.CodexDBs, fs.CodexDBsTotal = scanDirFiltered(codexDir, ".sqlite")

	return fs
}

func statEntry(name, path string) domain.DiagnosticsFileEntry {
	info, err := os.Stat(path)
	if err != nil {
		return domain.DiagnosticsFileEntry{Name: name, Path: path, Exists: false}
	}
	size := info.Size()
	mod := info.ModTime().UTC().Format(time.RFC3339)
	return domain.DiagnosticsFileEntry{
		Name:         name,
		Path:         path,
		SizeBytes:    &size,
		LastModified: &mod,
		Exists:       true,
	}
}
