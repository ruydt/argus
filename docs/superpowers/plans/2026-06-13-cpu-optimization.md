# CPU Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate idle CPU burn and per-event CPU spikes across the Go backend and React frontend, per the approved spec `docs/superpowers/specs/2026-06-13-cpu-optimization-design.md`.

**Architecture:** Tiered fix-in-place — no new services, no new dependencies. Backend: single-read file enrichment with a 2 MB cap, marshal-once SSE broadcast, write-time usage computation with a 30s per-session throttle, removal of transcript scans from read paths, a 5s TTL cache for dashboard stats, index-friendly SQL predicates, and an O(n log n) project merge. Frontend: scoped header clock, visibility-aware polling, cached timestamp/regex formatting, append-only filter short-circuit, split session-grouping memos, and identical-payload skip in the dashboard stats hook.

**Tech Stack:** Go 1.25 (stdlib net/http, modernc.org/sqlite), React 19 + TypeScript, Vitest, Go testing/benchmarks.

**Verification gates (run per task, not just at the end):**
- Backend tasks: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
- Frontend tasks: `cd frontend && npx tsc --noEmit && npx vitest run`, then `npx prettier --write` on changed files.

---

## File Structure Overview

| File | Change |
| --- | --- |
| `backend/internal/fileutil/fileutil.go` | Add `MaxEnrichFileBytes`, `ReadFileLines`, `FindStartLineInLines`, `ComputeContextFromLines`; existing funcs become wrappers |
| `backend/internal/fileutil/fileutil_test.go` | New tests + benchmark |
| `backend/internal/handler/hook.go` | `enrichContext` reads file once |
| `backend/internal/handler/events.go` | SSE stream writes pre-marshaled bytes |
| `backend/internal/service/event_service.go` | `BroadcastEvent` type, marshal-once broadcast, usage throttle, remove read-path backfill, startup backfill, stats TTL cache |
| `backend/internal/repository/sqlite/sqlite.go` | `UpsertSession` zero-usage guard, direct string time predicates, O(n log n) `mergeChildProjects` |
| `backend/internal/repository/sqlite/migrations/` | (Conditional) composite index migration |
| `backend/cmd/server/main.go` | Spawn one-time usage backfill goroutine |
| `frontend/src/app/HeaderClock.tsx` | New — isolated 1s clock |
| `frontend/src/app/Layout.tsx` | Drop `now` state/interval, render `<HeaderClock />` |
| `frontend/src/hooks/usePollingInterval.ts` | New — visibility-aware interval hook |
| `frontend/src/hooks/useSessions.ts` | Use `usePollingInterval` |
| `frontend/src/features/events/hooks/useEventFilters.ts` | Use `usePollingInterval` for projects poll; append-only filter short-circuit |
| `frontend/src/lib/format.ts` | `formatEventTime` cache, cached highlight regex |
| `frontend/src/features/events/EventRow.tsx` | Use `formatEventTime` |
| `frontend/src/features/events/AgentSession.tsx` | Memoized pagination math + last-time label |
| `frontend/src/features/events/SessionList.tsx` | Split memo, numeric timestamp sort |
| `frontend/src/features/dashboard/hooks/useDashboardStats.ts` | Skip state update when payload identical |
| `frontend/src/features/dashboard/TokenTimelineChart.tsx`, `ActivityPanel.tsx` | Wrap in `memo()` |

---

### Task 1: Baseline benchmarks (backend)

Capture before-numbers for the two hot paths whose public API stays stable across this plan. Record results in this file's checkboxes so the after-run in Task 11 has a comparison.

**Files:**
- Create: `backend/internal/fileutil/fileutil_bench_test.go`
- Create: `backend/internal/service/event_service_bench_test.go`

- [x] **Step 1: Write the fileutil benchmark**

```go
package fileutil_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"argus/internal/fileutil"
)

// writeBenchFile writes a synthetic n-line source file and returns its path.
func writeBenchFile(b *testing.B, n int) string {
	b.Helper()
	var sb strings.Builder
	for i := 0; i < n; i++ {
		fmt.Fprintf(&sb, "func line%dOfFile() { return %d } // padding padding padding\n", i, i)
	}
	path := filepath.Join(b.TempDir(), "bench.go")
	if err := os.WriteFile(path, []byte(sb.String()), 0o644); err != nil {
		b.Fatal(err)
	}
	return path
}

// BenchmarkEnrichLookup mirrors what handler.enrichContext does per edit hook:
// find the snippet's start line, then compute surrounding context.
func BenchmarkEnrichLookup(b *testing.B) {
	path := writeBenchFile(b, 5000)
	// Snippet near the end of the file = worst-case linear search.
	snippet := "func line4900OfFile() { return 4900 } // padding padding padding"
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		start := fileutil.FindStartLine(path, snippet)
		if start == 0 {
			b.Fatal("snippet not found")
		}
		fileutil.ComputeContext(path, start, 1, 3)
	}
}
```

- [x] **Step 2: Write the dashboard stats benchmark**

```go
package service_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"argus/internal/domain"
	"argus/internal/repository/sqlite"
	"argus/internal/service"
)

// writeBenchTranscript writes a Claude-Code-shaped JSONL transcript with n
// assistant entries. The "/.claude/" path segment makes agent detection match.
func writeBenchTranscript(b *testing.B, dir string, n int) string {
	b.Helper()
	var sb strings.Builder
	for i := 0; i < n; i++ {
		fmt.Fprintf(&sb,
			`{"type":"assistant","message":{"model":"claude-sonnet-4-6","usage":{"input_tokens":100,"output_tokens":50,"cache_creation_input_tokens":10,"cache_read_input_tokens":500}}}`+"\n")
	}
	path := filepath.Join(dir, "transcript.jsonl")
	if err := os.WriteFile(path, []byte(sb.String()), 0o644); err != nil {
		b.Fatal(err)
	}
	return path
}

func BenchmarkGetDashboardStats(b *testing.B) {
	repo, err := sqlite.New(":memory:")
	if err != nil {
		b.Fatal(err)
	}
	defer func() { _ = repo.Close() }()
	svc := service.New(repo)

	dir := filepath.Join(b.TempDir(), ".claude")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		b.Fatal(err)
	}
	transcript := writeBenchTranscript(b, dir, 500)

	for i := 0; i < 100; i++ {
		e := domain.NormalizedEvent{
			Time:           fmt.Sprintf("2026-06-12T%02d:%02d:00Z", i/60, i%60),
			Agent:          "claudecode",
			Session:        fmt.Sprintf("bench-session-%03d", i),
			HookEventName:  "PostToolUse",
			Tool:           "Edit",
			Action:         "EDIT",
			CWD:            "/tmp/bench",
			TranscriptPath: transcript,
		}
		if err := svc.AddEvent(e); err != nil {
			b.Fatal(err)
		}
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := svc.GetDashboardStats("", ""); err != nil {
			b.Fatal(err)
		}
	}
}
```

Note: `domain.NormalizedEvent` field names above must match `backend/internal/domain/event.go` — verify with a quick read and adjust field names if they differ (e.g., `CWD` vs `Cwd`).

- [x] **Step 3: Run benchmarks, record baseline**

Run: `cd backend && go test -bench BenchmarkEnrichLookup -benchtime 2s -run '^$' ./internal/fileutil/ && go test -bench BenchmarkGetDashboardStats -benchtime 2s -run '^$' ./internal/service/`
Expected: both benchmarks run and report ns/op. **Paste the two baseline numbers here:**

```
BASELINE BenchmarkEnrichLookup:        212832 ns/op
BASELINE BenchmarkGetDashboardStats:   75647572 ns/op
```

- [x] **Step 4: Verify gates and commit**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: all pass.

```bash
git add backend/internal/fileutil/fileutil_bench_test.go backend/internal/service/event_service_bench_test.go docs/superpowers/plans/2026-06-13-cpu-optimization.md
git commit -m "test(backend): baseline CPU benchmarks for enrichment and dashboard stats"
```

---

### Task 2: Single-read file enrichment in fileutil

**Files:**
- Modify: `backend/internal/fileutil/fileutil.go:170-224`
- Test: `backend/internal/fileutil/fileutil_test.go` (create if absent; append if it exists)

- [x] **Step 1: Write the failing tests**

Append to (or create) `backend/internal/fileutil/fileutil_test.go`:

```go
package fileutil_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"argus/internal/fileutil"
)

func writeTempFile(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "f.txt")
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestReadFileLines(t *testing.T) {
	path := writeTempFile(t, "alpha\nbeta\ngamma")
	lines := fileutil.ReadFileLines(path)
	if len(lines) != 3 || lines[0] != "alpha" || lines[2] != "gamma" {
		t.Fatalf("unexpected lines: %#v", lines)
	}
	if fileutil.ReadFileLines("") != nil {
		t.Fatal("empty path should return nil")
	}
	if fileutil.ReadFileLines(filepath.Join(t.TempDir(), "missing")) != nil {
		t.Fatal("missing file should return nil")
	}
}

func TestReadFileLinesSizeCap(t *testing.T) {
	big := strings.Repeat("x", fileutil.MaxEnrichFileBytes+1)
	path := writeTempFile(t, big)
	if fileutil.ReadFileLines(path) != nil {
		t.Fatal("oversized file should be skipped")
	}
}

func TestFindStartLineInLinesMatchesFindStartLine(t *testing.T) {
	content := "package main\n\nfunc a() {\n\treturn\n}\n\nfunc b() {\n\treturn\n}\n"
	path := writeTempFile(t, content)
	lines := fileutil.ReadFileLines(path)
	for _, snippet := range []string{"func b() {\n\treturn\n}", "package main", "missing snippet"} {
		got := fileutil.FindStartLineInLines(lines, snippet)
		want := fileutil.FindStartLine(path, snippet)
		if got != want {
			t.Errorf("snippet %q: FindStartLineInLines=%d FindStartLine=%d", snippet, got, want)
		}
	}
}

func TestComputeContextFromLinesMatchesComputeContext(t *testing.T) {
	content := "l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\n"
	path := writeTempFile(t, content)
	lines := fileutil.ReadFileLines(path)
	gotB, gotA := fileutil.ComputeContextFromLines(lines, 4, 2, 3)
	wantB, wantA := fileutil.ComputeContext(path, 4, 2, 3)
	if len(gotB) != len(wantB) || len(gotA) != len(wantA) {
		t.Fatalf("context mismatch: got %v/%v want %v/%v", gotB, gotA, wantB, wantA)
	}
	for i := range gotB {
		if gotB[i] != wantB[i] {
			t.Errorf("before[%d]: got %v want %v", i, gotB[i], wantB[i])
		}
	}
	for i := range gotA {
		if gotA[i] != wantA[i] {
			t.Errorf("after[%d]: got %v want %v", i, gotA[i], wantA[i])
		}
	}
}
```

- [x] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test -run 'TestReadFileLines|TestFindStartLineInLines|TestComputeContextFromLines' ./internal/fileutil/`
Expected: FAIL — `undefined: fileutil.ReadFileLines`, `undefined: fileutil.MaxEnrichFileBytes`, etc.

- [x] **Step 3: Implement**

In `backend/internal/fileutil/fileutil.go`, replace the existing `FindStartLine` and `ComputeContext` (lines 170-224) with:

```go
// MaxEnrichFileBytes caps context enrichment. Files larger than this are
// skipped entirely so one huge file can't burn CPU on the hook ingest path.
const MaxEnrichFileBytes = 2 << 20 // 2 MiB

// ReadFileLines reads filePath once and returns its lines. Returns nil when
// the path is empty, the file is missing/unreadable, or it exceeds
// MaxEnrichFileBytes.
func ReadFileLines(filePath string) []string {
	if filePath == "" {
		return nil
	}
	info, err := os.Stat(filePath)
	if err != nil {
		return nil
	}
	if info.Size() > MaxEnrichFileBytes {
		slog.Debug("enrichment skipped: file too large", "path", filePath, "size", info.Size())
		return nil
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil
	}
	return strings.Split(string(data), "\n")
}

// FindStartLine returns the 1-based line number where oldStr begins in filePath.
// Comparison ignores leading/trailing whitespace per line.
func FindStartLine(filePath, oldStr string) int {
	return FindStartLineInLines(ReadFileLines(filePath), oldStr)
}

// FindStartLineInLines is FindStartLine over already-read file lines, so a
// caller that needs both the start line and the context only reads once.
func FindStartLineInLines(fileLines []string, oldStr string) int {
	if len(fileLines) == 0 || oldStr == "" {
		return 0
	}
	searchLines := strings.Split(strings.TrimRight(oldStr, "\n"), "\n")
	if len(searchLines) == 0 {
		return 0
	}
	for i := 0; i <= len(fileLines)-len(searchLines); i++ {
		match := true
		for j := 0; j < len(searchLines); j++ {
			f := strings.TrimSpace(fileLines[i+j])
			s := strings.TrimSpace(searchLines[j])
			if f != s {
				// Special case: allow empty lines to match even if they have different whitespace
				if f == "" && s == "" {
					continue
				}
				match = false
				break
			}
		}
		if match {
			return i + 1
		}
	}
	return 0
}

// ComputeContext returns ctxLines lines before/after a changed region.
// changeStart is 1-based. changeLen is the number of lines in the changed block.
func ComputeContext(filePath string, changeStart, changeLen, ctxLines int) (before, after []domain.CtxLine) {
	return ComputeContextFromLines(ReadFileLines(filePath), changeStart, changeLen, ctxLines)
}

// ComputeContextFromLines is ComputeContext over already-read file lines.
func ComputeContextFromLines(lines []string, changeStart, changeLen, ctxLines int) (before, after []domain.CtxLine) {
	n := len(lines)
	if n == 0 {
		return
	}
	start := changeStart - 1
	end := start + changeLen - 1
	for i := max(0, start-ctxLines); i < start && i < n; i++ {
		before = append(before, domain.CtxLine{Num: i + 1, Text: lines[i]})
	}
	for i := end + 1; i <= end+ctxLines && i < n; i++ {
		after = append(after, domain.CtxLine{Num: i + 1, Text: lines[i]})
	}
	return
}
```

Add `"log/slog"` to the import block of `fileutil.go`.

Behavior change (intentional, per spec 1b): `FindStartLine`/`ComputeContext` now skip files over 2 MB — previously they read any size. If an existing fileutil test asserts behavior on a >2 MB fixture (unlikely), flag it rather than changing the cap.

- [x] **Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./internal/fileutil/ ./internal/handler/`
Expected: PASS (handler tests confirm no regression in enrichment behavior).

- [x] **Step 5: Commit**

```bash
git add backend/internal/fileutil/
git commit -m "perf(fileutil): single-read line helpers and 2MB enrichment cap"
```

---

### Task 3: enrichContext reads the file once

**Files:**
- Modify: `backend/internal/handler/hook.go:162-178`

- [x] **Step 1: Replace the two-read block**

In `enrichContext`, replace lines 162-178 (from `startLine := e.StartLine` through the closing brace of `if startLine > 0 {`) with:

```go
	startLine := e.StartLine
	needFind := startLine <= 1
	needCtx := len(e.CtxBefore) == 0 && len(e.CtxAfter) == 0

	if !needFind && !needCtx {
		return e
	}

	// One read serves both the start-line search and the context window.
	lines := fileutil.ReadFileLines(e.Path)
	if lines == nil {
		return e
	}

	if needFind {
		if found := fileutil.FindStartLineInLines(lines, searchStr); found > 0 {
			startLine = found
		}
	}

	if startLine > 0 {
		e.StartLine = startLine
		if needCtx {
			lineCount := len(strings.Split(strings.TrimRight(searchStr, "\n"), "\n"))
			e.CtxBefore, e.CtxAfter = fileutil.ComputeContextFromLines(lines, startLine, lineCount, 3)
		}
	}
```

Note the early return: when the payload already carries a usable `StartLine` (> 1) and context lines, the file is no longer read at all (previously this path also did zero reads — preserve that).

- [x] **Step 2: Run handler tests**

Run: `cd backend && go test ./internal/handler/`
Expected: PASS. Existing enrichment tests assert the same outputs from one read.

- [x] **Step 3: Gates and commit**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: all pass.

Scope extension (approved): `backend/internal/agents/codex/codex.go` hunk loop also had two `FindStartLine(path, …)` calls each re-reading the same file per hunk. One `ReadFileLines(path)` call was hoisted before the hunks loop (path is constant within the patch block — set before the loop and never changed inside it). Both lookups replaced with `FindStartLineInLines(fileLines, …)`. Guard: `fileLines == nil` passes nil through; `FindStartLineInLines(nil, x)` returns 0, matching pre-existing fallback when file is missing.

```bash
git add backend/internal/handler/hook.go backend/internal/agents/codex/codex.go docs/superpowers/plans/2026-06-13-cpu-optimization.md
git commit -m "perf(ingest): enrich hook and codex patch context with a single file read"
```

---

### Task 4: Marshal-once SSE broadcast

**Files:**
- Modify: `backend/internal/service/event_service.go:610-632` (Subscribe/Unsubscribe/broadcast)
- Modify: `backend/internal/handler/events.go:112-154` (EventsStream)
- Test: existing service/handler SSE tests (update signatures), plus one new service test

- [x] **Step 1: Write the failing service test**

Append to the service test file that holds broadcast/subscribe tests (or create `backend/internal/service/broadcast_test.go`):

```go
package service_test

import (
	"encoding/json"
	"testing"

	"argus/internal/domain"
	"argus/internal/repository"
	"argus/internal/service"
)

// stubAddRepo satisfies EventRepository via interface embedding; only the
// methods AddEvent touches are implemented.
type stubAddRepo struct {
	repository.EventRepository
}

func (stubAddRepo) Add(domain.NormalizedEvent) error { return nil }
func (stubAddRepo) UpsertSession(string, string, string, string, string, string, string, string, domain.SessionUsage) error {
	return nil
}

func TestBroadcastMarshalsOnce(t *testing.T) {
	svc := service.New(stubAddRepo{})
	ch1 := svc.Subscribe()
	ch2 := svc.Subscribe()
	defer svc.Unsubscribe(ch1)
	defer svc.Unsubscribe(ch2)

	e := domain.NormalizedEvent{Time: "2026-06-13T00:00:00Z", Agent: "claudecode", Session: "s1"}
	if err := svc.AddEvent(e); err != nil {
		t.Fatal(err)
	}

	got1 := <-ch1
	got2 := <-ch2
	if got1.Session != "s1" || got2.Session != "s1" {
		t.Fatalf("session field: got %q / %q", got1.Session, got2.Session)
	}
	// Both subscribers receive the same pre-marshaled payload.
	if string(got1.Payload) != string(got2.Payload) {
		t.Fatal("subscribers received different payloads")
	}
	var decoded domain.NormalizedEvent
	if err := json.Unmarshal(got1.Payload, &decoded); err != nil {
		t.Fatalf("payload not valid event JSON: %v", err)
	}
	if decoded.Session != "s1" {
		t.Fatalf("decoded session = %q", decoded.Session)
	}
}
```

Note: `AddEvent` with `Session != ""` and an empty `TranscriptPath` calls `ComputeUsage("")` today, which returns zero usage — `UpsertSession` stub absorbs it. After Task 6 the call is skipped entirely; this test is unaffected.

- [x] **Step 2: Run to verify failure**

Run: `cd backend && go test -run TestBroadcastMarshalsOnce ./internal/service/`
Expected: FAIL — `got1.Session undefined` / `got1.Payload undefined` (channel currently carries `domain.NormalizedEvent`).

- [x] **Step 3: Implement in the service**

In `backend/internal/service/event_service.go`, add `"encoding/json"` to imports, then replace `Subscribe`, `Unsubscribe`, and `broadcast` (lines 610-632) with:

```go
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
```

- [x] **Step 4: Update the SSE handler**

In `backend/internal/handler/events.go`, replace the `for { select { ... } }` loop in `EventsStream` (lines 138-152) with:

```go
	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				return
			}
			if sessionID != "" && ev.Session != sessionID {
				continue
			}
			_, _ = fmt.Fprintf(w, "data: %s\n\n", ev.Payload)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
```

The backfill loop above it keeps using `sendSSE(w, e)` — backfill events come from the repository as `domain.NormalizedEvent` and are marshaled per request, which is fine (bounded at `sseBackfillLimit`). Do not change the subscribe-before-backfill order — it is intentional (prevents dropped events).

- [x] **Step 5: Fix any compile errors in existing tests**

Run: `cd backend && go build ./... && go test ./...`
Any existing test that consumed `<-chan domain.NormalizedEvent` from `Subscribe()` must switch to `service.BroadcastEvent` and `json.Unmarshal(ev.Payload, &event)` where it inspected fields. Make those mechanical updates.
Expected: all pass.

- [x] **Step 6: Lint and commit**

Run: `cd backend && golangci-lint run ./...`
Expected: clean.

```bash
git add backend/internal/service/ backend/internal/handler/events.go
git commit -m "perf(sse): marshal events once per broadcast instead of per subscriber"
```

---

### Task 5: UpsertSession preserves stored usage on zero-usage writes

Prerequisite for Task 6 — once usage is computed only on some events, the other events' upserts must not wipe stored token counts (the current UPDATE clause overwrites unconditionally).

**Files:**
- Modify: `backend/internal/repository/sqlite/sqlite.go:901-946`
- Test: the sqlite test file containing `UpsertSession` tests

- [x] **Step 1: Write the failing test**

Append to the sqlite test file (package `sqlite_test`):

```go
func TestUpsertSessionZeroUsagePreservesStored(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()

	usage := domain.SessionUsage{InputTokens: 100, OutputTokens: 50, Turns: 3}
	if err := db.UpsertSession("s1", "claudecode", "m", "", "/tmp/p", "/tmp/.claude/t.jsonl",
		"2026-06-13T00:00:00Z", "", usage); err != nil {
		t.Fatal(err)
	}

	// A later event without computed usage must not wipe the stored counts.
	if err := db.UpsertSession("s1", "claudecode", "m", "", "/tmp/p", "/tmp/.claude/t.jsonl",
		"2026-06-13T00:01:00Z", "", domain.SessionUsage{}); err != nil {
		t.Fatal(err)
	}

	sessions, err := db.ListSessions()
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}
	if sessions[0].Usage.InputTokens != 100 || sessions[0].Usage.Turns != 3 {
		t.Fatalf("zero-usage upsert clobbered stored usage: %+v", sessions[0].Usage)
	}

	// A non-zero usage write still overwrites.
	if err := db.UpsertSession("s1", "claudecode", "m", "", "/tmp/p", "/tmp/.claude/t.jsonl",
		"2026-06-13T00:02:00Z", "", domain.SessionUsage{InputTokens: 200, OutputTokens: 80, Turns: 4}); err != nil {
		t.Fatal(err)
	}
	sessions, _ = db.ListSessions()
	if sessions[0].Usage.InputTokens != 200 {
		t.Fatalf("non-zero usage upsert did not overwrite: %+v", sessions[0].Usage)
	}
}
```

- [x] **Step 2: Run to verify failure**

Run: `cd backend && go test -run TestUpsertSessionZeroUsagePreservesStored ./internal/repository/sqlite/... ./tests/...`
Expected: FAIL — stored usage is wiped to 0 by the second upsert. (Run against whichever path holds the sqlite tests; `backend/tests/internal/repository/sqlite/` exists in this repo.)

- [x] **Step 3: Implement**

In `UpsertSession` (`sqlite.go:937-941`), replace the five unconditional usage assignments:

```sql
			input_tokens = excluded.input_tokens,
			output_tokens = excluded.output_tokens,
			cache_creation_tokens = excluded.cache_creation_tokens,
			cache_read_tokens = excluded.cache_read_tokens,
			turns = excluded.turns`,
```

with guarded ones (all-zero incoming usage means "no new usage computed — keep what's stored"):

```sql
			input_tokens = CASE WHEN (excluded.input_tokens + excluded.output_tokens + excluded.cache_creation_tokens + excluded.cache_read_tokens + excluded.turns) > 0 THEN excluded.input_tokens ELSE sessions.input_tokens END,
			output_tokens = CASE WHEN (excluded.input_tokens + excluded.output_tokens + excluded.cache_creation_tokens + excluded.cache_read_tokens + excluded.turns) > 0 THEN excluded.output_tokens ELSE sessions.output_tokens END,
			cache_creation_tokens = CASE WHEN (excluded.input_tokens + excluded.output_tokens + excluded.cache_creation_tokens + excluded.cache_read_tokens + excluded.turns) > 0 THEN excluded.cache_creation_tokens ELSE sessions.cache_creation_tokens END,
			cache_read_tokens = CASE WHEN (excluded.input_tokens + excluded.output_tokens + excluded.cache_creation_tokens + excluded.cache_read_tokens + excluded.turns) > 0 THEN excluded.cache_read_tokens ELSE sessions.cache_read_tokens END,
			turns = CASE WHEN (excluded.input_tokens + excluded.output_tokens + excluded.cache_creation_tokens + excluded.cache_read_tokens + excluded.turns) > 0 THEN excluded.turns ELSE sessions.turns END`,
```

- [x] **Step 4: Run tests, gates, commit**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: all pass.

```bash
git add backend/internal/repository/sqlite/sqlite.go backend/tests/
git commit -m "fix(sqlite): zero-usage upsert no longer clobbers stored session usage"
```

---

### Task 6: Throttle write-time usage computation in AddEvent

Today `AddEvent` scans the whole transcript JSONL on **every** hook event. Change: scan on session-terminal events always, otherwise at most once per 30s per session.

**Files:**
- Modify: `backend/internal/service/event_service.go:21-32` (struct), `70-106` (AddEvent)
- Test: service test file

- [x] **Step 1: Write the failing test**

```go
// countingUsageRepo records UpsertSession usage values, embedding the
// interface for unused methods.
type countingUsageRepo struct {
	repository.EventRepository
	usages []domain.SessionUsage
}

func (r *countingUsageRepo) Add(domain.NormalizedEvent) error { return nil }
func (r *countingUsageRepo) UpsertSession(_, _, _, _, _, _, _, _ string, usage domain.SessionUsage) error {
	r.usages = append(r.usages, usage)
	return nil
}

func TestAddEventThrottlesUsageComputation(t *testing.T) {
	dir := filepath.Join(t.TempDir(), ".claude")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	transcript := filepath.Join(dir, "t.jsonl")
	line := `{"type":"assistant","message":{"model":"m","usage":{"input_tokens":10,"output_tokens":5}}}` + "\n"
	if err := os.WriteFile(transcript, []byte(line), 0o644); err != nil {
		t.Fatal(err)
	}

	repo := &countingUsageRepo{}
	svc := service.New(repo)

	mid := domain.NormalizedEvent{
		Time: "2026-06-13T00:00:00Z", Agent: "claudecode", Session: "s1",
		HookEventName: "PostToolUse", TranscriptPath: transcript,
	}
	// First mid-session event computes usage (no record of a prior scan).
	if err := svc.AddEvent(mid); err != nil {
		t.Fatal(err)
	}
	// Second mid-session event within the throttle window skips the scan.
	if err := svc.AddEvent(mid); err != nil {
		t.Fatal(err)
	}
	// Terminal event always computes.
	stop := mid
	stop.HookEventName = "Stop"
	if err := svc.AddEvent(stop); err != nil {
		t.Fatal(err)
	}

	if len(repo.usages) != 3 {
		t.Fatalf("expected 3 upserts, got %d", len(repo.usages))
	}
	if repo.usages[0].InputTokens != 10 {
		t.Fatalf("first event should compute usage, got %+v", repo.usages[0])
	}
	if repo.usages[1].InputTokens != 0 {
		t.Fatalf("second event within throttle window should pass zero usage, got %+v", repo.usages[1])
	}
	if repo.usages[2].InputTokens != 10 {
		t.Fatalf("terminal event should compute usage, got %+v", repo.usages[2])
	}
}
```

Add `"os"` and `"path/filepath"` imports to the test file as needed.

- [x] **Step 2: Run to verify failure**

Run: `cd backend && go test -run TestAddEventThrottlesUsageComputation ./internal/service/`
Expected: FAIL — `repo.usages[1].InputTokens` is 10 (usage currently computed on every event).

- [x] **Step 3: Implement**

Add to the `EventService` struct (after `ingestionErrors atomic.Int64`):

```go
	// usageScannedAt tracks the last transcript usage scan per session so
	// mid-session events don't re-scan the whole JSONL on every hook.
	usageScannedAt sync.Map // session ID (string) → time.Time
```

Add near the other consts:

```go
// usageRescanInterval bounds transcript scans for live sessions: usage is
// recomputed at most this often per session, plus always on terminal events.
const usageRescanInterval = 30 * time.Second
```

Replace the usage block inside `AddEvent` (lines 82-103) with:

```go
	if e.Session != "" {
		var usage domain.SessionUsage
		if s.shouldComputeUsage(e) {
			switch e.Agent {
			case "claudecode":
				usage = claudecode.ComputeUsage(e.TranscriptPath)
			default:
				usage = codex.ComputeUsage(e.TranscriptPath)
			}
			s.usageScannedAt.Store(e.Session, time.Now())
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
```

Add the helper below `AddEvent`:

```go
// shouldComputeUsage reports whether this event warrants a transcript scan.
// Terminal events always scan (final numbers must be exact); other events
// scan at most once per usageRescanInterval per session.
func (s *EventService) shouldComputeUsage(e domain.NormalizedEvent) bool {
	if e.TranscriptPath == "" {
		return false
	}
	if endedAtForEvent(e) != "" {
		return true
	}
	if v, ok := s.usageScannedAt.Load(e.Session); ok {
		if last, isTime := v.(time.Time); isTime && time.Since(last) < usageRescanInterval {
			return false
		}
	}
	return true
}
```

Zero-usage upserts are safe because of Task 5's guard.

- [x] **Step 4: Run tests, gates, commit**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: all pass. If an existing service/handler test asserts usage is upserted on every event, update it to match the throttle semantics (terminal events exact, mid-session throttled).

```bash
git add backend/internal/service/
git commit -m "perf(service): throttle per-event transcript usage scans to 30s per session"
```

---

### Task 7: Remove backfill from read paths; one-time startup backfill

**Files:**
- Modify: `backend/internal/service/event_service.go:338-411` (ListSessions, ListSessionsByCWD, GetDashboardStats, backfillSessionUsage)
- Modify: `backend/cmd/server/main.go` (spawn goroutine)
- Test: service test file

- [x] **Step 1: Write the failing test**

```go
// trackingListRepo serves canned sessions and records upserts.
type trackingListRepo struct {
	repository.EventRepository
	sessions []domain.Session
	upserts  int
}

func (r *trackingListRepo) ListSessions() ([]domain.Session, error) {
	out := make([]domain.Session, len(r.sessions))
	copy(out, r.sessions)
	return out, nil
}
func (r *trackingListRepo) ListSessionsByCWD(string, string) ([]domain.Session, error) {
	return r.ListSessions()
}
func (r *trackingListRepo) UpsertSession(_, _, _, _, _, _, _, _ string, _ domain.SessionUsage) error {
	r.upserts++
	return nil
}

func TestListSessionsDoesNotScanTranscripts(t *testing.T) {
	dir := filepath.Join(t.TempDir(), ".claude")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	transcript := filepath.Join(dir, "t.jsonl")
	line := `{"type":"assistant","message":{"model":"m","usage":{"input_tokens":10,"output_tokens":5}}}` + "\n"
	if err := os.WriteFile(transcript, []byte(line), 0o644); err != nil {
		t.Fatal(err)
	}

	repo := &trackingListRepo{sessions: []domain.Session{
		{SessionID: "s1", Agent: "claudecode", TranscriptPath: transcript}, // no usage stored
	}}
	svc := service.New(repo)

	if _, err := svc.ListSessions(); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ListSessionsByCWD("/tmp", ""); err != nil {
		t.Fatal(err)
	}
	if repo.upserts != 0 {
		t.Fatalf("read paths should not upsert/backfill, got %d upserts", repo.upserts)
	}
}

func TestBackfillMissingSessionUsage(t *testing.T) {
	dir := filepath.Join(t.TempDir(), ".claude")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	transcript := filepath.Join(dir, "t.jsonl")
	line := `{"type":"assistant","message":{"model":"m","usage":{"input_tokens":10,"output_tokens":5}}}` + "\n"
	if err := os.WriteFile(transcript, []byte(line), 0o644); err != nil {
		t.Fatal(err)
	}

	repo := &trackingListRepo{sessions: []domain.Session{
		{SessionID: "s1", Agent: "claudecode", TranscriptPath: transcript},
		{SessionID: "s2", Agent: "claudecode", TranscriptPath: transcript,
			Usage: domain.SessionUsage{InputTokens: 1}}, // already has usage — skipped
	}}
	svc := service.New(repo)

	svc.BackfillMissingSessionUsage()
	if repo.upserts != 1 {
		t.Fatalf("expected exactly 1 backfill upsert, got %d", repo.upserts)
	}
}
```

- [x] **Step 2: Run to verify failure**

Run: `cd backend && go test -run 'TestListSessionsDoesNotScanTranscripts|TestBackfillMissingSessionUsage' ./internal/service/`
Expected: FAIL — `upserts` is 1 in the first test (read-path backfill), and `BackfillMissingSessionUsage` is undefined.

- [x] **Step 3: Implement**

In `event_service.go`:

1. `ListSessions` and `ListSessionsByCWD` — delete the `if err := s.backfillSessionUsage(sessions); err != nil { return nil, err }` blocks; return `s.repo.ListSessions()` / `s.repo.ListSessionsByCWD(cwd, since)` results directly.

2. `GetDashboardStats` — delete the `backfillSessionUsage` call (lines 365-367). `enrichDashboardStats` already computes a breakdown per session and falls back to `session.Usage` — it remains the single transcript-scan site for the dashboard (bounded by Task 8's TTL cache).

3. Rename `backfillSessionUsage` to `BackfillMissingSessionUsage`, change it to a no-argument exported method that lists sessions itself and never returns an error (log and continue):

```go
// BackfillMissingSessionUsage computes usage for sessions persisted before
// write-time usage existed. Called once at startup in a background goroutine;
// errors are logged per session and never fatal.
func (s *EventService) BackfillMissingSessionUsage() {
	sessions, err := s.repo.ListSessions()
	if err != nil {
		slog.Warn("usage backfill: list sessions", "err", err)
		return
	}
	updated := 0
	for i := range sessions {
		if hasUsage(sessions[i].Usage) || sessions[i].TranscriptPath == "" {
			continue
		}
		usage := computeUsage(sessions[i].Agent, sessions[i].TranscriptPath)
		if !hasUsage(usage) {
			continue
		}
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
			slog.Warn("usage backfill: upsert", "session", sessions[i].SessionID, "err", err)
			continue
		}
		updated++
	}
	if updated > 0 {
		slog.Info("usage backfill complete", "updated", updated)
	}
}
```

4. In `backend/cmd/server/main.go`, after `svc := service.New(repo)` (line 69), add:

```go
	// One-time backfill for sessions persisted before write-time usage
	// computation existed. Background, best-effort, runs once.
	go svc.BackfillMissingSessionUsage()
```

- [x] **Step 4: Run tests, gates, commit**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: all pass. Existing tests that relied on read-path backfill (e.g., a sessions-list test asserting freshly computed usage) must be updated: usage now comes from the DB (write-time, Task 6) or the startup backfill.

```bash
git add backend/internal/service/ backend/cmd/server/main.go
git commit -m "perf(service): move session usage backfill off read paths to one-time startup pass"
```

---

### Task 8: Dashboard stats TTL cache (5s)

**Files:**
- Modify: `backend/internal/service/event_service.go` (struct, New, GetDashboardStats)
- Test: service test file

- [x] **Step 1: Write the failing test**

```go
func TestGetDashboardStatsCached(t *testing.T) {
	repo, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = repo.Close() }()
	svc := service.New(repo)

	if err := svc.AddEvent(domain.NormalizedEvent{
		Time: "2026-06-13T00:00:00Z", Agent: "claudecode", Session: "s1",
		HookEventName: "PostToolUse", Action: "EDIT",
	}); err != nil {
		t.Fatal(err)
	}

	first, err := svc.GetDashboardStats("", "")
	if err != nil {
		t.Fatal(err)
	}
	if first.TotalEvents != 1 {
		t.Fatalf("TotalEvents = %d", first.TotalEvents)
	}

	// Second event lands, but within the TTL the cached snapshot is served.
	if err := svc.AddEvent(domain.NormalizedEvent{
		Time: "2026-06-13T00:00:01Z", Agent: "claudecode", Session: "s1",
		HookEventName: "PostToolUse", Action: "EDIT",
	}); err != nil {
		t.Fatal(err)
	}
	second, err := svc.GetDashboardStats("", "")
	if err != nil {
		t.Fatal(err)
	}
	if second.TotalEvents != 1 {
		t.Fatalf("expected cached TotalEvents=1, got %d", second.TotalEvents)
	}

	// Expire the cache; the fresh value is computed.
	svc.SetStatsCachedAt("|", time.Now().Add(-time.Minute))
	third, err := svc.GetDashboardStats("", "")
	if err != nil {
		t.Fatal(err)
	}
	if third.TotalEvents != 2 {
		t.Fatalf("expected fresh TotalEvents=2 after expiry, got %d", third.TotalEvents)
	}
}
```

Imports needed in the test file: `"time"`, `"argus/internal/repository/sqlite"`.

- [x] **Step 2: Run to verify failure**

Run: `cd backend && go test -run TestGetDashboardStatsCached ./internal/service/`
Expected: FAIL — `SetStatsCachedAt` undefined; without the cache `second.TotalEvents` is 2.

- [x] **Step 3: Implement**

Struct additions (after the diag cache fields):

```go
	statsMu    sync.RWMutex
	statsCache map[string]cachedDashboardStats
```

New type and const near the top of the file:

```go
// cachedDashboardStats is a TTL-cached GetDashboardStats response. The cached
// value is never mutated after store, so shallow copies are safe to hand out.
type cachedDashboardStats struct {
	stats    domain.DashboardStats
	cachedAt time.Time
}

// dashboardStatsTTL bounds how often dashboard aggregates and transcript
// scans run. 5s staleness is invisible for a local single-user dashboard.
const dashboardStatsTTL = 5 * time.Second
```

In `New()`, initialize the map:

```go
	return &EventService{
		repo:       repo,
		startTime:  time.Now(),
		statsCache: map[string]cachedDashboardStats{},
	}
```

Wrap `GetDashboardStats`:

```go
func (s *EventService) GetDashboardStats(since, until string) (*domain.DashboardStats, error) {
	key := since + "|" + until

	s.statsMu.RLock()
	if c, ok := s.statsCache[key]; ok && time.Since(c.cachedAt) < dashboardStatsTTL {
		result := c.stats // shallow copy — cached value is never mutated after store
		s.statsMu.RUnlock()
		return &result, nil
	}
	s.statsMu.RUnlock()

	sessions, err := s.repo.ListSessions()
	if err != nil {
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

	s.statsMu.Lock()
	s.statsCache[key] = cachedDashboardStats{stats: *stats, cachedAt: time.Now()}
	s.statsMu.Unlock()
	return stats, nil
}
```

Errors are returned without caching — the next request retries (spec error-handling table).

Test helper (next to `SetDiagCachedAt`):

```go
// SetStatsCachedAt sets a stats cache entry's timestamp for testing TTL
// expiry. Testing only — do not call in production code.
func (s *EventService) SetStatsCachedAt(key string, t time.Time) {
	s.statsMu.Lock()
	if c, ok := s.statsCache[key]; ok {
		c.cachedAt = t
		s.statsCache[key] = c
	}
	s.statsMu.Unlock()
}
```

- [x] **Step 4: Run tests, gates, commit**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: all pass. Any existing dashboard test asserting immediate freshness across two calls must expire the cache via `SetStatsCachedAt` between calls.

```bash
git add backend/internal/service/
git commit -m "perf(service): 5s TTL cache for dashboard stats responses"
```

---

### Task 9: Index-friendly time predicates in SQL

**Files:**
- Modify: `backend/internal/repository/sqlite/sqlite.go` — `GetDashboardStats` (lines 1008-1019), `ListSessionsByCWD` (line 575), `listSessionsWhere` ORDER BY (line 592)
- Possibly create: next-numbered migration in `backend/internal/repository/sqlite/migrations/`

- [x] **Step 1: Replace `datetime()` predicates in GetDashboardStats**

All stored timestamps (`created_at`, `started_at`, `last_seen_at`) are normalized RFC3339 UTC strings, so lexicographic comparison equals time comparison — but only if the parameter is normalized the same way. Replace lines 1008-1019 with:

```go
	if since != "" {
		s := normalizeToUTC(since)
		eventClauses = append(eventClauses, "created_at >= ?")
		sessionClauses = append(sessionClauses, "started_at >= ?")
		eventArgs = append(eventArgs, s)
		sessionArgs = append(sessionArgs, s)
	}
	if until != "" {
		u := normalizeToUTC(until)
		eventClauses = append(eventClauses, "created_at <= ?")
		sessionClauses = append(sessionClauses, "started_at <= ?")
		eventArgs = append(eventArgs, u)
		sessionArgs = append(sessionArgs, u)
	}
```

Check `normalizeToUTC`'s behavior on unparseable input first (it exists in this file): if it returns the input unchanged, this is safe; if it returns empty, guard with `if normalized == "" { normalized = since }`.

- [x] **Step 2: Same treatment for session listing**

`ListSessionsByCWD` (line 575): `"datetime(last_seen_at) >= datetime(?)"` → `"last_seen_at >= ?"` with `args = append(args, normalizeToUTC(since))`.

`listSessionsWhere` (line 592): `ORDER BY datetime(started_at) DESC, datetime(last_seen_at) DESC` → `ORDER BY started_at DESC, last_seen_at DESC`.

- [x] **Step 3: Run existing tests**

Run: `cd backend && go test ./...`
Expected: PASS. Dashboard/session time-range tests exercise the boundaries; failures here mean a normalization mismatch — fix by normalizing the parameter, never by reverting to `datetime()`.

- [x] **Step 4: Check query plans; add index only if a scan is confirmed**

Write a throwaway check (delete after running, or keep as a skipped test):

```go
func TestExplainDashboardQueries(t *testing.T) {
	t.Skip("manual EXPLAIN inspection — unskip locally")
	db, _ := sqlite.New(":memory:")
	defer func() { _ = db.Close() }()
	rows, err := db.Raw().Query(
		"EXPLAIN QUERY PLAN SELECT COUNT(*) FROM hook_events WHERE created_at >= ?", "2026-01-01T00:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var id, parent, notused int
		var detail string
		_ = rows.Scan(&id, &parent, &notused, &detail)
		t.Log(detail)
	}
}
```

(If the `DB` type exposes no `Raw()` accessor, run the EXPLAIN against a file DB with the `sqlite3` CLI instead.)

If the output says `USING INDEX` (any index on `created_at`): no migration needed — check the box and move on.
If it says `SCAN hook_events`: create the next-numbered migration file (check `ls backend/internal/repository/sqlite/migrations/` for the current max sequence):

```sql
-- NNN_hook_events_created_at_index.sql
CREATE INDEX IF NOT EXISTS idx_hook_events_created_at ON hook_events(created_at);
```

Never edit existing migration files.

- [x] **Step 5: Gates and commit**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: all pass.

```bash
git add backend/internal/repository/sqlite/
git commit -m "perf(sqlite): direct string time predicates so indexes apply"
```

---

### Task 10: mergeChildProjects O(n²) → O(n log n)

**Files:**
- Modify: `backend/internal/repository/sqlite/sqlite.go:515-565`
- Test: sqlite test file

- [ ] **Step 1: Write the failing equivalence test**

The test pins the old algorithm's output as the contract. Copy the **current** `mergeChildProjects` body into the test file as `mergeChildProjectsQuadratic` (test-local, unexported) before changing the implementation, and add:

```go
func TestMergeChildProjectsMatchesQuadratic(t *testing.T) {
	fixtures := [][]domain.Project{
		// nested chain with eligible (≥4 components) and ineligible parents
		{
			{CWD: "/Users/dev", SessionCount: 1, LastActivity: "2026-01-01T00:00:00Z", Agents: []string{"codex"}},
			{CWD: "/Users/dev/work/app", SessionCount: 2, LastActivity: "2026-01-03T00:00:00Z", Agents: []string{"claudecode"}},
			{CWD: "/Users/dev/work/app/frontend", SessionCount: 3, LastActivity: "2026-01-02T00:00:00Z", Agents: []string{"claudecode"}},
			{CWD: "/Users/dev/work/app/backend", SessionCount: 4, LastActivity: "2026-01-05T00:00:00Z", Agents: []string{"codex"}},
			{CWD: "/Users/dev/work/other", SessionCount: 5, LastActivity: "2026-01-04T00:00:00Z", Agents: []string{"codex"}},
		},
		// sibling prefixes that are NOT path parents (/foo/bar vs /foo/barbaz)
		{
			{CWD: "/a/b/c/foo", SessionCount: 1, LastActivity: "2026-01-01T00:00:00Z"},
			{CWD: "/a/b/c/foobar", SessionCount: 2, LastActivity: "2026-01-02T00:00:00Z"},
			{CWD: "/a/b/c/foo/sub", SessionCount: 3, LastActivity: "2026-01-03T00:00:00Z"},
		},
		// deep nesting: grandchild merges into deepest eligible ancestor
		{
			{CWD: "/u/x/p/root", SessionCount: 1, LastActivity: "2026-01-01T00:00:00Z"},
			{CWD: "/u/x/p/root/mid", SessionCount: 2, LastActivity: "2026-01-02T00:00:00Z"},
			{CWD: "/u/x/p/root/mid/leaf", SessionCount: 3, LastActivity: "2026-01-03T00:00:00Z"},
		},
		{}, // empty
	}

	for fi, fixture := range fixtures {
		a := append([]domain.Project(nil), fixture...)
		b := append([]domain.Project(nil), fixture...)
		got := mergeChildProjects(a)
		want := mergeChildProjectsQuadratic(b)
		if len(got) != len(want) {
			t.Fatalf("fixture %d: len got=%d want=%d\ngot=%+v\nwant=%+v", fi, len(got), len(want), got, want)
		}
		for i := range got {
			g, w := got[i], want[i]
			if g.CWD != w.CWD || g.SessionCount != w.SessionCount ||
				g.TotalTokens != w.TotalTokens || g.LiveCount != w.LiveCount ||
				g.LastActivity != w.LastActivity || len(g.Agents) != len(w.Agents) {
				t.Errorf("fixture %d row %d:\ngot  %+v\nwant %+v", fi, i, g, w)
			}
		}
	}
}
```

This test needs access to the unexported `mergeChildProjects`, so it lives in `package sqlite` (white-box, same directory: `backend/internal/repository/sqlite/merge_projects_test.go`).

- [ ] **Step 2: Run to verify it passes against the old code, then implement**

Run: `cd backend && go test -run TestMergeChildProjectsMatchesQuadratic ./internal/repository/sqlite/`
Expected: PASS (both sides are the quadratic algorithm). This is the safety net.

Now replace `mergeChildProjects` (lines 515-565) with:

```go
// mergeChildProjects collapses sessions from subdirectory CWDs into their
// nearest parent project so e.g. /foo/bar doesn't show alongside /foo.
// Lexicographic order puts every parent path immediately before its children,
// so one pass with an ancestor stack replaces the quadratic prefix search.
func mergeChildProjects(projects []domain.Project) []domain.Project {
	slices.SortStableFunc(projects, func(a, b domain.Project) int {
		return strings.Compare(a.CWD, b.CWD)
	})

	merged := make([]domain.Project, 0, len(projects))
	var stack []int // indexes into merged forming the current ancestor chain
	for _, p := range projects {
		for len(stack) > 0 {
			top := merged[stack[len(stack)-1]].CWD
			if top != "" && strings.HasPrefix(p.CWD, top+"/") {
				break
			}
			stack = stack[:len(stack)-1]
		}

		// Deepest eligible ancestor wins. Require ≥4 path components so home
		// dirs like /Users/foo don't absorb all projects as a side-effect of
		// prefix matching.
		parentIdx := -1
		for i := len(stack) - 1; i >= 0; i-- {
			if len(strings.Split(merged[stack[i]].CWD, "/")) >= 4 {
				parentIdx = stack[i]
				break
			}
		}

		if parentIdx >= 0 {
			par := &merged[parentIdx]
			par.SessionCount += p.SessionCount
			par.TotalTokens += p.TotalTokens
			par.LiveCount += p.LiveCount
			if p.LastActivity > par.LastActivity {
				par.LastActivity = p.LastActivity
			}
			seen := make(map[string]struct{}, len(par.Agents))
			for _, a := range par.Agents {
				seen[a] = struct{}{}
			}
			for _, a := range p.Agents {
				if _, ok := seen[a]; !ok {
					par.Agents = append(par.Agents, a)
				}
			}
			continue
		}

		merged = append(merged, p)
		stack = append(stack, len(merged)-1)
	}

	slices.SortStableFunc(merged, func(a, b domain.Project) int {
		switch {
		case a.LastActivity > b.LastActivity:
			return -1
		case a.LastActivity < b.LastActivity:
			return 1
		default:
			return 0
		}
	})
	return merged
}
```

Equivalence caveat: the old code processed projects in path-length order; the new one in lexicographic order. Both guarantee every parent is processed before its children, and the final LastActivity sort makes output order identical. If the equivalence test finds a fixture where final ordering ties differ (same LastActivity), accept either order in the test by comparing as sets keyed by CWD.

- [ ] **Step 3: Run the equivalence test against the new code**

Run: `cd backend && go test -run 'TestMergeChildProjects' ./internal/repository/sqlite/ ./tests/...`
Expected: PASS, including any pre-existing `mergeChildProjects`/`ListProjects` tests.

- [ ] **Step 4: Gates and commit**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: all pass.

```bash
git add backend/internal/repository/sqlite/
git commit -m "perf(sqlite): single-pass ancestor-stack project merge"
```

---

### Task 11: Backend after-benchmarks + broadcast benchmark

**Files:**
- Create: `backend/internal/service/broadcast_bench_test.go`
- Modify: this plan file (record numbers)

- [ ] **Step 1: Write the broadcast benchmark (new code shape)**

```go
package service_test

import (
	"testing"

	"argus/internal/domain"
	"argus/internal/service"
)

func BenchmarkBroadcastFiveSubscribers(b *testing.B) {
	svc := service.New(stubAddRepo{})
	for i := 0; i < 5; i++ {
		ch := svc.Subscribe()
		go func() {
			for range ch {
			}
		}()
		defer svc.Unsubscribe(ch)
	}
	e := domain.NormalizedEvent{Time: "2026-06-13T00:00:00Z", Agent: "claudecode", Session: "bench"}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if err := svc.AddEvent(e); err != nil {
			b.Fatal(err)
		}
	}
}
```

(`stubAddRepo` is defined in Task 4's test file, same package.)

- [ ] **Step 2: Re-run all benchmarks, record after-numbers**

Run: `cd backend && go test -bench . -benchtime 2s -run '^$' ./internal/fileutil/ ./internal/service/`
Expected: `BenchmarkEnrichLookup` roughly halves vs baseline (one read instead of two); `BenchmarkGetDashboardStats` drops by orders of magnitude on cache hits. **Paste the numbers here next to the Task 1 baseline:**

```
AFTER BenchmarkEnrichLookup:           ____ ns/op   (baseline: ____)
AFTER BenchmarkGetDashboardStats:      ____ ns/op   (baseline: ____)
AFTER BenchmarkBroadcastFiveSubscribers: ____ ns/op (no baseline — marshal-once by construction)
```

- [ ] **Step 3: Full backend gates and commit**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: all pass.

```bash
git add backend/internal/service/broadcast_bench_test.go docs/superpowers/plans/2026-06-13-cpu-optimization.md
git commit -m "test(backend): after-benchmarks for CPU optimization pass"
```

---

### Task 12: HeaderClock — stop re-rendering the app shell every second

**Files:**
- Create: `frontend/src/app/HeaderClock.tsx`
- Modify: `frontend/src/app/Layout.tsx:91, 148-151, 301-305`
- Test: `frontend/src/app/__tests__/HeaderClock.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderClock } from '../HeaderClock'

describe('HeaderClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-13T10:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the current time and ticks every second', () => {
    render(<HeaderClock />)
    const initial = screen.getByTestId('header-clock').textContent
    expect(initial).toContain(new Date('2026-06-13T10:00:00').toLocaleTimeString())

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByTestId('header-clock').textContent).toContain(
      new Date('2026-06-13T10:00:01').toLocaleTimeString()
    )
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/app/__tests__/HeaderClock.test.tsx`
Expected: FAIL — module `../HeaderClock` not found.

- [ ] **Step 3: Create the component**

`frontend/src/app/HeaderClock.tsx`:

```tsx
import { useEffect, useState } from 'react'

// Isolated so the per-second tick re-renders only this span, not the whole
// app shell and outlet tree.
export function HeaderClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <span
      data-testid="header-clock"
      className="tabular-nums text-[#444] shrink-0 font-medium text-right"
    >
      {now.toLocaleDateString()} {now.toLocaleTimeString()}
    </span>
  )
}
```

- [ ] **Step 4: Wire into Layout**

In `Layout.tsx`:
1. Delete line 91: `const [now, setNow] = useState(() => new Date())`
2. Delete the interval effect (lines 148-151).
3. Replace the clock span (lines 302-304) with `<HeaderClock />`.
4. Add `import { HeaderClock } from './HeaderClock'` (feature-local relative import, last group).
5. Remove `useState` from the React import only if now unused (it is still used for `isLive` — keep it).

- [ ] **Step 5: Run tests, format, commit**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx prettier --write src/app/HeaderClock.tsx src/app/Layout.tsx src/app/__tests__/HeaderClock.test.tsx`
Expected: all pass.

```bash
git add frontend/src/app/
git commit -m "perf(frontend): isolate header clock so the shell stops re-rendering every second"
```

---

### Task 13: Visibility-aware polling hook

**Files:**
- Create: `frontend/src/hooks/usePollingInterval.ts`
- Modify: `frontend/src/hooks/useSessions.ts:31-44`
- Modify: `frontend/src/features/events/hooks/useEventFilters.ts:74-87`
- Test: `frontend/src/hooks/__tests__/usePollingInterval.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePollingInterval } from '../usePollingInterval'

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('usePollingInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setDocumentHiddenSilently(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setDocumentHiddenSilently(false)
  })

  function setDocumentHiddenSilently(hidden: boolean) {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    })
  }

  it('fires on the interval while visible', () => {
    const cb = vi.fn()
    renderHook(() => usePollingInterval(cb, 1000))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('pauses while hidden and fires immediately on return', () => {
    const cb = vi.fn()
    renderHook(() => usePollingInterval(cb, 1000))

    act(() => {
      setDocumentHidden(true)
      vi.advanceTimersByTime(5000)
    })
    expect(cb).toHaveBeenCalledTimes(0)

    act(() => {
      setDocumentHidden(false)
    })
    expect(cb).toHaveBeenCalledTimes(1) // immediate refresh on return

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('does nothing when disabled', () => {
    const cb = vi.fn()
    renderHook(() => usePollingInterval(cb, 1000, false))
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(cb).toHaveBeenCalledTimes(0)
  })

  it('cleans up on unmount', () => {
    const cb = vi.fn()
    const { unmount } = renderHook(() => usePollingInterval(cb, 1000))
    unmount()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(cb).toHaveBeenCalledTimes(0)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/hooks/__tests__/usePollingInterval.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

`frontend/src/hooks/usePollingInterval.ts`:

```ts
import { useEffect, useRef } from 'react'

/**
 * Run callback every `ms` while the document is visible. Pauses entirely when
 * the tab is hidden and fires immediately on return, so a hidden tab costs
 * zero CPU and the data is never stale on screen.
 */
export function usePollingInterval(callback: () => void, ms: number, enabled = true) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) return

    let interval: number | null = null

    const start = () => {
      if (interval !== null) return
      interval = window.setInterval(() => callbackRef.current(), ms)
    }
    const stop = () => {
      if (interval !== null) {
        window.clearInterval(interval)
        interval = null
      }
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop()
      } else {
        callbackRef.current()
        start()
      }
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [ms, enabled])
}
```

- [ ] **Step 4: Wire into useSessions**

In `frontend/src/hooks/useSessions.ts`, replace the interval effect (lines 31-44) with:

```ts
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [refresh])

  usePollingInterval(() => void refresh(), 5000, enabled)
```

Add `import { usePollingInterval } from './usePollingInterval'`.

- [ ] **Step 5: Wire into useEventFilters projects poll**

In `frontend/src/features/events/hooks/useEventFilters.ts`, replace the projects poll effect (lines 74-87) with:

```ts
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshProjects()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [refreshProjects])

  usePollingInterval(() => void refreshProjects(), 15_000, isLive)
```

Add `import { usePollingInterval } from '@/hooks/usePollingInterval'` (shared-lib import group).

- [ ] **Step 6: Run tests, format, commit**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx prettier --write src/hooks/ src/features/events/hooks/useEventFilters.ts`
Expected: all pass. If existing useSessions/useEventFilters tests stub timers and assert polling while "hidden", they will need `document.hidden = false` made explicit (jsdom default is visible — usually no change needed).

```bash
git add frontend/src/hooks/ frontend/src/features/events/hooks/useEventFilters.ts
git commit -m "perf(frontend): pause sessions and projects polling while the tab is hidden"
```

---

### Task 14: Cached time formatting and highlight regex

**Files:**
- Modify: `frontend/src/lib/format.ts`
- Modify: `frontend/src/features/events/EventRow.tsx:107`
- Modify: `frontend/src/features/events/AgentSession.tsx:50-66, 135-136`
- Test: `frontend/src/lib/__tests__/format.test.ts` (create or extend)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { formatEventTime, highlight } from '../format'

describe('formatEventTime', () => {
  it('formats an ISO timestamp as a locale time', () => {
    const iso = '2026-06-13T10:20:30Z'
    expect(formatEventTime(iso)).toBe(new Date(iso).toLocaleTimeString([], { hour12: false }))
  })

  it('returns the cached value on repeat calls', () => {
    const iso = '2026-06-13T11:00:00Z'
    expect(formatEventTime(iso)).toBe(formatEventTime(iso))
  })
})

describe('highlight regex cache', () => {
  it('still highlights after the query changes', () => {
    // Exercise the cache invalidation path: two different queries in sequence.
    const first = highlight('alpha beta', 'alpha')
    const second = highlight('alpha beta', 'beta')
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/lib/__tests__/format.test.ts`
Expected: FAIL — `formatEventTime` is not exported.

- [ ] **Step 3: Implement in format.ts**

Add to `frontend/src/lib/format.ts`:

```ts
const timeFormatCache = new Map<string, string>()

/**
 * Format an ISO timestamp as a locale time string, cached per timestamp so
 * list re-renders don't re-run Date parsing and locale formatting per row.
 */
export function formatEventTime(iso: string): string {
  const cached = timeFormatCache.get(iso)
  if (cached !== undefined) return cached
  if (timeFormatCache.size > 20_000) timeFormatCache.clear()
  const formatted = new Date(iso).toLocaleTimeString([], { hour12: false })
  timeFormatCache.set(iso, formatted)
  return formatted
}
```

Replace the body of `highlight` so the regex is compiled once per query, not once per row render (`String.prototype.split` ignores a global regex's `lastIndex`, so reuse is safe):

```ts
let lastHighlightQuery: string | null = null
let lastHighlightRegex: RegExp | null = null

function highlightRegex(query: string): RegExp {
  if (query !== lastHighlightQuery || lastHighlightRegex === null) {
    const escaped = query.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')
    lastHighlightQuery = query
    lastHighlightRegex = new RegExp(`(${escaped})`, 'gi')
  }
  return lastHighlightRegex
}

/** Highlight matching text in a string */
export function highlight(text: string, query: string): ReactNode {
  if (!query) return text
  const parts = text.split(highlightRegex(query))
  return createElement(
    'span',
    null,
    ...parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? createElement('mark', { key: i }, part) : part
    )
  )
}
```

- [ ] **Step 4: Use formatEventTime in EventRow**

`EventRow.tsx:107`: replace

```tsx
          <span>{new Date(e.time).toLocaleTimeString([], { hour12: false })}</span>
```

with

```tsx
          <span>{formatEventTime(e.time)}</span>
```

and change the format import to `import { formatEventTime, highlight } from '@/lib/format'`.

- [ ] **Step 5: Memoize AgentSession derived values**

In `AgentSession.tsx`:

1. Change the React import to include the hooks: `import { memo, useMemo, useState } from 'react'`.

2. Replace the inline pagination math (lines 52-66) with:

```tsx
  const { totalPages, clampedPage, pageStart, pageEnd, visibleEvents } = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(events.length / pageSize))
    const targetEventIndex =
      targetEventKey && targetSessionId === sessionId
        ? events.findIndex((event) => buildEventKey(event) === targetEventKey)
        : -1
    const page =
      targetEventIndex >= 0
        ? Math.min(Math.floor(targetEventIndex / pageSize), totalPages - 1)
        : Math.min(manualPage, totalPages - 1)
    const pageStart = page * pageSize
    const pageEnd = Math.min(pageStart + pageSize, events.length)
    return {
      totalPages,
      clampedPage: page,
      pageStart,
      pageEnd,
      visibleEvents: events.slice(pageStart, pageEnd),
    }
  }, [events, pageSize, manualPage, targetEventKey, targetSessionId, sessionId])
  const needsPagination = events.length > pageSize
```

3. Add a memoized footer label and use it (replacing the two `lastTime.toLocale...` calls at lines 135-136):

```tsx
  const lastTimeLabel = useMemo(
    () => `${lastTime.toLocaleDateString()} • ${lastTime.toLocaleTimeString()}`,
    [lastTime]
  )
```

```tsx
            {events.length} events • {lastTimeLabel}
```

- [ ] **Step 6: Run tests, format, commit**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx prettier --write src/lib/format.ts src/lib/__tests__/format.test.ts src/features/events/EventRow.tsx src/features/events/AgentSession.tsx`
Expected: all pass.

```bash
git add frontend/src/lib/ frontend/src/features/events/EventRow.tsx frontend/src/features/events/AgentSession.tsx
git commit -m "perf(frontend): cache per-timestamp formatting and highlight regex"
```

---

### Task 15: Append-only short-circuit in useEventFilters

**Files:**
- Modify: `frontend/src/features/events/hooks/useEventFilters.ts:102-137`
- Test: `frontend/src/features/events/hooks/__tests__/useEventFilters.test.tsx` (create or extend)

- [ ] **Step 1: Write the failing test**

The test pins the core invariant: the append path must produce exactly what a full re-filter would.

```tsx
import { renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { EventRecord } from '@/types/events'
import { useEventFilters } from '../useEventFilters'

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>
}

function makeEvent(overrides: Partial<EventRecord>): EventRecord {
  return {
    time: '2026-06-13T00:00:00Z',
    agent: 'claudecode',
    session: 's1',
    action: 'EDIT',
    ...overrides,
  } as EventRecord
}

function renderFilters(events: EventRecord[]) {
  return renderHook(
    ({ evts }) =>
      useEventFilters(evts, '', vi.fn(), '', 'all', vi.fn(), '', vi.fn(), '', vi.fn(), true),
    { wrapper, initialProps: { evts: events } }
  )
}

describe('useEventFilters append short-circuit', () => {
  it('append path matches a full re-filter', () => {
    const base = [
      makeEvent({ session: 's1', action: 'EDIT' }),
      makeEvent({ session: 's2', action: 'BASH' }),
    ]
    const { result, rerender } = renderFilters(base)
    expect(result.current.filteredEvents).toHaveLength(2)

    // Live merge appends to a fresh array, preserving item identities.
    const appended = [...base, makeEvent({ session: 's3', action: 'EDIT' })]
    rerender({ evts: appended })
    expect(result.current.filteredEvents).toHaveLength(3)
    expect(result.current.filteredEvents).toEqual(appended)
  })

  it('keeps the same filtered array identity when appended events match nothing later filtered out', () => {
    const base = [makeEvent({ session: 's1' })]
    const { result, rerender } = renderFilters(base)
    const firstResult = result.current.filteredEvents

    // Re-render with an identical-prefix array and no new events: identity holds.
    rerender({ evts: base })
    expect(result.current.filteredEvents).toBe(firstResult)
  })

  it('full re-filter on shrink/reset', () => {
    const base = [makeEvent({ session: 's1' }), makeEvent({ session: 's2' })]
    const { result, rerender } = renderFilters(base)
    expect(result.current.filteredEvents).toHaveLength(2)

    rerender({ evts: [] })
    expect(result.current.filteredEvents).toHaveLength(0)
  })
})
```

Adjust the `useEventFilters(...)` argument list to its exact signature (events, searchQuery, setSearchQuery, sessionFilterOverride, timeRange, setTimeRange, customStart, setCustomStart, customEnd, setCustomEnd, isLive) — the literals above follow it.

- [ ] **Step 2: Run to verify the identity test fails**

Run: `cd frontend && npx vitest run src/features/events/hooks/__tests__/useEventFilters.test.tsx`
Expected: the length-based tests pass against current code; the array-identity expectation may also pass (useMemo with unchanged deps). The real change is algorithmic — proceed regardless; the tests pin behavior.

- [ ] **Step 3: Implement**

In `useEventFilters.ts`, add a module-level predicate above the hook (extracted verbatim from the current filter body):

```ts
function eventMatchesFilters(
  e: EventRecord,
  actionFilter: string,
  agentFilter: string,
  projectFilter: string,
  sessionFilter: string,
  q: string
): boolean {
  if (actionFilter !== 'all' && e.action !== actionFilter) return false
  if (agentFilter !== 'all' && e.agent !== agentFilter) return false
  if (
    projectFilter !== 'all' &&
    e.cwd !== projectFilter &&
    !e.cwd?.startsWith(projectFilter + '/')
  )
    return false
  if (sessionFilter && e.session !== sessionFilter) return false
  if (q) {
    if (
      !e.path?.toLowerCase().includes(q) &&
      !e.session?.toLowerCase().includes(q) &&
      !e.command?.toLowerCase().includes(q) &&
      !e.prompt?.toLowerCase().includes(q) &&
      !e.notification_message?.toLowerCase().includes(q) &&
      !e.error_message?.toLowerCase().includes(q) &&
      !e.response?.toLowerCase().includes(q) &&
      !e.task_title?.toLowerCase().includes(q) &&
      !e.subagent_type?.toLowerCase().includes(q) &&
      !e.trigger?.toLowerCase().includes(q) &&
      !e.tool_result_stdout?.toLowerCase().includes(q) &&
      !e.tool_result_stderr?.toLowerCase().includes(q)
    )
      return false
  }
  return true
}
```

Replace the `filteredEvents` memo (lines 102-137) with:

```ts
  const prevFilterRef = useRef<{
    events: EventRecord[]
    filtered: EventRecord[]
    signature: string
  } | null>(null)

  const filteredEvents = useMemo(() => {
    const q = debouncedSearchQuery.toLowerCase()
    const signature = [actionFilter, agentFilter, projectFilter, sessionFilter, q].join(' ')
    const prev = prevFilterRef.current

    // The live stream appends events to the end of a fresh array, preserving
    // item identities. When the previous events are an untouched prefix and
    // the filters haven't changed, only the appended slice needs filtering.
    const prevLen = prev?.events.length ?? 0
    const isAppendOnly =
      prev !== null &&
      prev.signature === signature &&
      events.length >= prevLen &&
      (prevLen === 0 ||
        (events[0] === prev.events[0] && events[prevLen - 1] === prev.events[prevLen - 1]))

    let filtered: EventRecord[]
    if (isAppendOnly) {
      const appended: EventRecord[] = []
      for (let i = prevLen; i < events.length; i++) {
        if (
          eventMatchesFilters(events[i], actionFilter, agentFilter, projectFilter, sessionFilter, q)
        ) {
          appended.push(events[i])
        }
      }
      filtered = appended.length > 0 ? [...prev.filtered, ...appended] : prev.filtered
    } else {
      filtered = events.filter((e) =>
        eventMatchesFilters(e, actionFilter, agentFilter, projectFilter, sessionFilter, q)
      )
    }

    prevFilterRef.current = { events, filtered, signature }
    return filtered
  }, [events, actionFilter, agentFilter, projectFilter, debouncedSearchQuery, sessionFilter])
```

`useRef` is already imported in this file.

- [ ] **Step 4: Run tests, format, commit**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx prettier --write src/features/events/hooks/`
Expected: all pass, including pre-existing useEventFilters tests.

```bash
git add frontend/src/features/events/hooks/
git commit -m "perf(frontend): filter only appended events on live stream updates"
```

---

### Task 16: SessionList split memo + numeric timestamp sort

**Files:**
- Modify: `frontend/src/features/events/SessionList.tsx:36-84`
- Test: existing SessionList/EventsPage tests must stay green

- [ ] **Step 1: Implement the split**

Replace the single `sessionList` memo (lines 36-84) with two memos — grouping (parses each event's time exactly once) and sorting (numeric comparisons, no Date allocation in comparators):

```tsx
type SessionAccumulator = {
  sessionId: string
  transcriptPath: string
  cwd: string
  entries: { event: EventRecord; timeMs: number }[]
  lastTimeMs: number
}
```

(Place the type above the component, next to `SessionListProps`.)

```tsx
  const grouped = useMemo(() => {
    const map = new Map<string, SessionAccumulator>()
    for (const event of events) {
      const key = event.session || event.transcript_path || 'ungrouped'
      const timeMs = new Date(event.time).getTime()
      const existing = map.get(key)
      if (existing) {
        existing.entries.push({ event, timeMs })
        if (timeMs > existing.lastTimeMs) existing.lastTimeMs = timeMs
        if (!existing.cwd && event.cwd) existing.cwd = event.cwd
        continue
      }
      map.set(key, {
        sessionId: key,
        transcriptPath: event.transcript_path ?? '',
        cwd: event.cwd ?? '',
        entries: [{ event, timeMs }],
        lastTimeMs: timeMs,
      })
    }
    return map
  }, [events])

  const sessionList = useMemo(() => {
    const list = Array.from(grouped.values()).map((acc) => {
      const sortedEntries = acc.entries.toSorted((a, b) =>
        sortOrder === 'newest' ? b.timeMs - a.timeMs : a.timeMs - b.timeMs
      )
      const session: SessionGroup = {
        sessionId: acc.sessionId,
        transcriptPath: acc.transcriptPath,
        cwd: acc.cwd,
        events: sortedEntries.map((entry) => entry.event),
      }
      return { session, lastTime: new Date(acc.lastTimeMs) }
    })

    list.sort((a, b) =>
      sortOrder === 'newest'
        ? b.lastTime.getTime() - a.lastTime.getTime()
        : a.lastTime.getTime() - b.lastTime.getTime()
    )

    return list
  }, [grouped, sortOrder])
```

Behavior preserved exactly: same grouping key, same cwd backfill, same lastTime (max event time), same sort directions. What changed: one `new Date()` per event total (was one per comparison), and toggling `sortOrder` no longer rebuilds the groups.

- [ ] **Step 2: Run the full frontend suite**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: PASS — existing events-page tests cover grouping and ordering.

- [ ] **Step 3: Format and commit**

Run: `cd frontend && npx prettier --write src/features/events/SessionList.tsx`

```bash
git add frontend/src/features/events/SessionList.tsx
git commit -m "perf(frontend): split session grouping from sorting, sort on precomputed timestamps"
```

---

### Task 17: Dashboard — skip update on identical payload, memo chart components

**Files:**
- Modify: `frontend/src/features/dashboard/hooks/useDashboardStats.ts:179-214`
- Modify: `frontend/src/features/dashboard/TokenTimelineChart.tsx:35`, `frontend/src/features/dashboard/ActivityPanel.tsx:33`

- [ ] **Step 1: Implement identical-payload skip**

In `useDashboardStats.ts`, add next to `statsCache` (line 81):

```ts
const rawTextCache = new Map<string, string>()
```

Replace the success branch of `fetchStats` (lines 193-199) with:

```ts
        if (res.ok) {
          const text = await res.text()
          // Identical payload → keep the existing object identity so every
          // downstream memo and chart skips re-rendering.
          if (rawTextCache.get(cacheKey) !== text) {
            rawTextCache.set(cacheKey, text)
            const data = normalizeDashboardStats(JSON.parse(text) as Partial<DashboardStats>)
            statsCache.set(cacheKey, data)
            if (mounted) {
              setSnapshot({ cacheKey, stats: data })
            }
          }
        }
```

- [ ] **Step 2: Memo-wrap the two chart components**

`TokenTimelineChart.tsx`: change the component declaration to

```tsx
export const TokenTimelineChart = memo(function TokenTimelineChart({
  stats,
  query = '',
}: TokenTimelineChartProps) {
```

and close with `})` at the end. Add `memo` to the React import: `import { memo, useMemo } from 'react'`.

`ActivityPanel.tsx`: same pattern —

```tsx
export const ActivityPanel = memo(function ActivityPanel({ stats, query }: ActivityPanelProps) {
```

closing `})`, `import { memo, useMemo } from 'react'`.

With stable `stats` identity from Step 1 and string `query` props, `memo` makes repeated parent renders skip both chart subtrees entirely.

- [ ] **Step 3: Run tests, format, commit**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx prettier --write src/features/dashboard/hooks/useDashboardStats.ts src/features/dashboard/TokenTimelineChart.tsx src/features/dashboard/ActivityPanel.tsx`
Expected: all pass.

```bash
git add frontend/src/features/dashboard/
git commit -m "perf(dashboard): skip state updates on identical stats payloads, memo chart components"
```

---

### Task 18: Final verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Full backend gates**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: all green. Paste any failure output instead of claiming success.

- [ ] **Step 2: Full frontend gates**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx eslint .`
Expected: all green.

- [ ] **Step 3: Manual QA — idle profile**

1. Start the backend and frontend dev server, open the Events page.
2. Open React DevTools → Profiler → start recording, hands off the keyboard for 30 seconds with no incoming events.
3. Expected: zero commits from `Layout`/`EventsPage`; only `HeaderClock` commits once per second.
4. Switch to another tab for 30 seconds, watch the network panel on return: no `/api/sessions` or `/api/projects` requests while hidden; one immediate request each on return.

Record the observed result here:

```
Idle profiler result: ____
Hidden-tab polling result: ____
```

- [ ] **Step 4: Update spec status and commit the plan**

```bash
git add docs/superpowers/plans/2026-06-13-cpu-optimization.md
git commit -m "docs: record CPU optimization benchmark and QA results"
```

---

## Known remaining work (accepted, out of scope)

- Codex `apply_patch` events read the target file once in `codex.Normalize` (hunk
  line-number resolution) and possibly once more in `handler.enrichContext`
  (context window) — 2 reads total, down from up to 2 per hunk. Removing the second
  read would require `codex.Normalize` to emit `CtxBefore`/`CtxAfter` itself;
  deferred until profiling shows it matters.

## Deviation notes vs the spec (already reflected above)

1. **Spec 2b "compute usage at write time"** — the codebase already computes usage at write time, but on *every* event (worse than the spec assumed). The implemented form is a 30s per-session throttle plus always-exact terminal events (Task 6), which both fixes the discovered hot-path cost and satisfies the spec's intent. The zero-usage upsert guard (Task 5) is a new prerequisite discovered from `UpsertSession`'s unconditional overwrite.
2. **Spec 2a "double transcript scan"** — resolved by deleting the read-path backfill (Task 7); `enrichDashboardStats` remains the single scan site, bounded by the 5s TTL cache (Task 8).
3. **Spec 4e "chart prop stability"** — the charts already memoize internally; the effective fix is payload-identity skip in `useDashboardStats` plus `memo()` wrappers (Task 17).
4. **Spec 4d "per-session sort memoized via Map"** — implemented as precomputed numeric timestamps + split memos (Task 16): same complexity win, no cache-invalidation risk from same-length filter swaps.
