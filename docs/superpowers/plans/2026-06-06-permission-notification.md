# Permission Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When argus receives a `PermissionRequest` hook, spawn a native macOS dialog so the developer can approve, deny, or select an option without leaving their current app — Claude Code blocks on the HTTP response until they respond (or 60s timeout → fall through to terminal).

**Architecture:** A new `internal/notify` package exposes a `Notifier` interface with platform-specific implementations (`notify_darwin.go` using `osascript`, `notify_other.go` as a no-op). The `handler.Hook` function gains a third `notify.Notifier` parameter; after storing the event it checks for `PermissionRequest` and calls `notifier.ShowPermissionDialog`, blocking the response until a decision is returned. Router and main wire the platform notifier through `server.Options`.

**Tech Stack:** Go stdlib (`os/exec`, `context`, `encoding/json`, `strings`), macOS `osascript` binary at `/usr/bin/osascript`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/internal/notify/notify.go` | `Decision` struct, `Notifier` interface |
| Create | `backend/internal/notify/notify_other.go` | No-op `NewPlatformNotifier` for non-darwin |
| Create | `backend/internal/notify/notify_darwin.go` | `darwinNotifier` — `osascript` dialogs |
| Create | `backend/internal/notify/notify_darwin_test.go` | Unit tests for darwin notifier |
| Modify | `backend/internal/handler/hook.go` | Add `notifier` param + permission intercept |
| Modify | `backend/internal/server/router.go` | Add `Notifier` to `Options`, wire to `Hook` |
| Modify | `backend/cmd/server/main.go` | Create notifier via `NewPlatformNotifier` |
| Modify | `backend/tests/internal/handler/hook_test.go` | Update `newHook`, add permission tests |

---

### Task 1: Create `internal/notify` types, interface, and no-op

**Files:**
- Create: `backend/internal/notify/notify.go`
- Create: `backend/internal/notify/notify_other.go`

- [ ] **Step 1: Create `notify.go`**

```go
// backend/internal/notify/notify.go
package notify

import (
	"context"

	"argus/internal/domain"
)

// Decision is the result of a user interaction with a permission dialog.
// Action is "approve", "block", or "" (empty = fall through to terminal).
type Decision struct {
	Action string
	Reason string // populated when Action == "block"
}

// Notifier shows a native OS dialog for PermissionRequest events.
type Notifier interface {
	ShowPermissionDialog(ctx context.Context, e domain.NormalizedEvent) (Decision, error)
}
```

- [ ] **Step 2: Create `notify_other.go`**

```go
// backend/internal/notify/notify_other.go
//go:build !darwin

package notify

import (
	"context"

	"argus/internal/domain"
)

type noopNotifier struct{}

func (noopNotifier) ShowPermissionDialog(_ context.Context, _ domain.NormalizedEvent) (Decision, error) {
	return Decision{}, nil
}

// NewPlatformNotifier returns a no-op notifier on non-darwin platforms.
func NewPlatformNotifier() Notifier {
	return noopNotifier{}
}
```

- [ ] **Step 3: Verify build**

```bash
cd backend && go build ./internal/notify/...
```

Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
cd backend
git add internal/notify/notify.go internal/notify/notify_other.go
git commit -m "feat(notify): add Notifier interface and no-op platform fallback"
```

---

### Task 2: Darwin notifier — approve/deny dialog

**Files:**
- Create: `backend/internal/notify/notify_darwin.go`
- Create: `backend/internal/notify/notify_darwin_test.go`

- [ ] **Step 1: Write failing tests for approve/deny/timeout cases**

```go
// backend/internal/notify/notify_darwin_test.go
//go:build darwin

package notify

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"argus/internal/domain"
)

// writeFakeOsascript creates a fake osascript binary in a temp dir that prints output and exits.
func writeFakeOsascript(t *testing.T, output string, exitCode int) string {
	t.Helper()
	dir := t.TempDir()
	script := filepath.Join(dir, "osascript")
	content := fmt.Sprintf("#!/bin/sh\necho %q\nexit %d\n", output, exitCode)
	if err := os.WriteFile(script, []byte(content), 0o755); err != nil {
		t.Fatal(err)
	}
	return script
}

func TestDarwinNotifierApprove(t *testing.T) {
	path := writeFakeOsascript(t, "button returned:Approve, gave up:false", 0)
	n := &darwinNotifier{osascriptPath: path}

	e := domain.NormalizedEvent{
		HookEventName: "PermissionRequest",
		Tool:          "Bash",
		Command:       "rm -rf node_modules",
	}

	d, err := n.ShowPermissionDialog(context.Background(), e)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.Action != "approve" {
		t.Errorf("Action = %q, want %q", d.Action, "approve")
	}
}

func TestDarwinNotifierDeny(t *testing.T) {
	path := writeFakeOsascript(t, "button returned:Deny, gave up:false", 0)
	n := &darwinNotifier{osascriptPath: path}

	e := domain.NormalizedEvent{
		HookEventName: "PermissionRequest",
		Tool:          "Write",
		Description:   "Write to /etc/hosts",
	}

	d, err := n.ShowPermissionDialog(context.Background(), e)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.Action != "block" {
		t.Errorf("Action = %q, want %q", d.Action, "block")
	}
	if d.Reason == "" {
		t.Error("Reason is empty, want non-empty")
	}
}

func TestDarwinNotifierTimeout(t *testing.T) {
	path := writeFakeOsascript(t, "button returned:, gave up:true", 0)
	n := &darwinNotifier{osascriptPath: path}

	e := domain.NormalizedEvent{
		HookEventName: "PermissionRequest",
		Tool:          "Bash",
	}

	d, err := n.ShowPermissionDialog(context.Background(), e)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.Action != "" {
		t.Errorf("Action = %q, want empty (fall through)", d.Action)
	}
}

func TestDarwinNotifierOsascriptFailure(t *testing.T) {
	path := writeFakeOsascript(t, "", 1) // non-zero exit = cancelled/error
	n := &darwinNotifier{osascriptPath: path}

	e := domain.NormalizedEvent{
		HookEventName: "PermissionRequest",
		Tool:          "Bash",
	}

	d, err := n.ShowPermissionDialog(context.Background(), e)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.Action != "" {
		t.Errorf("Action = %q, want empty (fall through on error)", d.Action)
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail (type not defined)**

```bash
cd backend && go test -run TestDarwinNotifier ./internal/notify/... 2>&1 | head -20
```

Expected: `undefined: darwinNotifier`

- [ ] **Step 3: Create `notify_darwin.go`**

```go
// backend/internal/notify/notify_darwin.go
//go:build darwin

package notify

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"argus/internal/domain"
)

type darwinNotifier struct {
	osascriptPath string
}

// NewPlatformNotifier returns a darwin notifier using /usr/bin/osascript.
func NewPlatformNotifier() Notifier {
	return &darwinNotifier{osascriptPath: "/usr/bin/osascript"}
}

func (n *darwinNotifier) ShowPermissionDialog(ctx context.Context, e domain.NormalizedEvent) (Decision, error) {
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	var script string
	var isChooseFromList bool

	if e.Tool == "AskUserQuestion" {
		script, isChooseFromList = buildAskScript(e.ToolInputQuestionsJSON)
	}
	if script == "" {
		script = buildDialogScript(e.Tool, firstNonEmpty(e.Description, e.Command))
		isChooseFromList = false
	}

	out, err := exec.CommandContext(ctx, n.osascriptPath, "-e", script).Output()
	if err != nil {
		// User cancelled, osascript crashed, or context deadline exceeded — fall through.
		return Decision{}, nil
	}

	result := strings.TrimSpace(string(out))

	if isChooseFromList {
		if result == "" || result == "false" {
			return Decision{}, nil
		}
		return Decision{Action: "block", Reason: "User selected: " + result}, nil
	}

	// display dialog output: "button returned:Approve, gave up:false"
	if strings.Contains(result, "gave up:true") {
		return Decision{}, nil
	}
	if strings.Contains(result, "button returned:Approve") {
		return Decision{Action: "approve"}, nil
	}
	if strings.Contains(result, "button returned:Deny") {
		return Decision{Action: "block", Reason: "Denied via notification"}, nil
	}
	return Decision{}, nil
}

// buildDialogScript builds an AppleScript display dialog for approve/deny permission checks.
func buildDialogScript(tool, detail string) string {
	msg := tool
	if detail != "" {
		if len(detail) > 200 {
			detail = detail[:200] + "…"
		}
		msg += "\n\n" + detail
	}
	return fmt.Sprintf(
		`display dialog %s buttons {"Deny", "Approve"} default button "Approve" giving up after 60 with title "Claude Code — Permission"`,
		escapeAS(msg),
	)
}

// buildAskScript builds an AppleScript choose from list for AskUserQuestion events.
// Returns the script and true, or ("", false) if the JSON is missing or malformed.
func buildAskScript(questionsJSON string) (string, bool) {
	if questionsJSON == "" {
		return "", false
	}
	var questions []struct {
		Question string `json:"question"`
		Options  []struct {
			Label string `json:"label"`
		} `json:"options"`
	}
	if err := json.Unmarshal([]byte(questionsJSON), &questions); err != nil || len(questions) == 0 {
		return "", false
	}
	q := questions[0]
	if len(q.Options) == 0 {
		return "", false
	}

	opts := make([]string, len(q.Options))
	for i, o := range q.Options {
		opts[i] = escapeAS(o.Label)
	}
	list := "{" + strings.Join(opts, ", ") + "}"

	return fmt.Sprintf(
		`choose from list %s with title "Claude Code — Question" with prompt %s default items {item 1 of %s} without multiple selections allowed and empty selection allowed`,
		list, escapeAS(q.Question), list,
	), true
}

// escapeAS wraps s in AppleScript double quotes, escaping any embedded double quotes.
func escapeAS(s string) string {
	return `"` + strings.ReplaceAll(s, `"`, `\"`) + `"`
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
```

- [ ] **Step 4: Run the failing tests — should now pass**

```bash
cd backend && go test -v -run TestDarwinNotifier ./internal/notify/...
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Run full build to confirm no breakage**

```bash
cd backend && go build ./...
```

Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
cd backend
git add internal/notify/notify_darwin.go internal/notify/notify_darwin_test.go
git commit -m "feat(notify): darwin notifier with osascript approve/deny dialog"
```

---

### Task 3: Darwin notifier — AskUserQuestion dialog

**Files:**
- Modify: `backend/internal/notify/notify_darwin_test.go`

- [ ] **Step 1: Add failing tests for AskUserQuestion**

Add these test functions to `notify_darwin_test.go`:

```go
func TestDarwinNotifierAskUserQuestionSelect(t *testing.T) {
	path := writeFakeOsascript(t, "Old session", 0)
	n := &darwinNotifier{osascriptPath: path}

	e := domain.NormalizedEvent{
		HookEventName: "PermissionRequest",
		Tool:          "AskUserQuestion",
		ToolInputQuestionsJSON: `[{
			"question": "What do you mean by 'not live'?",
			"header": "Clarify issue",
			"options": [
				{"label": "Old session", "description": "Session is from hours/days ago"},
				{"label": "Session ended", "description": "Session finished recently"}
			],
			"multiSelect": false
		}]`,
	}

	d, err := n.ShowPermissionDialog(context.Background(), e)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.Action != "block" {
		t.Errorf("Action = %q, want %q", d.Action, "block")
	}
	if !strings.Contains(d.Reason, "Old session") {
		t.Errorf("Reason = %q, want it to contain %q", d.Reason, "Old session")
	}
}

func TestDarwinNotifierAskUserQuestionCancelled(t *testing.T) {
	path := writeFakeOsascript(t, "false", 0)
	n := &darwinNotifier{osascriptPath: path}

	e := domain.NormalizedEvent{
		HookEventName: "PermissionRequest",
		Tool:          "AskUserQuestion",
		ToolInputQuestionsJSON: `[{
			"question": "Pick one",
			"options": [{"label": "A"}, {"label": "B"}]
		}]`,
	}

	d, err := n.ShowPermissionDialog(context.Background(), e)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if d.Action != "" {
		t.Errorf("Action = %q, want empty (fall through on cancel)", d.Action)
	}
}

func TestDarwinNotifierAskUserQuestionMalformedJSON(t *testing.T) {
	// Malformed ToolInputQuestionsJSON → falls back to display dialog (not choose from list)
	path := writeFakeOsascript(t, "button returned:Approve, gave up:false", 0)
	n := &darwinNotifier{osascriptPath: path}

	e := domain.NormalizedEvent{
		HookEventName:          "PermissionRequest",
		Tool:                   "AskUserQuestion",
		ToolInputQuestionsJSON: `not valid json`,
	}

	d, err := n.ShowPermissionDialog(context.Background(), e)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Falls back to dialog → approve
	if d.Action != "approve" {
		t.Errorf("Action = %q, want %q (fallback dialog)", d.Action, "approve")
	}
}
```

Add the `strings` import to the test file — update the import block:

```go
import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"argus/internal/domain"
)
```

- [ ] **Step 2: Run new tests — should PASS (implementation already handles these cases)**

```bash
cd backend && go test -v -run TestDarwinNotifierAsk ./internal/notify/...
```

Expected: all 3 tests PASS. The `buildAskScript` function in Task 2 already handles these cases.

- [ ] **Step 3: Run all notify tests**

```bash
cd backend && go test -v ./internal/notify/...
```

Expected: all 7 tests PASS.

- [ ] **Step 4: Commit**

```bash
cd backend
git add internal/notify/notify_darwin_test.go
git commit -m "test(notify): AskUserQuestion dialog selection, cancel, and malformed-JSON cases"
```

---

### Task 4: Hook handler — permission intercept

**Files:**
- Modify: `backend/internal/handler/hook.go`
- Modify: `backend/tests/internal/handler/hook_test.go`

- [ ] **Step 1: Write failing handler tests for permission intercept**

Find the `newHook` helper in `backend/tests/internal/handler/hook_test.go`. It currently looks like:

```go
func newHook(svc *service.EventService) http.Handler {
    return handler.Hook(svc, matchNoneMatcher{})
}
```

Add the following to `hook_test.go`. First, add `"argus/internal/notify"` to the import block:

```go
import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"argus/internal/domain"
	"argus/internal/handler"
	"argus/internal/notify"
	"argus/internal/repository/sqlite"
	"argus/internal/service"
)
```

Add a mock notifier and helper below the existing matchers:

```go
type mockNotifier struct {
	decision notify.Decision
	err      error
	called   bool
}

func (m *mockNotifier) ShowPermissionDialog(_ context.Context, _ domain.NormalizedEvent) (notify.Decision, error) {
	m.called = true
	return m.decision, m.err
}

func newHookWithNotifier(svc *service.EventService, notifier notify.Notifier) http.Handler {
	return handler.Hook(svc, matchNoneMatcher{}, notifier)
}
```

Add the new test functions:

```go
func TestHookHandlerPermissionRequestApprove(t *testing.T) {
	svc := newTestService(t)
	n := &mockNotifier{decision: notify.Decision{Action: "approve"}}
	h := newHookWithNotifier(svc, n)

	body := []byte(`{
		"session_id": "s-perm",
		"transcript_path": "/home/user/.claude/sessions/perm.jsonl",
		"hook_event_name": "PermissionRequest",
		"tool_name": "Bash",
		"cwd": "/tmp"
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var resp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["decision"] != "approve" {
		t.Errorf("decision = %q, want %q", resp["decision"], "approve")
	}
	if !n.called {
		t.Error("notifier was not called")
	}

	// Event must still be stored.
	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 {
		t.Errorf("stored events = %d, want 1", len(events))
	}
}

func TestHookHandlerPermissionRequestBlock(t *testing.T) {
	svc := newTestService(t)
	n := &mockNotifier{decision: notify.Decision{Action: "block", Reason: "Denied via notification"}}
	h := newHookWithNotifier(svc, n)

	body := []byte(`{
		"session_id": "s-deny",
		"transcript_path": "/home/user/.claude/sessions/deny.jsonl",
		"hook_event_name": "PermissionRequest",
		"tool_name": "Write",
		"cwd": "/tmp"
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var resp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["decision"] != "block" {
		t.Errorf("decision = %q, want %q", resp["decision"], "block")
	}
	if resp["reason"] != "Denied via notification" {
		t.Errorf("reason = %q, want %q", resp["reason"], "Denied via notification")
	}
}

func TestHookHandlerPermissionRequestFallThrough(t *testing.T) {
	svc := newTestService(t)
	n := &mockNotifier{decision: notify.Decision{}} // empty action = fall through
	h := newHookWithNotifier(svc, n)

	body := []byte(`{
		"session_id": "s-timeout",
		"transcript_path": "/home/user/.claude/sessions/timeout.jsonl",
		"hook_event_name": "PermissionRequest",
		"tool_name": "Bash",
		"cwd": "/tmp"
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	body2 := rec.Body.Bytes()
	if string(bytes.TrimSpace(body2)) != "{}" {
		t.Errorf("body = %q, want %q", string(body2), "{}")
	}
}

func TestHookHandlerPermissionRequestNilNotifier(t *testing.T) {
	// nil notifier must still store the event and return {}
	svc := newTestService(t)
	h := newHookWithNotifier(svc, nil)

	body := []byte(`{
		"session_id": "s-nil",
		"transcript_path": "/home/user/.claude/sessions/nil.jsonl",
		"hook_event_name": "PermissionRequest",
		"tool_name": "Bash",
		"cwd": "/tmp"
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if string(bytes.TrimSpace(rec.Body.Bytes())) != "{}" {
		t.Errorf("body = %q, want {}", rec.Body.String())
	}
}

func TestHookHandlerNonPermissionEventSkipsNotifier(t *testing.T) {
	svc := newTestService(t)
	n := &mockNotifier{decision: notify.Decision{Action: "approve"}}
	h := newHookWithNotifier(svc, n)

	body := []byte(`{
		"session_id": "s-bash",
		"transcript_path": "/home/user/.claude/sessions/bash.jsonl",
		"hook_event_name": "PreToolUse",
		"tool_name": "Bash",
		"cwd": "/tmp"
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if n.called {
		t.Error("notifier was called for non-PermissionRequest event, want not called")
	}
	if string(bytes.TrimSpace(rec.Body.Bytes())) != "{}" {
		t.Errorf("body = %q, want {}", rec.Body.String())
	}
}
```

- [ ] **Step 2: Run new tests — should FAIL (signature mismatch)**

```bash
cd backend && go test -run "TestHookHandlerPermission|TestHookHandlerNonPermission" ./tests/internal/handler/... 2>&1 | head -20
```

Expected: compile error — `handler.Hook` does not take 3 arguments.

- [ ] **Step 3: Update `handler/hook.go`**

Change the function signature and add the permission intercept. In `hook.go`:

1. Add import `"argus/internal/notify"` to the import block.

2. Add the `permissionResponse` struct before `Hook`:

```go
type permissionResponse struct {
	Decision string `json:"decision"`
	Reason   string `json:"reason,omitempty"`
}
```

3. Change the `Hook` signature from:
```go
func Hook(svc *service.EventService, matcher IgnoreMatcher) http.Handler {
```
to:
```go
func Hook(svc *service.EventService, matcher IgnoreMatcher, notifier notify.Notifier) http.Handler {
```

4. After the `svc.AddEvent(e)` call and its error branch, add the permission intercept block. The existing code at the end of the handler is:

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

Replace it with:

```go
	if err := svc.AddEvent(e); err != nil {
		slog.Error("hook store event", "err", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{}`))
		return
	}

	// Permission intercept: hold response open while user decides in native dialog.
	// Falls through (writes {}) on timeout, dismiss, or nil notifier.
	if e.HookEventName == "PermissionRequest" && notifier != nil {
		decision, notifyErr := notifier.ShowPermissionDialog(r.Context(), e)
		if notifyErr == nil && decision.Action != "" {
			w.Header().Set("Content-Type", "application/json")
			if err := json.NewEncoder(w).Encode(permissionResponse{
				Decision: decision.Action,
				Reason:   decision.Reason,
			}); err != nil {
				slog.Error("hook encode permission response", "err", err)
			}
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{}`))
```

- [ ] **Step 4: Update `newHook` in test file to pass `nil` notifier**

Find:
```go
func newHook(svc *service.EventService) http.Handler {
	return handler.Hook(svc, matchNoneMatcher{})
}
```

Replace with:
```go
func newHook(svc *service.EventService) http.Handler {
	return handler.Hook(svc, matchNoneMatcher{}, nil)
}
```

- [ ] **Step 5: Run all handler tests**

```bash
cd backend && go test -v ./tests/internal/handler/... 2>&1 | tail -30
```

Expected: all tests PASS including the 5 new permission tests.

- [ ] **Step 6: Run full test suite**

```bash
cd backend && go test ./...
```

Expected: all tests PASS.

- [ ] **Step 7: Run lint**

```bash
cd backend && golangci-lint run ./...
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd backend
git add internal/handler/hook.go tests/internal/handler/hook_test.go
git commit -m "feat(handler): intercept PermissionRequest events with native OS dialog"
```

---

### Task 5: Router and main wiring

**Files:**
- Modify: `backend/internal/server/router.go`
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Add `Notifier` to `server.Options` in `router.go`**

Add `"argus/internal/notify"` to the import block in `router.go`.

Add the `Notifier` field to the `Options` struct after the existing fields:

```go
// Notifier shows native OS permission dialogs for PermissionRequest hook events.
// If nil, permission events fall through to the terminal prompt (safe default).
Notifier notify.Notifier
```

- [ ] **Step 2: Wire notifier to `Hook` in `router.go`**

Find:
```go
mux.Handle("POST /api/hook", handler.Hook(svc, m))
```

Replace with:
```go
mux.Handle("POST /api/hook", handler.Hook(svc, m, opts.Notifier))
```

- [ ] **Step 3: Verify router compiles**

```bash
cd backend && go build ./internal/server/...
```

Expected: exit 0.

- [ ] **Step 4: Add notifier creation to `cmd/server/main.go`**

Add `"argus/internal/notify"` to the import block in `main.go`.

In the `run()` function, find the block where `server.NewRouter` is called:

```go
h := server.NewRouter(svc, repo, repo.Ready, server.Options{
    Matcher:     matcher,
    CORSOrigins: cfg.CORSOrigins,
    DBPath:      cfg.DBPath,
    IgnoreFile:  domainIgnoreFile(ignoreStatus),
    Addr:        cfg.Addr,
    AllowRemote:        cfg.AllowRemote,
    ClaudeSettingsPath: filepath.Join(home, ".claude", "settings.json"),
    CodexHooksPath:     filepath.Join(home, ".codex", "hooks.json"),
})
```

Add `Notifier: notify.NewPlatformNotifier(),` to the Options:

```go
h := server.NewRouter(svc, repo, repo.Ready, server.Options{
    Matcher:     matcher,
    CORSOrigins: cfg.CORSOrigins,
    DBPath:      cfg.DBPath,
    IgnoreFile:  domainIgnoreFile(ignoreStatus),
    Addr:        cfg.Addr,
    AllowRemote:        cfg.AllowRemote,
    ClaudeSettingsPath: filepath.Join(home, ".claude", "settings.json"),
    CodexHooksPath:     filepath.Join(home, ".codex", "hooks.json"),
    Notifier:           notify.NewPlatformNotifier(),
})
```

- [ ] **Step 5: Run full build**

```bash
cd backend && go build ./...
```

Expected: exit 0, no output.

- [ ] **Step 6: Run full test suite**

```bash
cd backend && go test ./...
```

Expected: all tests PASS.

- [ ] **Step 7: Run lint**

```bash
cd backend && golangci-lint run ./...
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd backend
git add internal/server/router.go cmd/server/main.go
git commit -m "feat(server): wire platform notifier into hook handler via Options"
```

---

## Verification

After all tasks complete, verify end-to-end:

1. Start argus: `cd backend && go run ./cmd/server/`
2. Send a fake `PermissionRequest` hook:
   ```bash
   curl -s -X POST http://127.0.0.1:8765/api/hook \
     -H "Content-Type: application/json" \
     -d '{
       "session_id": "test-session",
       "transcript_path": "/home/user/.claude/sessions/test.jsonl",
       "hook_event_name": "PermissionRequest",
       "tool_name": "Bash",
       "description": "Delete temp files",
       "cwd": "/tmp"
     }'
   ```
3. A macOS dialog should appear: **"Claude Code — Permission"** with Bash + description, buttons Deny / Approve.
4. Click **Approve** → `curl` receives `{"decision":"approve"}`.
5. Click **Deny** → `curl` receives `{"decision":"block","reason":"Denied via notification"}`.
6. Wait 60s without responding → `curl` receives `{}`.
7. Verify the event appears in the argus UI (SSE broadcast happened before dialog).
