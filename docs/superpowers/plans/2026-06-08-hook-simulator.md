# Hook Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Simulator tab to the Hooks Config page where users can pick a configured hook command, edit a pre-filled mock JSON payload, run it, and see stdout/stderr/exit code inline.

**Architecture:** New `POST /api/hooks/simulate` backend endpoint execs the user-supplied command with the payload JSON piped to stdin and returns stdout/stderr/exit_code/duration_ms. Frontend adds a third view mode tab (Terminal icon) to the existing right-side toggle on the Hooks Config page, rendering `SimulatorTab` which manages all state locally.

**Tech Stack:** Go stdlib (`os/exec`, `context`), React 19, CodeMirror 6, shadcn `Select`/`Badge`/`ScrollArea`/`Button`, lucide-react `Terminal` icon.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/internal/handler/hooks_simulate.go` | POST /api/hooks/simulate handler |
| Create | `backend/tests/internal/handler/hooks_simulate_test.go` | Handler tests |
| Modify | `backend/internal/server/router.go` | Register new route |
| Create | `frontend/src/features/hooks-config/hookTemplates.ts` | Realistic mock payloads keyed by agent + event type |
| Create | `frontend/src/features/hooks-config/SimulatorTab.tsx` | Simulator UI component |
| Modify | `frontend/src/features/hooks-config/HooksConfigPage.tsx` | Add simulator view mode tab |

---

## Task 1: Backend — write failing handler tests

**Files:**
- Create: `backend/tests/internal/handler/hooks_simulate_test.go`

- [ ] **Step 1: Create the test file**

```go
package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"runtime"
	"testing"

	"argus/internal/handler"
)

func TestHooksSimulateRejectsGET(t *testing.T) {
	h := handler.HooksSimulate()
	req := httptest.NewRequest(http.MethodGet, "/api/hooks/simulate", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestHooksSimulateEmptyCommand(t *testing.T) {
	h := handler.HooksSimulate()
	body := `{"command":"","payload":{"hook_event_name":"SessionStart"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/hooks/simulate",
		bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHooksSimulateInvalidRequestJSON(t *testing.T) {
	h := handler.HooksSimulate()
	req := httptest.NewRequest(http.MethodPost, "/api/hooks/simulate",
		bytes.NewBufferString("not json"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHooksSimulateSuccess(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("sh not available on Windows")
	}
	h := handler.HooksSimulate()
	body := `{"command":"echo hello","payload":{"hook_event_name":"SessionStart","session_id":"sim-abc123"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/hooks/simulate",
		bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Stdout     string `json:"stdout"`
		Stderr     string `json:"stderr"`
		ExitCode   int    `json:"exit_code"`
		DurationMs int64  `json:"duration_ms"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.ExitCode != 0 {
		t.Fatalf("exit_code = %d, want 0", resp.ExitCode)
	}
	if resp.Stdout != "hello\n" {
		t.Fatalf("stdout = %q, want %q", resp.Stdout, "hello\n")
	}
	if resp.DurationMs < 0 {
		t.Fatalf("duration_ms = %d, want >= 0", resp.DurationMs)
	}
}

func TestHooksSimulateNonZeroExit(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("sh not available on Windows")
	}
	h := handler.HooksSimulate()
	body := `{"command":"exit 2","payload":{"hook_event_name":"Stop"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/hooks/simulate",
		bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (non-zero exit is not a server error)", rec.Code)
	}
	var resp struct {
		ExitCode int `json:"exit_code"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.ExitCode != 2 {
		t.Fatalf("exit_code = %d, want 2", resp.ExitCode)
	}
}

func TestHooksSimulatePayloadArrivesOnStdin(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("sh not available on Windows")
	}
	h := handler.HooksSimulate()
	// `cat` echoes stdin to stdout — verifies payload is piped correctly
	body := `{"command":"cat","payload":{"hook_event_name":"PreToolUse","tool_name":"Bash"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/hooks/simulate",
		bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Stdout string `json:"stdout"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	var got map[string]any
	if err := json.Unmarshal([]byte(resp.Stdout), &got); err != nil {
		t.Fatalf("stdout is not valid JSON: %v — got %q", err, resp.Stdout)
	}
	if got["hook_event_name"] != "PreToolUse" {
		t.Fatalf("hook_event_name = %v, want PreToolUse", got["hook_event_name"])
	}
	if got["tool_name"] != "Bash" {
		t.Fatalf("tool_name = %v, want Bash", got["tool_name"])
	}
}

func TestHooksSimulateStderrCaptured(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("sh not available on Windows")
	}
	h := handler.HooksSimulate()
	body := `{"command":"echo err-msg >&2; exit 1","payload":{"hook_event_name":"Stop"}}`
	req := httptest.NewRequest(http.MethodPost, "/api/hooks/simulate",
		bytes.NewBufferString(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var resp struct {
		Stderr   string `json:"stderr"`
		ExitCode int    `json:"exit_code"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.ExitCode != 1 {
		t.Fatalf("exit_code = %d, want 1", resp.ExitCode)
	}
	if resp.Stderr != "err-msg\n" {
		t.Fatalf("stderr = %q, want %q", resp.Stderr, "err-msg\n")
	}
}
```

- [ ] **Step 2: Run to confirm they fail (HooksSimulate not yet defined)**

```bash
cd backend && go test ./tests/internal/handler/... -run TestHooksSimulate -v 2>&1 | head -20
```

Expected: compile error — `undefined: handler.HooksSimulate`

---

## Task 2: Backend — implement HooksSimulate handler

**Files:**
- Create: `backend/internal/handler/hooks_simulate.go`

- [ ] **Step 1: Create the handler**

```go
package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os/exec"
	"time"
)

type simulateRequest struct {
	Command string          `json:"command"`
	Payload json.RawMessage `json:"payload"`
}

type simulateResponse struct {
	Stdout     string `json:"stdout"`
	Stderr     string `json:"stderr"`
	ExitCode   int    `json:"exit_code"`
	DurationMs int64  `json:"duration_ms"`
}

func HooksSimulate() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req simulateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		if req.Command == "" {
			http.Error(w, "command is required", http.StatusBadRequest)
			return
		}
		if len(req.Payload) == 0 || !json.Valid(req.Payload) {
			http.Error(w, "payload must be valid JSON", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		cmd := exec.CommandContext(ctx, "sh", "-c", req.Command)
		cmd.Stdin = bytes.NewReader(req.Payload)

		var stdout, stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr

		start := time.Now()
		runErr := cmd.Run()
		durationMs := time.Since(start).Milliseconds()

		exitCode := 0
		if runErr != nil {
			if exitErr, ok := runErr.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				// context deadline exceeded or OS-level failure
				exitCode = -1
				if stderr.Len() == 0 {
					stderr.WriteString("hook timed out after 10s")
				}
			}
		}

		resp := simulateResponse{
			Stdout:     stdout.String(),
			Stderr:     stderr.String(),
			ExitCode:   exitCode,
			DurationMs: durationMs,
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			_ = err
		}
	})
}
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
cd backend && go test ./tests/internal/handler/... -run TestHooksSimulate -v
```

Expected: all 7 `TestHooksSimulate*` tests PASS.

- [ ] **Step 3: Run full test suite — no regressions**

```bash
cd backend && go test ./...
```

Expected: all tests PASS.

---

## Task 3: Backend — wire route and lint

**Files:**
- Modify: `backend/internal/server/router.go`

- [ ] **Step 1: Add route to router**

In `backend/internal/server/router.go`, after the existing hooks-config routes (lines 100–101), add:

```go
mux.Handle("POST /api/hooks/simulate", handler.HooksSimulate())
```

The block should now read:

```go
mux.Handle("GET /api/hooks-config", handler.HooksConfig(opts.ClaudeSettingsPath, opts.CodexHooksPath))
mux.Handle("PUT /api/hooks-config", handler.HooksConfig(opts.ClaudeSettingsPath, opts.CodexHooksPath))
mux.Handle("POST /api/hooks/simulate", handler.HooksSimulate())
mux.Handle("GET /", ui.Handler())
```

- [ ] **Step 2: Build and lint**

```bash
cd backend && go build ./... && golangci-lint run ./...
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/internal/handler/hooks_simulate.go \
        backend/tests/internal/handler/hooks_simulate_test.go \
        backend/internal/server/router.go
git commit -m "feat(backend): add POST /api/hooks/simulate endpoint"
```

---

## Task 4: Frontend — hook payload templates

**Files:**
- Create: `frontend/src/features/hooks-config/hookTemplates.ts`

- [ ] **Step 1: Create the file**

```ts
import type { AgentKey } from './types'

const BASE_CC = {
  session_id: 'sim-abc123',
  transcript_path: '/Users/dev/.claude/projects/-Users-dev-project/sim.jsonl',
  cwd: '/Users/dev/project',
}

const BASE_CODEX = {
  session_id: 'sim-abc123',
  transcript_path: null,
  cwd: '/Users/dev/project',
  model: 'codex-mini-latest',
  permission_mode: 'default',
}

export const HOOK_TEMPLATES: Record<AgentKey, Record<string, object>> = {
  claudecode: {
    SessionStart: { ...BASE_CC, hook_event_name: 'SessionStart', source: 'startup', model: 'claude-sonnet-4-6' },
    Setup: { ...BASE_CC, hook_event_name: 'Setup', trigger: 'init' },
    SessionEnd: { ...BASE_CC, hook_event_name: 'SessionEnd', reason: 'clear' },
    UserPromptSubmit: { ...BASE_CC, hook_event_name: 'UserPromptSubmit', prompt: 'write a hello world in Go', permission_mode: 'default' },
    UserPromptExpansion: { ...BASE_CC, hook_event_name: 'UserPromptExpansion', command_name: 'gsd-debug', command_input: '/gsd-debug auth bug', expanded_prompt: 'Debug the auth bug...' },
    PreToolUse: { ...BASE_CC, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, permission_mode: 'default', effort: { level: 'medium' } },
    PostToolUse: { ...BASE_CC, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_output: 'PASS: 42 tests passed', permission_mode: 'default', effort: { level: 'medium' } },
    PostToolUseFailure: { ...BASE_CC, hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'npm test' }, error: 'command not found: npm', effort: { level: 'medium' } },
    PostToolBatch: { ...BASE_CC, hook_event_name: 'PostToolBatch', tool_calls: [{ tool_name: 'Read', tool_input: { file_path: '/app/main.go' }, tool_output: 'package main', status: 'success' }], effort: { level: 'medium' } },
    PermissionRequest: { ...BASE_CC, hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'rm -rf dist/' }, permission_mode: 'default', permission_type: 'bash_command' },
    PermissionDenied: { ...BASE_CC, hook_event_name: 'PermissionDenied', tool_name: 'Bash', tool_input: { command: 'rm -rf dist/' }, reason: 'user denied' },
    Stop: { ...BASE_CC, hook_event_name: 'Stop', effort: { level: 'medium' }, permission_mode: 'default' },
    StopFailure: { ...BASE_CC, hook_event_name: 'StopFailure', error_type: 'rate_limit', error_message: 'Rate limit exceeded. Retry after 60s.' },
    SubagentStart: { ...BASE_CC, hook_event_name: 'SubagentStart', agent_type: 'Explore', agent_id: 'sub-xyz789' },
    SubagentStop: { ...BASE_CC, hook_event_name: 'SubagentStop', agent_type: 'Explore', agent_id: 'sub-xyz789', effort: { level: 'medium' } },
    TeammateIdle: { ...BASE_CC, hook_event_name: 'TeammateIdle', agent_type: 'Explore' },
    TaskCreated: { ...BASE_CC, hook_event_name: 'TaskCreated', task_id: 'task-001', task_title: 'Fix authentication bug' },
    TaskCompleted: { ...BASE_CC, hook_event_name: 'TaskCompleted', task_id: 'task-001', task_title: 'Fix authentication bug' },
    FileChanged: { ...BASE_CC, hook_event_name: 'FileChanged', file_path: '/Users/dev/project/src/auth.go', change_type: 'modified' },
    CwdChanged: { ...BASE_CC, hook_event_name: 'CwdChanged', new_cwd: '/Users/dev/project/frontend', previous_cwd: '/Users/dev/project' },
    ConfigChange: { ...BASE_CC, hook_event_name: 'ConfigChange', source: 'project_settings', changed_keys: ['hooks'] },
    InstructionsLoaded: { ...BASE_CC, hook_event_name: 'InstructionsLoaded', file_path: '/Users/dev/project/CLAUDE.md', memory_type: 'Project', load_reason: 'session_start' },
    MessageDisplay: { ...BASE_CC, hook_event_name: 'MessageDisplay', message_text: "I've analyzed the codebase and found 3 potential issues." },
    Notification: { ...BASE_CC, hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Allow Bash(npm test)?' },
    PreCompact: { ...BASE_CC, hook_event_name: 'PreCompact', trigger: 'auto' },
    PostCompact: { ...BASE_CC, hook_event_name: 'PostCompact', trigger: 'auto' },
    WorktreeCreate: { ...BASE_CC, hook_event_name: 'WorktreeCreate', isolation_method: 'worktree', base_path: '/Users/dev/project/.worktrees' },
    WorktreeRemove: { ...BASE_CC, hook_event_name: 'WorktreeRemove', worktree_path: '/Users/dev/project/.worktrees/agent-abc' },
    Elicitation: { ...BASE_CC, hook_event_name: 'Elicitation', server_name: 'github', tool_name: 'create_pr', form_schema: { title: { type: 'string' } }, tool_input: {} },
    ElicitationResult: { ...BASE_CC, hook_event_name: 'ElicitationResult', server_name: 'github', tool_name: 'create_pr', form_data: { title: 'Fix auth bug' } },
  },
  codex: {
    SessionStart: { ...BASE_CODEX, hook_event_name: 'SessionStart', source: 'startup' },
    UserPromptSubmit: { ...BASE_CODEX, hook_event_name: 'UserPromptSubmit', turn_id: 'turn-001', prompt: 'write a hello world in Go' },
    PreToolUse: { ...BASE_CODEX, hook_event_name: 'PreToolUse', turn_id: 'turn-001', tool_name: 'bash', tool_use_id: 'tool-abc', tool_input: { cmd: 'npm test' } },
    PermissionRequest: { ...BASE_CODEX, hook_event_name: 'PermissionRequest', turn_id: 'turn-001', tool_name: 'bash', tool_input: { cmd: 'rm -rf dist/', description: 'Delete build artifacts' } },
    PostToolUse: { ...BASE_CODEX, hook_event_name: 'PostToolUse', turn_id: 'turn-001', tool_name: 'bash', tool_use_id: 'tool-abc', tool_input: { cmd: 'npm test' }, tool_response: { output: 'PASS: 42 tests passed', exit_code: 0 } },
    Stop: { ...BASE_CODEX, hook_event_name: 'Stop', turn_id: 'turn-001', stop_hook_active: false, last_assistant_message: 'Done! The tests pass.' },
    SubagentStart: { ...BASE_CODEX, hook_event_name: 'SubagentStart', turn_id: 'turn-001', agent_id: 'sub-xyz789', agent_type: 'researcher' },
    SubagentStop: { ...BASE_CODEX, hook_event_name: 'SubagentStop', turn_id: 'turn-001', agent_id: 'sub-xyz789', agent_type: 'researcher', stop_hook_active: false, agent_transcript_path: null, last_assistant_message: null },
    PreCompact: { ...BASE_CODEX, hook_event_name: 'PreCompact', turn_id: 'turn-001', trigger: 'auto' },
    PostCompact: { ...BASE_CODEX, hook_event_name: 'PostCompact', turn_id: 'turn-001', trigger: 'auto' },
  },
}

export function getTemplate(agent: AgentKey, eventType: string): object {
  return (
    HOOK_TEMPLATES[agent][eventType] ?? {
      hook_event_name: eventType,
      session_id: 'sim-abc123',
      cwd: '/Users/dev/project',
    }
  )
}
```

- [ ] **Step 2: Type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

---

## Task 5: Frontend — SimulatorTab component

**Files:**
- Create: `frontend/src/features/hooks-config/SimulatorTab.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react'
import { json } from '@codemirror/lang-json'
import CodeMirror from '@uiw/react-codemirror'
import { RefreshCw, Terminal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { argusEditorTheme, argusHighlighting, editableExtensions } from '@/lib/editorTheme'
import { getTemplate } from './hookTemplates'
import type { AgentKey, HooksConfig } from './types'

type SimulateResult = {
  stdout: string
  stderr: string
  exit_code: number
  duration_ms: number
}

export type SimulatorTabProps = {
  agent: AgentKey
  config: HooksConfig | null
}

type CommandOption = {
  label: string
  command: string
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function SimulatorTab({ agent, config }: SimulatorTabProps) {
  const [eventType, setEventType] = useState<string>('')
  const [command, setCommand] = useState<string>('')
  const [payloadJSON, setPayloadJSON] = useState<string>('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eventTypes: string[] = config
    ? Object.entries(config.hooks)
        .filter(([, groups]) => groups.some((g) => g.hooks.length > 0))
        .map(([et]) => et)
        .sort()
    : []

  const commandOptions: CommandOption[] = (() => {
    if (!config || !eventType) return []
    const groups = config.hooks[eventType] ?? []
    const opts: CommandOption[] = []
    groups.forEach((g, gi) => {
      g.hooks.forEach((h, hi) => {
        opts.push({
          label: `group ${gi + 1} hook ${hi + 1} → ${truncate(h.command, 60)}`,
          command: h.command,
        })
      })
    })
    return opts
  })()

  function handleEventTypeChange(et: string) {
    setEventType(et)
    setCommand('')
    setResult(null)
    setError(null)
    setPayloadJSON(JSON.stringify(getTemplate(agent, et), null, 2))
  }

  function handleCommandChange(cmd: string) {
    setCommand(cmd)
    setResult(null)
    setError(null)
  }

  async function handleRun() {
    if (!command) return
    let payload: unknown
    try {
      payload = JSON.parse(payloadJSON)
    } catch {
      setError('Payload JSON is invalid')
      return
    }
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const resp = await fetch('/api/hooks/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload }),
      })
      if (!resp.ok) {
        const msg = await resp.text()
        setError(`Server error: ${msg}`)
        return
      }
      setResult((await resp.json()) as SimulateResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  if (!config || eventTypes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-foreground">No hooks configured</p>
        <p className="text-xs text-muted-foreground">
          Add hooks in the Structured or JSON view first
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 mt-4">
      <div className="flex gap-3">
        <Select value={eventType} onValueChange={handleEventTypeChange}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select event type" />
          </SelectTrigger>
          <SelectContent>
            {eventTypes.map((et) => (
              <SelectItem key={et} value={et}>
                {et}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={command}
          onValueChange={handleCommandChange}
          disabled={commandOptions.length === 0}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select hook command" />
          </SelectTrigger>
          <SelectContent>
            {commandOptions.map((opt) => (
              <SelectItem key={opt.command} value={opt.command}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {eventType && (
        <div className="rounded-md border overflow-hidden">
          <CodeMirror
            value={payloadJSON}
            onChange={setPayloadJSON}
            extensions={[json(), argusEditorTheme, argusHighlighting, ...editableExtensions]}
            theme="none"
            height="280px"
            basicSetup={{
              lineNumbers: true,
              highlightActiveLine: true,
              bracketMatching: true,
              autocompletion: false,
              foldGutter: true,
            }}
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button
          variant="default"
          size="sm"
          onClick={() => void handleRun()}
          disabled={!command || running}
        >
          {running ? (
            <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
          ) : (
            <Terminal className="size-3.5 mr-1.5" />
          )}
          Run
        </Button>
      </div>

      {error !== null && <p className="text-[12px] text-destructive">{error}</p>}

      {result !== null && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Badge variant={result.exit_code === 0 ? 'default' : 'destructive'}>
              exit {result.exit_code}
            </Badge>
            <span className="text-[12px] text-muted-foreground">{result.duration_ms}ms</span>
          </div>

          <div className="rounded-md border overflow-hidden bg-[#0d1117]">
            <ScrollArea className="h-[180px]">
              <pre className="p-3 text-[12px] font-mono text-[#e6edf3] whitespace-pre-wrap break-all">
                {result.stdout || (
                  <span className="text-[#8b949e]">(no output)</span>
                )}
              </pre>
            </ScrollArea>
          </div>

          {result.stderr && (
            <div className="rounded-md border border-destructive/40 overflow-hidden bg-[rgba(255,95,86,0.05)]">
              <ScrollArea className="h-[120px]">
                <pre className="p-3 text-[12px] font-mono text-destructive whitespace-pre-wrap break-all">
                  {result.stderr}
                </pre>
              </ScrollArea>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

---

## Task 6: Frontend — wire SimulatorTab into HooksConfigPage

**Files:**
- Modify: `frontend/src/features/hooks-config/HooksConfigPage.tsx`

- [ ] **Step 1: Apply all changes to HooksConfigPage.tsx**

Replace the top of the file through the `ViewMode` type definition:

```tsx
import { useState } from 'react'
import { json } from '@codemirror/lang-json'
import CodeMirror from '@uiw/react-codemirror'
import { AppWindowIcon, Check, CodeIcon, Copy, ExternalLink, RefreshCw, Save, Terminal } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { argusEditorTheme, argusHighlighting, editableExtensions } from '@/lib/editorTheme'
import { SimulatorTab } from './SimulatorTab'
import { StructuredEditor } from './StructuredEditor'
import { useHooksConfig } from './hooks/useHooksConfig'
import type { AgentKey, HooksConfig, HooksConfigState } from './types'

type ViewMode = 'structured' | 'json' | 'simulator'
```

Replace the `handleViewModeChange` function body to guard simulator mode:

```tsx
function handleViewModeChange(nextMode: string) {
  const mode = nextMode as ViewMode
  if (mode === viewMode) return
  if (mode === 'structured') {
    if (!jsonIsValid) return
    try {
      activeState.setConfig(JSON.parse(activeState.draftJSON) as HooksConfig)
    } catch {
      return
    }
  }
  setViewMode(mode)
}
```

Replace the header actions `div` (Save button + dirty indicator) to hide when in simulator mode:

```tsx
<div className="flex items-center gap-2">
  {viewMode !== 'simulator' && activeState.isDirty && !activeState.loading && (
    <span className="text-[12px] text-[var(--cwd)]">Unsaved changes</span>
  )}
  {viewMode !== 'simulator' && !activeState.isDirty && !activeState.loading && activeState.error === null && (
    <span className="text-[12px] text-muted-foreground">Saved</span>
  )}
  {viewMode !== 'simulator' && (
    <Button
      variant="default"
      size="sm"
      onClick={() => void activeState.save()}
      disabled={!canSave}
      aria-label="Save hooks config"
    >
      {activeState.saving ? (
        <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
      ) : (
        <Save className="size-3.5 mr-1.5" />
      )}
      Save
    </Button>
  )}
</div>
```

Replace the right-side view mode `TabsList` to add the simulator trigger:

```tsx
<Tabs value={viewMode} onValueChange={handleViewModeChange}>
  <TabsList>
    <TabsTrigger
      value="structured"
      aria-label="Structured"
      disabled={viewMode === 'json' && !jsonIsValid}
      title={
        viewMode === 'json' && !jsonIsValid
          ? 'Fix JSON errors before switching to structured view'
          : undefined
      }
    >
      <AppWindowIcon />
    </TabsTrigger>
    <TabsTrigger value="json" aria-label="JSON">
      <CodeIcon />
    </TabsTrigger>
    <TabsTrigger value="simulator" aria-label="Simulator">
      <Terminal />
    </TabsTrigger>
  </TabsList>
</Tabs>
```

Replace the `AgentTabContent` render block to add simulator case. Inside `AgentTabContent`, after the closing `{viewMode === 'json' && ...}` block and before the `saveError` alert, add:

```tsx
{viewMode === 'simulator' && (
  <SimulatorTab agent={agent} config={config} />
)}
```

The full updated `AgentTabContent` return becomes:

```tsx
return (
  <div className="flex flex-col gap-4 mt-4">
    {viewMode === 'structured' && config !== null && (
      <StructuredEditor
        config={config}
        agent={agent}
        isDirty={state.isDirty}
        onDiscardChanges={state.discardChanges}
        onChange={setConfig}
      />
    )}

    {viewMode === 'json' && (
      <div className="flex flex-col gap-1">
        <section
          className={cn(
            'relative rounded-md border overflow-hidden',
            !jsonIsValid && 'border-destructive'
          )}
          aria-label="Hooks config JSON"
        >
          <button
            type="button"
            onClick={handleCopy}
            className="absolute top-2 right-2 z-10 flex items-center justify-center size-7 rounded text-[#8b949e] hover:text-[#e6edf3] hover:bg-white/10 transition-colors"
            aria-label="Copy JSON"
            title="Copy JSON"
          >
            {copied ? (
              <Check className="size-3.5 text-green-400" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
          <CodeMirror
            value={draftJSON}
            onChange={(value) => setDraftJSON(value)}
            extensions={[json(), argusEditorTheme, argusHighlighting, ...editableExtensions]}
            theme="none"
            height="calc(100dvh - 220px)"
            minHeight="320px"
            basicSetup={{
              lineNumbers: true,
              highlightActiveLine: true,
              bracketMatching: true,
              autocompletion: false,
              foldGutter: true,
            }}
          />
        </section>
        {!jsonIsValid && <p className="text-[12px] text-destructive mt-0.5">Invalid JSON</p>}
      </div>
    )}

    {viewMode === 'simulator' && (
      <SimulatorTab agent={agent} config={config} />
    )}

    {saveError !== null && (
      <Alert className="border-destructive bg-[rgba(255,95,86,0.08)]">
        <AlertDescription className="text-[13px] text-destructive">{saveError}</AlertDescription>
      </Alert>
    )}
  </div>
)
```

- [ ] **Step 2: Type check + Vitest**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: no type errors, all tests pass.

- [ ] **Step 3: Prettier**

```bash
cd frontend && npx prettier --write src/features/hooks-config/hookTemplates.ts src/features/hooks-config/SimulatorTab.tsx src/features/hooks-config/HooksConfigPage.tsx
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/hooks-config/hookTemplates.ts \
        frontend/src/features/hooks-config/SimulatorTab.tsx \
        frontend/src/features/hooks-config/HooksConfigPage.tsx
git commit -m "feat(frontend): add hook simulator tab to hooks config page"
```

---

## Self-review checklist

- [x] `POST /api/hooks/simulate` — Task 2 + Task 3
- [x] Request: `command` string + `payload` JSON object — Task 2
- [x] Response: `stdout`, `stderr`, `exit_code`, `duration_ms` — Task 2
- [x] 10s timeout with fallback stderr message — Task 2
- [x] 400 on empty command or invalid payload — Task 1 + Task 2
- [x] Route wired in router.go — Task 3
- [x] `hookTemplates.ts` — all 30 Claude Code events + 10 Codex events — Task 4
- [x] `SimulatorTab` — event type selector, command selector, CodeMirror editor, Run button, output panel — Task 5
- [x] `HooksConfigPage` — third tab trigger (Terminal icon), hide Save/dirty in simulator mode — Task 6
- [x] Empty-config guard (no hooks configured message) — Task 5
- [x] `getTemplate` fallback for unknown event types — Task 4
- [x] Type names consistent: `SimulatorTabProps`, `SimulateResult`, `CommandOption` throughout Tasks 5–6
