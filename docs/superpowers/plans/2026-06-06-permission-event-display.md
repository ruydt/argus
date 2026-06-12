# Permission Event Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface tool_input.description, AskUserQuestion questions, and permission_suggestions in the events page so PermissionRequest/PreToolUse events are human-readable without opening the raw modal.

**Architecture:** Add `Questions json.RawMessage` to `ToolInput` and `PermissionSuggestions json.RawMessage` to `RawPayload` in the backend domain. Marshal both to strings through both normalizers into two new NormalizedEvent fields, persist to two new SQLite columns via migration 011, surface via the existing events API. Frontend adds `description` display to `CommandBlock`, a new `PermissionBlock` renderer for PERMISSION events, and wires both into `EventRow`.

**Tech Stack:** Go (backend domain, normalizers, SQLite repository), TypeScript/React (frontend types, renderers), SQLite migration (ALTER TABLE), Vitest + Testing Library (frontend tests), Go stdlib testing (backend tests)

---

## File Map

| File | Change |
|------|--------|
| `backend/internal/domain/hook.go` | Add `Questions json.RawMessage` to `ToolInput`; add `PermissionSuggestions json.RawMessage` to `RawPayload` |
| `backend/internal/domain/event.go` | Add `ToolInputQuestionsJSON` and `PermissionSuggestionsJSON` string fields to `NormalizedEvent` |
| `backend/internal/agents/claudecode/claudecode.go` | Add `marshalRawJSON` helper; wire two new fields in `Normalize()` |
| `backend/internal/agents/codex/codex.go` | Wire same two new fields in `Normalize()` |
| `backend/internal/repository/sqlite/migrations/011_permission_fields.sql` | **Create** — two `ALTER TABLE` statements |
| `backend/internal/repository/sqlite/sqlite.go` | Register migration 011; add two columns to INSERT and SELECT/Scan |
| `backend/tests/internal/handler/hook_test.go` | Add normalization tests for new fields |
| `frontend/src/types/events.ts` | Add `tool_input_questions_json` and `permission_suggestions_json` optional fields |
| `frontend/src/features/events/renderers/CommandBlock.tsx` | Add optional `description` prop + Intent label |
| `frontend/src/features/events/renderers/PermissionBlock.tsx` | **Create** — AskUserQuestion card + permission suggestions chips |
| `frontend/src/features/events/EventRow.tsx` | Pass `description` to `CommandBlock`; add `PermissionBlock` for PERMISSION action |
| `frontend/tests/features/events/EventRow.test.tsx` | Add tests for description display and PermissionBlock rendering |

---

## Task 1: Backend domain — capture new fields

**Files:**
- Modify: `backend/internal/domain/hook.go`
- Modify: `backend/internal/domain/event.go`

- [ ] **Step 1: Add Questions to ToolInput**

In `backend/internal/domain/hook.go`, update `ToolInput`:

```go
type ToolInput struct {
	FilePath    string          `json:"file_path"`
	Command     string          `json:"command"`
	Description string          `json:"description"`
	OldString   string          `json:"old_string"`
	NewString   string          `json:"new_string"`
	OldStr      string          `json:"old_str"`
	NewStr      string          `json:"new_str"`
	Content     string          `json:"content"`
	Questions   json.RawMessage `json:"questions"`
}
```

- [ ] **Step 2: Add PermissionSuggestions to RawPayload**

In `backend/internal/domain/hook.go`, update the `// Permission / approval fields` section:

```go
// Permission / approval fields
PermissionMode        string          `json:"permission_mode"`
PermissionSuggestions json.RawMessage `json:"permission_suggestions"`
```

- [ ] **Step 3: Add two fields to NormalizedEvent**

In `backend/internal/domain/event.go`, add after the `PermissionMode` field (around line 37):

```go
PermissionMode           string `json:"permission_mode,omitempty"`
ToolInputQuestionsJSON   string `json:"tool_input_questions_json,omitempty"`
PermissionSuggestionsJSON string `json:"permission_suggestions_json,omitempty"`
```

- [ ] **Step 4: Verify build**

```bash
cd backend && go build ./...
```

Expected: no output, exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/domain/hook.go backend/internal/domain/event.go
git commit -m "feat(domain): capture Questions and PermissionSuggestions in hook payload structs"
```

---

## Task 2: claudecode normalizer — wire new fields

**Files:**
- Modify: `backend/internal/agents/claudecode/claudecode.go`

- [ ] **Step 1: Add marshalRawJSON helper**

At the end of `backend/internal/agents/claudecode/claudecode.go`, add:

```go
// marshalRawJSON converts a json.RawMessage to its string representation.
// Returns "" for nil or empty input so callers can use the zero value check.
func marshalRawJSON(b json.RawMessage) string {
	if len(b) == 0 {
		return ""
	}
	return string(b)
}
```

- [ ] **Step 2: Wire new fields in Normalize()**

In `claudecode.go`'s `Normalize()` function, add two lines to the `domain.NormalizedEvent` literal — after `Description: p.ToolInput.Description,`:

```go
Description:              p.ToolInput.Description,
ToolInputQuestionsJSON:   marshalRawJSON(p.ToolInput.Questions),
PermissionSuggestionsJSON: marshalRawJSON(p.PermissionSuggestions),
```

- [ ] **Step 3: Verify build**

```bash
cd backend && go build ./...
```

Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/agents/claudecode/claudecode.go
git commit -m "feat(claudecode): wire ToolInputQuestionsJSON and PermissionSuggestionsJSON through normalizer"
```

---

## Task 3: codex normalizer — wire new fields

**Files:**
- Modify: `backend/internal/agents/codex/codex.go`

- [ ] **Step 1: Wire new fields in codex Normalize()**

In `codex.go`'s `Normalize()` return statement (around line 367), add after `Description: p.ToolInput.Description,`:

```go
Description:              p.ToolInput.Description,
ToolInputQuestionsJSON:   marshalRawJSON(p.ToolInput.Questions),
PermissionSuggestionsJSON: marshalRawJSON(p.PermissionSuggestions),
```

- [ ] **Step 2: Add marshalRawJSON helper to codex.go**

At the end of `backend/internal/agents/codex/codex.go`, add:

```go
func marshalRawJSON(b json.RawMessage) string {
	if len(b) == 0 {
		return ""
	}
	return string(b)
}
```

- [ ] **Step 3: Verify build**

```bash
cd backend && go build ./...
```

Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/agents/codex/codex.go
git commit -m "feat(codex): wire ToolInputQuestionsJSON and PermissionSuggestionsJSON through normalizer"
```

---

## Task 4: SQLite migration and repository wiring

**Files:**
- Create: `backend/internal/repository/sqlite/migrations/011_permission_fields.sql`
- Modify: `backend/internal/repository/sqlite/sqlite.go`

- [ ] **Step 1: Create migration file**

Create `backend/internal/repository/sqlite/migrations/011_permission_fields.sql`:

```sql
ALTER TABLE hook_events ADD COLUMN tool_input_questions_json TEXT NOT NULL DEFAULT '';
ALTER TABLE hook_events ADD COLUMN permission_suggestions_json TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 2: Register migration in sqlite.go**

In `backend/internal/repository/sqlite/sqlite.go`, add the embed directive after `schema009`:

```go
//go:embed migrations/009_new_event_fields.sql
var schema009 string

//go:embed migrations/010_add_created_at_index.sql
var schema010 string

//go:embed migrations/011_permission_fields.sql
var schema011 string
```

- [ ] **Step 3: Add migration to the migrations slice**

In `sqlite.go`, `schema010` exists as a file but is NOT yet embedded or referenced. Add it alongside `schema011`. The full `//go:embed` block and migrations slice should look like:

```go
//go:embed migrations/009_new_event_fields.sql
var schema009 string

//go:embed migrations/010_add_created_at_index.sql
var schema010 string

//go:embed migrations/011_permission_fields.sql
var schema011 string
```

In the `migrate()` function, extend the `migrations` slice:

```go
migrations := []struct {
    version int
    sql     string
}{
    {1, schema001},
    {2, schema002},
    {3, schema003},
    {4, schema004},
    {5, schema005},
    {6, schema006},
    {7, schema007},
    {8, schema008},
    {9, schema009},
    {10, schema010},
    {11, schema011},
}
```

- [ ] **Step 4: Add new columns to INSERT statement**

In `Add()`, extend the INSERT column list and values. Current last columns:
```
expansion_type, command_name, memory_type, load_reason, branch, server_name
```

Change to:
```
expansion_type, command_name, memory_type, load_reason, branch, server_name,
tool_input_questions_json, permission_suggestions_json
```

Add the `?` placeholders and values accordingly. The full INSERT becomes:

```go
_, err := d.db.ExecContext(ctx, `
    INSERT OR IGNORE INTO hook_events (
        created_at, agent, session_id, hook_event_name, turn_id, tool_use_id,
        tool_name, model, source, cwd, transcript_path,
        action, path, command, old_string, new_string, start_line,
        ctx_before, ctx_after, raw_payload, dedup_key,
        prompt, description, permission_mode, response,
        error_message, error_type,
        subagent_id, subagent_type,
        task_id, task_title, task_description,
        notification_type, notification_title, notification_message,
        change_type, old_cwd, new_cwd, tool_calls_json,
        tool_result_stdout, tool_result_stderr, duration_ms, trigger,
        normalizer_version, agent_version, normalization_status,
        expansion_type, command_name, memory_type, load_reason, branch, server_name,
        tool_input_questions_json, permission_suggestions_json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    e.Time, e.Agent, e.Session, e.HookEventName, e.TurnID, e.ToolUseID,
    e.Tool, e.Model, e.Source, e.CWD, e.TranscriptPath,
    nullStr(e.Action), nullStr(e.Path), nullStr(e.Command),
    nullStr(e.OldString), nullStr(e.NewString), nullInt(e.StartLine),
    jsonSlice(e.CtxBefore), jsonSlice(e.CtxAfter),
    string(e.RawPayload), dedupKey(e),
    nullStr(e.Prompt), nullStr(e.Description), nullStr(e.PermissionMode), nullStr(e.Response),
    nullStr(e.ErrorMessage), nullStr(e.ErrorType),
    nullStr(e.SubagentID), nullStr(e.SubagentType),
    nullStr(e.TaskID), nullStr(e.TaskTitle), nullStr(e.TaskDescription),
    nullStr(e.NotificationType), nullStr(e.NotificationTitle), nullStr(e.NotificationMessage),
    nullStr(e.ChangeType), nullStr(e.OldCWD), nullStr(e.NewCWD), nullStr(e.ToolCallsJSON),
    nullStr(e.ToolResultStdout), nullStr(e.ToolResultStderr), nullInt(e.DurationMS), nullStr(e.Trigger),
    nullStr(e.NormalizerVersion), nullStr(e.AgentVersion), normalizationStatus(e.NormalizationStatus),
    nullStr(e.ExpansionType), nullStr(e.CommandName), nullStr(e.MemoryType),
    nullStr(e.LoadReason), nullStr(e.Branch), nullStr(e.ServerName),
    nullStr(e.ToolInputQuestionsJSON), nullStr(e.PermissionSuggestionsJSON),
)
```

Count the `?` placeholders: should be 54.

- [ ] **Step 5: Add new columns to SELECT in listWithWhere()**

In `listWithWhere()`, the SELECT ends with:
```sql
COALESCE(branch,''), COALESCE(server_name,''),
COALESCE(dedup_key,'')
```

Change to:
```sql
COALESCE(branch,''), COALESCE(server_name,''),
COALESCE(tool_input_questions_json,''), COALESCE(permission_suggestions_json,''),
COALESCE(dedup_key,'')
```

- [ ] **Step 6: Add new fields to rows.Scan() call**

In the `rows.Scan()` call inside `listWithWhere()`, the current last fields are:
```go
&e.Branch, &e.ServerName,
&e.DedupKey,
```

Change to:
```go
&e.Branch, &e.ServerName,
&e.ToolInputQuestionsJSON, &e.PermissionSuggestionsJSON,
&e.DedupKey,
```

- [ ] **Step 7: Build and run all backend tests**

```bash
cd backend && go build ./... && go test ./...
```

Expected: all tests pass, no compilation errors.

- [ ] **Step 8: Commit**

```bash
git add backend/internal/repository/sqlite/migrations/011_permission_fields.sql backend/internal/repository/sqlite/sqlite.go
git commit -m "feat(sqlite): add tool_input_questions_json and permission_suggestions_json columns (migration 011)"
```

---

## Task 5: Backend tests for new normalizer fields

**Files:**
- Modify: `backend/tests/internal/handler/hook_test.go`

- [ ] **Step 1: Write failing test for AskUserQuestion questions capture**

Add to `backend/tests/internal/handler/hook_test.go`:

```go
func TestHookHandlerCapturesAskUserQuestionFields(t *testing.T) {
	svc := newTestService(t)
	h := newHook(svc)

	body := []byte(`{
		"session_id": "s-ask",
		"transcript_path": "/home/user/.claude/sessions/ask.jsonl",
		"hook_event_name": "PermissionRequest",
		"tool_name": "AskUserQuestion",
		"tool_use_id": "tu-ask",
		"turn_id": "t-ask",
		"cwd": "/tmp",
		"tool_input": {
			"questions": [
				{
					"question": "What do you mean by 'not live'?",
					"header": "Clarify issue",
					"options": [
						{"label": "Old session", "description": "Session is from hours/days ago"},
						{"label": "Session ended", "description": "Session finished recently"}
					],
					"multiSelect": false
				}
			]
		},
		"permission_suggestions": [
			{
				"type": "addRules",
				"rules": [{"toolName": "Bash", "ruleContent": "xargs cat"}],
				"behavior": "allow",
				"destination": "localSettings"
			}
		]
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events len = %d, want 1", len(events))
	}

	e := events[0]
	if e.ToolInputQuestionsJSON == "" {
		t.Error("ToolInputQuestionsJSON is empty, want non-empty")
	}
	var questions []struct {
		Question string `json:"question"`
		Header   string `json:"header"`
	}
	if err := json.Unmarshal([]byte(e.ToolInputQuestionsJSON), &questions); err != nil {
		t.Fatalf("ToolInputQuestionsJSON is not valid JSON: %v", err)
	}
	if len(questions) != 1 {
		t.Fatalf("questions len = %d, want 1", len(questions))
	}
	if questions[0].Header != "Clarify issue" {
		t.Errorf("header = %q, want %q", questions[0].Header, "Clarify issue")
	}

	if e.PermissionSuggestionsJSON == "" {
		t.Error("PermissionSuggestionsJSON is empty, want non-empty")
	}
	var suggestions []struct {
		Behavior    string `json:"behavior"`
		Destination string `json:"destination"`
	}
	if err := json.Unmarshal([]byte(e.PermissionSuggestionsJSON), &suggestions); err != nil {
		t.Fatalf("PermissionSuggestionsJSON is not valid JSON: %v", err)
	}
	if len(suggestions) != 1 || suggestions[0].Behavior != "allow" {
		t.Errorf("suggestions = %v, want [{behavior:allow ...}]", suggestions)
	}
}

func TestHookHandlerEmptyFieldsWhenMissing(t *testing.T) {
	svc := newTestService(t)
	h := newHook(svc)

	body := []byte(`{
		"session_id": "s-plain",
		"transcript_path": "/home/user/.claude/sessions/plain.jsonl",
		"hook_event_name": "PreToolUse",
		"tool_name": "Bash",
		"tool_use_id": "tu-plain",
		"turn_id": "t-plain",
		"cwd": "/tmp",
		"tool_input": {"command": "ls -la", "description": "List files"}
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	events, err := svc.ListEvents(10)
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events len = %d, want 1", len(events))
	}
	e := events[0]
	if e.ToolInputQuestionsJSON != "" {
		t.Errorf("ToolInputQuestionsJSON = %q, want empty", e.ToolInputQuestionsJSON)
	}
	if e.PermissionSuggestionsJSON != "" {
		t.Errorf("PermissionSuggestionsJSON = %q, want empty", e.PermissionSuggestionsJSON)
	}
	if e.Description != "List files" {
		t.Errorf("Description = %q, want %q", e.Description, "List files")
	}
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd backend && go test ./tests/internal/handler/... -run TestHookHandlerCapturesAskUserQuestionFields -v
cd backend && go test ./tests/internal/handler/... -run TestHookHandlerEmptyFieldsWhenMissing -v
```

Expected: both PASS.

- [ ] **Step 3: Run full backend test suite**

```bash
cd backend && go test ./...
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/internal/handler/hook_test.go
git commit -m "test(handler): verify AskUserQuestion and permission_suggestions capture"
```

---

## Task 6: Frontend types

**Files:**
- Modify: `frontend/src/types/events.ts`

- [ ] **Step 1: Add two optional fields to EventRecord**

In `frontend/src/types/events.ts`, add these two fields to the `EventRecord` interface after `server_name?`:

```ts
server_name?: string
tool_input_questions_json?: string
permission_suggestions_json?: string
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/events.ts
git commit -m "feat(types): add tool_input_questions_json and permission_suggestions_json to EventRecord"
```

---

## Task 7: CommandBlock — description display

**Files:**
- Modify: `frontend/src/features/events/renderers/CommandBlock.tsx`

- [ ] **Step 1: Add description prop and Intent label**

Replace the entire `CommandBlock.tsx` with:

```tsx
import type { ReactNode } from 'react'
import { highlight } from '@/lib/format'
import { CopyIconButton } from './CopyIconButton'

type CommandBlockProps = {
  prompt?: string
  command?: string
  path?: string
  description?: string
  searchQuery?: string
}

export function CommandBlock({ prompt, command, path, description, searchQuery = '' }: CommandBlockProps) {
  const label = prompt ? 'Prompt' : command ? 'Command' : path ? 'File' : 'Shell'
  const textToCopy = prompt || command || path || ''

  return (
    <div
      className="group/eblock mt-2 select-text rounded-[6px] border border-white/[0.05] bg-black/30 px-3 py-2 text-[0.75rem] text-[#ccc]"
      data-event-drag-ignore
    >
      <div className="flex items-center justify-between gap-3">
        <strong className="text-[#aaa] text-[0.7rem]">{label}</strong>
        <CopyIconButton
          text={textToCopy}
          label={label.toLowerCase()}
          className="opacity-0 group-hover/eblock:opacity-100 focus-visible:opacity-100"
        />
      </div>
      {prompt ? (
        <pre className="mt-1 mb-0 max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words font-[inherit] text-[0.75rem] text-[#a0a0a0]">
          {highlight(prompt, searchQuery) as ReactNode}
        </pre>
      ) : (
        <pre className="mt-1 mb-0 whitespace-pre-wrap break-words text-[0.75rem] text-[#a0a0a0] max-h-[300px] overflow-y-auto font-[inherit]">
          {highlight(command || '', searchQuery) as ReactNode}
        </pre>
      )}
      {description && (
        <p className="mt-1 mb-0 text-[0.7rem] text-[#777]">
          <span className="text-[#555]">Intent:</span> {description}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/events/renderers/CommandBlock.tsx
git commit -m "feat(CommandBlock): show description as Intent label when present"
```

---

## Task 8: PermissionBlock renderer

**Files:**
- Create: `frontend/src/features/events/renderers/PermissionBlock.tsx`

- [ ] **Step 1: Create PermissionBlock.tsx**

Create `frontend/src/features/events/renderers/PermissionBlock.tsx`:

```tsx
type Question = {
  question: string
  header: string
  multiSelect?: boolean
  options: Array<{ label: string; description: string }>
}

type PermissionSuggestion = {
  type: string
  rules: Array<{ toolName: string; ruleContent: string }>
  behavior: string
  destination: string
}

type PermissionBlockProps = {
  toolName?: string
  toolInputQuestionsJson?: string
  permissionSuggestionsJson?: string
}

function parseJSON<T>(raw: string | undefined): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function PermissionBlock({
  toolName,
  toolInputQuestionsJson,
  permissionSuggestionsJson,
}: PermissionBlockProps) {
  const questions =
    toolName === 'AskUserQuestion'
      ? parseJSON<Question[]>(toolInputQuestionsJson)
      : null

  const suggestions = parseJSON<PermissionSuggestion[]>(permissionSuggestionsJson)

  if (!questions && !suggestions) return null

  return (
    <div className="mt-2 flex flex-col gap-2">
      {questions &&
        questions.map((q, qi) => (
          <div
            key={qi}
            className="select-text rounded-[6px] border border-white/[0.05] bg-black/30 px-3 py-2 text-[0.75rem] text-[#ccc]"
            data-event-drag-ignore
          >
            <strong className="text-[#aaa] text-[0.7rem]">{q.header}</strong>
            <p className="mt-1 mb-2 text-[0.75rem] text-[#c8c8c8]">{q.question}</p>
            <ul className="m-0 flex flex-col gap-1 p-0 list-none">
              {q.options.map((opt, oi) => (
                <li key={oi} className="flex gap-2">
                  <span className="mt-[2px] shrink-0 text-[0.65rem] text-[#555]">
                    {q.multiSelect ? '□' : '○'}
                  </span>
                  <span>
                    <span className="text-[0.73rem] text-[#aaa]">{opt.label}</span>
                    {opt.description && (
                      <span className="ml-1 text-[0.7rem] text-[#666]">— {opt.description}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}

      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1" data-event-drag-ignore>
          {suggestions.map((s, si) =>
            s.rules.map((r, ri) => (
              <span
                key={`${si}-${ri}`}
                className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-black/20 px-2 py-0.5 text-[0.68rem]"
              >
                <span
                  className={
                    s.behavior === 'allow' ? 'text-[#4ade80]' : 'text-[#f87171]'
                  }
                >
                  {s.behavior}
                </span>
                <span className="text-[#888]">
                  &quot;{r.ruleContent}&quot; → {s.destination}
                </span>
              </span>
            ))
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/events/renderers/PermissionBlock.tsx
git commit -m "feat(PermissionBlock): new renderer for AskUserQuestion cards and permission suggestions"
```

---

## Task 9: Wire PermissionBlock and description into EventRow

**Files:**
- Modify: `frontend/src/features/events/EventRow.tsx`

- [ ] **Step 1: Import PermissionBlock**

Add import at the top of `EventRow.tsx`, after the existing renderer imports:

```tsx
import { PermissionBlock } from './renderers/PermissionBlock'
```

- [ ] **Step 2: Pass description to CommandBlock**

Find the `CommandBlock` usage in `EventRow.tsx` (around line 147):

```tsx
<CommandBlock
  prompt={e.prompt}
  command={e.command}
  path={e.path}
  searchQuery={searchQuery}
/>
```

Change to:

```tsx
<CommandBlock
  prompt={e.prompt}
  command={e.command}
  path={e.path}
  description={e.description}
  searchQuery={searchQuery}
/>
```

- [ ] **Step 3: Add PermissionBlock render for PERMISSION action**

In `EventRow.tsx`, after the `{e.action === 'INSTRUCT' && ...}` block (around line 229), add:

```tsx
{e.action === 'PERMISSION' && (
  <PermissionBlock
    toolName={e.tool}
    toolInputQuestionsJson={e.tool_input_questions_json}
    permissionSuggestionsJson={e.permission_suggestions_json}
  />
)}
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/events/EventRow.tsx
git commit -m "feat(EventRow): wire description to CommandBlock and add PermissionBlock for PERMISSION events"
```

---

## Task 10: Frontend tests

**Files:**
- Modify: `frontend/tests/features/events/EventRow.test.tsx`

- [ ] **Step 1: Add tests for description display and PermissionBlock**

Add to `frontend/tests/features/events/EventRow.test.tsx`:

```tsx
describe('EventRow description display', () => {
  it('shows Intent label when description is set', () => {
    render(
      <EventRow
        event={buildEvent({ action: 'BASH', command: 'ls -la', description: 'List project files' })}
        searchQuery=""
      />
    )
    expect(screen.getByText('Intent:')).toBeTruthy()
    expect(screen.getByText('List project files')).toBeTruthy()
  })

  it('does not show Intent label when description is absent', () => {
    render(<EventRow event={buildEvent({ action: 'BASH', command: 'ls -la' })} searchQuery="" />)
    expect(screen.queryByText('Intent:')).toBeNull()
  })
})

describe('EventRow PermissionBlock', () => {
  it('renders AskUserQuestion card with question text and options', () => {
    const questionsJson = JSON.stringify([
      {
        question: 'What do you mean?',
        header: 'Clarify issue',
        multiSelect: false,
        options: [
          { label: 'Old session', description: 'Session is from hours ago' },
          { label: 'Session ended', description: 'Session finished recently' },
        ],
      },
    ])
    render(
      <EventRow
        event={buildEvent({
          action: 'PERMISSION',
          tool: 'AskUserQuestion',
          tool_input_questions_json: questionsJson,
        })}
        searchQuery=""
      />
    )
    expect(screen.getByText('Clarify issue')).toBeTruthy()
    expect(screen.getByText('What do you mean?')).toBeTruthy()
    expect(screen.getByText('Old session')).toBeTruthy()
    expect(screen.getByText('Session ended')).toBeTruthy()
  })

  it('renders permission suggestion chip with allow behavior', () => {
    const suggestionsJson = JSON.stringify([
      {
        type: 'addRules',
        rules: [{ toolName: 'Bash', ruleContent: 'xargs cat' }],
        behavior: 'allow',
        destination: 'localSettings',
      },
    ])
    render(
      <EventRow
        event={buildEvent({
          action: 'PERMISSION',
          tool: 'Bash',
          permission_suggestions_json: suggestionsJson,
        })}
        searchQuery=""
      />
    )
    expect(screen.getByText('allow')).toBeTruthy()
    expect(screen.getByText(/"xargs cat" → localSettings/)).toBeTruthy()
  })

  it('renders no question card or suggestion chip for PERMISSION event with empty data', () => {
    render(
      <EventRow
        event={buildEvent({
          action: 'PERMISSION',
          tool: 'Bash',
        })}
        searchQuery=""
      />
    )
    expect(screen.queryByText('allow')).toBeNull()
    expect(screen.queryByText('deny')).toBeNull()
    // No question header rendered
    expect(screen.queryByText('○')).toBeNull()
    expect(screen.queryByText('□')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the new tests**

```bash
cd frontend && npx vitest run tests/features/events/EventRow.test.tsx
```

Expected: all tests in EventRow.test.tsx pass.

- [ ] **Step 3: Run full frontend test suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/features/events/EventRow.test.tsx
git commit -m "test(EventRow): verify description display and PermissionBlock rendering"
```

---

## Task 11: Lint and final verification

**Files:** none (verification only)

- [ ] **Step 1: Run backend lint**

```bash
cd backend && golangci-lint run ./...
```

Expected: no lint errors.

- [ ] **Step 2: Run full backend tests**

```bash
cd backend && go test ./...
```

Expected: all tests pass.

- [ ] **Step 3: Run full frontend tests**

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

Expected: all tests pass, no type errors.

- [ ] **Step 4: Final commit if any lint fixes were needed**

```bash
# Only if golangci-lint required fixes:
git add -p
git commit -m "fix(lint): address golangci-lint findings in permission display feature"
```
