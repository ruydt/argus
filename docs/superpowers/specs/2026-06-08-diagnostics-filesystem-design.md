# Diagnostics: File System Section + UI Cleanup

**Date:** 2026-06-08
**Status:** Approved

## Goal

Surface `~/.argus` directory contents (binary, logs, hooks) in the Diagnostics page with inline log tail. Clean up the Version row and Hook Config column display.

---

## Scope

1. Backend: new `DiagnosticsFileSystem` domain type, service scan, log-tail endpoint
2. Frontend: File System full-width card with inline log tail, version row split, hook config column reformatted

---

## Backend

### Domain (`backend/internal/domain/diagnostics.go`)

Add to `Diagnostics` struct:

```go
FileSystem DiagnosticsFileSystem `json:"fileSystem"`
```

New types:

```go
type DiagnosticsFileSystem struct {
    ArgusDir string                 `json:"argusDir"`
    Binary    DiagnosticsFileEntry   `json:"binary"`
    Logs      []DiagnosticsFileEntry `json:"logs"`
    Hooks     []DiagnosticsFileEntry `json:"hooks"`
}

type DiagnosticsFileEntry struct {
    Name         string  `json:"name"`
    Path         string  `json:"path"`
    SizeBytes    *int64  `json:"sizeBytes"`
    LastModified *string `json:"lastModified"` // RFC3339, nil if unreadable
    Exists       bool    `json:"exists"`
}
```

### Service (`backend/internal/service/event_service.go`)

Add `ArgusDir string` to `DiagnosticsOptions`.

In `DiagnosticsWithOptions`, populate `FileSystem`:
- `ArgusDir`: the value from options (e.g. `~/.argus` expanded)
- `Binary`: stat `<argusDir>/bin/argus`
- `Logs`: stat `<argusDir>/argus.log` and `<argusDir>/build.log` (both always listed; `Exists: false` if missing)
- `Hooks`: `readdir(<argusDir>/hooks/)`, one entry per file (skip directories)

All stat failures are non-fatal: set `Exists: false`, leave `SizeBytes` and `LastModified` nil.

### Log-Tail Handler (`backend/internal/handler/log_tail.go`)

New endpoint: `GET /api/diagnostics/log-tail?file=argus|build&lines=1-200`

- `file` param: strict whitelist — only `"argus"` and `"build"` accepted. Any other value → 400.
- Maps to `<argusDir>/argus.log` and `<argusDir>/build.log` respectively.
- `lines` param: integer 1–200, default 50. Out-of-range → clamp, not error.
- Reads last N lines by scanning from EOF.
- Response: `{ "file": "argus.log", "lines": ["line1", "line2", ...] }`
- File missing: return `{ "file": "argus.log", "lines": [] }` with 200 (not an error).
- No path traversal possible — file param never used as a path directly.

Register route: `GET /api/diagnostics/log-tail` alongside existing diagnostics route.

`ArgusDir` passed to handler via closure from `main.go` (same pattern as `DiagnosticsOptions`).

### Frontend Types (`frontend/src/features/diagnostics/types.ts`)

Add:

```ts
export type DiagnosticsFileEntry = {
  name: string
  path: string
  sizeBytes: number | null
  lastModified: string | null // RFC3339
  exists: boolean
}

export type DiagnosticsFileSystem = {
  argusDir: string
  binary: DiagnosticsFileEntry
  logs: DiagnosticsFileEntry[]
  hooks: DiagnosticsFileEntry[]
}
```

Add `fileSystem: DiagnosticsFileSystem` to `Diagnostics` type.

---

## Frontend

### Version Row Fix (System Facts card)

**Before:** single row — `v0.1.1-15-geb8a4aa eb8a4aa 2026-06-08T09:56:26Z`

**After:** three rows:

| Label | Value |
|---|---|
| Version | `v0.1.1-15-geb8a4aa` |
| Commit | `eb8a4aa` (monospace, amber `var(--edit)`) |
| Built | `Jun 8, 2026` (formatted from buildDate) |

`buildDate` format: parse RFC3339, render as `MMM D, YYYY` using `date-fns/format`.

### Hook Config Column

Change `detectHookConfigLabel` in `frontend/src/features/hooks-config/presets.ts`:

- Remove all preset name returns (Baseline / Medium / Full).
- Any argus-managed events present → `Configured (X/Y)` where X = `argusEventTypes.size`, Y = `AGENT_EVENT_TOTALS[agent]`.
- No argus-managed events but hooks exist → `Configured` (manual setup, no count).
- No hooks at all → `Missing` (unchanged — backend drives the `hookConfigStatus: 'missing'` branch; this return path is a fallback).

`HookConfigCell` in `DiagnosticsPage.tsx`: no logic changes needed — it renders `label` as-is. Remove the `label ?? 'Configured'` fallback default since the function now always returns a string.

### File System Card (`FileSystemCard` component, new file)

Full-width card, rendered below the existing 2-column section in `LoadedContent`.

**Structure:**

```
┌─ File System ─────────────────────────────────────────────┐
│  Header row: ~/.argus  [copy path button]                │
├───────────────────────────────────────────────────────────┤
│  Binary section                                           │
│    argus   <path>   <size>   <last modified>   [copy]   │
├───────────────────────────────────────────────────────────┤
│  Logs section                                             │
│  For each log file:                                       │
│    <name>  <path>  <size>  <modified>  [copy] [Tail ▾]   │
│    ┌─ inline panel (collapsible) ──────────────────────┐  │
│    │ <pre> last 50 lines, monospace, max-h 320px,      │  │
│    │ overflow-y scroll                      [Refresh]  │  │
│    └───────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────┤
│  Hooks section (count in header)                          │
│  For each hook file:                                      │
│    <name>   <size>   <last modified>   [copy path]       │
│  Empty state: "No hook scripts found"                     │
└───────────────────────────────────────────────────────────┘
```

**Tail behavior:**
- One log panel open at a time (toggling one closes the other).
- Clicking Tail: fetch `/api/diagnostics/log-tail?file=<name>&lines=50`, expand panel.
- Clicking Tail again: collapse panel (no refetch).
- Refresh button: re-fetches with same params, shows loading spinner on button.
- Error state: inline `"Failed to load log"` text inside panel.
- File missing (`lines: []`): show `"Log file is empty or not found"`.

**`useLogTail` hook (new, co-located in `features/diagnostics/hooks/`):**

```ts
function useLogTail(file: 'argus' | 'build', lines = 50) {
  // fetch on demand (not on mount)
  // returns { lines, loading, error, fetch, clear }
}
```

`fetch()` triggers the request. `clear()` resets state.

**Size display:** reuse existing `formatBytes` helper from `DiagnosticsPage.tsx` — extract to `features/diagnostics/utils.ts` so `FileSystemCard` can import it.

**Missing binary:** show `Exists: false` state — grey "Not found" text instead of size/date.

### Component placement

`FileSystemCard` exported from `features/diagnostics/FileSystemCard.tsx`. Imported and rendered in `LoadedContent` directly after the 2-column `<div>`.

---

## Error Handling

- Backend stat failures: non-fatal, entry shows `exists: false`.
- Log-tail file missing: `200 { lines: [] }` — frontend shows empty state message, not error.
- Log-tail bad `file` param: `400` — frontend shows `"Failed to load log"` in panel.
- Frontend fetch error in `useLogTail`: set `error` state, show inline error in panel.

---

## Testing

**Backend:**
- Unit test `DiagnosticsWithOptions` with a temp `argusDir` containing binary, logs, hooks — assert correct `FileSystem` population.
- Unit test log-tail handler: valid file → 200 with lines; invalid file param → 400; missing file → 200 empty lines.
- Add `ArgusDir` to existing diagnostics handler test setup.

**Frontend:**
- Test `detectHookConfigLabel` change: argus-managed exact-preset match → `Configured (X/Y)` not preset name; custom → `Configured (X/Y)`; manual → `Configured`; empty → `Missing`.
- Test `FileSystemCard`: renders binary row, log rows with Tail toggle, hooks list; Tail button calls fetch; Refresh re-fetches; missing file shows `"Not found"`.
- Test `useLogTail`: fetches on `fetch()` call, not on mount; loading/error/clear states.

---

## Files Changed

| File | Change |
|---|---|
| `backend/internal/domain/diagnostics.go` | Add `DiagnosticsFileSystem`, `DiagnosticsFileEntry`, field on `Diagnostics` |
| `backend/internal/service/event_service.go` | Add `ArgusDir` to options, populate `FileSystem` in `DiagnosticsWithOptions` |
| `backend/internal/handler/log_tail.go` | New log-tail handler |
| `backend/internal/server/router.go` | Register `GET /api/diagnostics/log-tail` |
| `backend/cmd/server/main.go` | Pass `ArgusDir` to `DiagnosticsOptions` and log-tail handler |
| `backend/tests/internal/handler/log_tail_test.go` | New handler tests |
| `backend/tests/internal/handler/diagnostics_test.go` | Update for `ArgusDir` + `FileSystem` field |
| `frontend/src/features/diagnostics/types.ts` | Add `DiagnosticsFileEntry`, `DiagnosticsFileSystem`, extend `Diagnostics` |
| `frontend/src/features/diagnostics/utils.ts` | Extract `formatBytes` from `DiagnosticsPage.tsx` |
| `frontend/src/features/diagnostics/hooks/useLogTail.ts` | New hook |
| `frontend/src/features/diagnostics/FileSystemCard.tsx` | New component |
| `frontend/src/features/diagnostics/DiagnosticsPage.tsx` | Version row split; render `FileSystemCard`; import `formatBytes` from utils |
| `frontend/src/features/hooks-config/presets.ts` | Change `detectHookConfigLabel` to always return `Configured (X/Y)` |
