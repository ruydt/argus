# Diagnostics Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server runtime stats, DB health, external agent databases, and per-agent event rates to the diagnostics page.

**Architecture:** New domain types flow through the existing `/api/diagnostics` pipeline — repo methods surface DB internals and event rates, service layer tracks in-memory runtime counters and extends `scanFileSystem`, and the frontend renders new rows in System Facts, new columns in the agent table, and new sections in FileSystemCard.

**Tech Stack:** Go (sync/atomic, bufio, os.Stat), SQLite PRAGMAs, React + TypeScript, Tailwind

---

## File Map

| File | Change |
|---|---|
| `backend/internal/domain/diagnostics.go` | Add `DiagnosticsRuntime`, `DiagnosticsDBHealth`; extend `DiagnosticsFileEntry`, `DiagnosticsFileSystem`, `DiagnosticsAgentStats`, `DiagnosticsAgent`, `Diagnostics` |
| `backend/internal/repository/repository.go` | Add `DBHealth()` to interface |
| `backend/internal/repository/sqlite/sqlite.go` | Implement `DBHealth()`; add event-rate query to `DiagnosticsAgentStats()` |
| `backend/internal/service/event_service.go` | Add runtime counters; extend `scanFileSystem`; wire into `DiagnosticsWithOptions`; add `buildRuntime()`, `countLines()`, `pathExists()`, `statEntryWithLineCount()` |
| `backend/internal/handler/hook.go` | Increment hook/error counters on each POST |
| `backend/tests/internal/service/event_service_test.go` | Add `DBHealth()` stub to mockRepo |
| `backend/tests/internal/repository/sqlite/sqlite_test.go` | Tests for `DBHealth()` and event rate query |
| `backend/tests/internal/handler/diagnostics_test.go` | Update fixture with new fields |
| `frontend/src/features/diagnostics/types.ts` | Add new interfaces and extend existing ones |
| `frontend/src/features/diagnostics/DiagnosticsPage.tsx` | Runtime + DBHealth rows; 1h/24h agent table columns |
| `frontend/src/features/diagnostics/FileSystemCard.tsx` | Claude history row; Codex DBs section; Uninstalled badges |
| `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx` | Update fixtures; add column assertions |
| `frontend/tests/features/diagnostics/DiagnosticsRoute.test.tsx` | Update fixture |
| `frontend/tests/features/diagnostics/FileSystemCard.test.tsx` | Update mockFS; add Uninstalled + lineCount assertions |

---

## Task 1: Domain types

**Files:**
- Modify: `backend/internal/domain/diagnostics.go`

- [ ] **Step 1: Add new types and extend existing ones**

Replace the entire file content with:

```go
package domain

type DiagnosticsVersion struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildDate string `json:"buildDate"`
}

type DiagnosticsHealth struct {
	Live   bool   `json:"live"`
	Ready  bool   `json:"ready"`
	Reason string `json:"reason,omitempty"`
}

type DiagnosticsStorageStats struct {
	TotalEvents   int
	TotalSessions int
	LatestEventAt *string
}

type DiagnosticsStorage struct {
	DBPath        string  `json:"dbPath"`
	DBSizeBytes   *int64  `json:"dbSizeBytes"`
	DBSizeReason  string  `json:"dbSizeReason,omitempty"`
	TotalEvents   int     `json:"totalEvents"`
	TotalSessions int     `json:"totalSessions"`
	LatestEventAt *string `json:"latestEventAt"`
}

type DiagnosticsRuntime struct {
	StartedAt       string `json:"startedAt"`
	UptimeSeconds   int64  `json:"uptimeSeconds"`
	HookRequests    int64  `json:"hookRequests"`
	IngestionErrors int64  `json:"ingestionErrors"`
}

type DiagnosticsDBHealth struct {
	JournalMode      string `json:"journalMode"`
	PageCount        int64  `json:"pageCount"`
	PageSizeBytes    int64  `json:"pageSizeBytes"`
	WALSizeBytes     *int64 `json:"walSizeBytes"`
	MigrationVersion int    `json:"migrationVersion"`
}

type DiagnosticsAgent struct {
	ID                string   `json:"id"`
	Label             string   `json:"label"`
	EventCount        int      `json:"eventCount"`
	LastSeenAt        *string  `json:"lastSeenAt"`
	DegradedCount     int      `json:"degradedCount"`
	NormalizerVersion *string  `json:"normalizerVersion"`
	HookConfigStatus  string   `json:"hookConfigStatus"`
	HookConfigReason  string   `json:"hookConfigReason,omitempty"`
	Status            string   `json:"status"`
	Warnings          []string `json:"warnings"`
	EventsLastHour    int      `json:"eventsLastHour"`
	EventsLast24h     int      `json:"eventsLast24h"`
}

type DiagnosticsAgentStats struct {
	Agent             string
	EventCount        int
	LastSeenAt        *string
	DegradedCount     int
	NormalizerVersion *string
	EventsLastHour    int
	EventsLast24h     int
}

type DiagnosticsHookConfig struct {
	Agent  string
	Path   string
	Status string
	Reason string
}

type DiagnosticsPrivacy struct {
	IgnoreFile    DiagnosticsIgnoreFile `json:"ignoreFile"`
	ExportWarning string                `json:"exportWarning"`
}

type DiagnosticsIgnoreFile struct {
	Path               string `json:"path"`
	Status             string `json:"status"`
	ActivePatternCount int    `json:"activePatternCount"`
}

type DiagnosticsRemoteBind struct {
	Addr        string `json:"addr"`
	Status      string `json:"status"`
	AllowRemote bool   `json:"allowRemote"`
}

type DiagnosticsCORS struct {
	TotalOrigins int `json:"totalOrigins"`
	LocalOrigins int `json:"localOrigins"`
	ExtraOrigins int `json:"extraOrigins"`
}

type DiagnosticsSecurity struct {
	RemoteBind DiagnosticsRemoteBind `json:"remoteBind"`
	CORS       DiagnosticsCORS       `json:"cors"`
}

type DiagnosticsFileEntry struct {
	Name         string  `json:"name"`
	Path         string  `json:"path"`
	SizeBytes    *int64  `json:"sizeBytes"`
	LastModified *string `json:"lastModified"`
	Exists       bool    `json:"exists"`
	LineCount    *int64  `json:"lineCount,omitempty"`
}

type DiagnosticsFileSystem struct {
	ArgusDir            string                 `json:"argusDir"`
	Binary               DiagnosticsFileEntry   `json:"binary"`
	Logs                 []DiagnosticsFileEntry `json:"logs"`
	Hooks                []DiagnosticsFileEntry `json:"hooks"`
	ClaudeHooks          []DiagnosticsFileEntry `json:"claudeHooks"`
	ClaudeHooksDirExists bool                   `json:"claudeHooksDirExists"`
	ClaudeHistory        DiagnosticsFileEntry   `json:"claudeHistory"`
	CodexHooks           []DiagnosticsFileEntry `json:"codexHooks"`
	CodexHooksDirExists  bool                   `json:"codexHooksDirExists"`
	CodexDBs             []DiagnosticsFileEntry `json:"codexDBs"`
	CodexDBsDirExists    bool                   `json:"codexDBsDirExists"`
}

type Diagnostics struct {
	Version    DiagnosticsVersion    `json:"version"`
	Health     DiagnosticsHealth     `json:"health"`
	Storage    DiagnosticsStorage    `json:"storage"`
	Agents     []DiagnosticsAgent    `json:"agents"`
	Privacy    DiagnosticsPrivacy    `json:"privacy"`
	Security   DiagnosticsSecurity   `json:"security"`
	FileSystem DiagnosticsFileSystem `json:"fileSystem"`
	Runtime    DiagnosticsRuntime    `json:"runtime"`
	DBHealth   DiagnosticsDBHealth   `json:"dbHealth"`
}
```

- [ ] **Step 2: Build to verify**

```bash
cd backend && go build ./...
```

Expected: compiles (some errors from callers are fine — fixed in later tasks)

- [ ] **Step 3: Commit**

```bash
git add backend/internal/domain/diagnostics.go
git commit -m "feat(domain): add Runtime, DBHealth, extend FileSystem and Agent diagnostics types"
```

---

## Task 2: Repository — DBHealth method

**Files:**
- Modify: `backend/internal/repository/repository.go`
- Modify: `backend/internal/repository/sqlite/sqlite.go`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/internal/repository/sqlite/sqlite_test.go`:

```go
func TestDBHealth(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	h, err := db.DBHealth()
	if err != nil {
		t.Fatalf("DBHealth: %v", err)
	}
	if h.JournalMode == "" {
		t.Error("want non-empty JournalMode")
	}
	if h.PageCount <= 0 {
		t.Errorf("want PageCount > 0, got %d", h.PageCount)
	}
	if h.PageSizeBytes <= 0 {
		t.Errorf("want PageSizeBytes > 0, got %d", h.PageSizeBytes)
	}
	if h.MigrationVersion <= 0 {
		t.Errorf("want MigrationVersion > 0, got %d", h.MigrationVersion)
	}
	// WAL file absent for :memory: — walSizeBytes should be nil
	if h.WALSizeBytes != nil {
		t.Errorf("want nil WALSizeBytes for :memory:, got %v", *h.WALSizeBytes)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && go test ./tests/internal/repository/sqlite/... -run TestDBHealth -v
```

Expected: FAIL — `db.DBHealth undefined`

- [ ] **Step 3: Add DBHealth to repository interface**

In `backend/internal/repository/repository.go`, add to the `EventRepository` interface:

```go
DBHealth() (domain.DiagnosticsDBHealth, error)
```

- [ ] **Step 4: Implement DBHealth in sqlite.go**

Add after the `Ready()` method (around line 111):

```go
func (d *DB) DBHealth() (domain.DiagnosticsDBHealth, error) {
	var h domain.DiagnosticsDBHealth
	_ = d.db.QueryRow(`PRAGMA journal_mode`).Scan(&h.JournalMode)
	_ = d.db.QueryRow(`PRAGMA page_count`).Scan(&h.PageCount)
	_ = d.db.QueryRow(`PRAGMA page_size`).Scan(&h.PageSizeBytes)
	_ = d.db.QueryRow(`SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&h.MigrationVersion)
	return h, nil
}
```

- [ ] **Step 5: Add DBHealth stub to mockRepo in service tests**

In `backend/tests/internal/service/event_service_test.go`, add after the `Ready()` stub:

```go
func (m *mockRepo) DBHealth() (domain.DiagnosticsDBHealth, error) {
	return domain.DiagnosticsDBHealth{JournalMode: "wal", PageCount: 10, PageSizeBytes: 4096, MigrationVersion: 13}, nil
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd backend && go test ./tests/internal/repository/sqlite/... -run TestDBHealth -v
```

Expected: PASS

- [ ] **Step 7: Build**

```bash
cd backend && go build ./...
```

- [ ] **Step 8: Commit**

```bash
git add backend/internal/repository/repository.go \
        backend/internal/repository/sqlite/sqlite.go \
        backend/tests/internal/repository/sqlite/sqlite_test.go \
        backend/tests/internal/service/event_service_test.go
git commit -m "feat(repo): add DBHealth() returning PRAGMA stats and migration version"
```

---

## Task 3: Repository — agent event rate query

**Files:**
- Modify: `backend/internal/repository/sqlite/sqlite.go`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/internal/repository/sqlite/sqlite_test.go`:

```go
func TestDiagnosticsAgentStatsEventRates(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	// Insert one recent event for claudecode
	e := domain.NormalizedEvent{
		Agent:        "claudecode",
		Session:      "s1",
		Action:       "PreToolUse",
		Time:         time.Now().UTC().Format(time.RFC3339),
		DedupKey:     "k1",
	}
	if err := db.Add(e); err != nil {
		t.Fatalf("add event: %v", err)
	}

	stats, err := db.DiagnosticsAgentStats()
	if err != nil {
		t.Fatalf("DiagnosticsAgentStats: %v", err)
	}

	var cc *domain.DiagnosticsAgentStats
	for i := range stats {
		if stats[i].Agent == "claudecode" {
			cc = &stats[i]
		}
	}
	if cc == nil {
		t.Fatal("no claudecode entry in stats")
	}
	if cc.EventsLastHour != 1 {
		t.Errorf("EventsLastHour: want 1, got %d", cc.EventsLastHour)
	}
	if cc.EventsLast24h != 1 {
		t.Errorf("EventsLast24h: want 1, got %d", cc.EventsLast24h)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && go test ./tests/internal/repository/sqlite/... -run TestDiagnosticsAgentStatsEventRates -v
```

Expected: FAIL — `EventsLastHour` is 0

- [ ] **Step 3: Add rate query to DiagnosticsAgentStats() in sqlite.go**

At the end of `DiagnosticsAgentStats()`, before the final `return`, add:

```go
rateRows, err := d.db.Query(`
    SELECT agent,
        SUM(CASE WHEN datetime(created_at) >= datetime('now', '-1 hour') THEN 1 ELSE 0 END),
        SUM(CASE WHEN datetime(created_at) >= datetime('now', '-24 hours') THEN 1 ELSE 0 END)
    FROM hook_events
    WHERE agent IN ('claudecode', 'codex')
    GROUP BY agent
`)
if err != nil {
    return nil, fmt.Errorf("diagnostics agent rates: %w", err)
}
defer rateRows.Close()
for rateRows.Next() {
    var agent string
    var h, d int
    if err := rateRows.Scan(&agent, &h, &d); err != nil {
        return nil, fmt.Errorf("diagnostics agent rates scan: %w", err)
    }
    if s, ok := stats[agent]; ok {
        s.EventsLastHour = h
        s.EventsLast24h = d
    }
}
if err := rateRows.Err(); err != nil {
    return nil, fmt.Errorf("diagnostics agent rates rows: %w", err)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && go test ./tests/internal/repository/sqlite/... -run TestDiagnosticsAgentStatsEventRates -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/repository/sqlite/sqlite.go \
        backend/tests/internal/repository/sqlite/sqlite_test.go
git commit -m "feat(repo): add EventsLastHour and EventsLast24h to DiagnosticsAgentStats"
```

---

## Task 4: Service — runtime counters

**Files:**
- Modify: `backend/internal/service/event_service.go`

- [ ] **Step 1: Add sync/atomic import and counters to EventService**

Add `"sync/atomic"` to the import block in `event_service.go`.

Replace the `EventService` struct and `New()` constructor:

```go
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

func New(repo repository.EventRepository) *EventService {
	return &EventService{
		repo:      repo,
		startTime: time.Now(),
	}
}
```

Add three new methods after `New()`:

```go
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
```

- [ ] **Step 2: Build**

```bash
cd backend && go build ./...
```

Expected: compiles

- [ ] **Step 3: Write test for runtime counters**

Add to `backend/tests/internal/service/event_service_test.go`:

```go
func TestRuntimeCounters(t *testing.T) {
	svc := service.New(&mockRepo{})

	svc.IncrementHookRequests()
	svc.IncrementHookRequests()
	svc.IncrementIngestionErrors()

	diag, err := svc.DiagnosticsWithOptions(service.DiagnosticsOptions{DBPath: ":memory:"}, true)
	if err != nil {
		t.Fatalf("DiagnosticsWithOptions: %v", err)
	}
	if diag.Runtime.HookRequests != 2 {
		t.Errorf("HookRequests: want 2, got %d", diag.Runtime.HookRequests)
	}
	if diag.Runtime.IngestionErrors != 1 {
		t.Errorf("IngestionErrors: want 1, got %d", diag.Runtime.IngestionErrors)
	}
	if diag.Runtime.UptimeSeconds < 0 {
		t.Errorf("UptimeSeconds: want >= 0, got %d", diag.Runtime.UptimeSeconds)
	}
	if diag.Runtime.StartedAt == "" {
		t.Error("StartedAt: want non-empty")
	}
}
```

- [ ] **Step 4: Run test**

```bash
cd backend && go test ./tests/internal/service/... -run TestRuntimeCounters -v
```

Expected: FAIL — `diag.Runtime` fields are zero (not wired yet — wired in Task 6)

- [ ] **Step 5: Commit counter scaffolding (test will pass after Task 6)**

```bash
git add backend/internal/service/event_service.go \
        backend/tests/internal/service/event_service_test.go
git commit -m "feat(service): add runtime counters (hookRequests, ingestionErrors, startTime)"
```

---

## Task 5: Service — extend scanFileSystem

**Files:**
- Modify: `backend/internal/service/event_service.go`

- [ ] **Step 1: Add bufio import**

Add `"bufio"` and `"strings"` to the import block (if `strings` not already there — check first).

- [ ] **Step 2: Replace scanFileSystem and add helpers**

Replace the existing `scanFileSystem` function and add new helpers:

```go
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

func scanDir(dir string) []domain.DiagnosticsFileEntry {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return []domain.DiagnosticsFileEntry{}
	}
	var result []domain.DiagnosticsFileEntry
	for _, e := range entries {
		if e.IsDir() {
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
	return result
}

func scanDirFiltered(dir string, suffix string) []domain.DiagnosticsFileEntry {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return []domain.DiagnosticsFileEntry{}
	}
	var result []domain.DiagnosticsFileEntry
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), suffix) {
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
	return result
}

func scanFileSystem(argusDir string) domain.DiagnosticsFileSystem {
	fs := domain.DiagnosticsFileSystem{
		ArgusDir: argusDir,
		Binary:    statEntry("argus", filepath.Join(argusDir, "bin", "argus")),
		Logs: []domain.DiagnosticsFileEntry{
			statEntry("argus.log", filepath.Join(argusDir, "argus.log")),
			statEntry("build.log", filepath.Join(argusDir, "build.log")),
		},
		Hooks:       scanDir(filepath.Join(argusDir, "hooks")),
		ClaudeHooks: []domain.DiagnosticsFileEntry{},
		CodexHooks:  []domain.DiagnosticsFileEntry{},
		CodexDBs:    []domain.DiagnosticsFileEntry{},
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fs
	}

	claudeHooksDir := filepath.Join(homeDir, ".claude", "hooks")
	fs.ClaudeHooksDirExists = pathExists(claudeHooksDir)
	fs.ClaudeHooks = scanDir(claudeHooksDir)

	fs.ClaudeHistory = statEntryWithLineCount("history.jsonl", filepath.Join(homeDir, ".claude", "history.jsonl"))

	codexHooksDir := filepath.Join(homeDir, ".codex", "hooks")
	fs.CodexHooksDirExists = pathExists(codexHooksDir)
	fs.CodexHooks = scanDir(codexHooksDir)

	codexDir := filepath.Join(homeDir, ".codex")
	fs.CodexDBsDirExists = pathExists(codexDir)
	fs.CodexDBs = scanDirFiltered(codexDir, ".sqlite")

	return fs
}
```

- [ ] **Step 3: Build**

```bash
cd backend && go build ./...
```

Expected: compiles

- [ ] **Step 4: Write test for scanFileSystem extensions**

Add to `backend/tests/internal/service/event_service_test.go`:

```go
func TestDiagnosticsFilesystemHasCodexAndClaudeFields(t *testing.T) {
	svc := service.New(&mockRepo{})
	diag, err := svc.DiagnosticsWithOptions(service.DiagnosticsOptions{
		DBPath:    ":memory:",
		ArgusDir: t.TempDir(),
	}, true)
	if err != nil {
		t.Fatalf("DiagnosticsWithOptions: %v", err)
	}
	// Fields must be present (not nil slices) even when dirs don't exist
	if diag.FileSystem.ClaudeHooks == nil {
		t.Error("ClaudeHooks: want non-nil slice")
	}
	if diag.FileSystem.CodexHooks == nil {
		t.Error("CodexHooks: want non-nil slice")
	}
	if diag.FileSystem.CodexDBs == nil {
		t.Error("CodexDBs: want non-nil slice")
	}
}
```

- [ ] **Step 5: Run test**

```bash
cd backend && go test ./tests/internal/service/... -run TestDiagnosticsFilesystemHasCodexAndClaudeFields -v
```

Expected: PASS (dirs don't exist in temp dir, so empty slices)

- [ ] **Step 6: Commit**

```bash
git add backend/internal/service/event_service.go \
        backend/tests/internal/service/event_service_test.go
git commit -m "feat(service): extend scanFileSystem with Codex DBs, Claude history line count, dir-exists flags"
```

---

## Task 6: Service — wire DiagnosticsWithOptions

**Files:**
- Modify: `backend/internal/service/event_service.go`

- [ ] **Step 1: Update DiagnosticsWithOptions — cache hit path**

In the cache hit path, overlay runtime (always live):

```go
s.diagMu.RLock()
if s.diagCache != nil && time.Since(s.diagCachedAt) < ttl {
    result := *s.diagCache
    result.Agents = diagnosticsAgents(s.diagAgentStats, hookConfigs)
    result.Runtime = s.buildRuntime() // always live — not cached
    s.diagMu.RUnlock()
    return result, nil
}
s.diagMu.RUnlock()
```

- [ ] **Step 2: Update DiagnosticsWithOptions — full build path**

After building `storage`, add:

```go
dbHealth, _ := s.repo.DBHealth()
if opts.DBPath != "" && opts.DBPath != ":memory:" {
    walPath := opts.DBPath + "-wal"
    if info, err := os.Stat(walPath); err == nil {
        size := info.Size()
        dbHealth.WALSizeBytes = &size
    }
}
```

Add `Runtime` and `DBHealth` to the `result` struct literal:

```go
result := domain.Diagnostics{
    Version: domain.DiagnosticsVersion{ ... },
    Health:  health,
    Storage: storage,
    Agents:  diagnosticsAgents(agentStats, hookConfigs),
    Privacy: domain.DiagnosticsPrivacy{ ... },
    Security: domain.DiagnosticsSecurity{ ... },
    FileSystem: scanFileSystem(opts.ArgusDir),
    Runtime:  s.buildRuntime(),
    DBHealth: dbHealth,
}
```

- [ ] **Step 3: Update diagnosticsAgents to map new rate fields**

In `diagnosticsAgents()`, add to the `row` struct literal:

```go
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
```

- [ ] **Step 4: Build and run all backend tests**

```bash
cd backend && go build ./... && go test ./...
```

Expected: all pass, including `TestRuntimeCounters` from Task 4

- [ ] **Step 5: Commit**

```bash
git add backend/internal/service/event_service.go
git commit -m "feat(service): wire Runtime, DBHealth, and agent event rates into DiagnosticsWithOptions"
```

---

## Task 7: Handler — increment counters

**Files:**
- Modify: `backend/internal/handler/hook.go`

- [ ] **Step 1: Increment hookRequests on accepted payload**

In `hook.go`, after `svc.AddEvent(e)` succeeds (inside the success branch), add:

```go
svc.IncrementHookRequests()
```

- [ ] **Step 2: Increment ingestionErrors on normalization failure**

Find the degraded/error path where normalization fails. After setting the degraded flag or returning early on bad payload, add:

```go
svc.IncrementIngestionErrors()
```

Look for the block that handles `normalize` errors — it will look something like:
```go
if err != nil {
    // degraded path
    svc.IncrementIngestionErrors()
}
```

- [ ] **Step 3: Build and run handler tests**

```bash
cd backend && go build ./... && go test ./tests/internal/handler/... -v
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handler/hook.go
git commit -m "feat(handler): increment hookRequests and ingestionErrors counters on each POST /api/hook"
```

---

## Task 8: Backend — run full test suite

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && go test ./... 2>&1
```

Expected: all 223+ tests pass

- [ ] **Step 2: Run go vet**

```bash
cd backend && go vet ./...
```

Expected: no issues

---

## Task 9: Frontend — update types

**Files:**
- Modify: `frontend/src/features/diagnostics/types.ts`

- [ ] **Step 1: Replace DiagnosticsFileEntry, DiagnosticsFileSystem, DiagnosticsAgent, and Diagnostics; add new interfaces**

```typescript
export interface DiagnosticsVersion {
  version: string
  commit: string
  buildDate: string
}

export interface DiagnosticsHealth {
  live: boolean
  ready: boolean
  reason?: string
}

export interface DiagnosticsStorage {
  dbPath: string
  dbSizeBytes: number | null
  dbSizeReason?: string
  totalEvents: number
  totalSessions: number
  latestEventAt: string | null
}

export interface DiagnosticsRuntime {
  startedAt: string
  uptimeSeconds: number
  hookRequests: number
  ingestionErrors: number
}

export interface DiagnosticsDBHealth {
  journalMode: string
  pageCount: number
  pageSizeBytes: number
  walSizeBytes: number | null
  migrationVersion: number
}

export interface DiagnosticsAgent {
  id: string
  label: string
  eventCount: number
  lastSeenAt: string | null
  degradedCount: number
  normalizerVersion: string | null
  hookConfigStatus: string
  hookConfigReason?: string
  status: string
  warnings: string[]
  eventsLastHour: number
  eventsLast24h: number
}

export interface DiagnosticsIgnoreFile {
  path: string
  status: string
  activePatternCount: number
}

export interface DiagnosticsPrivacy {
  ignoreFile: DiagnosticsIgnoreFile
  exportWarning: string
}

export interface DiagnosticsRemoteBind {
  addr: string
  status: string
  allowRemote: boolean
}

export interface DiagnosticsCORS {
  totalOrigins: number
  localOrigins: number
  extraOrigins: number
}

export interface DiagnosticsSecurity {
  remoteBind: DiagnosticsRemoteBind
  cors: DiagnosticsCORS
}

export interface DiagnosticsFileEntry {
  name: string
  path: string
  sizeBytes: number | null
  lastModified: string | null
  exists: boolean
  lineCount?: number | null
}

export interface DiagnosticsFileSystem {
  argusDir: string
  binary: DiagnosticsFileEntry
  logs: DiagnosticsFileEntry[]
  hooks: DiagnosticsFileEntry[]
  claudeHooks: DiagnosticsFileEntry[]
  claudeHooksDirExists: boolean
  claudeHistory: DiagnosticsFileEntry
  codexHooks: DiagnosticsFileEntry[]
  codexHooksDirExists: boolean
  codexDBs: DiagnosticsFileEntry[]
  codexDBsDirExists: boolean
}

export interface Diagnostics {
  version: DiagnosticsVersion
  health: DiagnosticsHealth
  storage: DiagnosticsStorage
  agents: DiagnosticsAgent[]
  privacy: DiagnosticsPrivacy
  security: DiagnosticsSecurity
  fileSystem: DiagnosticsFileSystem
  runtime: DiagnosticsRuntime
  dbHealth: DiagnosticsDBHealth
}
```

- [ ] **Step 2: Type check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors referencing missing fields in fixtures/components — normal at this stage

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/diagnostics/types.ts
git commit -m "feat(types): add Runtime, DBHealth, extend DiagnosticsAgent and DiagnosticsFileSystem"
```

---

## Task 10: Frontend — System Facts card additions

**Files:**
- Modify: `frontend/src/features/diagnostics/DiagnosticsPage.tsx`

- [ ] **Step 1: Add Runtime and DBHealth rows to System Facts card**

`formatBytes` is already imported from `./utils` in DiagnosticsPage.tsx. The System Facts card ends with the `DB Size` row followed by `</CardContent>`. Add new rows before `</CardContent>`:

```tsx
<Separator />
{/* Runtime */}
<div className="flex items-center justify-between py-2 text-[13px]">
  <span className="text-muted-foreground">Started</span>
  <span>{formatDistanceToNow(new Date(data.runtime.startedAt), { addSuffix: true })}</span>
</div>
<Separator />
<div className="flex items-center justify-between py-2 text-[13px]">
  <span className="text-muted-foreground">Uptime</span>
  <span>{Math.floor(data.runtime.uptimeSeconds / 3600)}h {Math.floor((data.runtime.uptimeSeconds % 3600) / 60)}m</span>
</div>
<Separator />
<div className="flex items-center justify-between py-2 text-[13px]">
  <span className="text-muted-foreground">Hook requests</span>
  <span>{data.runtime.hookRequests.toLocaleString()}</span>
</div>
<Separator />
<div className="flex items-center justify-between py-2 text-[13px]">
  <span className="text-muted-foreground">Ingestion errors</span>
  <span className={data.runtime.ingestionErrors > 0 ? 'text-[var(--destructive)]' : ''}>
    {data.runtime.ingestionErrors.toLocaleString()}
  </span>
</div>
<Separator />
{/* DB Health */}
<div className="flex items-center justify-between py-2 text-[13px]">
  <span className="text-muted-foreground">DB journal</span>
  <code className="font-mono text-[12px]">{data.dbHealth.journalMode}</code>
</div>
<Separator />
<div className="flex items-center justify-between py-2 text-[13px]">
  <span className="text-muted-foreground">DB pages</span>
  <span>{data.dbHealth.pageCount.toLocaleString()} × {formatBytes(data.dbHealth.pageSizeBytes)}</span>
</div>
<Separator />
<div className="flex items-center justify-between py-2 text-[13px]">
  <span className="text-muted-foreground">WAL size</span>
  <span>{data.dbHealth.walSizeBytes !== null ? formatBytes(data.dbHealth.walSizeBytes) : '—'}</span>
</div>
<Separator />
<div className="flex items-center justify-between py-2 text-[13px]">
  <span className="text-muted-foreground">Migration</span>
  <span>v{data.dbHealth.migrationVersion}</span>
</div>
```

- [ ] **Step 2: Type check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/diagnostics/DiagnosticsPage.tsx
git commit -m "feat(diagnostics): add Runtime and DB Health rows to System Facts card"
```

---

## Task 11: Frontend — Agent table 1h/24h columns

**Files:**
- Modify: `frontend/src/features/diagnostics/DiagnosticsPage.tsx`

- [ ] **Step 1: Add column headers to TableHeader**

After the `Last Seen` `<TableHead>` and before `Hook Config`:

```tsx
<TableHead scope="col" className="w-[50px] text-right">1h</TableHead>
<TableHead scope="col" className="w-[50px] text-right">24h</TableHead>
```

- [ ] **Step 2: Add cells to TableBody row**

After the `Last Seen` `<TableCell>` and before `Hook Config`:

```tsx
<TableCell className="text-right tabular-nums">
  {agent.eventsLastHour.toLocaleString()}
</TableCell>
<TableCell className="text-right tabular-nums">
  {agent.eventsLast24h.toLocaleString()}
</TableCell>
```

- [ ] **Step 3: Type check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/diagnostics/DiagnosticsPage.tsx
git commit -m "feat(diagnostics): add 1h and 24h event rate columns to Agent Connectivity table"
```

---

## Task 12: Frontend — FileSystemCard extensions

**Files:**
- Modify: `frontend/src/features/diagnostics/FileSystemCard.tsx`

- [ ] **Step 1: Add Uninstalled badge constant and helper component**

Add at the top of the component file (after imports):

```tsx
const BADGE_AMBER = 'border-[var(--cwd)] text-[var(--cwd)] bg-transparent'

function UninstalledBadge() {
  return (
    <Badge variant="outline" className={BADGE_AMBER}>
      Uninstalled
    </Badge>
  )
}
```

Make sure `Badge` is imported from `@/components/ui/badge`.

- [ ] **Step 2: Update Claude hooks section to show Uninstalled badge**

Replace the Claude hooks section `<p>` header:

```tsx
{/* Claude hooks */}
<div className="py-1">
  <div className="flex items-center gap-2 py-1">
    <p className="text-[11px] text-muted-foreground">
      ~/.claude/hooks ({(fileSystem.claudeHooks ?? []).length})
    </p>
    {!fileSystem.claudeHooksDirExists && <UninstalledBadge />}
  </div>
  {(fileSystem.claudeHooks ?? []).length === 0 && fileSystem.claudeHooksDirExists ? (
    <p className="text-[12px] text-muted-foreground py-2">No hook scripts found</p>
  ) : (
    (fileSystem.claudeHooks ?? []).map((entry, i) => (
      <div key={entry.name}>
        {i > 0 && <Separator />}
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="font-mono text-[12px]">{entry.name}</span>
          <div className="flex items-center gap-2">
            <FileSize entry={entry} />
            <FileModified entry={entry} />
            <CopyIconButton
              text={entry.path}
              label={`Copy ${entry.name} path`}
              className="size-4 opacity-40 hover:opacity-100 hover:bg-transparent"
            />
          </div>
        </div>
      </div>
    ))
  )}
</div>
```

- [ ] **Step 3: Add Claude history.jsonl row**

After the Claude hooks section, before the Codex hooks section:

```tsx
<Separator />

{/* Claude history.jsonl */}
<div className="flex items-center justify-between py-2 text-[13px]">
  <div className="flex items-center gap-2">
    <span className="font-mono text-[12px]">~/.claude/history.jsonl</span>
  </div>
  <div className="flex items-center gap-2">
    <FileSize entry={fileSystem.claudeHistory} />
    {fileSystem.claudeHistory.lineCount != null && (
      <span className="text-[12px] text-muted-foreground">
        {fileSystem.claudeHistory.lineCount.toLocaleString()} lines
      </span>
    )}
    <FileModified entry={fileSystem.claudeHistory} />
    {fileSystem.claudeHistory.exists && (
      <CopyIconButton
        text={fileSystem.claudeHistory.path}
        label="Copy history.jsonl path"
        className="size-4 opacity-40 hover:opacity-100 hover:bg-transparent"
      />
    )}
  </div>
</div>
```

- [ ] **Step 4: Update Codex hooks section to show Uninstalled badge**

Replace the Codex hooks section similarly to Claude hooks:

```tsx
{/* Codex hooks */}
<div className="py-1">
  <div className="flex items-center gap-2 py-1">
    <p className="text-[11px] text-muted-foreground">
      ~/.codex/hooks ({(fileSystem.codexHooks ?? []).length})
    </p>
    {!fileSystem.codexHooksDirExists && <UninstalledBadge />}
  </div>
  {(fileSystem.codexHooks ?? []).length === 0 && fileSystem.codexHooksDirExists ? (
    <p className="text-[12px] text-muted-foreground py-2">No hook scripts found</p>
  ) : (
    (fileSystem.codexHooks ?? []).map((entry, i) => (
      <div key={entry.name}>
        {i > 0 && <Separator />}
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="font-mono text-[12px]">{entry.name}</span>
          <div className="flex items-center gap-2">
            <FileSize entry={entry} />
            <FileModified entry={entry} />
            <CopyIconButton
              text={entry.path}
              label={`Copy ${entry.name} path`}
              className="size-4 opacity-40 hover:opacity-100 hover:bg-transparent"
            />
          </div>
        </div>
      </div>
    ))
  )}
</div>
<Separator />

{/* Codex databases */}
<div className="py-1">
  <div className="flex items-center gap-2 py-1">
    <p className="text-[11px] text-muted-foreground">
      ~/.codex databases ({(fileSystem.codexDBs ?? []).length})
    </p>
    {!fileSystem.codexDBsDirExists && <UninstalledBadge />}
  </div>
  {(fileSystem.codexDBs ?? []).length === 0 && fileSystem.codexDBsDirExists ? (
    <p className="text-[12px] text-muted-foreground py-2">No databases found</p>
  ) : (
    (fileSystem.codexDBs ?? []).map((entry, i) => (
      <div key={entry.name}>
        {i > 0 && <Separator />}
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="font-mono text-[12px]">{entry.name}</span>
          <div className="flex items-center gap-2">
            <FileSize entry={entry} />
            <FileModified entry={entry} />
            <CopyIconButton
              text={entry.path}
              label={`Copy ${entry.name} path`}
              className="size-4 opacity-40 hover:opacity-100 hover:bg-transparent"
            />
          </div>
        </div>
      </div>
    ))
  )}
</div>
```

- [ ] **Step 5: Type check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/diagnostics/FileSystemCard.tsx
git commit -m "feat(diagnostics): add Claude history line count, Codex DBs section, Uninstalled badges to FileSystemCard"
```

---

## Task 13: Frontend tests — update fixtures and add assertions

**Files:**
- Modify: `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx`
- Modify: `frontend/tests/features/diagnostics/DiagnosticsRoute.test.tsx`
- Modify: `frontend/tests/features/diagnostics/FileSystemCard.test.tsx`

- [ ] **Step 1: Update healthyDiagnostics fixture in DiagnosticsPage.test.tsx**

Add to each agent in `agents`:
```typescript
eventsLastHour: 5,
eventsLast24h: 42,
```

Add to `fileSystem`:
```typescript
claudeHooksDirExists: true,
claudeHistory: {
  name: 'history.jsonl',
  path: '/home/user/.claude/history.jsonl',
  sizeBytes: 278000,
  lastModified: '2026-06-09T10:00:00Z',
  exists: true,
  lineCount: 48231,
},
codexHooksDirExists: false,
codexDBs: [],
codexDBsDirExists: false,
```

Add top-level fields to `healthyDiagnostics`:
```typescript
runtime: {
  startedAt: '2026-06-09T08:00:00Z',
  uptimeSeconds: 3600,
  hookRequests: 150,
  ingestionErrors: 0,
},
dbHealth: {
  journalMode: 'wal',
  pageCount: 1024,
  pageSizeBytes: 4096,
  walSizeBytes: 65536,
  migrationVersion: 13,
},
```

- [ ] **Step 2: Update warningDiagnostics fixture**

`warningDiagnostics` spreads from `healthyDiagnostics` so most fields inherit. Verify `agents` override still includes `eventsLastHour` and `eventsLast24h` on the spread base.

- [ ] **Step 3: Add assertions for new UI**

In the test `'renders all sections when diagnostics load successfully'`, add:
```typescript
expect(screen.getByText('Hook requests')).toBeInTheDocument()
expect(screen.getByText('Migration')).toBeInTheDocument()
expect(screen.getByText('1h')).toBeInTheDocument()
expect(screen.getByText('24h')).toBeInTheDocument()
```

Add a new test:
```typescript
it('shows Uninstalled badge when codexDBsDirExists is false', async () => {
  renderPage()
  await screen.findByText('Agent Connectivity')
  expect(screen.getByText('Uninstalled')).toBeInTheDocument()
})
```

Add a new test:
```typescript
it('renders history.jsonl line count', async () => {
  renderPage()
  await screen.findByText('Agent Connectivity')
  expect(screen.getByText(/48,231 lines/)).toBeInTheDocument()
})
```

- [ ] **Step 4: Update DiagnosticsRoute.test.tsx fixture**

Add the same new fields to that fixture's `fileSystem`, `agents`, and add `runtime` + `dbHealth` top-level entries (same values as above).

- [ ] **Step 5: Update FileSystemCard.test.tsx mockFS**

Add to `mockFS`:
```typescript
claudeHooksDirExists: true,
claudeHistory: {
  name: 'history.jsonl',
  path: '/home/user/.claude/history.jsonl',
  sizeBytes: 278000,
  lastModified: '2026-06-09T10:00:00Z',
  exists: true,
  lineCount: 48231,
},
codexHooksDirExists: false,
codexDBs: [
  {
    name: 'logs_2.sqlite',
    path: '/home/user/.codex/logs_2.sqlite',
    sizeBytes: 368000000,
    lastModified: '2026-06-09T10:00:00Z',
    exists: true,
  },
],
codexDBsDirExists: true,
```

Add test assertions:
```typescript
it('renders Uninstalled badge when codexHooksDirExists is false', () => {
  render(<FileSystemCard fileSystem={mockFS} />)
  expect(screen.getByText('Uninstalled')).toBeInTheDocument()
})

it('renders history.jsonl line count', () => {
  render(<FileSystemCard fileSystem={mockFS} />)
  expect(screen.getByText(/48,231 lines/)).toBeInTheDocument()
})

it('renders Codex DB file name', () => {
  render(<FileSystemCard fileSystem={mockFS} />)
  expect(screen.getByText('logs_2.sqlite')).toBeInTheDocument()
})
```

- [ ] **Step 6: Run all frontend tests**

```bash
cd frontend && npx vitest run 2>&1 | tail -6
```

Expected: all pass

- [ ] **Step 7: Type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add frontend/tests/features/diagnostics/
git commit -m "test(diagnostics): update fixtures and add assertions for runtime, DB health, agent rates, and FileSystemCard extensions"
```

---

## Final Verification

- [ ] Run all backend tests: `cd backend && go test ./...`
- [ ] Run all frontend tests: `cd frontend && npx vitest run`
- [ ] Type check: `cd frontend && npx tsc --noEmit`
- [ ] Start backend (`make build-local` or `go run ./cmd/server`) and navigate to `/diagnostics` — verify Runtime section, DB Health rows, 1h/24h columns, Codex DBs section, Claude history line count, Uninstalled badges
