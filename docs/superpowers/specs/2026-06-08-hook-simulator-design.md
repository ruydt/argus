# Hook Simulator Design

**Date:** 2026-06-08
**Status:** Approved

## Overview

Add a Hook Simulator tab to the Hooks Config page. Users pick an event type, pick which configured hook command to test, edit a pre-filled mock JSON payload, run it, and see stdout/stderr/exit code inline — without waiting for a real agent session.

## Problem

No way to test hook commands in-app. The only option is manually constructing a curl command in the terminal. Slow feedback loop when writing or debugging hooks.

## Solution

Third view mode tab (Terminal icon) in the existing right-side toggle on the Hooks Config page, alongside Structured and JSON views. Agent-scoped — the claudecode/codex agent tabs continue to work normally.

---

## Backend

### New endpoint

`POST /api/hooks/simulate`

**New file:** `backend/internal/handler/hooks_simulate.go`

**Request body:**
```json
{
  "command": "curl -s --max-time 2 -X POST http://127.0.0.1:10804/api/hook -H 'Content-Type: application/json' -d @- || true",
  "payload": {
    "hook_event_name": "PreToolUse",
    "session_id": "sim-abc123",
    "cwd": "/Users/dev/project",
    "transcript_path": "/Users/dev/.claude/projects/-Users-dev-project/sim.jsonl",
    "tool_name": "Bash",
    "tool_input": { "command": "npm test" }
  }
}
```

The frontend sends `command` as a plain string (extracted from the selected hook entry in the loaded config). Backend does not re-read any config file.

**Response:**
```json
{
  "stdout": "...",
  "stderr": "...",
  "exit_code": 0,
  "duration_ms": 42
}
```

**Implementation:**
- Marshal `payload` to JSON bytes
- Run `sh -c <command>` with payload bytes piped to stdin
- `context.WithTimeout` — 10s hard limit (matches hook contract)
- Capture stdout and stderr separately via `cmd.StdoutPipe` / `cmd.StderrPipe`
- Return 200 regardless of exit code (non-zero exit is a valid test result, not a server error)
- Return 400 if command is empty or payload is invalid JSON

**Security:** localhost-only service; command comes from user-authored hooks config. Same trust level as the existing `PUT /api/hooks-config/:agent` endpoint.

**Wire in router:** `router.go` — add `POST /api/hooks/simulate` alongside existing hook config routes.

**Tests:** `backend/internal/handler/hooks_simulate_test.go`
- Success: command exits 0, captures stdout
- Non-zero exit: returns exit code, captures stderr
- Timeout: command sleeps > 10s, returns error
- Empty command: returns 400

---

## Frontend

### New files

**`frontend/src/features/hooks-config/SimulatorTab.tsx`**

Props:
```ts
type SimulatorTabProps = {
  agent: AgentKey
  config: HooksConfig | null
}
```

Layout (top to bottom):

1. **Selectors row** — two `Select` primitives side by side:
   - Event type: options from `Object.keys(config.hooks)` that have at least one hook command
   - Hook command: options from the selected event's groups, labeled as `group[i] → command` (truncated to 60 chars)

2. **JSON editor** — same CodeMirror setup as the JSON view tab (`json()`, `argusEditorTheme`, `argusHighlighting`, `editableExtensions`). Pre-filled from `hookTemplates.ts` when event type changes. User can freely edit.

3. **Run button** — right-aligned `Button` with Terminal icon. Disabled while request is in-flight or when no command is selected. Shows spinner while running.

4. **Output section** — only rendered after first run:
   - Header row: exit code `Badge` (green variant for 0, destructive for nonzero) + duration chip (`text-muted-foreground`)
   - Stdout block: `ScrollArea` with monospace pre block, dark background, always shown
   - Stderr block: same styling with red tint border, only shown when stderr is non-empty

State managed locally inside `SimulatorTab` with `useState`. No custom hook needed — single `fetch` call, no polling.

**`frontend/src/features/hooks-config/hookTemplates.ts`**

Exported map: `Record<AgentKey, Record<string, object>>` — keyed by agent, then event type name.

Common base fields used in all templates:
```ts
const BASE_CLAUDECODE = {
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
```

Full template definitions per agent:

#### Claude Code templates

| Event | Extra fields |
|---|---|
| `SessionStart` | `source: "startup"`, `model: "claude-sonnet-4-6"` |
| `Setup` | `trigger: "init"` |
| `SessionEnd` | `reason: "clear"` |
| `UserPromptSubmit` | `prompt: "write a hello world in Go"`, `permission_mode: "default"` |
| `UserPromptExpansion` | `command_name: "gsd-debug"`, `command_input: "/gsd-debug auth bug"`, `expanded_prompt: "Debug the auth bug..."` |
| `PreToolUse` | `tool_name: "Bash"`, `tool_input: { command: "npm test" }`, `permission_mode: "default"`, `effort: { level: "medium" }` |
| `PostToolUse` | same as PreToolUse + `tool_output: "PASS: 42 tests passed"` |
| `PostToolUseFailure` | `tool_name: "Bash"`, `tool_input: { command: "npm test" }`, `error: "command not found: npm"`, `effort: { level: "medium" }` |
| `PostToolBatch` | `tool_calls: [{ tool_name: "Read", tool_input: { file_path: "/app/main.go" }, tool_output: "package main", status: "success" }]`, `effort: { level: "medium" }` |
| `PermissionRequest` | `tool_name: "Bash"`, `tool_input: { command: "rm -rf dist/" }`, `permission_mode: "default"`, `permission_type: "bash_command"` |
| `PermissionDenied` | `tool_name: "Bash"`, `tool_input: { command: "rm -rf dist/" }`, `reason: "user denied"` |
| `Stop` | `effort: { level: "medium" }`, `permission_mode: "default"` |
| `StopFailure` | `error_type: "rate_limit"`, `error_message: "Rate limit exceeded. Retry after 60s."` |
| `SubagentStart` | `agent_type: "Explore"`, `agent_id: "sub-xyz789"` |
| `SubagentStop` | `agent_type: "Explore"`, `agent_id: "sub-xyz789"`, `effort: { level: "medium" }` |
| `TeammateIdle` | `agent_type: "Explore"` |
| `TaskCreated` | `task_id: "task-001"`, `task_title: "Fix authentication bug"` |
| `TaskCompleted` | `task_id: "task-001"`, `task_title: "Fix authentication bug"` |
| `FileChanged` | `file_path: "/Users/dev/project/src/auth.go"`, `change_type: "modified"` |
| `CwdChanged` | `new_cwd: "/Users/dev/project/frontend"`, `previous_cwd: "/Users/dev/project"` |
| `ConfigChange` | `source: "project_settings"`, `changed_keys: ["hooks"]` |
| `InstructionsLoaded` | `file_path: "/Users/dev/project/CLAUDE.md"`, `memory_type: "Project"`, `load_reason: "session_start"` |
| `MessageDisplay` | `message_text: "I've analyzed the codebase and found 3 potential issues."` |
| `Notification` | `notification_type: "permission_prompt"`, `message: "Allow Bash(npm test)?"` |
| `PreCompact` | `trigger: "auto"` |
| `PostCompact` | `trigger: "auto"` |
| `WorktreeCreate` | `isolation_method: "worktree"`, `base_path: "/Users/dev/project/.worktrees"` |
| `WorktreeRemove` | `worktree_path: "/Users/dev/project/.worktrees/agent-abc"` |
| `Elicitation` | `server_name: "github"`, `tool_name: "create_pr"`, `form_schema: { title: { type: "string" } }`, `tool_input: {}` |
| `ElicitationResult` | `server_name: "github"`, `tool_name: "create_pr"`, `form_data: { title: "Fix auth bug" }` |

#### Codex templates

| Event | Extra fields |
|---|---|
| `SessionStart` | `source: "startup"` |
| `UserPromptSubmit` | `turn_id: "turn-001"`, `prompt: "write a hello world in Go"` |
| `PreToolUse` | `turn_id: "turn-001"`, `tool_name: "bash"`, `tool_use_id: "tool-abc"`, `tool_input: { cmd: "npm test" }` |
| `PermissionRequest` | `turn_id: "turn-001"`, `tool_name: "bash"`, `tool_input: { cmd: "rm -rf dist/", description: "Delete build artifacts" }` |
| `PostToolUse` | `turn_id: "turn-001"`, `tool_name: "bash"`, `tool_use_id: "tool-abc"`, `tool_input: { cmd: "npm test" }`, `tool_response: { output: "PASS: 42 tests passed", exit_code: 0 }` |
| `Stop` | `turn_id: "turn-001"`, `stop_hook_active: false`, `last_assistant_message: "Done! The tests pass."` |
| `SubagentStart` | `turn_id: "turn-001"`, `agent_id: "sub-xyz789"`, `agent_type: "researcher"` |
| `SubagentStop` | `turn_id: "turn-001"`, `agent_id: "sub-xyz789"`, `agent_type: "researcher"`, `stop_hook_active: false`, `agent_transcript_path: null`, `last_assistant_message: null` |
| `PreCompact` | `turn_id: "turn-001"`, `trigger: "auto"` |
| `PostCompact` | `turn_id: "turn-001"`, `trigger: "auto"` |

### Changes to existing files

**`HooksConfigPage.tsx`:**
- Add `'simulator'` to `ViewMode` type
- Add third `TabsTrigger` with `TerminalIcon` from lucide-react, value `"simulator"`, aria-label `"Simulator"`
- Add `TabsContent value="simulator"` inside each agent's `TabsContent` that renders `<SimulatorTab agent={agent} config={activeState.config} />`
- Hide Save button and dirty indicator when `viewMode === 'simulator'` (they don't apply)

**No changes to:** `types.ts`, `StructuredEditor.tsx`, `useHooksConfig.ts`, `presets.ts`

---

## Data flow

```
User selects event type
  → hookTemplates[agent][eventType] → pre-fill editor

User selects hook command
  → store command string in local state

User clicks Run
  → POST /api/hooks/simulate { command, payload }
  → backend: sh -c <command> with JSON on stdin, 10s timeout
  → response: { stdout, stderr, exit_code, duration_ms }
  → render output section
```

---

## Out of scope

- Saving simulation results
- Replaying real captured events as simulations (future: "Re-run" button on EventRow)
- Streaming output (most hooks finish in <1s; streaming adds complexity without value)
- Running multiple hook commands in sequence
