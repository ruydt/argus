# Phase 3: Mature Local Product - Pattern Map

**Mapped:** 2026-05-27
**Files analyzed:** 17 new/modified files
**Analogs found:** 14 / 17

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/internal/privacy/ignore/ignore.go` | utility | file-I/O, transform | `backend/internal/fileutil/fileutil.go` | role-match |
| `backend/internal/privacy/ignore/ignore_test.go` | test | file-I/O, transform | `backend/tests/internal/fileutil/fileutil_test.go` | role-match |
| `backend/internal/handler/hook.go` | controller | request-response | `backend/internal/handler/hook.go` | exact |
| `backend/tests/internal/handler/hook_test.go` | test | request-response, CRUD | `backend/tests/internal/handler/hook_test.go` | exact |
| `backend/internal/config/config.go` | config | request-response | `backend/internal/config/config.go` | exact |
| `backend/tests/internal/config/config_test.go` | test | request-response | `backend/tests/internal/config/config_test.go` | exact |
| `backend/cmd/server/main.go` | config | request-response | `backend/cmd/server/main.go` | exact |
| `backend/internal/server/middleware.go` | middleware | request-response | `backend/internal/server/middleware.go` | exact |
| `backend/internal/server/router.go` | route | request-response | `backend/internal/server/router.go` | exact |
| `backend/tests/internal/server/router_test.go` | test | request-response | `backend/tests/internal/server/router_test.go` | exact |
| `scripts/hooker` | utility | batch, request-response | `scripts/hooker` | exact |
| `docs/privacy.md` | docs | file-I/O | `docs/install.md` | role-match |
| `docs/security.md` | docs | file-I/O | `docs/install.md` | role-match |
| `docs/adr/0001-sqlite-local-storage.md` | docs | file-I/O | none | no-analog |
| `docs/adr/0002-hook-normalization-strategy.md` | docs | file-I/O | none | no-analog |
| `docs/adr/0003-local-first-positioning.md` | docs | file-I/O | none | no-analog |
| `CONTRIBUTING.md` | docs | file-I/O | `CONTRIBUTING.md` | exact |

## Pattern Assignments

### `backend/internal/privacy/ignore/ignore.go` (utility, file-I/O + transform)

**Analog:** `backend/internal/fileutil/fileutil.go`

**Imports pattern** (lines 3-10):
```go
import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"hooker/internal/domain"
)
```

**Core utility pattern** (lines 66-74):
```go
func ResolvePath(cwd, path string) string {
	if path == "" {
		return ""
	}
	if filepath.IsAbs(path) {
		return path
	}
	return filepath.Join(cwd, path)
}
```

**Transform/error handling pattern** (lines 168-175):
```go
func FindStartLine(filePath, oldStr string) int {
	if filePath == "" || oldStr == "" {
		return 0
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return 0
	}
```

Apply this shape to a small package with exported constructor/API and unexported helpers. Unlike `fileutil`, ignore loading should return explicit errors for unreadable configured files, while missing default ignore file may be treated as an empty matcher if the planner chooses that policy.

### `backend/internal/privacy/ignore/ignore_test.go` (test, file-I/O + transform)

**Analog:** `backend/tests/internal/fileutil/fileutil_test.go`

**Imports and external test package pattern** (lines 1-9):
```go
package fileutil_test

import (
	"os"
	"path/filepath"
	"testing"

	"hooker/internal/fileutil"
)
```

**Table-driven matcher pattern** (lines 31-54):
```go
func TestToolToAction(t *testing.T) {
	cases := []struct{ tool, want string }{
		{"bash", "BASH"},
		{"Bash", "BASH"},
		{"shell_exec", "BASH"},
	}
	for _, c := range cases {
		if got := fileutil.ToolToAction(c.tool); got != c.want {
			t.Errorf("ToolToAction(%q) = %q, want %q", c.tool, got, c.want)
		}
	}
}
```

**Temp file pattern** (lines 137-144):
```go
dir := t.TempDir()
path := filepath.Join(dir, "f.go")
if err := os.WriteFile(path, []byte("a\nb\nc\nd\ne\n"), 0o600); err != nil {
	t.Fatalf("WriteFile: %v", err)
}
```

Use these tests for blank lines, comments, `!` negation, directory patterns, `**`, missing default file behavior, and event matching against only `domain.NormalizedEvent.CWD` and `Path`.

### `backend/internal/handler/hook.go` (controller, request-response)

**Analog:** `backend/internal/handler/hook.go`

**Imports pattern** (lines 3-19):
```go
import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"hooker/internal/agents/claudecode"
	"hooker/internal/agents/codex"
	"hooker/internal/agents/geminicli"
	"hooker/internal/domain"
	"hooker/internal/fileutil"
	"hooker/internal/service"
)
```

**Normalization before persistence pattern** (lines 40-49):
```go
var e domain.NormalizedEvent
var normalizeErr error
switch {
case claudecode.MatchesTranscript(meta.TranscriptPath):
	e, normalizeErr = claudecode.Normalize(raw)
case geminicli.MatchesTranscript(meta.TranscriptPath) || meta.Source == "gemini":
	e, normalizeErr = geminicli.Normalize(raw)
default:
	e, normalizeErr = codex.Normalize(raw)
}
```

**Insertion point for privacy ignore** (lines 84-101):
```go
e = enrichContext(e)

if e.Model == "" && e.Session != "" {
	if model, err := svc.SessionModel(e.Session); err == nil && model != "" {
		e.Model = model
	}
}

slog.Info("hook", "agent", e.Agent, "session", e.Session, "tool", e.Tool, "action", e.Action, "path", e.Path)

if err := svc.AddEvent(e); err != nil {
```

Place the ignore decision after `enrichContext(e)` has canonical `CWD`/`Path` and before model enrichment, hook logging, and `svc.AddEvent`. Matched events should return the existing JSON `{}` response and log only safe metadata.

**Store error handling pattern** (lines 101-110):
```go
if err := svc.AddEvent(e); err != nil {
	slog.Error("hook store event", "err", err)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_, _ = w.Write([]byte(`{}`))
	return
}

w.Header().Set("Content-Type", "application/json")
_, _ = w.Write([]byte(`{}`))
```

### `backend/tests/internal/handler/hook_test.go` (test, request-response + CRUD)

**Analog:** `backend/tests/internal/handler/hook_test.go`

**Test service setup pattern** (lines 17-24):
```go
func newTestService(t *testing.T) *service.EventService {
	t.Helper()
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	return service.New(db)
}
```

**POST handler assertion pattern** (lines 38-59):
```go
h := handler.Hook(newTestService(t))
body := []byte(`{
	"session_id": "s1",
	"transcript_path": "/home/user/.claude/sessions/abc.jsonl",
	"hook_event_name": "PreToolUse",
	"tool_name": "Edit",
	"cwd": "/tmp",
	"tool_input": {"file_path": "foo.go"}
}`)

req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
rec := httptest.NewRecorder()
h.ServeHTTP(rec, req)

if rec.Code != http.StatusOK {
	t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
}
```

**Persistence assertion pattern** (lines 96-105):
```go
events, err := svc.ListEvents(10)
if err != nil {
	t.Fatalf("ListEvents: %v", err)
}
if len(events) != 1 {
	t.Fatalf("events len = %d, want 1", len(events))
}
```

Add tests proving ignored events return 200 but produce zero stored rows and no SSE broadcast; subscribe via `svc.Subscribe()` before the POST and assert no channel receive after the handler returns.

### `backend/internal/config/config.go` (config, request-response)

**Analog:** `backend/internal/config/config.go`

**Config struct and env loading pattern** (lines 8-18):
```go
type Config struct {
	Addr   string
	DBPath string
}

func Load() Config {
	return Config{
		Addr:   envOr("ADDR", "127.0.0.1:8765"),
		DBPath: envOr("DB_PATH", defaultDBPath()),
	}
}
```

**Env helper pattern** (lines 20-25):
```go
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

Extend this surface for `HOOKER_ALLOW_REMOTE`, explicit CORS origins, and ignore path. Keep parsing small and testable; use defaults here, startup validation in `cmd/server`.

### `backend/tests/internal/config/config_test.go` (test, request-response)

**Analog:** `backend/tests/internal/config/config_test.go`

**Default env cleanup pattern** (lines 12-25):
```go
func TestLoad_defaults(t *testing.T) {
	if err := os.Unsetenv("ADDR"); err != nil {
		t.Fatalf("Unsetenv ADDR: %v", err)
	}
	if err := os.Unsetenv("DB_PATH"); err != nil {
		t.Fatalf("Unsetenv DB_PATH: %v", err)
	}
	cfg := config.Load()
	if cfg.Addr != "127.0.0.1:8765" {
		t.Errorf("Addr = %q, want 127.0.0.1:8765", cfg.Addr)
	}
}
```

**Env override pattern** (lines 28-37):
```go
func TestLoad_env(t *testing.T) {
	t.Setenv("ADDR", "0.0.0.0:9000")
	t.Setenv("DB_PATH", "/tmp/test.db")
	cfg := config.Load()
	if cfg.Addr != "0.0.0.0:9000" {
		t.Errorf("Addr = %q, want 0.0.0.0:9000", cfg.Addr)
	}
}
```

Add cases for boolean remote opt-in, comma-separated CORS origins, and default ignore path `~/.config/hooker/ignore`.

### `backend/cmd/server/main.go` (config, request-response)

**Analog:** `backend/cmd/server/main.go`

**Startup validation pattern** (lines 21-39):
```go
func main() {
	cfg := config.Load()

	if cfg.DBPath != ":memory:" {
		f, err := os.OpenFile(cfg.DBPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
		if err != nil {
			slog.Error("db not writable", "path", cfg.DBPath, "err", err)
			os.Exit(1)
		}
		_ = f.Close()
	}

	if _, _, err := net.SplitHostPort(cfg.Addr); err != nil {
		slog.Error("invalid ADDR", "addr", cfg.Addr, "err", err)
		os.Exit(1)
	}
```

**Warning/logging pattern** (lines 56-59):
```go
slog.Info("hooker", "version", version.Version, "commit", version.Commit)
slog.Info("hook endpoint", "url", "POST http://"+cfg.Addr+"/api/hook")
slog.Info("events SSE", "url", "GET http://"+cfg.Addr+"/api/events/stream")
slog.Info("db", "path", cfg.DBPath)
```

Add non-loopback bind validation before opening the server socket. If remote is opted in, emit a prominent `slog.Warn` block before `ListenAndServe`.

### `backend/internal/server/middleware.go` (middleware, request-response)

**Analog:** `backend/internal/server/middleware.go`

**Middleware imports pattern** (lines 3-9):
```go
import (
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"time"
)
```

**CORS preflight pattern to replace** (lines 46-57):
```go
func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
```

**Host guard pattern** (lines 62-78):
```go
func hostHeader(next http.Handler) http.Handler {
	allowed := map[string]bool{
		"localhost": true,
		"127.0.0.1": true,
		"[::1]":     true,
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		if !allowed[host] {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
```

Replace wildcard CORS with exact-origin allowlist, preserve `OPTIONS` behavior, and keep `hostHeader` as a separate guard.

### `backend/internal/server/router.go` (route, request-response)

**Analog:** `backend/internal/server/router.go`

**Route registration pattern** (lines 12-34):
```go
func NewRouter(svc *service.EventService, repo repository.EventRepository, ready func() bool) http.Handler {
	mux := http.NewServeMux()

	mux.Handle("GET /healthz", handler.Healthz())
	mux.Handle("GET /readyz", handler.Readyz(ready))
	mux.Handle("POST /api/hook", handler.Hook(svc))
	mux.Handle("GET /api/events", handler.Events(svc))
	mux.Handle("GET /api/events/stream", handler.EventsStream(svc))
	mux.Handle("GET /api/export/events", secFetchSite(handler.ExportEvents(repo)))
	mux.Handle("GET /api/export/snapshot", secFetchSite(handler.ExportSnapshot(repo)))
	mux.Handle("GET /", ui.Handler())

	return panicRecovery(hostHeader(cors(logging(mux))))
}
```

If CORS and ignore matcher need configuration, update `NewRouter` signature with a narrow options struct rather than threading unrelated parameters.

### `backend/tests/internal/server/router_test.go` (test, request-response)

**Analog:** `backend/tests/internal/server/router_test.go`

**Noop repository pattern** (lines 16-64):
```go
type noopRepo struct{}

func (noopRepo) Add(domain.NormalizedEvent) error { return nil }
func (noopRepo) List(int) ([]domain.NormalizedEvent, error) { return nil, nil }
func (noopRepo) ListBySession(string, int) ([]domain.NormalizedEvent, error) { return nil, nil }

func newTestRouter() http.Handler {
	repo := noopRepo{}
	return server.NewRouter(service.New(repo), repo, repo.Ready)
}
```

**Local request helper and CORS preflight test pattern** (lines 67-84):
```go
func localRequest(method, target string) *http.Request {
	req := httptest.NewRequest(method, target, nil)
	req.Host = "127.0.0.1:8765"
	return req
}

func TestNewRouterOptionsReturnsCORSHeaders(t *testing.T) {
	req := localRequest(http.MethodOptions, "/api/hook")
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
}
```

Update this test to assert allowed local origins are echoed, `Vary: Origin` is present, and disallowed origins do not receive wildcard access.

### `scripts/hooker` (utility, batch + request-response)

**Analog:** `scripts/hooker`

**Shell structure pattern** (lines 1-7):
```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
```

**Doctor status helper pattern** (lines 120-154):
```bash
doctor() {
  local doctor_errors=0
  local PASS='[ok]  '
  local FAIL='[FAIL]'
  local WARN='[warn]'

  check_optional() {
    local label="$1" result="$2" hint="$3"
    if [ "$result" = "pass" ]; then
      printf '%s %s\n' "$PASS" "$label"
    else
      printf '%s %s\n      note: %s\n' "$WARN" "$label" "$hint"
    fi
  }
```

**Existing ADDR privacy warning pattern** (lines 220-225):
```bash
addr_host="$(printf '%s' "$addr" | cut -d: -f1)"
if [ "$addr_host" = "127.0.0.1" ] || [ "$addr_host" = "localhost" ] || [ "$addr_host" = "::1" ]; then
  check_optional "ADDR is loopback ($addr)" "pass" ""
else
  check_optional "ADDR is loopback ($addr)" "warn" "Non-loopback bind exposes hooker on the network. Hooker stores prompts, file paths, and diffs. Keep ADDR on loopback for personal use."
fi
```

Extend the warning categories to match Phase 3: prompts, diffs, file paths, tool outputs, raw payloads, and exports. Add checks for remote opt-in semantics without shelling into backend internals.

### `docs/privacy.md` (docs, file-I/O)

**Analog:** `docs/install.md`

**Configuration table pattern** (lines 60-68):
```markdown
## Configuration

Backend environment variables:

| Variable  | Default             | Purpose                |
| --------- | ------------------- | ---------------------- |
| `ADDR`    | `127.0.0.1:8765`    | Backend listen address |
| `DB_PATH` | `backend/hooker.db` | SQLite database path   |
```

**Privacy warning pattern** (lines 208-223):
```markdown
## Privacy

Hooker captures and stores the following data locally:

- **Prompts** - the full text of prompts sent to coding agents
- **Tool outputs** - complete output from tool calls (file reads, shell commands, search results)
- **File paths** - absolute paths to every file read, written, or modified
- **Diffs** - code changes made during agent sessions
- **Transcript references** - paths to local agent transcript files

All data is stored only on your machine in the SQLite database. Nothing is sent to any
external service by hooker itself.
```

Make `docs/privacy.md` the detailed home for capture categories, ignore rules, default ignore path, no raw-text scanning, and export implications.

### `docs/security.md` (docs, file-I/O)

**Analog:** `docs/install.md`

**Local bind warning pattern** (lines 77-79):
```markdown
Keep `ADDR` on loopback unless you understand the privacy and security impact.
Hooker stores local development context, including prompts, file paths, tool
outputs, diffs, and transcript references.
```

**Endpoint locality pattern** (lines 221-223):
```markdown
The hook endpoint (`POST /api/hook`) accepts requests only from localhost by default.
Setting `ADDR` to a non-loopback address exposes this data to your local network.
Use `./scripts/hooker doctor` to verify your ADDR setting.
```

Use this style for the threat model: local-first, single-user, loopback default, no authentication for loopback, DNS rebinding/Host guard, CORS allowlist, and unsupported public internet exposure.

### `CONTRIBUTING.md` (docs, file-I/O)

**Analog:** `CONTRIBUTING.md`

**Contributor setup pattern** (lines 5-18):
````markdown
## Development Setup

### Prerequisites

- Go `1.25.0+`
- Node.js `18+`
- `pnpm`

### 1) Start Backend

```bash
cd backend
go run ./cmd/server/main.go
```
````

**Quality checks pattern** (lines 39-58):
````markdown
## Quality Checks

Run these before opening a PR.

### Backend

```bash
cd backend
go test ./...
go vet ./...
```
````

**PR/doc update pattern** (lines 60-66):
```markdown
## Pull Request Guidelines

- Keep PRs focused on one topic.
- Include a clear description of what changed and why.
- Link related issues/tasks.
- For UI changes, include screenshots or short recordings.
- Update docs when behavior or commands change.
```

Expand in the same practical style with project structure, layer boundaries, adapter fixture/test rule, DB-column guidance, and frontend-backend contract checklist.

## Shared Patterns

### Persistence and SSE Boundary

**Source:** `backend/internal/service/event_service.go` lines 26-58  
**Apply to:** `backend/internal/handler/hook.go`, privacy ignore tests

```go
func (s *EventService) AddEvent(e domain.NormalizedEvent) error {
	if e.Time == "" {
		e.Time = time.Now().Format(time.RFC3339)
	}
	if err := s.repo.Add(e); err != nil {
		return err
	}
	if e.Session != "" {
		// session upsert omitted
	}
	s.broadcast(e)
	return nil
}
```

Because `AddEvent` persists and broadcasts, ignore filtering must happen before this call.

### Safe Request Guards

**Source:** `backend/internal/server/middleware.go` lines 13-35, 62-78  
**Apply to:** CORS allowlist, router options, security docs

```go
func secFetchSite(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if v := r.Header.Get("Sec-Fetch-Site"); v == "cross-site" {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
```

Keep individual guards small and composable, then compose them in `NewRouter`.

### HTTP Error Mapping

**Source:** `backend/internal/handler/export.go` lines 31-43  
**Apply to:** new startup/config validation helpers and handler changes

```go
tmp, err := os.CreateTemp("", "hooker-snapshot-*.db")
if err != nil {
	http.Error(w, "create temp file", http.StatusInternalServerError)
	return
}

if err := repo.ExportSnapshot(r.Context(), tmpPath); err != nil {
	http.Error(w, "snapshot failed", http.StatusInternalServerError)
	slog.Error("export snapshot", "err", err)
	return
}
```

### Contract Synchronization

**Source:** `backend/internal/domain/event.go` lines 3-55 and `frontend/src/types/events.ts` lines 8-54  
**Apply to:** `CONTRIBUTING.md`, any frontend-backend contract change

```go
// NormalizedEvent is the canonical representation of a hook event from any agent.
// JSON tags match the original FileEvent wire format — frontend requires no changes.
type NormalizedEvent struct {
	Time           string `json:"time"`
	Action         string `json:"action,omitempty"`
	Path           string `json:"path,omitempty"`
	CWD            string `json:"cwd,omitempty"`
	NormalizationStatus string `json:"normalization_status,omitempty"`
}
```

```typescript
export interface EventRecord {
  time: string
  action: string
  path: string
  cwd?: string
  normalization_status?: 'ok' | 'degraded'
}
```

Document that JSON tags and TypeScript fields move together, with backend and frontend tests proving the contract.

### Agent Adapter Test Shape

**Source:** `backend/tests/internal/agents/codex/normalize_test.go` lines 9-39, 111-129  
**Apply to:** adapter contributor rules

```go
func TestNormalizeApplyPatchUsesPatchRendering(t *testing.T) {
	raw := []byte(`{
		"session_id":"s2",
		"transcript_path":"/tmp/codex-session.jsonl",
		"cwd":"/tmp",
		"hook_event_name":"PostToolUse",
		"tool_name":"apply_patch"
	}`)

	got, err := codex.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.Agent != "codex" {
		t.Fatalf("Agent = %q, want codex", got.Agent)
	}
}
```

Use this as the contributor rule: each adapter payload shape needs a fixture payload and normalization assertion.

## No Analog Found

Files with no close match in the codebase. Planner should use `03-RESEARCH.md` recommendations and keep the docs lightweight.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `docs/adr/0001-sqlite-local-storage.md` | docs | file-I/O | No existing `docs/adr/` directory or ADR template exists. |
| `docs/adr/0002-hook-normalization-strategy.md` | docs | file-I/O | No existing ADR format; use standard lightweight ADR headings. |
| `docs/adr/0003-local-first-positioning.md` | docs | file-I/O | No existing ADR format; use standard lightweight ADR headings. |

Suggested ADR structure:

```markdown
# ADR 0001: Title

**Status:** Accepted
**Date:** 2026-05-27

## Context

## Decision

## Consequences
```

## Metadata

**Analog search scope:** `backend/internal`, `backend/tests/internal`, `scripts`, `docs`, `CONTRIBUTING.md`, `frontend/src/types`  
**Files scanned:** 166 indexed files plus docs/scripts discovered from filesystem  
**Pattern extraction date:** 2026-05-27
