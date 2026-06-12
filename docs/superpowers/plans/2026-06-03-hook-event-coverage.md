# Hook Event Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all gaps in hook event handling — map 3 unmapped actions, persist 6 dropped fields, and add 4 new frontend renderer blocks so every Claude Code and Codex event type has a meaningful display.

**Architecture:** Backend changes first (action mapping → domain fields → normalizer → SQLite migration + persistence), then frontend (types → CSS → renderers → wiring). Changes are layered so each task compiles and tests pass independently before moving to the next.

**Tech Stack:** Go 1.25, SQLite (modernc.org/sqlite), React 19, TypeScript 6, Vitest, Testing Library

---

## File Map

| File | Change |
|---|---|
| `backend/internal/repository/sqlite/migrations/009_new_event_fields.sql` | New — 6 ALTER TABLE statements |
| `backend/internal/fileutil/fileutil.go` | Add 3 cases to `HookEventAction` |
| `backend/internal/domain/event.go` | Add 6 fields to `NormalizedEvent` |
| `backend/internal/agents/claudecode/claudecode.go` | Map 6 new fields in `Normalize()` |
| `backend/internal/repository/sqlite/sqlite.go` | Update INSERT, `listWithWhere` SELECT+scan, `ExportEvents` SELECT+scan |
| `backend/tests/internal/fileutil/fileutil_test.go` | Add 3 `HookEventAction` test cases |
| `backend/tests/internal/agents/claudecode/normalize_test.go` | Add 3 normalization tests for new events |
| `backend/tests/internal/repository/sqlite/migration_test.go` | Add test for 6 new columns |
| `frontend/src/types/events.ts` | Add 6 optional fields to `EventRecord` |
| `frontend/src/index.css` | Add 2 CSS custom properties (`--display`, `--elicit`) |
| `frontend/src/styles/app.css` | Add 2 action classes + 3 hook badge classes |
| `frontend/src/features/events/renderers/ElicitBlock.tsx` | New renderer for Elicitation/ElicitationResult |
| `frontend/src/features/events/renderers/DisplayBlock.tsx` | New renderer for MessageDisplay |
| `frontend/src/features/events/renderers/WorktreeBlock.tsx` | New renderer for WorktreeCreate/Remove |
| `frontend/src/features/events/renderers/InstructBlock.tsx` | New renderer for InstructionsLoaded |
| `frontend/src/features/events/EventRow.tsx` | Wire 4 new renderers + add imports |
| `frontend/src/features/events/EventBadges.tsx` | Add `command_name` + `expansion_type` badges |
| `frontend/tests/features/events/renderers/ElicitDisplayBlocks.test.tsx` | Tests for ElicitBlock + DisplayBlock |
| `frontend/tests/features/events/renderers/WorktreeInstructBlocks.test.tsx` | Tests for WorktreeBlock + InstructBlock |
| `frontend/tests/features/events/EventRow.new-events.test.tsx` | Tests for new event wiring in EventRow |

---

## Task 1: Add missing `HookEventAction` cases (TDD)

**Files:**
- Modify: `backend/internal/fileutil/fileutil.go:99-134`
- Modify: `backend/tests/internal/fileutil/fileutil_test.go:116-135`

- [ ] **Step 1: Add failing test cases to `TestHookEventAction`**

Open `backend/tests/internal/fileutil/fileutil_test.go`. The existing `TestHookEventAction` table ends at line 134. Add 3 new cases to the `cases` slice:

```go
{"MessageDisplay", "DISPLAY"},
{"Elicitation", "ELICIT"},
{"ElicitationResult", "ELICIT"},
```

The full updated cases slice becomes:
```go
cases := []struct {
    hook string
    want string
}{
    {"SessionStart", "SESSION"},
    {"SubagentStart", "AGENT"},
    {"BeforeAgent", "AGENT"},
    {"AfterAgent", "AGENT"},
    {"BeforeModel", "MODEL"},
    {"AfterModel", "MODEL"},
    {"TaskCreated", "TASK"},
    {"MessageDisplay", "DISPLAY"},
    {"Elicitation", "ELICIT"},
    {"ElicitationResult", "ELICIT"},
    {"Unknown", ""},
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend
go test ./tests/internal/fileutil/... -run TestHookEventAction -v
```

Expected: FAIL — `HookEventAction("MessageDisplay") = "", want "DISPLAY"`

- [ ] **Step 3: Add the 3 new cases to `HookEventAction`**

Open `backend/internal/fileutil/fileutil.go`. Find the `HookEventAction` function (line ~99). Add 3 cases before the `default` branch:

```go
case "MessageDisplay":
    return "DISPLAY"
case "Elicitation", "ElicitationResult":
    return "ELICIT"
```

The full updated switch becomes:
```go
func HookEventAction(hookName string) string {
    switch hookName {
    case "SessionStart", "SessionEnd", "Setup":
        return "SESSION"
    case "Stop", "StopFailure":
        return "STOP"
    case "UserPromptSubmit", "UserPromptExpansion":
        return "PROMPT"
    case "SubagentStart", "SubagentStop", "TeammateIdle", "BeforeAgent", "AfterAgent":
        return "AGENT"
    case "BeforeModel", "AfterModel":
        return "MODEL"
    case "TaskCreated", "TaskCompleted":
        return "TASK"
    case "Notification":
        return "NOTIFY"
    case "PreCompact", "PostCompact":
        return "COMPACT"
    case "FileChanged":
        return "FILE"
    case "ConfigChange":
        return "CONFIG"
    case "WorktreeCreate", "WorktreeRemove":
        return "WORKTREE"
    case "PermissionRequest", "PermissionDenied":
        return "PERMISSION"
    case "CwdChanged":
        return "CWD"
    case "PostToolBatch":
        return "BATCH"
    case "InstructionsLoaded":
        return "INSTRUCT"
    case "MessageDisplay":
        return "DISPLAY"
    case "Elicitation", "ElicitationResult":
        return "ELICIT"
    default:
        return ""
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd backend
go test ./tests/internal/fileutil/... -run TestHookEventAction -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/fileutil/fileutil.go backend/tests/internal/fileutil/fileutil_test.go
git commit -m "feat(backend): map MessageDisplay, Elicitation, ElicitationResult hook actions"
```

---

## Task 2: Add 6 new fields to `NormalizedEvent` and `claudecode.Normalize()` (TDD)

**Files:**
- Modify: `backend/internal/domain/event.go`
- Modify: `backend/internal/agents/claudecode/claudecode.go`
- Modify: `backend/tests/internal/agents/claudecode/normalize_test.go`

- [ ] **Step 1: Write failing normalization tests**

Open `backend/tests/internal/agents/claudecode/normalize_test.go`. Append these 3 tests at the end of the file:

```go
func TestNormalizeUserPromptExpansionFields(t *testing.T) {
    raw := []byte(`{
        "session_id": "s-exp-01",
        "transcript_path": "/home/user/.claude/sessions/abc.jsonl",
        "cwd": "/tmp",
        "hook_event_name": "UserPromptExpansion",
        "expansion_type": "slash_command",
        "command_name": "/brainstorming"
    }`)

    got, err := claudecode.Normalize(raw)
    if err != nil {
        t.Fatalf("Normalize: %v", err)
    }
    if got.Action != "PROMPT" {
        t.Errorf("Action = %q, want PROMPT", got.Action)
    }
    if got.ExpansionType != "slash_command" {
        t.Errorf("ExpansionType = %q, want slash_command", got.ExpansionType)
    }
    if got.CommandName != "/brainstorming" {
        t.Errorf("CommandName = %q, want /brainstorming", got.CommandName)
    }
}

func TestNormalizeElicitationFields(t *testing.T) {
    raw := []byte(`{
        "session_id": "s-elicit-01",
        "transcript_path": "/home/user/.claude/sessions/abc.jsonl",
        "cwd": "/tmp",
        "hook_event_name": "Elicitation",
        "server_name": "memory",
        "prompt": "Should I delete these files?"
    }`)

    got, err := claudecode.Normalize(raw)
    if err != nil {
        t.Fatalf("Normalize: %v", err)
    }
    if got.Action != "ELICIT" {
        t.Errorf("Action = %q, want ELICIT", got.Action)
    }
    if got.ServerName != "memory" {
        t.Errorf("ServerName = %q, want memory", got.ServerName)
    }
}

func TestNormalizeInstructionsLoadedFields(t *testing.T) {
    raw := []byte(`{
        "session_id": "s-instruct-01",
        "transcript_path": "/home/user/.claude/sessions/abc.jsonl",
        "cwd": "/tmp",
        "hook_event_name": "InstructionsLoaded",
        "memory_type": "project",
        "load_reason": "startup"
    }`)

    got, err := claudecode.Normalize(raw)
    if err != nil {
        t.Fatalf("Normalize: %v", err)
    }
    if got.Action != "INSTRUCT" {
        t.Errorf("Action = %q, want INSTRUCT", got.Action)
    }
    if got.MemoryType != "project" {
        t.Errorf("MemoryType = %q, want project", got.MemoryType)
    }
    if got.LoadReason != "startup" {
        t.Errorf("LoadReason = %q, want startup", got.LoadReason)
    }
}
```

Also add a WorktreeCreate test:

```go
func TestNormalizeWorktreeFields(t *testing.T) {
    raw := []byte(`{
        "session_id": "s-worktree-01",
        "transcript_path": "/home/user/.claude/sessions/abc.jsonl",
        "cwd": "/tmp",
        "hook_event_name": "WorktreeCreate",
        "branch": "feature/foo"
    }`)

    got, err := claudecode.Normalize(raw)
    if err != nil {
        t.Fatalf("Normalize: %v", err)
    }
    if got.Action != "WORKTREE" {
        t.Errorf("Action = %q, want WORKTREE", got.Action)
    }
    if got.Branch != "feature/foo" {
        t.Errorf("Branch = %q, want feature/foo", got.Branch)
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
go test ./tests/internal/agents/claudecode/... -run "TestNormalizeUserPromptExpansionFields|TestNormalizeElicitationFields|TestNormalizeInstructionsLoadedFields|TestNormalizeWorktreeFields" -v
```

Expected: compile error — `got.ExpansionType undefined`

- [ ] **Step 3: Add 6 new fields to `NormalizedEvent`**

Open `backend/internal/domain/event.go`. After the `Trigger` field (line ~55), add:

```go
// New event type fields
ExpansionType string `json:"expansion_type,omitempty"`
CommandName   string `json:"command_name,omitempty"`
MemoryType    string `json:"memory_type,omitempty"`
LoadReason    string `json:"load_reason,omitempty"`
Branch        string `json:"branch,omitempty"`
ServerName    string `json:"server_name,omitempty"`
```

- [ ] **Step 4: Map new fields in `claudecode.Normalize()`**

Open `backend/internal/agents/claudecode/claudecode.go`. In the `return domain.NormalizedEvent{...}` block, after the `Trigger: p.Trigger,` line, add:

```go
ExpansionType: p.ExpansionType,
CommandName:   p.CommandName,
MemoryType:    p.MemoryType,
LoadReason:    p.LoadReason,
Branch:        p.Branch,
ServerName:    p.ServerName,
```

- [ ] **Step 5: Verify build**

```bash
cd backend
go build ./...
```

Expected: no errors

- [ ] **Step 6: Run the new tests to verify they pass**

```bash
cd backend
go test ./tests/internal/agents/claudecode/... -run "TestNormalizeUserPromptExpansionFields|TestNormalizeElicitationFields|TestNormalizeInstructionsLoadedFields|TestNormalizeWorktreeFields" -v
```

Expected: all PASS

- [ ] **Step 7: Run all backend tests**

```bash
cd backend
go test ./...
```

Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add backend/internal/domain/event.go \
        backend/internal/agents/claudecode/claudecode.go \
        backend/tests/internal/agents/claudecode/normalize_test.go
git commit -m "feat(backend): add 6 new normalized event fields for expansion, elicitation, worktree, instruct"
```

---

## Task 3: Migration + SQLite persistence

**Files:**
- Create: `backend/internal/repository/sqlite/migrations/009_new_event_fields.sql`
- Modify: `backend/internal/repository/sqlite/sqlite.go`

- [ ] **Step 1: Create migration `009_new_event_fields.sql`**

Create file `backend/internal/repository/sqlite/migrations/009_new_event_fields.sql`:

```sql
ALTER TABLE hook_events ADD COLUMN expansion_type TEXT;
ALTER TABLE hook_events ADD COLUMN command_name TEXT;
ALTER TABLE hook_events ADD COLUMN memory_type TEXT;
ALTER TABLE hook_events ADD COLUMN load_reason TEXT;
ALTER TABLE hook_events ADD COLUMN branch TEXT;
ALTER TABLE hook_events ADD COLUMN server_name TEXT;
```

- [ ] **Step 2: Update the `Add` INSERT in `sqlite.go`**

Open `backend/internal/repository/sqlite/sqlite.go`. Find the `INSERT OR IGNORE INTO hook_events` statement (around line 143). 

Add `expansion_type, command_name, memory_type, load_reason, branch, server_name` to the column list. The full updated column section at the end becomes:

```sql
tool_result_stdout, tool_result_stderr, duration_ms, trigger,
normalizer_version, agent_version, normalization_status,
expansion_type, command_name, memory_type, load_reason, branch, server_name
```

Add 6 more `?` placeholders to the VALUES clause (was 46, now 52).

Add 6 new value args at the end of the `ExecContext` call, after `normalizationStatus(e.NormalizationStatus),`:

```go
nullStr(e.ExpansionType), nullStr(e.CommandName), nullStr(e.MemoryType),
nullStr(e.LoadReason), nullStr(e.Branch), nullStr(e.ServerName),
```

- [ ] **Step 3: Update `listWithWhere` SELECT query**

In `listWithWhere`, the SELECT ends with:
```sql
COALESCE(normalizer_version,''), COALESCE(agent_version,''), COALESCE(normalization_status,''),
COALESCE(dedup_key,'')
```

Add the 6 new columns between `normalization_status` and `dedup_key`:

```sql
COALESCE(normalizer_version,''), COALESCE(agent_version,''), COALESCE(normalization_status,''),
COALESCE(expansion_type,''), COALESCE(command_name,''),
COALESCE(memory_type,''), COALESCE(load_reason,''),
COALESCE(branch,''), COALESCE(server_name,''),
COALESCE(dedup_key,'')
```

- [ ] **Step 4: Update `listWithWhere` Scan call**

In `listWithWhere`, the `rows.Scan(...)` call ends with:
```go
&e.NormalizationStatus,
&e.DedupKey,
```

Add 6 new scan destinations between them:

```go
&e.NormalizationStatus,
&e.ExpansionType, &e.CommandName, &e.MemoryType, &e.LoadReason, &e.Branch, &e.ServerName,
&e.DedupKey,
```

- [ ] **Step 5: Update `ExportEvents` SELECT query**

In `ExportEvents`, the SELECT ends with:
```sql
COALESCE(normalizer_version,''), COALESCE(agent_version,''), COALESCE(normalization_status,'')
```

Add 6 new columns after `normalization_status`:

```sql
COALESCE(normalizer_version,''), COALESCE(agent_version,''), COALESCE(normalization_status,''),
COALESCE(expansion_type,''), COALESCE(command_name,''),
COALESCE(memory_type,''), COALESCE(load_reason,''),
COALESCE(branch,''), COALESCE(server_name,'')
```

- [ ] **Step 6: Update `ExportEvents` Scan call**

In `ExportEvents`, the `rows.Scan(...)` call ends with:
```go
&e.NormalizationStatus,
```

Add 6 new scan destinations:

```go
&e.NormalizationStatus,
&e.ExpansionType, &e.CommandName, &e.MemoryType, &e.LoadReason, &e.Branch, &e.ServerName,
```

- [ ] **Step 7: Verify build**

```bash
cd backend
go build ./...
```

Expected: no errors

- [ ] **Step 8: Run all backend tests**

```bash
cd backend
go test ./...
```

Expected: all pass (migration runs on in-memory DB, new columns present)

- [ ] **Step 9: Commit**

```bash
git add backend/internal/repository/sqlite/migrations/009_new_event_fields.sql \
        backend/internal/repository/sqlite/sqlite.go
git commit -m "feat(backend): migrate and persist 6 new event fields"
```

---

## Task 4: Migration round-trip test + backend lint

**Files:**
- Modify: `backend/tests/internal/repository/sqlite/migration_test.go`

- [ ] **Step 1: Add migration test for new columns**

Open `backend/tests/internal/repository/sqlite/migration_test.go`. Append a new test after `TestMigrationNewColumns`:

```go
func TestMigrationNewEventFieldColumns(t *testing.T) {
    db, _ := newTestFileDB(t)

    rawDB := db.RawDB()
    rows, err := rawDB.Query(`PRAGMA table_info(hook_events)`)
    if err != nil {
        t.Fatalf("PRAGMA table_info: %v", err)
    }
    defer rows.Close()

    cols := map[string]bool{}
    for rows.Next() {
        var cid int
        var name, colType string
        var notNull int
        var dfltValue any
        var pk int
        if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
            t.Fatalf("scan table_info: %v", err)
        }
        cols[name] = true
    }
    if err := rows.Err(); err != nil {
        t.Fatalf("table_info rows: %v", err)
    }

    for _, want := range []string{
        "expansion_type", "command_name",
        "memory_type", "load_reason",
        "branch", "server_name",
    } {
        if !cols[want] {
            t.Errorf("column %q missing from hook_events after migration", want)
        }
    }

    // Insert an event with the new fields and verify round-trip.
    e := domain.NormalizedEvent{
        Time:          "2026-01-01T00:00:00Z",
        Agent:         "claudecode",
        Session:       "sess-009-01",
        HookEventName: "WorktreeCreate",
        RawPayload:    []byte(`{}`),
        Branch:        "feature/test-branch",
        ExpansionType: "slash_command",
        CommandName:   "/foo",
        MemoryType:    "project",
        LoadReason:    "startup",
        ServerName:    "memory",
    }
    if err := db.Add(e); err != nil {
        t.Fatalf("Add: %v", err)
    }

    events, err := db.List(10)
    if err != nil {
        t.Fatalf("List: %v", err)
    }
    if len(events) != 1 {
        t.Fatalf("got %d events, want 1", len(events))
    }
    got := events[0]
    if got.Branch != "feature/test-branch" {
        t.Errorf("Branch = %q, want feature/test-branch", got.Branch)
    }
    if got.CommandName != "/foo" {
        t.Errorf("CommandName = %q, want /foo", got.CommandName)
    }
    if got.ServerName != "memory" {
        t.Errorf("ServerName = %q, want memory", got.ServerName)
    }
}
```

- [ ] **Step 2: Run the new test**

```bash
cd backend
go test ./tests/internal/repository/sqlite/... -run TestMigrationNewEventFieldColumns -v
```

Expected: PASS

- [ ] **Step 3: Run full backend test suite**

```bash
cd backend
go test ./...
```

Expected: all pass

- [ ] **Step 4: Run lint**

```bash
cd backend
golangci-lint run ./...
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add backend/tests/internal/repository/sqlite/migration_test.go
git commit -m "test(backend): verify migration 009 new event field columns round-trip"
```

---

## Task 5: Frontend types + CSS

**Files:**
- Modify: `frontend/src/types/events.ts`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/styles/app.css`

- [ ] **Step 1: Add 6 new fields to `EventRecord`**

Open `frontend/src/types/events.ts`. After the `dedup_key?: string` field, add:

```ts
expansion_type?: string
command_name?: string
memory_type?: string
load_reason?: string
branch?: string
server_name?: string
```

- [ ] **Step 2: Add CSS custom properties**

Open `frontend/src/index.css`. In the `:root` block, after `--instruct: #818cf8;`, add:

```css
--display: #e2c4ff;
--elicit: #ff9f6b;
```

- [ ] **Step 3: Add action + hook badge CSS classes**

Open `frontend/src/styles/app.css`. After `.INSTRUCT { color: var(--instruct); }`, add:

```css
.DISPLAY {
  color: var(--display);
}
.ELICIT {
  color: var(--elicit);
}
```

After the `.hook-Stop` block (end of hook badge section), add:

```css
.hook-MessageDisplay {
  color: #e2c4ff;
  border-color: rgba(226, 196, 255, 0.35);
  background: rgba(226, 196, 255, 0.08);
}
.hook-Elicitation {
  color: #ff9f6b;
  border-color: rgba(255, 159, 107, 0.35);
  background: rgba(255, 159, 107, 0.08);
}
.hook-ElicitationResult {
  color: #ffc78a;
  border-color: rgba(255, 199, 138, 0.35);
  background: rgba(255, 199, 138, 0.08);
}
```

- [ ] **Step 4: Type check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/events.ts frontend/src/index.css frontend/src/styles/app.css
git commit -m "feat(frontend): add EventRecord fields and CSS for new hook event types"
```

---

## Task 6: New renderers — `ElicitBlock` + `DisplayBlock`

**Files:**
- Create: `frontend/src/features/events/renderers/ElicitBlock.tsx`
- Create: `frontend/src/features/events/renderers/DisplayBlock.tsx`
- Create: `frontend/tests/features/events/renderers/ElicitDisplayBlocks.test.tsx`

- [ ] **Step 1: Write failing tests for ElicitBlock and DisplayBlock**

Create `frontend/tests/features/events/renderers/ElicitDisplayBlocks.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ElicitBlock } from '@/features/events/renderers/ElicitBlock'
import { DisplayBlock } from '@/features/events/renderers/DisplayBlock'

describe('ElicitBlock', () => {
  it('renders server name and prompt', () => {
    render(
      <ElicitBlock serverName="memory" prompt="Should I delete these files?" searchQuery="" />
    )
    expect(screen.getByText('memory')).toBeTruthy()
    expect(screen.getByText('Should I delete these files?')).toBeTruthy()
  })

  it('renders response when present', () => {
    render(
      <ElicitBlock
        serverName="memory"
        prompt="Delete files?"
        response="No"
        searchQuery=""
      />
    )
    expect(screen.getByText('No')).toBeTruthy()
  })

  it('returns null when no server name and no prompt', () => {
    const { container } = render(<ElicitBlock searchQuery="" />)
    expect(container.firstChild).toBeNull()
  })
})

describe('DisplayBlock', () => {
  it('renders message content', () => {
    render(<DisplayBlock message="Hello from the model" searchQuery="" />)
    expect(screen.getByText('Hello from the model')).toBeTruthy()
  })

  it('returns null when message is empty', () => {
    const { container } = render(<DisplayBlock searchQuery="" />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail (compile error — files don't exist)**

```bash
cd frontend
npx vitest run tests/features/events/renderers/ElicitDisplayBlocks.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `ElicitBlock.tsx`**

Create `frontend/src/features/events/renderers/ElicitBlock.tsx`:

```tsx
import type { ReactNode } from 'react'
import { highlight } from '@/lib/format'

type ElicitBlockProps = {
  serverName?: string
  prompt?: string
  response?: string
  searchQuery?: string
}

export function ElicitBlock({ serverName, prompt, response, searchQuery = '' }: ElicitBlockProps) {
  if (!serverName && !prompt) return null

  return (
    <div className="mt-2 text-[0.75rem] text-[#ccc] bg-black/30 border border-white/[0.05] px-3 py-2 rounded-[6px]">
      {serverName && (
        <strong className="text-[#aaa] text-[0.7rem]">{serverName}</strong>
      )}
      {prompt && (
        <pre className="mt-1 mb-0 whitespace-pre-wrap text-[0.73rem] text-[#888]">
          {highlight(prompt, searchQuery) as ReactNode}
        </pre>
      )}
      {response && (
        <pre className="mt-1 mb-0 whitespace-pre-wrap text-[0.73rem] text-[#47ff9c]">
          {highlight(response, searchQuery) as ReactNode}
        </pre>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `DisplayBlock.tsx`**

Create `frontend/src/features/events/renderers/DisplayBlock.tsx`:

```tsx
import type { ReactNode } from 'react'
import { highlight } from '@/lib/format'

type DisplayBlockProps = {
  message?: string
  searchQuery?: string
}

export function DisplayBlock({ message, searchQuery = '' }: DisplayBlockProps) {
  if (!message) return null

  return (
    <div className="mt-2 text-[0.75rem] text-[#ccc] bg-black/30 border border-white/[0.05] px-3 py-2 rounded-[6px]">
      <pre className="mt-0 mb-0 whitespace-pre-wrap text-[0.73rem] text-[#888]">
        {highlight(message, searchQuery) as ReactNode}
      </pre>
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify ElicitBlock and DisplayBlock pass**

```bash
cd frontend
npx vitest run tests/features/events/renderers/ElicitDisplayBlocks.test.tsx
```

Expected: all 5 tests PASS

- [ ] **Step 6: Commit ElicitBlock + DisplayBlock**

```bash
git add \
  frontend/src/features/events/renderers/ElicitBlock.tsx \
  frontend/src/features/events/renderers/DisplayBlock.tsx \
  frontend/tests/features/events/renderers/ElicitDisplayBlocks.test.tsx
git commit -m "feat(frontend): add ElicitBlock and DisplayBlock renderers"
```

---

## Task 7: New renderers — `WorktreeBlock` + `InstructBlock`

**Files:**
- Create: `frontend/src/features/events/renderers/WorktreeBlock.tsx`
- Create: `frontend/src/features/events/renderers/InstructBlock.tsx`
- Create: `frontend/tests/features/events/renderers/WorktreeInstructBlocks.test.tsx`

- [ ] **Step 1: Write failing tests for WorktreeBlock and InstructBlock**

Create `frontend/tests/features/events/renderers/WorktreeInstructBlocks.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorktreeBlock } from '@/features/events/renderers/WorktreeBlock'
import { InstructBlock } from '@/features/events/renderers/InstructBlock'

describe('WorktreeBlock', () => {
  it('renders branch name', () => {
    render(<WorktreeBlock branch="feature/foo" hookEventName="WorktreeCreate" />)
    expect(screen.getByText('feature/foo')).toBeTruthy()
  })

  it('returns null when branch is empty', () => {
    const { container } = render(<WorktreeBlock />)
    expect(container.firstChild).toBeNull()
  })
})

describe('InstructBlock', () => {
  it('renders memory type and load reason', () => {
    render(<InstructBlock memoryType="project" loadReason="startup" searchQuery="" />)
    expect(screen.getByText('project')).toBeTruthy()
    expect(screen.getByText('startup')).toBeTruthy()
  })

  it('returns null when both props are empty', () => {
    const { container } = render(<InstructBlock searchQuery="" />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
npx vitest run tests/features/events/renderers/WorktreeInstructBlocks.test.tsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `WorktreeBlock.tsx`**

Create `frontend/src/features/events/renderers/WorktreeBlock.tsx`:

```tsx
type WorktreeBlockProps = {
  branch?: string
  hookEventName?: string
}

export function WorktreeBlock({ branch, hookEventName }: WorktreeBlockProps) {
  if (!branch) return null

  const isCreate = hookEventName === 'WorktreeCreate'

  return (
    <div className="mt-1 text-[0.72rem] text-[#888]">
      <span className="text-[#555] mr-1">branch</span>
      <span className={isCreate ? 'text-[#47ff9c]' : 'text-[#ff6b6b]'}>{branch}</span>
    </div>
  )
}
```

- [ ] **Step 2: Create `InstructBlock.tsx`**

Create `frontend/src/features/events/renderers/InstructBlock.tsx`:

```tsx
import type { ReactNode } from 'react'
import { highlight } from '@/lib/format'

type InstructBlockProps = {
  memoryType?: string
  loadReason?: string
  searchQuery?: string
}

export function InstructBlock({ memoryType, loadReason, searchQuery = '' }: InstructBlockProps) {
  if (!memoryType && !loadReason) return null

  return (
    <div className="mt-2 text-[0.75rem] text-[#ccc] bg-black/30 border border-white/[0.05] px-3 py-2 rounded-[6px]">
      {memoryType && (
        <div>
          <strong className="text-[#aaa] text-[0.7rem] mr-1">type</strong>
          <span className="text-[#888]">{highlight(memoryType, searchQuery) as ReactNode}</span>
        </div>
      )}
      {loadReason && (
        <div className="mt-1">
          <strong className="text-[#aaa] text-[0.7rem] mr-1">reason</strong>
          <span className="text-[#888]">{highlight(loadReason, searchQuery) as ReactNode}</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run all WorktreeBlock + InstructBlock tests**

```bash
cd frontend
npx vitest run tests/features/events/renderers/WorktreeInstructBlocks.test.tsx
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add \
  frontend/src/features/events/renderers/WorktreeBlock.tsx \
  frontend/src/features/events/renderers/InstructBlock.tsx \
  frontend/tests/features/events/renderers/WorktreeInstructBlocks.test.tsx
git commit -m "feat(frontend): add WorktreeBlock and InstructBlock renderers"
```

---

## Task 8: Wire new renderers in `EventRow` + expansion badges in `EventBadges`

**Files:**
- Modify: `frontend/src/features/events/EventRow.tsx`
- Modify: `frontend/src/features/events/EventBadges.tsx`
- Create: `frontend/tests/features/events/EventRow.new-events.test.tsx`

- [ ] **Step 1: Write failing EventRow wiring tests**

Create `frontend/tests/features/events/EventRow.new-events.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EventRow } from '@/features/events/EventRow'
import type { EventRecord } from '@/types/events'

function buildEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    time: '2026-06-03T10:00:00.000Z',
    action: 'ELICIT',
    path: '',
    ...overrides,
  }
}

describe('EventRow — new event types', () => {
  it('renders ElicitBlock for ELICIT action', () => {
    render(
      <EventRow
        event={buildEvent({
          action: 'ELICIT',
          hook_event_name: 'Elicitation',
          server_name: 'memory',
          prompt: 'Should I delete?',
        })}
        searchQuery=""
      />
    )
    expect(screen.getByText('memory')).toBeTruthy()
    expect(screen.getByText('Should I delete?')).toBeTruthy()
  })

  it('renders DisplayBlock for DISPLAY action', () => {
    render(
      <EventRow
        event={buildEvent({
          action: 'DISPLAY',
          hook_event_name: 'MessageDisplay',
          notification_message: 'Hello from model',
        })}
        searchQuery=""
      />
    )
    expect(screen.getByText('Hello from model')).toBeTruthy()
  })

  it('renders WorktreeBlock for WORKTREE action', () => {
    render(
      <EventRow
        event={buildEvent({
          action: 'WORKTREE',
          hook_event_name: 'WorktreeCreate',
          branch: 'feature/foo',
        })}
        searchQuery=""
      />
    )
    expect(screen.getByText('feature/foo')).toBeTruthy()
  })

  it('renders InstructBlock for INSTRUCT action', () => {
    render(
      <EventRow
        event={buildEvent({
          action: 'INSTRUCT',
          hook_event_name: 'InstructionsLoaded',
          memory_type: 'project',
          load_reason: 'startup',
        })}
        searchQuery=""
      />
    )
    expect(screen.getByText('project')).toBeTruthy()
    expect(screen.getByText('startup')).toBeTruthy()
  })
})

describe('EventBadges — expansion fields', () => {
  it('shows command_name badge for UserPromptExpansion', () => {
    const { container } = render(
      <EventRow
        event={buildEvent({
          action: 'PROMPT',
          hook_event_name: 'UserPromptExpansion',
          command_name: '/brainstorming',
          expansion_type: 'slash_command',
        })}
        searchQuery=""
      />
    )
    expect(container.textContent).toContain('/brainstorming')
    expect(container.textContent).toContain('slash_command')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend
npx vitest run tests/features/events/EventRow.new-events.test.tsx
```

Expected: FAIL — new renderers not wired yet

- [ ] **Step 3: Update `EventRow.tsx` — add imports**

Open `frontend/src/features/events/EventRow.tsx`. After the existing renderer imports (after `import { BatchBlock }...`), add:

```tsx
import { ElicitBlock } from './renderers/ElicitBlock'
import { DisplayBlock } from './renderers/DisplayBlock'
import { WorktreeBlock } from './renderers/WorktreeBlock'
import { InstructBlock } from './renderers/InstructBlock'
```

- [ ] **Step 4: Update `EventRow.tsx` — wire new renderers**

In `EventRow.tsx`, after the `{e.action === 'BATCH' && <BatchBlock json={e.tool_calls_json} />}` line, add:

```tsx
{e.action === 'DISPLAY' && (
  <DisplayBlock message={e.notification_message || e.prompt} searchQuery={searchQuery} />
)}
{e.action === 'ELICIT' && (
  <ElicitBlock
    serverName={e.server_name}
    prompt={e.prompt || e.notification_message}
    response={e.response}
    searchQuery={searchQuery}
  />
)}
{e.action === 'WORKTREE' && (
  <WorktreeBlock branch={e.branch} hookEventName={e.hook_event_name} />
)}
{e.action === 'INSTRUCT' && (
  <InstructBlock memoryType={e.memory_type} loadReason={e.load_reason} searchQuery={searchQuery} />
)}
```

- [ ] **Step 5: Update `EventBadges.tsx` — add expansion badges**

Open `frontend/src/features/events/EventBadges.tsx`. 

First, update the `hasAny` check to include the new fields:

```tsx
const hasAny =
  e.normalization_status === 'degraded' ||
  e.tool ||
  e.source ||
  e.turn_id ||
  e.permission_mode ||
  e.subagent_type ||
  (e.subagent_id && e.action === 'AGENT') ||
  e.task_id ||
  e.notification_type ||
  e.change_type ||
  e.trigger ||
  e.command_name ||
  e.expansion_type
```

Then, after the `{e.trigger && ...}` Badge block, add:

```tsx
{e.command_name && (
  <Badge
    variant="outline"
    className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
  >
    <strong className="text-[#aaa] font-semibold mr-1">Command:</strong> {e.command_name}
  </Badge>
)}
{e.expansion_type && (
  <Badge
    variant="outline"
    className="text-[0.68rem] text-[#888] border-white/5 bg-white/[0.04] px-[6px] py-[2px] h-auto rounded"
  >
    <strong className="text-[#aaa] font-semibold mr-1">Expansion:</strong> {e.expansion_type}
  </Badge>
)}
```

- [ ] **Step 6: Run the new EventRow tests**

```bash
cd frontend
npx vitest run tests/features/events/EventRow.new-events.test.tsx
```

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add \
  frontend/src/features/events/EventRow.tsx \
  frontend/src/features/events/EventBadges.tsx \
  frontend/tests/features/events/EventRow.new-events.test.tsx
git commit -m "feat(frontend): wire new event renderers in EventRow and expansion badges in EventBadges"
```

---

## Task 9: Final verification

**Files:** none — verification only

- [ ] **Step 1: Full backend test + lint**

```bash
cd backend
go test ./...
golangci-lint run ./...
```

Expected: all pass, no lint errors

- [ ] **Step 2: Frontend type check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Full frontend test suite**

```bash
cd frontend
npx vitest run
```

Expected: all tests pass

- [ ] **Step 4: Run Prettier on changed files**

```bash
cd frontend
npx prettier --write \
  src/types/events.ts \
  src/features/events/EventRow.tsx \
  src/features/events/EventBadges.tsx \
  src/features/events/renderers/ElicitBlock.tsx \
  src/features/events/renderers/DisplayBlock.tsx \
  src/features/events/renderers/WorktreeBlock.tsx \
  src/features/events/renderers/InstructBlock.tsx
```

- [ ] **Step 5: Commit if Prettier made changes**

```bash
git diff --quiet || git commit -am "style(frontend): prettier formatting on new hook event files"
```

- [ ] **Step 6: Final commit summary**

All hook events now handled. Coverage:
- 3 previously invisible events (MessageDisplay → DISPLAY, Elicitation/ElicitationResult → ELICIT) now have action labels and content blocks
- 6 dropped payload fields (expansion_type, command_name, memory_type, load_reason, branch, server_name) now persisted and displayed
- 4 new renderer components: ElicitBlock, DisplayBlock, WorktreeBlock, InstructBlock
