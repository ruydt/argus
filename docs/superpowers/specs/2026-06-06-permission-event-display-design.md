# Permission Event Display Design

**Date:** 2026-06-06
**Status:** Approved

## Problem

Three data points present in raw hook payloads are invisible on the events page:

1. **`tool_input.description`** — A human-readable intent string (e.g., "Check IconAvatar props") present on Bash and other tool events. Already captured in `NormalizedEvent.Description` / `EventRecord.description`, but never rendered.

2. **`tool_input.questions`** — The structured question array sent by `AskUserQuestion` permission requests. Contains header, question text, and options with labels and descriptions. Completely lost during normalization — `ToolInput` struct has no `questions` field.

3. **`permission_suggestions`** — Rule recommendations Claude sends alongside permission requests (e.g., "allow `xargs cat` → localSettings"). Not captured in `RawPayload` at all.

## Goal

Make PermissionRequest and PreToolUse/PostToolUse events fully human-readable at a glance, without requiring users to open the raw payload modal.

## Scope

- Claude Code (primary)
- Codex (same `RawPayload` / `ToolInput` structs — automatic benefit)
- No changes to session tree, dashboard, usage, or SSE broadcast logic

---

## Design

### Architecture Overview

```
POST /api/hook
  tool_input.questions       → RawPayload.ToolInput.Questions (json.RawMessage)
  permission_suggestions     → RawPayload.PermissionSuggestions (json.RawMessage)
  → claudecode.Normalize()
      ToolInputQuestionsJSON    ← string(ToolInput.Questions)
      PermissionSuggestionsJSON ← string(PermissionSuggestions)
  → SQLite: tool_input_questions_json, permission_suggestions_json
  → GET /api/events
      EventRecord.tool_input_questions_json
      EventRecord.permission_suggestions_json
  → PermissionBlock.tsx (AskUserQuestion card + suggestion chips)
  → CommandBlock.tsx (description as "Intent:" label)
```

### Backend

#### `domain/hook.go`

Add `Questions json.RawMessage` to `ToolInput`:

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
    Questions   json.RawMessage `json:"questions"` // AskUserQuestion payload
}
```

Add `PermissionSuggestions` to `RawPayload`:

```go
// Permission fields
PermissionMode        string          `json:"permission_mode"`
PermissionSuggestions json.RawMessage `json:"permission_suggestions"`
```

#### `domain/event.go`

Add two string fields to `NormalizedEvent`:

```go
ToolInputQuestionsJSON    string `json:"tool_input_questions_json"`
PermissionSuggestionsJSON string `json:"permission_suggestions_json"`
```

Corresponding JSON tag names must match the frontend `EventRecord` field names exactly.

#### `claudecode/claudecode.go`

In `Normalize()`, marshal the raw JSON fields to strings. Use a helper `marshalRawJSON(b json.RawMessage) string` that returns `""` for nil/empty input:

```go
ToolInputQuestionsJSON:    marshalRawJSON(p.ToolInput.Questions),
PermissionSuggestionsJSON: marshalRawJSON(p.PermissionSuggestions),
```

#### `codex/codex.go`

Same wiring — add identical mappings in Codex's `Normalize()`. Both normalizers read from the same `RawPayload` struct.

#### Migration: `011_permission_fields.sql`

```sql
ALTER TABLE events ADD COLUMN tool_input_questions_json TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN permission_suggestions_json TEXT NOT NULL DEFAULT '';
```

New file in `backend/internal/repository/sqlite/migrations/`. Never edit existing migration files.

#### `repository/sqlite/sqlite.go`

Update the event INSERT statement to write both new columns. Update the SELECT (scan) to read them back into `domain.NormalizedEvent`. Update any test helpers that construct `NormalizedEvent` literals if needed.

---

### Frontend

#### `types/events.ts`

```ts
tool_input_questions_json?: string
permission_suggestions_json?: string
```

These are raw JSON strings. Frontend parses them client-side.

#### `CommandBlock.tsx`

Add optional `description` prop. When set, render a small "Intent:" label below the command block:

```tsx
type CommandBlockProps = {
  prompt?: string
  command?: string
  path?: string
  description?: string  // new
  searchQuery?: string
}
```

Render (inside the existing block, after the `<pre>`):

```tsx
{description && (
  <p className="mt-1 text-[0.7rem] text-[#777]">
    <span className="text-[#555]">Intent:</span> {description}
  </p>
)}
```

#### New `renderers/PermissionBlock.tsx`

Handles all `action === 'PERMISSION'` events.

```tsx
type PermissionBlockProps = {
  toolName?: string
  toolInputQuestionsJson?: string
  permissionSuggestionsJson?: string
  searchQuery?: string
}
```

**AskUserQuestion section** (when `toolName === 'AskUserQuestion'` and `toolInputQuestionsJson` is set):

Parse the JSON as:
```ts
type Question = {
  question: string
  header: string
  options: Array<{ label: string; description: string }>
  multiSelect?: boolean
}
```

Render each question as a card:
```
┌─ Clarify issue ───────────────────────────────────────┐
│  What do you mean by 'not live' for that session?     │
│                                                        │
│  ○ Old session, wrong time range                      │
│    Session is from hours/days ago — ...               │
│  ○ Session ended, still showing                       │
│    Session finished recently...                       │
│  ○ Missing live indicator                             │
│    Session appears but has no visual badge...         │
└────────────────────────────────────────────────────────┘
```

Options are display-only (no interactivity). Use `○` for single-select, `□` for `multiSelect: true`.

**Permission suggestions section** (when `permissionSuggestionsJson` is set, any tool):

Parse as:
```ts
type PermissionSuggestion = {
  type: string
  rules: Array<{ toolName: string; ruleContent: string }>
  behavior: string        // "allow" | "deny"
  destination: string     // "localSettings" | "userSettings"
}
```

Render each suggestion as a small chip:
```
allow "xargs cat" → localSettings
```

Style: small muted badge, `allow` in green, `deny` in red.

**Generic tool section** (non-AskUserQuestion PermissionRequest):

If there's no questions data but there is a description (passed from the parent via `CommandBlock`), the description already shows inline. No additional block needed.

#### `EventRow.tsx`

1. Pass `description={e.description}` to `CommandBlock` where it's invoked.

2. Add `PermissionBlock` for PERMISSION action:

```tsx
{e.action === 'PERMISSION' && (
  <PermissionBlock
    toolName={e.tool}
    toolInputQuestionsJson={e.tool_input_questions_json}
    permissionSuggestionsJson={e.permission_suggestions_json}
    searchQuery={searchQuery}
  />
)}
```

---

### Testing

#### Backend

**`claudecode/claudecode_test.go`**:
- AskUserQuestion PermissionRequest payload → `NormalizedEvent.ToolInputQuestionsJSON` is non-empty, parseable, questions array length matches
- Bash PermissionRequest with `permission_suggestions` → `NormalizedEvent.PermissionSuggestionsJSON` is non-empty, parseable
- Payload without questions/suggestions → both fields are `""`

**`repository/sqlite/sqlite_test.go`**:
- Round-trip: INSERT event with both fields set → SELECT returns same JSON strings

#### Frontend

**`renderers/__tests__/PermissionBlock.test.tsx`**:
- AskUserQuestion data → renders question header, question text, all option labels
- AskUserQuestion multiSelect → renders `□` instead of `○`
- Permission suggestion → renders behavior and destination
- Empty/invalid JSON strings → renders nothing (no crash)

---

## Constraints

- `PermissionBlock` is display-only. Options are never interactive.
- JSON parse errors in `tool_input_questions_json` or `permission_suggestions_json` must fail silently (return `null`, render nothing).
- Existing events in the DB (pre-migration) will have `''` for both columns — frontend must handle empty string as "no data."
- Do not add `questions` to the `ToolCall` struct used by PostToolBatch — that's a different shape.
- `description` display in `CommandBlock` applies to any action with a description set, not just `PERMISSION`. This improves Bash PreToolUse events too.
