---
phase: 02-reliable-daily-use
reviewed: 2026-05-27T02:50:00Z
depth: standard
files_reviewed: 27
files_reviewed_list:
  - .github/workflows/ci.yml
  - backend/cmd/server/main.go
  - backend/internal/agents/claudecode/claudecode.go
  - backend/internal/agents/codex/codex.go
  - backend/internal/agents/geminicli/geminicli.go
  - backend/internal/domain/event.go
  - backend/internal/handler/export.go
  - backend/internal/handler/hook.go
  - backend/internal/repository/repository.go
  - backend/internal/repository/sqlite/migrations/008_normalization_fields.sql
  - backend/internal/repository/sqlite/sqlite.go
  - backend/internal/server/middleware.go
  - backend/internal/server/router.go
  - backend/internal/service/event_service.go
  - backend/tests/internal/agents/claudecode/normalize_test.go
  - backend/tests/internal/agents/codex/normalize_test.go
  - backend/tests/internal/handler/export_test.go
  - backend/tests/internal/handler/hook_test.go
  - backend/tests/internal/repository/sqlite/dedup_test.go
  - backend/tests/internal/repository/sqlite/migration_test.go
  - backend/tests/internal/repository/sqlite/sqlite_test.go
  - backend/tests/internal/service/event_service_test.go
  - frontend/src/features/events/EventBadges.tsx
  - frontend/src/features/events/EventRow.tsx
  - frontend/src/types/events.ts
  - frontend/vite.config.ts
  - playwright.config.ts
  - tests-e2e/smoke.spec.ts
findings:
  critical: 4
  warning: 8
  info: 4
  total: 16
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-05-27T02:50:00Z
**Depth:** standard
**Files Reviewed:** 27
**Status:** issues_found

## Summary

This phase adds: normalization metadata fields (migration 008), degraded ingest mode, export endpoints (NDJSON + snapshot), security middleware (host header + Sec-Fetch-Site), graceful shutdown, E2E smoke tests, and Gemini CLI agent support. The overall architecture is sound and the new features are wired correctly. However, several correctness defects were found that will cause silent data loss or incorrect behavior in production.

The most serious issues are: (1) a `log.Printf` debug statement left in the Codex normalizer that logs every hook call including commands that may contain secrets; (2) the `ExportSnapshot` handler using `http.ServeFile` after headers are already set, which causes double Content-Type headers and corrupts the download in some HTTP clients; (3) the WAL checkpoint goroutine leaks because `context.Background()` is passed instead of the server lifecycle context; and (4) the Smoke test fixtures are structurally wrong and will produce degraded events rather than testing the real normalization path.

---

## Critical Issues

### CR-01: Debug `log.Printf` Left in Codex Normalizer — Logs Every Hook Call

**File:** `backend/internal/agents/codex/codex.go:262`
**Issue:** A `log.Printf` call is embedded directly in the `Normalize()` hot path. This fires on every single hook POST. It logs the full tool name, command length, and a 100-character command preview. Commands can contain passwords, API keys, file contents, and diff data. This is both a security concern (sensitive data in logs) and a reliability concern (high-volume structured event stream producing unstructured log noise at rate).
**Fix:**
```go
// Remove this line entirely from Normalize():
// log.Printf("[codex] tool=%s cmd_len=%d cmd_preview=%q", p.ToolName, len(cmd), firstN(cmd, 100))
```
The `log` package import should also be removed from codex.go if this is the only usage — the file should use `slog` like the rest of the codebase, or no logging at all inside normalizers.

---

### CR-02: `ExportSnapshot` Uses `http.ServeFile` After Headers Are Already Set

**File:** `backend/internal/handler/export.go:55`
**Issue:** `http.ServeFile(w, r, tmpPath)` is called after `w.Header().Set(...)` has already been called to set `Content-Disposition`, `Content-Length`, and `Content-Type`. The `http.ServeFile` function unconditionally sets its own `Content-Type` header (detected by file extension — `.db` → `application/octet-stream` or similar), and also handles `If-Modified-Since`, range requests, and 304 responses internally. This creates conflicting headers. In particular, `http.ServeFile` will call `w.Header().Set("Content-Type", ...)` again and then call `w.WriteHeader(200)`, resulting in a response where Content-Type may be set twice (the second call overwrites the first in Go's `http.ResponseWriter`, but only if the header hasn't been flushed yet). More critically, `http.ServeFile` adds `Last-Modified` and `Accept-Ranges` headers inappropriate for a generated file, and will respond to range requests or conditional GETs with partial content (206) or 304 even though the temp file is newly created and ephemeral. The correct approach is to open the file and copy it manually.
**Fix:**
```go
f, err := os.Open(tmpPath)
if err != nil {
    http.Error(w, "open snapshot", http.StatusInternalServerError)
    return
}
defer f.Close()

w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="hooker-snapshot-%s.db"`, ts))
w.Header().Set("Content-Length", fmt.Sprintf("%d", fi.Size()))
w.Header().Set("Content-Type", "application/octet-stream")
if _, err := io.Copy(w, f); err != nil {
    slog.Error("export snapshot copy", "err", err)
}
```

---

### CR-03: WAL Checkpoint Goroutine Leaks — `context.Background()` Passed Instead of Server Lifecycle Context

**File:** `backend/internal/repository/sqlite/sqlite.go:80`
**Issue:** `startWALCheckpoint(context.Background(), db, 5*time.Minute)` is called with a background context that is never cancelled. The goroutine inside `startWALCheckpoint` only stops when `<-ctx.Done()` fires, which never happens with `context.Background()`. In production this is a permanent goroutine leak. On graceful shutdown (`SIGTERM`), the WAL checkpoint goroutine continues to run against the already-closed database, which will log `slog.Warn("wal checkpoint", ...)` errors indefinitely (or until the process is killed). In tests that create many in-memory DBs via `sqlite.New(":memory:")`, each call leaks a goroutine with a 5-minute ticker — at scale this accumulates.

The server wires shutdown correctly (`signal.NotifyContext`) but `sqlite.New` has no way to receive that context. The fix requires either passing the context into `New()`, or returning a `Close()` method that cancels a stored context.
**Fix:**
```go
// In sqlite.go — add cancel to DB struct:
type DB struct {
    db     *sql.DB
    ready  atomic.Bool
    cancel context.CancelFunc
}

func New(path string) (*DB, error) {
    // ... existing open/migrate code ...
    ctx, cancel := context.WithCancel(context.Background())
    d.cancel = cancel
    startWALCheckpoint(ctx, db, 5*time.Minute)
    return d, nil
}

func (d *DB) Close() error {
    d.cancel()
    return d.db.Close()
}
```
Then call `repo.Close()` in the server shutdown path.

---

### CR-04: Smoke Test Fixtures Use Wrong Payload Shape — Will Always Produce Degraded Events

**File:** `tests-e2e/smoke.spec.ts:4-18`
**Issue:** The `claudeCodeFixture` embeds the tool as a nested object `tool: { name: 'Bash', input: { command: 'echo hello' } }` but the real Claude Code hook payload schema (as defined in `domain.RawPayload` and used throughout the normalizers) expects `tool_name` at the top level and `tool_input` as a separate object. The fixture will be parsed by `json.Unmarshal` into `domain.RawPayload` successfully (extra fields are ignored), but `meta.TranscriptPath` contains `/.claude/` so it will route to `claudecode.Normalize()`, which will produce a `NormalizedEvent` with `Tool == ""`, `Session == "smoke-cc-01"`, `HookEventName == "PreToolUse"` (from the `hook_event_name` field) — so it will _not_ be degraded, but the tool info is silently missing.

The `codexFixture` is even more wrong: `hook_event_name: 'tool_call'` is not a recognized hook event name in `HookEventAction`, and the `command` and `tool` fields at the top level are not where codex normalization reads them (it reads from `tool_input.command` and `tool_name`). This fixture will produce a degraded event every run, meaning the smoke test is testing that the server accepts any JSON — not that normalization works.

This makes the smoke tests pass vacuously. They do not exercise the real ingest path.
**Fix:**
```typescript
const claudeCodeFixture = {
  session_id: 'smoke-cc-01',
  transcript_path: '/home/user/.claude/projects/hooker-smoke/transcript.jsonl',
  hook_event_name: 'PreToolUse',
  turn_id: 'turn-smoke-01',
  tool_use_id: 'tuse-smoke-01',
  tool_name: 'Bash',
  cwd: '/tmp',
  tool_input: { command: 'echo hello' },
}

const codexFixture = {
  session_id: 'smoke-codex-01',
  transcript_path: '/tmp/codex-smoke.jsonl',
  hook_event_name: 'PreToolUse',
  turn_id: 'turn-codex-01',
  tool_use_id: 'tuse-codex-01',
  tool_name: 'shell',
  cwd: '/tmp',
  tool_input: { command: 'echo world' },
}
```

---

## Warnings

### WR-01: `cors` Middleware Uses Wildcard Origin on a Local-First Service — Contradicts Host Header Guard

**File:** `backend/internal/server/middleware.go:48`
**Issue:** The `cors` middleware sets `Access-Control-Allow-Origin: *`. This is contradicted by the `hostHeader` middleware which enforces that only `localhost`/`127.0.0.1`/`[::1]` requests are accepted. The CORS wildcard means any browser origin can make credentialed cross-origin requests if `Access-Control-Allow-Credentials: true` were ever added. More practically, the wildcard permits reading responses from any cross-origin script that manages to bypass the `Sec-Fetch-Site` guard (e.g. via a non-browser fetch polyfill or service worker). For a local-first service handling potentially sensitive data (prompts, diffs, file paths), the CORS origin should be restricted to known local origins.
**Fix:**
```go
func cors(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        origin := r.Header.Get("Origin")
        // Only reflect localhost origins; deny all others.
        if origin == "http://localhost:5173" || origin == "http://127.0.0.1:5173" ||
            strings.HasPrefix(origin, "http://localhost:") ||
            strings.HasPrefix(origin, "http://127.0.0.1:") {
            w.Header().Set("Access-Control-Allow-Origin", origin)
        }
        // ... rest unchanged
    })
}
```

---

### WR-02: `secFetchSite` Middleware Only Applied to Export Endpoints — Other Sensitive Endpoints Unprotected

**File:** `backend/internal/server/router.go:30-31`
**Issue:** `secFetchSite` is only applied to `/api/export/events` and `/api/export/snapshot`. The `/api/hook` endpoint (which writes to the database) and all read endpoints (`/api/events`, `/api/sessions/tree`, `/api/dashboard/stats`) are not wrapped. A cross-site request can still POST arbitrary events to `/api/hook` or read session data from `/api/sessions/tree`. The `hostHeader` middleware provides some defense but `Sec-Fetch-Site` was added as defense-in-depth for these risks. If the intent is CSRF protection for all state-changing endpoints, `secFetchSite` should be applied globally or at minimum to `/api/hook`.
**Fix:**
```go
// Apply secFetchSite at the router level for all /api/ routes,
// or at minimum wrap the hook endpoint:
mux.Handle("POST /api/hook", secFetchSite(handler.Hook(svc)))
```

---

### WR-03: `ExportSnapshot` Uses In-OS-Temp Path But Does Not Validate `destPath` in Repository

**File:** `backend/internal/repository/sqlite/sqlite.go:1177`
**Issue:** `ExportSnapshot` passes `destPath` directly to `VACUUM INTO ?`. The comment says "destPath must be a path in the OS temp directory — it is never user-supplied." This is correct today because the handler calls `os.CreateTemp("", ...)`. However, the `EventRepository` interface exposes `ExportSnapshot(ctx context.Context, destPath string) error` — a future implementation or test could pass an arbitrary path. `VACUUM INTO` will overwrite any file the SQLite process can write to, including the live database file. There is no guard in the repository implementation against a caller supplying a dangerous path. At minimum, the function should verify the path is in a temp directory.
**Fix:**
```go
func (d *DB) ExportSnapshot(ctx context.Context, destPath string) error {
    if !strings.HasPrefix(filepath.Clean(destPath), os.TempDir()) {
        return fmt.Errorf("snapshot dest must be in temp dir, got %q", destPath)
    }
    if _, err := d.db.ExecContext(ctx, `VACUUM INTO ?`, destPath); err != nil {
        return fmt.Errorf("vacuum into: %w", err)
    }
    return nil
}
```

---

### WR-04: `GetDashboardStats` Calls `ListSessions` and `backfillSessionUsage` Then Immediately Calls Them Again via `enrichDashboardStats`

**File:** `backend/internal/service/event_service.go:99-123`
**Issue:** `GetDashboardStats` first calls `s.repo.ListSessions()` + `s.backfillSessionUsage(sessions)` (lines 100-104), then calls `s.repo.GetDashboardStats(since, until)` (line 107), then calls `enrichDashboardStats(stats, sessions, since, until)` (line 121) which calls `computeUsageBreakdown(session.Agent, session.TranscriptPath)` again for every session (line 191). This means the transcript file is read twice for every session on every dashboard request: once in `backfillSessionUsage` and once in `enrichDashboardStats`. For a user with hundreds of sessions, this doubles the transcript file I/O per dashboard load and can cause measurable latency spikes.

Additionally, `backfillSessionUsage` issues `UpsertSession` for each zero-usage session, but `enrichDashboardStats` ignores the already-backfilled `sessions[i].Usage` and re-reads the transcript anyway (line 191-193 always calls `computeUsageBreakdown` regardless). The backfill write is wasted for any session that will be re-read.
**Fix:** In `enrichDashboardStats`, use the already-backfilled `session.Usage` directly when `breakdown.Total` is zero rather than calling `computeUsageBreakdown` a second time:
```go
breakdown := computeUsageBreakdown(session.Agent, session.TranscriptPath)
if !hasUsage(breakdown.Total) {
    breakdown.Total = session.Usage  // already backfilled above
}
```
This is already partially done at line 192-194, but `computeUsageBreakdown` is still called unconditionally, doing the file read before the fallback check.

---

### WR-05: `sessionOutsideRange` Has Inconsistent Error Handling — Falls Back to String Comparison

**File:** `backend/internal/service/event_service.go:250-283`
**Issue:** `sessionOutsideRange` parses `session.StartedAt` with `time.Parse(time.RFC3339, ...)`. When that parse fails (line 252), it falls back to raw string comparison (`session.StartedAt < since`). String comparison of ISO-8601 timestamps works only if both sides are in the same timezone and format. A stored `StartedAt` in the format `2026-05-10T03:01:00-07:00` would compare incorrectly against a `since` value of `2026-05-10T10:00:00Z` because lexicographic ordering of timezone-offset strings is not chronological. The `normalizeToUTC` function exists in the repository layer and is called before storage — but `sessionOutsideRange` operates on the already-stored value and does not normalize before fallback comparison.
**Fix:** Remove the string-comparison fallback. If `session.StartedAt` cannot be parsed, the session should be included (not excluded) to avoid silent data loss:
```go
func sessionOutsideRange(session domain.Session, since, until string) bool {
    if session.StartedAt == "" {
        return false
    }
    startedAt, err := time.Parse(time.RFC3339, session.StartedAt)
    if err != nil {
        return false // unparseable → include rather than silently exclude
    }
    // ... time.Time comparisons only
}
```

---

### WR-06: `dedupKey` Ignores `Agent` Field — Different Agents Can Collide on Same Session+Turn+Tool

**File:** `backend/internal/repository/sqlite/sqlite.go:782-787`
**Issue:** The dedup key is computed from `Session + TurnID + ToolUseID + HookEventName + Time`. It does not include the `Agent` field. If two different agent integrations (e.g. claudecode and codex) ever send events with the same session ID, turn ID, tool use ID, and hook event name (possible in multi-agent setups or during testing), they will silently collide and only the first one will be stored. The session ID namespace is not agent-scoped so this is a real risk in degraded mode where `session` is set to `degraded-<hash>` — two different degraded payloads arriving at the exact same millisecond could collide if `Time` is set to `time.Now()` at coarse RFC3339 granularity.

More practically: RFC3339 only has one-second granularity. Two events with the same session/turn/tool arriving within the same second produce the same dedup key and one is silently dropped. The `ToolUseID` field provides enough uniqueness for normal events but not for session-scoped events without a ToolUseID (e.g. SessionStart).
**Fix:** Include `Agent` in the hash:
```go
func dedupKey(e domain.NormalizedEvent) string {
    h := sha256.Sum256([]byte(
        e.Agent + "|" + e.Session + "|" + e.TurnID + "|" + e.ToolUseID + "|" + e.HookEventName + "|" + e.Time,
    ))
    return fmt.Sprintf("%x", h)
}
```

---

### WR-07: `vite.config.ts` Exposes Two Hardcoded `ngrok` Hostnames

**File:** `frontend/vite.config.ts:31-34`
**Issue:** `server.allowedHosts` contains two hardcoded ngrok subdomain hostnames:
```
'nonendemic-intermolar-exie.ngrok-free.dev'
'gregarious-karlie-unmicrobial.ngrok-free.dev'
```
These appear to be personal tunnel URLs committed during development. Committing personal tunnel addresses into the project config is a minor security concern (it allows traffic from those URLs to reach the dev server) and a quality issue (other developers won't have these tunnels, and any new developer will be confused by them). These should be removed or moved to a local-only `.env` file / `vite.config.local.ts`.
**Fix:** Remove the `allowedHosts` array, or move it to an untracked local override:
```typescript
server: {
  // Remove allowedHosts — ngrok tunnels are personal dev tooling,
  // not part of the project config.
  proxy: { ... }
}
```

---

### WR-08: `mockRepo.List` in Service Test Has Off-By-One on `limit=0`

**File:** `backend/tests/internal/service/event_service_test.go:39-45`
**Issue:** The mock `List` implementation returns `m.events[len(m.events)-limit:]` when `len(m.events) > limit`. When `limit=0`, this evaluates to `m.events[len(m.events):]` which returns an empty slice — it silently ignores all events when called with limit=0. The real SQLite `List` implementation treats `limit=0` as "no limit" (see `sqlite.go:167`, `listWithWhere` skips the `LIMIT` clause when `limit == 0`). This means tests using `svc.ListEvents(0)` via the mock would see zero events instead of all events, potentially masking bugs. No current test calls `ListEvents(0)` via the mock, but the contract mismatch is a latent defect.
**Fix:**
```go
func (m *mockRepo) List(limit int) ([]domain.NormalizedEvent, error) {
    m.mu.Lock()
    defer m.mu.Unlock()
    if limit <= 0 || len(m.events) <= limit {
        return append([]domain.NormalizedEvent{}, m.events...), nil
    }
    return append([]domain.NormalizedEvent{}, m.events[len(m.events)-limit:]...), nil
}
```

---

## Info

### IN-01: `codex.go` Defines Local `firstNonEmpty` That Duplicates `fileutil.FirstNonEmpty`

**File:** `backend/internal/agents/codex/codex.go:453-459`
**Issue:** The `codex` package defines its own `firstNonEmpty(vals ...string) string` function. The `fileutil` package already exports an identical `FirstNonEmpty` function used by `claudecode` and `geminicli`. This is a dead copy — any future change to the canonical function must be made in two places.
**Fix:** Replace calls to `firstNonEmpty(...)` in `codex.go` with `fileutil.FirstNonEmpty(...)` and remove the local duplicate.

---

### IN-02: `TestAddReturnsBeforeHookTimeoutWhenDatabaseIsWriteLocked` Has a Dead Setup Step

**File:** `backend/tests/internal/repository/sqlite/sqlite_test.go:104-113`
**Issue:** The test opens a "poisoned" connection, sets `PRAGMA busy_timeout = 5000` on it, then immediately closes it. Setting a per-connection pragma and then closing the connection has no effect on subsequent connections — the busy timeout for the test is controlled by the connection string parameter `_pragma=busy_timeout(750)` set in `sqlite.New`. The poison step at lines 104-113 is dead code. This doesn't affect correctness (the test still validates the right behavior via the `sqliteWriteTimeout` context), but it adds confusion about the test's mechanism.
**Fix:** Remove lines 104-113 (the poisoned connection setup) and add a comment explaining that the write timeout is enforced by `sqliteWriteTimeout` in `Add()`, not by SQLite's own busy timeout.

---

### IN-03: `geminicli.Normalize` Does Not Set `StartLine` — Missing vs Codex

**File:** `backend/internal/agents/geminicli/geminicli.go:42-83`
**Issue:** The `geminicli.Normalize` function does not set `StartLine` on the returned `NormalizedEvent`. Both `claudecode` and `codex` normalizers handle `StartLine` (codex computes it from patch hunks; claudecode relies on `enrichContext` in the handler). The `enrichContext` function in `hook.go` will fill in `StartLine` for non-BASH events when `OldString` or `NewString` is populated, so in practice this is only a gap for Gemini CLI EDIT events that arrive without OldString. The field is silently zero rather than computed. This is low severity but represents an intentional omission that should be documented or addressed.
**Fix:** No immediate code change required if Gemini CLI's hook payload doesn't populate file paths for edits, but add a comment in `geminicli.Normalize` explaining why `StartLine` is not set.

---

### IN-04: CI `govulncheck` Step Uses `continue-on-error: true` — Vulnerability Scan Failures Are Silent

**File:** `.github/workflows/ci.yml:52`
**Issue:** The `govulncheck` step sets `continue-on-error: true`. This means a known CVE in a dependency will not block the build — it will silently pass CI. For a security-sensitive project that captures prompts and file contents, this is an inappropriate default. At minimum, the step should notify (e.g. create an annotation) rather than silently succeed.
**Fix:** Remove `continue-on-error: true` once the vulnerability scan is verified to produce no false positives, or replace with a GitHub Actions `problem-matcher` that creates a warning annotation without blocking the build:
```yaml
- name: govulncheck
  working-directory: backend
  run: |
    go install golang.org/x/vuln/cmd/govulncheck@latest
    govulncheck ./...
  # Remove: continue-on-error: true
```

---

_Reviewed: 2026-05-27T02:50:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
