# Hooks Config Editor — Design Spec

**Date:** 2026-06-02  
**Status:** Approved

## Goal

Add a Hooks Config page to the argus frontend where users can view and edit hook configurations for Claude Code (`~/.claude/settings.json`) and Codex (`~/.codex/hooks.json`) without leaving the browser.

---

## Backend API

### New file: `backend/internal/handler/hooks_config.go`

Two endpoints registered on the existing router:

```
GET  /api/hooks-config?agent=claudecode|codex
PUT  /api/hooks-config?agent=claudecode|codex
```

**GET** — reads the config file and returns the `hooks` map:

```json
{ "hooks": { "SessionStart": [...], "PreToolUse": [...] } }
```

Returns `{"hooks": {}}` with HTTP 200 if the file is missing (not an error).

**PUT** — body must match the same shape. Behavior per agent:

- `claudecode`: reads `~/.claude/settings.json`, replaces only the `hooks` key, writes back (all other settings keys preserved)
- `codex`: writes `~/.codex/hooks.json` directly (entire file is hooks config)

Creates parent directories and file if missing on write.

**Error responses:**
- Unknown `agent` param → 400
- Invalid JSON body → 400
- File write failure (permissions, disk full) → 500 with message

Agent is determined by query param only. No path construction from user input — no path traversal risk.

---

## Data Types

### Backend (Go)

```go
// HookEntry is a single hook command within a group.
type HookEntry struct {
    Type          string `json:"type"`
    Command       string `json:"command"`
    Timeout       *int   `json:"timeout,omitempty"`
    StatusMessage string `json:"statusMessage,omitempty"`
}

// HookGroup is a matcher + list of hook entries.
type HookGroup struct {
    Matcher string      `json:"matcher,omitempty"`
    Hooks   []HookEntry `json:"hooks"`
}

// HooksConfigPayload is the request/response body for GET and PUT.
type HooksConfigPayload struct {
    Hooks map[string][]HookGroup `json:"hooks"`
}
```

### Frontend (TypeScript)

Co-located in `frontend/src/features/hooks-config/types.ts`:

```ts
export type HookEntry = {
  type: string
  command: string
  timeout?: number
  statusMessage?: string
}

export type HookGroup = {
  matcher?: string
  hooks: HookEntry[]
}

export type HooksConfig = {
  hooks: Record<string, HookGroup[]>
}
```

---

## Frontend Structure

### New files

```
frontend/src/features/hooks-config/
  HooksConfigPage.tsx          # page shell, agent tabs, Save button
  StructuredEditor.tsx         # collapsible event sections, add/remove entries
  types.ts                     # HookEntry, HookGroup, HooksConfig
  hooks/
    useHooksConfig.ts          # fetch, save, dirty tracking per agent
```

### Route + sidebar

- Route: `/hooks-config` added to `App.tsx`
- Sidebar item added to `NAV_ITEMS` in `Sidebar.tsx` (icon: `Webhook` from lucide-react)

---

## Page Layout

```
[Hooks Config]                         [Save]  ← disabled when no dirty changes

[Claude Code]  [Codex]                 ← agent tabs

                          [Structured | JSON]  ← toggle in tab top-right

┌─ SessionStart ─────────────────────────────────────────────┐
│  matcher: [           ]                                     │
│  command: [                                              ]  │
│  timeout: [   ]   statusMessage: [                      ]  │
│  [+ Add hook]                          [Remove]            │
└────────────────────────────────────────────────────────────┘
[+ Add event type]
```

**JSON view** (toggled per tab):

- Monospace `<textarea>` showing full hooks JSON
- Real-time validation: invalid JSON → red border + "Invalid JSON" label, Save disabled
- Invalid shape (valid JSON but wrong structure) → stays in JSON view, inline warning

---

## State & Behavior

### `useHooksConfig.ts`

- Fetches `GET /api/hooks-config?agent=...` on mount
- Tracks `savedConfig` (last fetched/saved) and `draftConfig` (in-flight edits)
- `isDirty = draftConfig !== JSON.stringify(savedConfig)`
- Save: `PUT /api/hooks-config?agent=...` with draft, updates `savedConfig` on success
- Per-agent state is independent — each tab has its own draft/dirty tracking

### View toggle

- State: `viewMode: 'structured' | 'json'` per agent tab (not shared)
- Structured → JSON: serializes current draft to formatted JSON string
- JSON → Structured: parses JSON string; if valid and correct shape, updates draft; if invalid, blocks switch and shows error

### Dirty tracking across tabs

Each agent tab tracks dirty state independently. No warning shown when switching tabs — per-tab state is preserved in memory until save or page reload.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Load fails | Error card + Retry button (matches DiagnosticsPage pattern) |
| Save fails | Inline error below Save button; config stays editable |
| JSON textarea invalid | Save disabled, red border, "Invalid JSON" label |
| JSON valid but wrong shape | Warn inline; stay in JSON view |
| File missing on load | Empty editor (no error) |
| File created on save | Silent — backend creates dirs + file |

---

## Out of Scope

- Backup-before-write
- Undo/redo history
- Validation of hook command syntax
- Support for project-level hook configs (only global `~/.claude/` and `~/.codex/`)
