# Diagnostics File System + UI Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `~/.argus` File System section to the Diagnostics page with inline log tail, split the Version row, and normalize Hook Config column to `Configured (n/n)`.

**Architecture:** Backend gets a new `DiagnosticsFileSystem` domain type populated by `os.Stat` scans in `DiagnosticsWithOptions`, plus a whitelist-only `GET /api/diagnostics/log-tail` handler. Frontend adds `FileSystemCard` (full-width, below the existing 2-col layout), extracts `formatBytes` to `utils.ts`, adds a `useLogTail` hook, splits the version row into 3 rows, and changes `detectHookConfigLabel` to always emit `Configured (n/n)`.

**Tech Stack:** Go stdlib (`os`, `bufio`, `path/filepath`), React 19, TypeScript, shadcn Card/Table/Badge/Button, date-fns, Vitest + Testing Library

---

## File Map

| Action | File |
|---|---|
| Modify | `backend/internal/domain/diagnostics.go` |
| Modify | `backend/internal/service/event_service.go` |
| Create | `backend/internal/handler/log_tail.go` |
| Modify | `backend/internal/server/router.go` |
| Modify | `backend/cmd/server/main.go` |
| Create | `backend/tests/internal/handler/log_tail_test.go` |
| Modify | `backend/tests/internal/handler/diagnostics_test.go` |
| Modify | `frontend/src/features/diagnostics/types.ts` |
| Create | `frontend/src/features/diagnostics/utils.ts` |
| Create | `frontend/src/features/diagnostics/hooks/useLogTail.ts` |
| Create | `frontend/src/features/diagnostics/FileSystemCard.tsx` |
| Modify | `frontend/src/features/diagnostics/DiagnosticsPage.tsx` |
| Modify | `frontend/src/features/hooks-config/presets.ts` |

---

## Task 1: Domain types — DiagnosticsFileSystem

**Files:**
- Modify: `backend/internal/domain/diagnostics.go`

- [ ] **Step 1: Add types and field**

Open `backend/internal/domain/diagnostics.go`. After the existing `DiagnosticsCORS` type, append:

```go
type DiagnosticsFileSystem struct {
	ArgusDir string                 `json:"argusDir"`
	Binary    DiagnosticsFileEntry   `json:"binary"`
	Logs      []DiagnosticsFileEntry `json:"logs"`
	Hooks     []DiagnosticsFileEntry `json:"hooks"`
}

type DiagnosticsFileEntry struct {
	Name         string  `json:"name"`
	Path         string  `json:"path"`
	SizeBytes    *int64  `json:"sizeBytes"`
	LastModified *string `json:"lastModified"`
	Exists       bool    `json:"exists"`
}
```

Add `FileSystem DiagnosticsFileSystem` field to `Diagnostics`:

```go
type Diagnostics struct {
	Version    DiagnosticsVersion    `json:"version"`
	Health     DiagnosticsHealth     `json:"health"`
	Storage    DiagnosticsStorage    `json:"storage"`
	Agents     []DiagnosticsAgent    `json:"agents"`
	Privacy    DiagnosticsPrivacy    `json:"privacy"`
	Security   DiagnosticsSecurity   `json:"security"`
	FileSystem DiagnosticsFileSystem `json:"fileSystem"`
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd backend && go build ./...
```

Expected: no output (clean build).

- [ ] **Step 3: Commit**

```bash
git add backend/internal/domain/diagnostics.go
git commit -m "feat(domain): add DiagnosticsFileSystem and DiagnosticsFileEntry types"
```

---

## Task 2: Service — file system scan

**Files:**
- Modify: `backend/internal/service/event_service.go`

- [ ] **Step 1: Add ArgusDir to DiagnosticsOptions**

In `event_service.go`, add `ArgusDir string` to `DiagnosticsOptions`:

```go
type DiagnosticsOptions struct {
	DBPath             string
	HookConfigDetector func() []domain.DiagnosticsHookConfig
	IgnoreFile         domain.DiagnosticsIgnoreFile
	Addr               string
	AllowRemote        bool
	CORSOrigins        []string
	ArgusDir          string
}
```

- [ ] **Step 2: Add scanFileSystem and statEntry helpers**

At the bottom of `event_service.go`, add:

```go
func scanFileSystem(argusDir string) domain.DiagnosticsFileSystem {
	fs := domain.DiagnosticsFileSystem{
		ArgusDir: argusDir,
		Binary:    statEntry("argus", filepath.Join(argusDir, "bin", "argus")),
		Logs: []domain.DiagnosticsFileEntry{
			statEntry("argus.log", filepath.Join(argusDir, "argus.log")),
			statEntry("build.log", filepath.Join(argusDir, "build.log")),
		},
		Hooks: []domain.DiagnosticsFileEntry{},
	}
	entries, err := os.ReadDir(filepath.Join(argusDir, "hooks"))
	if err == nil {
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
			fs.Hooks = append(fs.Hooks, domain.DiagnosticsFileEntry{
				Name:         e.Name(),
				Path:         filepath.Join(argusDir, "hooks", e.Name()),
				SizeBytes:    &size,
				LastModified: &mod,
				Exists:       true,
			})
		}
	}
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
```

Add `"path/filepath"` to imports if not already present (it is, since `os` is already imported — add `filepath` separately).

- [ ] **Step 3: Populate FileSystem in DiagnosticsWithOptions**

In `DiagnosticsWithOptions`, find the `result := domain.Diagnostics{...}` block and add the `FileSystem` field:

```go
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
}
```

- [ ] **Step 4: Build and verify**

```bash
cd backend && go build ./...
```

Expected: no output.

- [ ] **Step 5: Write internal test for scanFileSystem**

Create `backend/internal/service/filesystem_test.go` (uses `package service` — white-box, no mock needed since scanFileSystem has no repo dependency):

```go
package service

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanFileSystemPopulatesEntries(t *testing.T) {
	dir := t.TempDir()

	// Create bin/argus
	binDir := filepath.Join(dir, "bin")
	if err := os.MkdirAll(binDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(binDir, "argus"), []byte("binary"), 0o755); err != nil {
		t.Fatal(err)
	}

	// Create argus.log only (build.log intentionally missing)
	if err := os.WriteFile(filepath.Join(dir, "argus.log"), []byte("log line\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Create hooks/myhook.sh
	hooksDir := filepath.Join(dir, "hooks")
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(hooksDir, "myhook.sh"), []byte("#!/bin/sh"), 0o755); err != nil {
		t.Fatal(err)
	}

	fs := scanFileSystem(dir)

	if fs.ArgusDir != dir {
		t.Errorf("argusDir = %q, want %q", fs.ArgusDir, dir)
	}
	if !fs.Binary.Exists {
		t.Error("binary.exists = false, want true")
	}
	if fs.Binary.SizeBytes == nil || *fs.Binary.SizeBytes != 6 {
		t.Errorf("binary.sizeBytes = %v, want 6", fs.Binary.SizeBytes)
	}
	if len(fs.Logs) != 2 {
		t.Fatalf("len(logs) = %d, want 2", len(fs.Logs))
	}
	if !fs.Logs[0].Exists {
		t.Error("logs[0] (argus.log) exists = false, want true")
	}
	if fs.Logs[1].Exists {
		t.Error("logs[1] (build.log) exists = true, want false")
	}
	if len(fs.Hooks) != 1 {
		t.Fatalf("len(hooks) = %d, want 1", len(fs.Hooks))
	}
	if fs.Hooks[0].Name != "myhook.sh" {
		t.Errorf("hooks[0].name = %q, want myhook.sh", fs.Hooks[0].Name)
	}
}

func TestStatEntryMissingFile(t *testing.T) {
	entry := statEntry("missing", "/nonexistent/path/file")
	if entry.Exists {
		t.Error("exists = true, want false for missing file")
	}
	if entry.SizeBytes != nil {
		t.Error("sizeBytes should be nil for missing file")
	}
	if entry.Name != "missing" {
		t.Errorf("name = %q, want missing", entry.Name)
	}
}
```

- [ ] **Step 6: Run tests**

```bash
cd backend && go test ./internal/service/...
```

Expected: PASS (all tests green).

- [ ] **Step 7: Commit**

```bash
git add backend/internal/service/event_service.go \
        backend/internal/service/filesystem_test.go
git commit -m "feat(service): scan ~/.argus filesystem for DiagnosticsFileSystem"
```

---

## Task 3: Log-tail handler

**Files:**
- Create: `backend/internal/handler/log_tail.go`
- Create: `backend/tests/internal/handler/log_tail_test.go`

- [ ] **Step 1: Write the failing test first**

Create `backend/tests/internal/handler/log_tail_test.go`:

```go
package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"argus/internal/handler"
)

func TestLogTailRejectsInvalidFile(t *testing.T) {
	h := handler.LogTail(handler.LogTailOptions{ArgusDir: t.TempDir()})
	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics/log-tail?file=../../etc/passwd", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestLogTailMissingFileReturnsEmptyLines(t *testing.T) {
	dir := t.TempDir()
	h := handler.LogTail(handler.LogTailOptions{ArgusDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics/log-tail?file=argus&lines=10", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	lines, ok := payload["lines"].([]any)
	if !ok {
		t.Fatalf("lines = %#v, want array", payload["lines"])
	}
	if len(lines) != 0 {
		t.Errorf("len(lines) = %d, want 0", len(lines))
	}
}

func TestLogTailReturnsLastNLines(t *testing.T) {
	dir := t.TempDir()
	content := "line1\nline2\nline3\nline4\nline5\n"
	if err := os.WriteFile(filepath.Join(dir, "argus.log"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	h := handler.LogTail(handler.LogTailOptions{ArgusDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics/log-tail?file=argus&lines=3", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload struct {
		File  string   `json:"file"`
		Lines []string `json:"lines"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload.File != "argus.log" {
		t.Errorf("file = %q, want argus.log", payload.File)
	}
	if len(payload.Lines) != 3 {
		t.Fatalf("len(lines) = %d, want 3", len(payload.Lines))
	}
	if payload.Lines[0] != "line3" || payload.Lines[2] != "line5" {
		t.Errorf("lines = %v, want [line3 line4 line5]", payload.Lines)
	}
}

func TestLogTailBuildFileParam(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "build.log"), []byte("build output\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := handler.LogTail(handler.LogTailOptions{ArgusDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics/log-tail?file=build", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload struct {
		File  string   `json:"file"`
		Lines []string `json:"lines"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload.File != "build.log" {
		t.Errorf("file = %q, want build.log", payload.File)
	}
}
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd backend && go test ./tests/internal/handler/... -run TestLogTail -v
```

Expected: compile error — `handler.LogTail` and `handler.LogTailOptions` not defined yet.

- [ ] **Step 3: Implement the handler**

Create `backend/internal/handler/log_tail.go`:

```go
package handler

import (
	"bufio"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
)

// LogTailOptions configures the log-tail handler.
type LogTailOptions struct {
	ArgusDir string
}

// LogTail serves the last N lines of a whitelisted log file in ~/.argus.
func LogTail(opts LogTailOptions) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fileParam := r.URL.Query().Get("file")
		var filename string
		switch fileParam {
		case "argus":
			filename = "argus.log"
		case "build":
			filename = "build.log"
		default:
			http.Error(w, "invalid file param: must be 'argus' or 'build'", http.StatusBadRequest)
			return
		}

		n := 50
		if raw := r.URL.Query().Get("lines"); raw != "" {
			if v, err := strconv.Atoi(raw); err == nil {
				if v < 1 {
					v = 1
				}
				if v > 200 {
					v = 200
				}
				n = v
			}
		}

		path := filepath.Join(opts.ArgusDir, filename)
		lines, err := tailLines(path, n)
		if err != nil {
			lines = []string{}
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]any{
			"file":  filename,
			"lines": lines,
		}); err != nil {
			log.Printf("[handler] encode log-tail: %v", err)
		}
	})
}

func tailLines(path string, n int) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var all []string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		all = append(all, sc.Text())
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}

	if len(all) <= n {
		return all, nil
	}
	return all[len(all)-n:], nil
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && go test ./tests/internal/handler/... -run TestLogTail -v
```

Expected: all 4 `TestLogTail*` tests PASS.

- [ ] **Step 5: Run full backend tests**

```bash
cd backend && go test ./...
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/handler/log_tail.go \
        backend/tests/internal/handler/log_tail_test.go
git commit -m "feat(handler): add log-tail endpoint with file whitelist"
```

---

## Task 4: Router and main wiring

**Files:**
- Modify: `backend/internal/server/router.go`
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Add ArgusDir to server.Options**

In `backend/internal/server/router.go`, add `ArgusDir string` to `Options`:

```go
type Options struct {
	Matcher            handler.IgnoreMatcher
	CORSOrigins        []string
	DBPath             string
	HookConfigDetector func() []domain.DiagnosticsHookConfig
	IgnoreFile         domain.DiagnosticsIgnoreFile
	Addr               string
	AllowRemote        bool
	ClaudeSettingsPath string
	CodexHooksPath     string
	ArgusDir          string
}
```

- [ ] **Step 2: Register the log-tail route and pass ArgusDir to diagnostics**

In `NewRouter`, after the existing diagnostics handler registration, add:

```go
mux.Handle("GET /api/diagnostics/log-tail", handler.LogTail(handler.LogTailOptions{
    ArgusDir: opts.ArgusDir,
}))
```

Also update the existing diagnostics handler registration to pass `ArgusDir`:

```go
mux.Handle("GET /api/diagnostics", handler.Diagnostics(svc, ready, service.DiagnosticsOptions{
    DBPath:             opts.DBPath,
    HookConfigDetector: hookDetector,
    IgnoreFile:         opts.IgnoreFile,
    Addr:               opts.Addr,
    AllowRemote:        opts.AllowRemote,
    CORSOrigins:        corsOrigins,
    ArgusDir:          opts.ArgusDir,
}))
```

- [ ] **Step 3: Pass ArgusDir from main.go**

In `backend/cmd/server/main.go`, update the `server.NewRouter` call to include `ArgusDir`:

```go
h := server.NewRouter(svc, repo, repo.Ready, server.Options{
    Matcher:            matcher,
    CORSOrigins:        cfg.CORSOrigins,
    DBPath:             cfg.DBPath,
    IgnoreFile:         domainIgnoreFile(ignoreStatus),
    Addr:               cfg.Addr,
    AllowRemote:        cfg.AllowRemote,
    ClaudeSettingsPath: filepath.Join(home, ".claude", "settings.json"),
    CodexHooksPath:     filepath.Join(home, ".codex", "hooks.json"),
    ArgusDir:          filepath.Join(home, ".argus"),
})
```

(`home` is already computed on line 71 of `main.go` as `home, _ := os.UserHomeDir()`)

- [ ] **Step 4: Build and run all backend tests**

```bash
cd backend && go build ./... && go test ./...
```

Expected: clean build, all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/server/router.go backend/cmd/server/main.go
git commit -m "feat(router): wire log-tail handler and ArgusDir through to diagnostics service"
```

---

## Task 5: Update diagnostics handler test

**Files:**
- Modify: `backend/tests/internal/handler/diagnostics_test.go`

- [ ] **Step 1: Assert fileSystem key in payload check**

Find `TestDiagnosticsHandlerReturnsGroupedShape` in `backend/tests/internal/handler/diagnostics_test.go`. Update the keys check to include `"fileSystem"`:

```go
for _, key := range []string{"version", "health", "storage", "agents", "privacy", "security", "fileSystem"} {
    if _, ok := payload[key]; !ok {
        t.Fatalf("payload missing %q: %#v", key, payload)
    }
}
```

Also add a shape check for `fileSystem` after the existing `storage` checks:

```go
fileSystem, ok := payload["fileSystem"].(map[string]any)
if !ok {
    t.Fatalf("fileSystem = %#v, want object", payload["fileSystem"])
}
for _, key := range []string{"argusDir", "binary", "logs", "hooks"} {
    if _, ok := fileSystem[key]; !ok {
        t.Fatalf("fileSystem missing %q: %#v", key, fileSystem)
    }
}
logs, ok := fileSystem["logs"].([]any)
if !ok {
    t.Fatalf("fileSystem.logs = %#v, want array", fileSystem["logs"])
}
if len(logs) != 2 {
    t.Fatalf("len(fileSystem.logs) = %d, want 2", len(logs))
}
```

- [ ] **Step 2: Run tests**

```bash
cd backend && go test ./tests/internal/handler/... -v
```

Expected: all tests PASS.

- [ ] **Step 3: Run lint**

```bash
cd backend && golangci-lint run ./...
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/internal/handler/diagnostics_test.go
git commit -m "test(handler): assert fileSystem shape in diagnostics handler test"
```

---

## Task 6: Frontend types

**Files:**
- Modify: `frontend/src/features/diagnostics/types.ts`

- [ ] **Step 1: Add DiagnosticsFileEntry, DiagnosticsFileSystem, extend Diagnostics**

Append to `frontend/src/features/diagnostics/types.ts`:

```ts
export interface DiagnosticsFileEntry {
  name: string
  path: string
  sizeBytes: number | null
  lastModified: string | null
  exists: boolean
}

export interface DiagnosticsFileSystem {
  argusDir: string
  binary: DiagnosticsFileEntry
  logs: DiagnosticsFileEntry[]
  hooks: DiagnosticsFileEntry[]
}
```

Update the `Diagnostics` interface to add the field:

```ts
export interface Diagnostics {
  version: DiagnosticsVersion
  health: DiagnosticsHealth
  storage: DiagnosticsStorage
  agents: DiagnosticsAgent[]
  privacy: DiagnosticsPrivacy
  security: DiagnosticsSecurity
  fileSystem: DiagnosticsFileSystem
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/diagnostics/types.ts
git commit -m "feat(types): add DiagnosticsFileSystem and DiagnosticsFileEntry types"
```

---

## Task 7: Fix detectHookConfigLabel — always Configured (n/n)

**Files:**
- Modify: `frontend/src/features/hooks-config/presets.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/features/hooks-config/__tests__/presets.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { detectHookConfigLabel, HOOK_PRESETS } from '../presets'

describe('detectHookConfigLabel', () => {
  it('returns Configured (n/Y) for exact preset match — not preset name', () => {
    // Full preset for claudecode has 30 events
    const fullConfig = HOOK_PRESETS.claudecode.full
    const label = detectHookConfigLabel('claudecode', fullConfig)
    expect(label).toBe('Configured (30/30)')
  })

  it('returns Configured (n/Y) for baseline preset', () => {
    const baselineConfig = HOOK_PRESETS.claudecode.baseline
    const label = detectHookConfigLabel('claudecode', baselineConfig)
    // baseline has 5 event types
    expect(label).toMatch(/^Configured \(\d+\/30\)$/)
    expect(label).not.toBe('Baseline')
  })

  it('returns Configured (n/Y) for codex full preset', () => {
    const fullConfig = HOOK_PRESETS.codex.full
    const label = detectHookConfigLabel('codex', fullConfig)
    expect(label).toBe('Configured (10/10)')
    expect(label).not.toBe('Full')
  })

  it('returns Configured for manual setup with no argus status message', () => {
    const manualConfig = {
      hooks: {
        SessionStart: [
          { id: 'abc', hooks: [{ id: 'def', type: 'command' as const, command: 'echo hi' }] },
        ],
      },
    }
    const label = detectHookConfigLabel('claudecode', manualConfig)
    expect(label).toBe('Configured')
  })

  it('returns Missing for empty config', () => {
    const label = detectHookConfigLabel('claudecode', { hooks: {} })
    expect(label).toBe('Missing')
  })
})
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd frontend && npx vitest run src/features/hooks-config/__tests__/presets.test.ts
```

Expected: FAIL — `Configured (30/30)` ≠ `Full`, etc.

- [ ] **Step 3: Update detectHookConfigLabel**

In `frontend/src/features/hooks-config/presets.ts`, replace the body of `detectHookConfigLabel`:

```ts
export function detectHookConfigLabel(agent: AgentKey, config: HooksConfig): string {
  const anyEvents = Object.values(config.hooks).some((groups) =>
    groups.some((g) => g.hooks.length > 0)
  )
  if (!anyEvents) return 'Missing'

  const argusEventTypes = new Set(
    Object.entries(config.hooks)
      .filter(([, groups]) =>
        groups.some((g) => g.hooks.some((e) => e.statusMessage === ARGUS_STATUS_MESSAGE))
      )
      .map(([eventType]) => eventType)
  )

  if (argusEventTypes.size === 0) return 'Configured'

  const total = AGENT_EVENT_TOTALS[agent]
  return `Configured (${argusEventTypes.size}/${total})`
}
```

(Remove the preset-matching loop and `PRESET_LABELS` references — they are no longer needed here. `PRESET_LABELS` is still used by the hooks config UI, so do NOT delete it from the file.)

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/features/hooks-config/__tests__/presets.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Run full frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/hooks-config/presets.ts \
        frontend/src/features/hooks-config/__tests__/presets.test.ts
git commit -m "feat(presets): normalize hook config label to Configured (n/n) format"
```

---

## Task 8: Extract formatBytes to utils.ts

**Files:**
- Create: `frontend/src/features/diagnostics/utils.ts`
- Modify: `frontend/src/features/diagnostics/DiagnosticsPage.tsx`

- [ ] **Step 1: Create utils.ts with formatBytes**

Create `frontend/src/features/diagnostics/utils.ts`:

```ts
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
```

- [ ] **Step 2: Remove formatBytes from DiagnosticsPage.tsx and import from utils**

In `DiagnosticsPage.tsx`:
- Delete the `function formatBytes(...)` definition (lines 66–72 in the current file)
- Add import at the top, after the shadcn imports block:

```ts
import { formatBytes } from './utils'
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/diagnostics/utils.ts \
        frontend/src/features/diagnostics/DiagnosticsPage.tsx
git commit -m "refactor(diagnostics): extract formatBytes to utils.ts"
```

---

## Task 9: useLogTail hook

**Files:**
- Create: `frontend/src/features/diagnostics/hooks/useLogTail.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/diagnostics/hooks/__tests__/useLogTail.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogTail } from '../useLogTail'

describe('useLogTail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not fetch on mount', () => {
    renderHook(() => useLogTail('argus'))
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches when fetch() is called', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ file: 'argus.log', lines: ['line1', 'line2'] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useLogTail('argus', 10))

    await act(async () => {
      await result.current.fetch()
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/diagnostics/log-tail?file=argus&lines=10')
    expect(result.current.lines).toEqual(['line1', 'line2'])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets error on HTTP failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }))
    const { result } = renderHook(() => useLogTail('build'))

    await act(async () => {
      await result.current.fetch()
    })

    expect(result.current.error).toBe('Failed to load log')
    expect(result.current.lines).toEqual([])
  })

  it('clear() resets state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ file: 'argus.log', lines: ['x'] }),
      })
    )
    const { result } = renderHook(() => useLogTail('argus'))

    await act(async () => {
      await result.current.fetch()
    })
    expect(result.current.lines).toEqual(['x'])

    act(() => {
      result.current.clear()
    })
    expect(result.current.lines).toEqual([])
    expect(result.current.error).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
cd frontend && npx vitest run src/features/diagnostics/hooks/__tests__/useLogTail.test.ts
```

Expected: FAIL — `useLogTail` not found.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/features/diagnostics/hooks/useLogTail.ts`:

```ts
import { useCallback, useState } from 'react'

type LogFile = 'argus' | 'build'

type State = {
  lines: string[]
  loading: boolean
  error: string | null
}

export function useLogTail(file: LogFile, lines = 50) {
  const [state, setState] = useState<State>({ lines: [], loading: false, error: null })

  const fetchLog = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const r = await fetch(`/api/diagnostics/log-tail?file=${file}&lines=${lines}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = (await r.json()) as { file: string; lines: string[] }
      setState({ lines: data.lines, loading: false, error: null })
    } catch {
      setState({ lines: [], loading: false, error: 'Failed to load log' })
    }
  }, [file, lines])

  const clear = useCallback(() => {
    setState({ lines: [], loading: false, error: null })
  }, [])

  return { ...state, fetch: fetchLog, clear }
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/features/diagnostics/hooks/__tests__/useLogTail.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/diagnostics/hooks/useLogTail.ts \
        frontend/src/features/diagnostics/hooks/__tests__/useLogTail.test.ts
git commit -m "feat(diagnostics): add useLogTail hook for on-demand log file fetching"
```

---

## Task 10: FileSystemCard component

**Files:**
- Create: `frontend/src/features/diagnostics/FileSystemCard.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/diagnostics/__tests__/FileSystemCard.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileSystemCard } from '../FileSystemCard'
import type { DiagnosticsFileSystem } from '../types'

const mockFS: DiagnosticsFileSystem = {
  argusDir: '/home/user/.argus',
  binary: {
    name: 'argus',
    path: '/home/user/.argus/bin/argus',
    sizeBytes: 18700000,
    lastModified: '2026-06-08T10:00:00Z',
    exists: true,
  },
  logs: [
    {
      name: 'argus.log',
      path: '/home/user/.argus/argus.log',
      sizeBytes: 2900000,
      lastModified: '2026-06-08T10:00:00Z',
      exists: true,
    },
    {
      name: 'build.log',
      path: '/home/user/.argus/build.log',
      sizeBytes: null,
      lastModified: null,
      exists: false,
    },
  ],
  hooks: [
    {
      name: 'permission-request.sh',
      path: '/home/user/.argus/hooks/permission-request.sh',
      sizeBytes: 5600,
      lastModified: '2026-06-08T09:00:00Z',
      exists: true,
    },
  ],
}

describe('FileSystemCard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders argusDir', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    expect(screen.getByText('/home/user/.argus')).toBeInTheDocument()
  })

  it('renders binary size', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    expect(screen.getByText('17.8 MB')).toBeInTheDocument()
  })

  it('shows Not found for missing log', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    expect(screen.getByText('Not found')).toBeInTheDocument()
  })

  it('renders hook file name', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    expect(screen.getByText('permission-request.sh')).toBeInTheDocument()
  })

  it('shows Tail button for existing log files', () => {
    render(<FileSystemCard fileSystem={mockFS} />)
    const tailButtons = screen.getAllByRole('button', { name: /tail/i })
    expect(tailButtons.length).toBeGreaterThan(0)
  })

  it('fetches and shows log lines when Tail is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ file: 'argus.log', lines: ['log line A', 'log line B'] }),
      })
    )
    render(<FileSystemCard fileSystem={mockFS} />)
    const tailButtons = screen.getAllByRole('button', { name: /tail/i })
    fireEvent.click(tailButtons[0])
    await waitFor(() => {
      expect(screen.getByText('log line A')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run to verify fail**

```bash
cd frontend && npx vitest run src/features/diagnostics/__tests__/FileSystemCard.test.tsx
```

Expected: FAIL — `FileSystemCard` not found.

- [ ] **Step 3: Implement FileSystemCard**

Create `frontend/src/features/diagnostics/FileSystemCard.tsx`:

```tsx
import { format } from 'date-fns'
import { Copy, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { formatBytes } from './utils'
import { useLogTail } from './hooks/useLogTail'
import type { DiagnosticsFileEntry, DiagnosticsFileSystem } from './types'

type FileSystemCardProps = {
  fileSystem: DiagnosticsFileSystem
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => navigator.clipboard.writeText(value).catch(() => {})}
      className="h-auto p-0 opacity-40 hover:opacity-100 transition-opacity"
      aria-label={label}
    >
      <Copy className="size-3" />
    </Button>
  )
}

function FileSize({ entry }: { entry: DiagnosticsFileEntry }) {
  if (!entry.exists) {
    return <span className="text-[12px] text-muted-foreground">Not found</span>
  }
  return (
    <span className="text-[13px]">
      {entry.sizeBytes !== null ? formatBytes(entry.sizeBytes) : 'Unknown'}
    </span>
  )
}

function FileModified({ entry }: { entry: DiagnosticsFileEntry }) {
  if (!entry.exists || !entry.lastModified) return null
  try {
    return (
      <span className="text-[12px] text-muted-foreground">
        {format(new Date(entry.lastModified), 'MMM d')}
      </span>
    )
  } catch {
    return null
  }
}

type TailPanelProps = {
  lines: string[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

function TailPanel({ lines, loading, error, onRefresh }: TailPanelProps) {
  return (
    <div className="mt-2 rounded border border-border bg-[var(--secondary)] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-muted-foreground">Last 50 lines</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh log"
        >
          <RefreshCw className={cn('size-3', loading && 'animate-spin')} />
        </Button>
      </div>
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      {!error && lines.length === 0 && !loading && (
        <p className="text-[12px] text-muted-foreground">Log file is empty or not found</p>
      )}
      {lines.length > 0 && (
        <pre className="font-mono text-[11px] leading-relaxed overflow-y-auto max-h-[320px] whitespace-pre-wrap break-all">
          {lines.join('\n')}
        </pre>
      )}
    </div>
  )
}

type LogRowProps = {
  entry: DiagnosticsFileEntry
  open: boolean
  onToggle: () => void
  tailState: { lines: string[]; loading: boolean; error: string | null }
  onRefresh: () => void
}

function LogRow({ entry, open, onToggle, tailState, onRefresh }: LogRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between py-2 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px]">{entry.name}</span>
          <span
            className="font-mono text-[12px] text-muted-foreground truncate max-w-[180px]"
            title={entry.path}
          >
            {entry.path}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <FileSize entry={entry} />
          <FileModified entry={entry} />
          {entry.exists && <CopyButton value={entry.path} label={`Copy ${entry.name} path`} />}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={onToggle}
            aria-label={`Tail ${entry.name}`}
          >
            {open ? 'Close' : 'Tail'}
          </Button>
        </div>
      </div>
      {open && <TailPanel {...tailState} onRefresh={onRefresh} />}
    </div>
  )
}

export function FileSystemCard({ fileSystem }: FileSystemCardProps) {
  // Tail hooks hoisted here — one per log file (always exactly 2: argus + build)
  const argusTail = useLogTail('argus', 50)
  const buildTail = useLogTail('build', 50)
  const [openLog, setOpenLog] = useState<string | null>(null)

  function toggleLog(name: string) {
    const opening = openLog !== name
    setOpenLog(opening ? name : null)
    if (opening) {
      if (name === 'argus.log') argusTail.fetch()
      else if (name === 'build.log') buildTail.fetch()
    }
  }

  function tailStateFor(name: string) {
    const t = name === 'argus.log' ? argusTail : buildTail
    return { lines: t.lines, loading: t.loading, error: t.error }
  }

  function refreshFor(name: string) {
    return name === 'argus.log' ? argusTail.fetch : buildTail.fetch
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>File System</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-0">
        {/* Root dir */}
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="text-muted-foreground">~/.argus</span>
          <span className="flex items-center gap-1">
            <span
              className="font-mono text-[12px] text-foreground truncate max-w-[300px]"
              title={fileSystem.argusDir}
            >
              {fileSystem.argusDir}
            </span>
            <CopyButton value={fileSystem.argusDir} label="Copy .argus path" />
          </span>
        </div>
        <Separator />

        {/* Binary */}
        <div className="flex items-center justify-between py-2 text-[13px]">
          <span className="text-muted-foreground">Binary</span>
          <div className="flex items-center gap-2">
            <span
              className="font-mono text-[12px] text-foreground truncate max-w-[200px]"
              title={fileSystem.binary.path}
            >
              {fileSystem.binary.path}
            </span>
            <FileSize entry={fileSystem.binary} />
            <FileModified entry={fileSystem.binary} />
            {fileSystem.binary.exists && (
              <CopyButton value={fileSystem.binary.path} label="Copy binary path" />
            )}
          </div>
        </div>
        <Separator />

        {/* Logs */}
        <div className="py-1">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide py-1">Logs</p>
          {fileSystem.logs.map((entry, i) => (
            <div key={entry.name}>
              {i > 0 && <Separator />}
              <LogRow
                entry={entry}
                open={openLog === entry.name}
                onToggle={() => toggleLog(entry.name)}
                tailState={tailStateFor(entry.name)}
                onRefresh={refreshFor(entry.name)}
              />
            </div>
          ))}
        </div>
        <Separator />

        {/* Hooks */}
        <div className="py-1">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide py-1">
            Hooks ({fileSystem.hooks.length})
          </p>
          {fileSystem.hooks.length === 0 ? (
            <p className="text-[12px] text-muted-foreground py-2">No hook scripts found</p>
          ) : (
            fileSystem.hooks.map((entry, i) => (
              <div key={entry.name}>
                {i > 0 && <Separator />}
                <div className="flex items-center justify-between py-2 text-[13px]">
                  <span className="font-mono text-[12px]">{entry.name}</span>
                  <div className="flex items-center gap-2">
                    <FileSize entry={entry} />
                    <FileModified entry={entry} />
                    <CopyButton value={entry.path} label={`Copy ${entry.name} path`} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Warning for missing binary */}
        {!fileSystem.binary.exists && (
          <div className="mt-2">
            <Badge
              variant="outline"
              className="border-[var(--cwd)] text-[var(--cwd)] bg-transparent"
            >
              Binary not installed
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/features/diagnostics/__tests__/FileSystemCard.test.tsx
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/diagnostics/FileSystemCard.tsx \
        frontend/src/features/diagnostics/__tests__/FileSystemCard.test.tsx
git commit -m "feat(diagnostics): add FileSystemCard component with inline log tail"
```

---

## Task 11: DiagnosticsPage — version row split + render FileSystemCard

**Files:**
- Modify: `frontend/src/features/diagnostics/DiagnosticsPage.tsx`

- [ ] **Step 1: Import FileSystemCard and update version rows**

In `DiagnosticsPage.tsx`, add import after the `useDiagnostics` import:

```ts
import { FileSystemCard } from './FileSystemCard'
```

- [ ] **Step 2: Split the Version row into 3 rows**

Find the System Facts card version row (currently one row showing `data.version.version` + commit + buildDate combined). Replace it with 3 separate rows:

```tsx
{/* Version */}
<div className="flex items-center justify-between py-2 text-[13px]">
  <span className="text-muted-foreground">Version</span>
  <span>{data.version.version}</span>
</div>
<Separator />
{/* Commit */}
<div className="flex items-center justify-between py-2 text-[13px]">
  <span className="text-muted-foreground">Commit</span>
  <code className="font-mono text-[12px] text-[var(--edit)]">
    {data.version.commit.slice(0, 8)}
  </code>
</div>
<Separator />
{/* Built */}
<div className="flex items-center justify-between py-2 text-[13px]">
  <span className="text-muted-foreground">Built</span>
  <span>
    {data.version.buildDate
      ? (() => {
          try {
            return format(new Date(data.version.buildDate), 'MMM d, yyyy')
          } catch {
            return data.version.buildDate
          }
        })()
      : '—'}
  </span>
</div>
```

Add `format` to the `date-fns` import at the top:

```ts
import { format, formatDistanceToNow } from 'date-fns'
```

- [ ] **Step 3: Render FileSystemCard below the 2-column section**

In `LoadedContent`, after the closing `</div>` of the 2-column grid (`className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]"`), add:

```tsx
{/* File System — full width */}
<FileSystemCard fileSystem={data.fileSystem} />
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 6: Run lint**

```bash
cd frontend && npx prettier --check src/features/diagnostics/DiagnosticsPage.tsx
```

Fix any formatting issues:

```bash
cd frontend && npx prettier --write src/features/diagnostics/DiagnosticsPage.tsx
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/diagnostics/DiagnosticsPage.tsx
git commit -m "feat(diagnostics): split version row, render FileSystemCard below 2-col layout"
```

---

## Task 12: Build and deploy

- [ ] **Step 1: Full backend check**

```bash
cd backend && go build ./... && go test ./... && golangci-lint run ./...
```

Expected: clean build, all tests green, no lint errors.

- [ ] **Step 2: Full frontend check**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: no type errors, all tests PASS.

- [ ] **Step 3: Deploy with make build-local**

```bash
make build-local
```

Expected: binary built with version ldflags, service restarted, version logged.

- [ ] **Step 4: Verify in browser**

Navigate to `http://localhost:10804/diagnostics` (or `http://localhost:5173/diagnostics` if using dev server).

Check:
- System Facts shows 3 separate rows: Version / Commit / Built
- Agent Connectivity Hook Config column shows `Configured (n/n)` not preset names
- File System card visible below Privacy & Security
- Binary row shows path + size
- `argus.log` row has Tail button; clicking it loads last 50 lines
- Hooks section lists `permission-request.sh`
