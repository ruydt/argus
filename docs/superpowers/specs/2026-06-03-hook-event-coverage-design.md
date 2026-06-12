# Hook Event Coverage — Full Design

**Date:** 2026-06-03
**Scope:** Close all gaps in hook event handling for Claude Code and Codex — backend action mapping, dropped fields, and frontend renderers.

---

## Problem

Three categories of gaps identified:

1. **Unmapped hook events** — `MessageDisplay`, `Elicitation`, `ElicitationResult` return `""` from `HookEventAction`, so they get no action label and render as empty generic rows.
2. **Dropped fields** — Several hook payload fields are parsed into `RawPayload` but never mapped to `NormalizedEvent`: `expansion_type`, `command_name` (UserPromptExpansion), `memory_type`, `load_reason` (InstructionsLoaded), `branch` (WorktreeCreate/Remove), `server_name` (Elicitation).
3. **Badge-only events** — Many event types (SESSION, AGENT, COMPACT, FILE, CONFIG, WORKTREE, PERMISSION, INSTRUCT) already have correct actions but no content block renderer — they show only the hook badge.

---

## Approach

Single pass: fix all backend gaps + field mapping + frontend blocks together. Backend field mapping and frontend renderers are tightly coupled — adding fields without renderers creates dead code.

---

## Backend Changes

### 1. Migration `009_new_event_fields.sql`

Six new `TEXT` columns added to `hook_events`:

```sql
ALTER TABLE hook_events ADD COLUMN expansion_type TEXT;
ALTER TABLE hook_events ADD COLUMN command_name TEXT;
ALTER TABLE hook_events ADD COLUMN memory_type TEXT;
ALTER TABLE hook_events ADD COLUMN load_reason TEXT;
ALTER TABLE hook_events ADD COLUMN branch TEXT;
ALTER TABLE hook_events ADD COLUMN server_name TEXT;
```

### 2. `internal/fileutil/fileutil.go` — `HookEventAction`

Three missing cases added:

```go
case "MessageDisplay":
    return "DISPLAY"
case "Elicitation", "ElicitationResult":
    return "ELICIT"
```

### 3. `internal/domain/event.go` — `NormalizedEvent`

Six new fields added after `Trigger`:

```go
ExpansionType string `json:"expansion_type,omitempty"`
CommandName   string `json:"command_name,omitempty"`
MemoryType    string `json:"memory_type,omitempty"`
LoadReason    string `json:"load_reason,omitempty"`
Branch        string `json:"branch,omitempty"`
ServerName    string `json:"server_name,omitempty"`
```

### 4. `internal/agents/claudecode/claudecode.go` — `Normalize()`

Maps new `RawPayload` fields into `NormalizedEvent`:

```go
ExpansionType: p.ExpansionType,
CommandName:   p.CommandName,
MemoryType:    p.MemoryType,
LoadReason:    p.LoadReason,
Branch:        p.Branch,
ServerName:    p.ServerName,
```

### 5. `internal/repository/sqlite/sqlite.go`

Three locations updated:

- **INSERT** (`Add` method): 6 new column names + 6 new `nullStr()` value args
- **SELECT + Scan** (`listWithWhere`): 6 new `COALESCE(col,'')` selects + 6 new scan destinations
- **SELECT + Scan** (`ExportEvents`): same as above

---

## Frontend Changes

### 6. `src/types/events.ts` — `EventRecord`

Six new optional fields matching backend JSON tags:

```ts
expansion_type?: string
command_name?: string
memory_type?: string
load_reason?: string
branch?: string
server_name?: string
```

### 7. `src/index.css` — CSS variables

Two new action color tokens:

```css
--display: #e2c4ff;   /* soft lavender — informational */
--elicit: #ff9f6b;    /* warm orange — MCP elicitation */
```

### 8. `src/styles/app.css` — Classes

Two new action classes:

```css
.DISPLAY { color: var(--display); }
.ELICIT  { color: var(--elicit); }
```

Three new hook badge classes:

```css
.hook-MessageDisplay    { color: #e2c4ff; border-color: rgba(226,196,255,0.35); background: rgba(226,196,255,0.08); }
.hook-Elicitation       { color: #ff9f6b; border-color: rgba(255,159,107,0.35); background: rgba(255,159,107,0.08); }
.hook-ElicitationResult { color: #ffc78a; border-color: rgba(255,199,138,0.35); background: rgba(255,199,138,0.08); }
```

### 9. New renderer: `ElicitBlock.tsx`

For `ELICIT` action (`Elicitation` + `ElicitationResult`). Matches `NotifyBlock` style.

Props: `serverName`, `prompt`, `response`, `searchQuery`

Renders:
- Server name as header label (strong)
- Prompt content (the question MCP server asked)
- Response if present (for `ElicitationResult` — user's answer)

### 10. New renderer: `DisplayBlock.tsx`

For `DISPLAY` action (`MessageDisplay`). Matches `NotifyBlock` style.

Props: `message`, `searchQuery`

Renders: message content in styled block. Falls back to nothing if empty.

### 11. New renderer: `WorktreeBlock.tsx`

For `WORKTREE` action (`WorktreeCreate` + `WorktreeRemove`). Matches `CwdBlock` style (simple inline).

Props: `branch`, `hookEventName`

Renders: branch name with color cue — green for create, red-dim for remove.

### 12. New renderer: `InstructBlock.tsx`

For `INSTRUCT` action (`InstructionsLoaded`). Matches `NotifyBlock` style.

Props: `memoryType`, `loadReason`, `searchQuery`

Renders: two labeled rows — memory type and load reason. Path already shown in row header.

### 13. `EventRow.tsx` — wire new renderers

Four new render blocks added (after existing action-specific blocks):

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

Four new imports added at top.

### 14. `EventBadges.tsx` — expansion metadata

Two new badges added for `UserPromptExpansion` context:

```tsx
{e.command_name && (
  <Badge ...><strong className="...">Command:</strong> {e.command_name}</Badge>
)}
{e.expansion_type && (
  <Badge ...><strong className="...">Expansion:</strong> {e.expansion_type}</Badge>
)}
```

---

## Coverage After This Change

### Claude Code — full list

| Hook Event | Action | Renderer |
|---|---|---|
| SessionStart / Setup / SessionEnd | SESSION | hook badge |
| UserPromptSubmit | PROMPT | CommandBlock |
| UserPromptExpansion | PROMPT | CommandBlock + expansion badges |
| Stop / StopFailure | STOP | StopBlock |
| PreToolUse / PostToolUse | ToolToAction | CommandBlock + ToolResultBlock |
| PostToolUseFailure | ToolToAction | ErrorBlock |
| PostToolBatch | BATCH | BatchBlock |
| PermissionRequest / PermissionDenied | PERMISSION | hook badge + permission_mode badge |
| SubagentStart / SubagentStop / TeammateIdle | AGENT | hook badge + subagent badges |
| TaskCreated / TaskCompleted | TASK | TaskBlock |
| FileChanged | FILE | hook badge + change_type badge |
| CwdChanged | CWD | CwdBlock |
| ConfigChange | CONFIG | hook badge |
| InstructionsLoaded | INSTRUCT | **InstructBlock** (new) |
| MessageDisplay | **DISPLAY** | **DisplayBlock** (new) |
| Notification | NOTIFY | NotifyBlock |
| PreCompact / PostCompact | COMPACT | hook badge + model |
| WorktreeCreate / WorktreeRemove | WORKTREE | **WorktreeBlock** (new) |
| Elicitation / ElicitationResult | **ELICIT** | **ElicitBlock** (new) |

### Codex — all 10 events

All covered via same machinery. No Codex-specific changes needed.

---

## Files Changed

| File | Change |
|---|---|
| `backend/internal/repository/sqlite/migrations/009_new_event_fields.sql` | New |
| `backend/internal/fileutil/fileutil.go` | +3 HookEventAction cases |
| `backend/internal/domain/event.go` | +6 NormalizedEvent fields |
| `backend/internal/agents/claudecode/claudecode.go` | +6 field mappings |
| `backend/internal/repository/sqlite/sqlite.go` | UPDATE INSERT + 2× SELECT+Scan |
| `frontend/src/types/events.ts` | +6 EventRecord fields |
| `frontend/src/index.css` | +2 CSS vars |
| `frontend/src/styles/app.css` | +2 action classes + 3 hook badge classes |
| `frontend/src/features/events/renderers/ElicitBlock.tsx` | New |
| `frontend/src/features/events/renderers/DisplayBlock.tsx` | New |
| `frontend/src/features/events/renderers/WorktreeBlock.tsx` | New |
| `frontend/src/features/events/renderers/InstructBlock.tsx` | New |
| `frontend/src/features/events/EventRow.tsx` | +4 renderers + imports |
| `frontend/src/features/events/EventBadges.tsx` | +2 expansion badges |

---

## Testing

**Backend:**
- `go build ./...` — no compile errors
- `go test ./...` — all existing tests pass
- Add normalization test for `MessageDisplay`, `Elicitation`, `ElicitationResult` in `claudecode_test.go`
- Add `HookEventAction` unit tests for 3 new cases in `fileutil_test.go`

**Frontend:**
- `npx tsc --noEmit` — no type errors
- `npx vitest run` — all tests pass
- Manual: trigger or seed each new event type, verify correct renderer appears
