# Event Raw Payload Modal

**Date:** 2026-06-02
**Status:** Approved

## Goal

Allow users to inspect the original raw JSON payload for any event on the Events page. The raw payload is the unmodified JSON blob received from the hook sender, before normalization.

## Approach

Lazy-fetch via `dedup_key`. The event list response is extended with a `dedup_key` field per event. When the user opens the modal for an event, the frontend fetches only that event's raw payload via a dedicated endpoint. The list response stays lean.

## Data Flow

```
EventRow "{ }" button click
  → RawPayloadModal opens (loading state)
  → GET /api/events/raw?key=<dedup_key>
  → backend: SELECT raw_payload FROM hook_events WHERE dedup_key = ?
  → returns { "raw_payload": "<json string>" }
  → modal renders CodeMirror read-only JSON viewer
```

## Backend Changes

### `backend/internal/domain/event.go`
Add `DedupKey` field to `NormalizedEvent`:
```go
DedupKey string `json:"dedup_key,omitempty"`
```

### `backend/internal/repository/repository.go`
Add to `EventRepository` interface:
```go
GetRawPayload(dedupKey string) ([]byte, error)
```

### `backend/internal/repository/sqlite/sqlite.go`
- Add `dedup_key` to the SELECT column list in `listWithWhere`
- Scan `dedup_key` into `e.DedupKey`
- Implement `GetRawPayload(dedupKey string) ([]byte, error)`:
  ```go
  SELECT raw_payload FROM hook_events WHERE dedup_key = ?
  ```
  Returns `(nil, nil)` if not found (handler converts to 404).

### `backend/internal/handler/events.go`
Add handler for `GET /api/events/raw?key=<dedup_key>`:
- Read `key` query param; return 400 if missing
- Call `svc.GetRawPayload(key)`; return 404 if nil, 500 on error
- Return `Content-Type: application/json` with body `{"raw_payload": <value>}`
- The raw payload is already valid JSON bytes — write directly without re-encoding if possible

### `backend/internal/server/router.go`
Wire route: `GET /api/events/raw` → raw payload handler.

## Frontend Changes

### `frontend/src/lib/editorTheme.ts`
Move `editorTheme.ts` from `features/hooks-config/editorTheme.ts` to `src/lib/editorTheme.ts`. No content changes — purely a relocation to make it a shared utility usable by multiple features.

### `frontend/src/features/hooks-config/HooksConfigPage.tsx`
Update import from `./editorTheme` to `@/lib/editorTheme`.

### `frontend/src/types/events.ts`
Add to `EventRecord`:
```ts
dedup_key?: string
```

### `frontend/src/features/events/RawPayloadModal.tsx`
New component. Props:
```ts
type RawPayloadModalProps = {
  dedupKey: string
  label: string      // e.g. "PreToolUse · Bash · 10:23:01"
  open: boolean
  onClose: () => void
}
```

Internal state: `status: 'loading' | 'ready' | 'error'`, `rawJson: string`.

Behavior:
- Fetch fires in `useEffect` when `open` becomes true; clears on close
- Shows `Skeleton` while loading
- Shows error `Alert` on fetch failure
- On success: renders CodeMirror with `json()` language, `argusEditorTheme` + `argusHighlighting` from `@/lib/editorTheme`, `EditorView.editable.of(false)`, `EditorView.lineWrapping`
- Copy button in modal header using `CopyIconButton` from `./renderers/CopyIconButton`
- Uses shadcn `Dialog` / `DialogContent` / `DialogHeader` primitives (add via `npx shadcn add dialog`)

### `frontend/src/features/events/EventRow.tsx`
- Add `useState` for `rawModalOpen: boolean`
- Add `Braces` icon button (lucide-react) in the content column header row, right-aligned
- Button only renders when `e.dedup_key` is truthy
- Button has `data-event-drag-ignore` to suppress drag
- Render `<RawPayloadModal>` conditionally when `rawModalOpen`

## Error Handling

| Scenario | Behavior |
|---|---|
| `dedup_key` absent (old events before migration) | Button not rendered |
| Fetch returns 404 | Modal shows "Payload not found" error |
| Fetch network error | Modal shows "Failed to load payload" error with retry not implemented |
| Raw payload is null in DB | Handler returns 404 |

## Testing

**Backend:**
- Handler test: valid key → 200 + JSON body
- Handler test: missing key param → 400
- Handler test: unknown key → 404
- Repository test: `GetRawPayload` returns correct bytes for known dedup_key

**Frontend:**
- `RawPayloadModal` test: renders loading state, then mocked response → CodeMirror present
- `RawPayloadModal` test: fetch error → error alert shown
- `EventRow` test: button renders when `dedup_key` present; absent when not

## Constraints

- Raw payload column already populated for all events since initial schema — no migration needed
- `dedup_key` is content-addressable (hash of event fields); stable across DB restores
- Dialog primitive must be added: `npx shadcn add dialog`
