package service

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"time"

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

	// compacting serializes database compaction so two concurrent requests can't
	// both run VACUUM.
	compacting atomic.Bool
}

// ErrCompactionInProgress is returned when a compaction is already running.
var ErrCompactionInProgress = errors.New("compaction already in progress")

// invalidateCaches clears the diagnostics TTL cache so the next read recomputes.
// Call after any operation that mutates stored events (compact, prune, delete)
// so cached totals don't lag behind the DB.
func (s *EventService) invalidateCaches() {
	s.diagMu.Lock()
	s.diagCache = nil
	s.diagMu.Unlock()
}

type DiagnosticsOptions struct {
	DBPath             string
	HookConfigDetector func() []domain.DiagnosticsHookConfig
	IgnoreFile         domain.DiagnosticsIgnoreFile
	Addr               string
	AllowRemote        bool
	CORSOrigins        []string
	ArgusDir           string
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
		endedAt := endedAtForEvent(e)
		if err := s.repo.UpsertSession(
			e.Session,
			e.Agent,
			e.Model,
			e.Source,
			e.CWD,
			e.TranscriptPath,
			e.Time,
			endedAt,
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

func (s *EventService) ListEventsBySessionsTimeRange(since, until, search string, beforeCursor int64, sessionLimit int) ([]domain.NormalizedEvent, int64, bool, error) {
	return s.repo.ListBySessionsTimeRange(since, until, search, beforeCursor, sessionLimit)
}

func (s *EventService) GetRawPayload(dedupKey string) ([]byte, error) {
	return s.repo.GetRawPayload(dedupKey)
}

// CompactDatabase compresses legacy raw_payload rows and VACUUMs to reclaim disk.
// Only one compaction runs at a time (VACUUM takes an exclusive lock); a
// concurrent call returns ErrCompactionInProgress.
func (s *EventService) CompactDatabase(ctx context.Context) (domain.CompactResult, error) {
	if !s.compacting.CompareAndSwap(false, true) {
		return domain.CompactResult{}, ErrCompactionInProgress
	}
	defer s.compacting.Store(false)

	res, err := s.repo.Compact(ctx)
	if err != nil {
		return res, err
	}
	// Reclaimed size + row count changed — drop cached stats/diagnostics.
	s.invalidateCaches()
	return res, nil
}

// PruneEvents deletes events older than before and/or beyond the maxEvents
// newest. Used by the optional retention sweep.
func (s *EventService) PruneEvents(ctx context.Context, before string, maxEvents int) (int64, error) {
	n, err := s.repo.PruneEvents(ctx, before, maxEvents)
	if err == nil && n > 0 {
		s.invalidateCaches()
	}
	return n, err
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

	// Size of the running executable on disk. Best-effort: nil if the path
	// can't be resolved or stat'd (e.g. binary removed while running).
	var binarySize *int64
	if exe, err := os.Executable(); err == nil {
		if info, err := os.Stat(exe); err == nil {
			size := info.Size()
			binarySize = &size
		}
	}

	result := domain.Diagnostics{
		Version: domain.DiagnosticsVersion{
			Version:         version.Version,
			Commit:          version.Commit,
			BuildDate:       version.BuildDate,
			BinarySizeBytes: binarySize,
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
	Payload []byte // immutable after construction; safe to share across subscribers
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
		Binary:   statEntry("argus", filepath.Join(argusDir, "bin", "argus")),
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
