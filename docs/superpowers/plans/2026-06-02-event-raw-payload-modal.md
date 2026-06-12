# Event Raw Payload Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a modal to the Events page that lets users inspect the original raw JSON payload for any event, fetched on-demand via a `dedup_key`-keyed backend endpoint.

**Architecture:** Expose `dedup_key` in the event list response; add `GET /api/events/raw?key=<dedup_key>` endpoint that returns the stored raw payload bytes; frontend opens a CodeMirror read-only JSON viewer in a Dialog modal when the user clicks a `Braces` icon button on any EventRow.

**Tech Stack:** Go `net/http`, `database/sql`, `encoding/json`; React 19, CodeMirror 6 (`@uiw/react-codemirror`, `@codemirror/lang-json`), shadcn Dialog, lucide-react `Braces` icon.

---

## File Map

| File | Change |
|---|---|
| `backend/internal/domain/event.go` | Add `DedupKey` field |
| `backend/internal/repository/repository.go` | Add `GetRawPayload` to interface |
| `backend/internal/repository/sqlite/sqlite.go` | Add dedup_key to SELECT+Scan; implement `GetRawPayload` |
| `backend/internal/service/event_service.go` | Add `GetRawPayload` delegation method |
| `backend/internal/handler/events.go` | Add `EventRawPayload` handler |
| `backend/internal/server/router.go` | Wire `GET /api/events/raw` |
| `backend/tests/internal/handler/events_test.go` | Add 3 handler tests |
| `backend/tests/internal/repository/sqlite/sqlite_test.go` | Add 2 repo tests |
| `frontend/src/lib/editorTheme.ts` | Move from hooks-config (new location) |
| `frontend/src/features/hooks-config/HooksConfigPage.tsx` | Update import path |
| `frontend/src/types/events.ts` | Add `dedup_key?: string` |
| `frontend/src/features/events/RawPayloadModal.tsx` | New component |
| `frontend/src/features/events/EventRow.tsx` | Add button + modal state |
| `frontend/tests/features/events/RawPayloadModal.test.tsx` | New test file |
| `frontend/tests/features/events/EventRow.test.tsx` | Add 2 button visibility tests |

---

## Task 1: Expose `dedup_key` in event list response

**Files:**
- Modify: `backend/internal/domain/event.go`
- Modify: `backend/internal/repository/sqlite/sqlite.go:185-254`

- [ ] **Step 1: Add `DedupKey` field to `NormalizedEvent`**

In `backend/internal/domain/event.go`, add after the `RawPayload` field (line 27):

```go
DedupKey   string `json:"dedup_key,omitempty"`
```

The full block should look like:
```go
RawPayload  []byte `json:"-"`
DedupKey    string `json:"dedup_key,omitempty"`
```

- [ ] **Step 2: Add `dedup_key` to `listWithWhere` SELECT**

In `backend/internal/repository/sqlite/sqlite.go`, in the `listWithWhere` function, change the last line of the SELECT from:

```sql
       COALESCE(normalizer_version,''), COALESCE(agent_version,''), COALESCE(normalization_status,'')
```

to:

```sql
       COALESCE(normalizer_version,''), COALESCE(agent_version,''), COALESCE(normalization_status,''),
       COALESCE(dedup_key,'')
```

- [ ] **Step 3: Add `&e.DedupKey` to the `rows.Scan` call**

In the same function, find the `rows.Scan(...)` call. Add `&e.DedupKey` at the very end, after `&e.NormalizationStatus`:

```go
if err := rows.Scan(
    &e.Time, &e.Agent, &e.Session, &e.HookEventName,
    &e.TurnID, &e.ToolUseID, &e.Tool, &e.Model, &e.Source,
    &e.CWD, &e.TranscriptPath,
    &e.Action, &e.Path, &e.Command,
    &e.OldString, &e.NewString, &e.StartLine,
    &ctxBefore, &ctxAfter,
    &e.Prompt, &e.Description,
    &e.PermissionMode, &e.Response,
    &e.ErrorMessage, &e.ErrorType,
    &e.SubagentID, &e.SubagentType,
    &e.TaskID, &e.TaskTitle, &e.TaskDescription,
    &e.NotificationType, &e.NotificationTitle, &e.NotificationMessage,
    &e.ChangeType, &e.OldCWD, &e.NewCWD, &e.ToolCallsJSON,
    &e.ToolResultStdout, &e.ToolResultStderr, &e.DurationMS, &e.Trigger,
    &e.NormalizerVersion, &e.AgentVersion, &e.NormalizationStatus,
    &e.DedupKey,
); err != nil {
    return nil, err
}
```

- [ ] **Step 4: Build and verify no errors**

```bash
cd backend && go build ./...
```

Expected: no output (success).

- [ ] **Step 5: Run tests**

```bash
cd backend && go test ./...
```

Expected: all pass, no failures.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/domain/event.go backend/internal/repository/sqlite/sqlite.go
git commit -m "feat(backend): expose dedup_key in event list response"
```

---

## Task 2: Add `GetRawPayload` to repository interface and SQLite implementation

**Files:**
- Modify: `backend/internal/repository/repository.go`
- Modify: `backend/internal/repository/sqlite/sqlite.go`
- Test: `backend/tests/internal/repository/sqlite/sqlite_test.go`

- [ ] **Step 1: Write the failing repository tests**

Add to `backend/tests/internal/repository/sqlite/sqlite_test.go`:

```go
func TestGetRawPayload_returnsStoredBytes(t *testing.T) {
	db := newTestDB(t)
	e := domain.NormalizedEvent{
		Time:          "2026-01-01T00:00:00Z",
		Agent:         "claudecode",
		Session:       "sess1",
		HookEventName: "PreToolUse",
		TurnID:        "t1",
		ToolUseID:     "u1",
		RawPayload:    []byte(`{"tool":"Bash","input":"echo hi"}`),
	}
	if err := db.Add(e); err != nil {
		t.Fatalf("Add: %v", err)
	}

	events, err := db.List(10)
	if err != nil || len(events) == 0 {
		t.Fatalf("List: %v, len=%d", err, len(events))
	}
	key := events[0].DedupKey
	if key == "" {
		t.Fatal("DedupKey is empty after list")
	}

	got, err := db.GetRawPayload(key)
	if err != nil {
		t.Fatalf("GetRawPayload: %v", err)
	}
	want := `{"tool":"Bash","input":"echo hi"}`
	if string(got) != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestGetRawPayload_unknownKeyReturnsNil(t *testing.T) {
	db := newTestDB(t)
	got, err := db.GetRawPayload("nonexistentkey")
	if err != nil {
		t.Fatalf("GetRawPayload: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil for unknown key, got %q", got)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && go test ./tests/internal/repository/sqlite/... -run TestGetRawPayload -v
```

Expected: FAIL with `db.GetRawPayload undefined` (method doesn't exist yet).

- [ ] **Step 3: Add `GetRawPayload` to the repository interface**

In `backend/internal/repository/repository.go`, add to the `EventRepository` interface:

```go
GetRawPayload(dedupKey string) ([]byte, error)
```

Add it after the `ExportSnapshot` line:

```go
ExportEvents(ctx context.Context, w io.Writer) error
ExportSnapshot(ctx context.Context, destPath string) error
GetRawPayload(dedupKey string) ([]byte, error)
Ready() bool
```

- [ ] **Step 4: Implement `GetRawPayload` in SQLite**

Add this method to `backend/internal/repository/sqlite/sqlite.go`, after the `dedupKey` function (around line 930):

```go
func (d *DB) GetRawPayload(dedupKey string) ([]byte, error) {
	var raw string
	err := d.db.QueryRow(
		`SELECT COALESCE(raw_payload,'') FROM hook_events WHERE dedup_key = ? LIMIT 1`,
		dedupKey,
	).Scan(&raw)
	if err == sql.ErrNoRows || raw == "" {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return []byte(raw), nil
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && go test ./tests/internal/repository/sqlite/... -run TestGetRawPayload -v
```

Expected: PASS for both tests.

- [ ] **Step 6: Run full backend test suite**

```bash
cd backend && go test ./...
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/repository/repository.go backend/internal/repository/sqlite/sqlite.go backend/tests/internal/repository/sqlite/sqlite_test.go
git commit -m "feat(backend): add GetRawPayload to repository interface and sqlite"
```

---

## Task 3: Add service method, handler, and route

**Files:**
- Modify: `backend/internal/service/event_service.go`
- Modify: `backend/internal/handler/events.go`
- Modify: `backend/internal/server/router.go`
- Test: `backend/tests/internal/handler/events_test.go`

- [ ] **Step 1: Write the failing handler tests**

Add to `backend/tests/internal/handler/events_test.go`:

```go
func TestEventRawPayloadHandler_returnsPayload(t *testing.T) {
	svc := newTestService(t)
	e := domain.NormalizedEvent{
		Time:          "2026-01-01T00:00:00Z",
		Agent:         "claudecode",
		Session:       "sess-raw",
		HookEventName: "PreToolUse",
		TurnID:        "t1",
		ToolUseID:     "u1",
		RawPayload:    []byte(`{"tool":"Bash","input":"echo hi"}`),
	}
	if err := svc.AddEvent(e); err != nil {
		t.Fatalf("AddEvent: %v", err)
	}

	events, err := svc.ListEvents(10)
	if err != nil || len(events) == 0 {
		t.Fatalf("ListEvents: %v, len=%d", err, len(events))
	}
	key := events[0].DedupKey
	if key == "" {
		t.Fatal("DedupKey empty")
	}

	h := handler.EventRawPayload(svc)
	req := httptest.NewRequest(http.MethodGet, "/api/events/raw?key="+key, nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		RawPayload map[string]any `json:"raw_payload"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.RawPayload["tool"] != "Bash" {
		t.Errorf("tool = %v, want Bash", resp.RawPayload["tool"])
	}
}

func TestEventRawPayloadHandler_missingKeyReturns400(t *testing.T) {
	h := handler.EventRawPayload(newTestService(t))
	req := httptest.NewRequest(http.MethodGet, "/api/events/raw", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestEventRawPayloadHandler_unknownKeyReturns404(t *testing.T) {
	h := handler.EventRawPayload(newTestService(t))
	req := httptest.NewRequest(http.MethodGet, "/api/events/raw?key=doesnotexist", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && go test ./tests/internal/handler/... -run TestEventRawPayload -v
```

Expected: FAIL with `handler.EventRawPayload undefined`.

- [ ] **Step 3: Add `GetRawPayload` method to `EventService`**

In `backend/internal/service/event_service.go`, add after `ListEventsBySession`:

```go
func (s *EventService) GetRawPayload(dedupKey string) ([]byte, error) {
	return s.repo.GetRawPayload(dedupKey)
}
```

- [ ] **Step 4: Add `EventRawPayload` handler to `handler/events.go`**

Add this function to `backend/internal/handler/events.go`:

```go
func EventRawPayload(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := r.URL.Query().Get("key")
		if key == "" {
			http.Error(w, "missing key", http.StatusBadRequest)
			return
		}
		raw, err := svc.GetRawPayload(key)
		if err != nil {
			log.Printf("[handler] GetRawPayload: %v", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if raw == nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		resp := struct {
			RawPayload json.RawMessage `json:"raw_payload"`
		}{RawPayload: json.RawMessage(raw)}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			log.Printf("[handler] encode raw payload: %v", err)
		}
	})
}
```

- [ ] **Step 5: Wire route in router**

In `backend/internal/server/router.go`, add after the `GET /api/events/stream` line:

```go
mux.Handle("GET /api/events/raw", handler.EventRawPayload(svc))
```

- [ ] **Step 6: Run handler tests**

```bash
cd backend && go test ./tests/internal/handler/... -run TestEventRawPayload -v
```

Expected: all 3 tests PASS.

- [ ] **Step 7: Run full suite and lint**

```bash
cd backend && go test ./... && golangci-lint run ./...
```

Expected: all pass, no lint errors.

- [ ] **Step 8: Commit**

```bash
git add backend/internal/service/event_service.go backend/internal/handler/events.go backend/internal/server/router.go backend/tests/internal/handler/events_test.go
git commit -m "feat(backend): add GET /api/events/raw endpoint for raw payload inspection"
```

---

## Task 4: Move editorTheme to shared lib

**Files:**
- Create: `frontend/src/lib/editorTheme.ts`
- Modify: `frontend/src/features/hooks-config/HooksConfigPage.tsx`
- Delete: `frontend/src/features/hooks-config/editorTheme.ts`

- [ ] **Step 1: Create `src/lib/editorTheme.ts`**

Create `frontend/src/lib/editorTheme.ts` with exactly this content (copied from `features/hooks-config/editorTheme.ts`):

```ts
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags } from '@lezer/highlight'

const bg = '#0d1117'
const cyan = '#79c0ff'
const orange = '#ffa657'
const white = '#e6edf3'
const muted = '#8b949e'
const selection = 'rgba(121, 192, 255, 0.18)'
const lineHighlight = '#161b22'

export const argusEditorTheme = EditorView.theme(
  {
    '&': { backgroundColor: bg, color: white },
    '.cm-content': { caretColor: white },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: white },
    '.cm-selectionBackground': { backgroundColor: selection },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: selection },
    '.cm-gutters': { backgroundColor: bg, color: muted, border: 'none', borderRight: '1px solid #21262d' },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '3ch', paddingRight: '12px' },
    '.cm-activeLineGutter': { backgroundColor: lineHighlight },
    '.cm-activeLine': { backgroundColor: lineHighlight },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(121, 192, 255, 0.15)',
      color: `${white} !important`,
      outline: '1px solid rgba(121, 192, 255, 0.4)',
    },
    '.cm-foldPlaceholder': { backgroundColor: '#21262d', border: '1px solid #30363d', color: muted },
    '.cm-tooltip': { backgroundColor: '#161b22', border: '1px solid #30363d' },
    '.cm-tooltip .cm-tooltip-arrow:before': { borderTopColor: '#30363d' },
    '.cm-tooltip .cm-tooltip-arrow:after': { borderTopColor: '#161b22' },
  },
  { dark: true }
)

export const argusHighlighting = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.propertyName, color: cyan },
    { tag: tags.string, color: orange },
    { tag: tags.number, color: orange },
    { tag: tags.bool, color: orange },
    { tag: tags.null, color: muted },
    { tag: tags.punctuation, color: white },
    { tag: tags.bracket, color: white },
    { tag: tags.brace, color: white },
  ])
)
```

- [ ] **Step 2: Update import in `HooksConfigPage.tsx`**

In `frontend/src/features/hooks-config/HooksConfigPage.tsx`, change:

```ts
import { argusEditorTheme, argusHighlighting } from './editorTheme'
```

to:

```ts
import { argusEditorTheme, argusHighlighting } from '@/lib/editorTheme'
```

- [ ] **Step 3: Delete the old file**

```bash
rm frontend/src/features/hooks-config/editorTheme.ts
```

- [ ] **Step 4: Type check and tests**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: no type errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/editorTheme.ts frontend/src/features/hooks-config/HooksConfigPage.tsx && git rm frontend/src/features/hooks-config/editorTheme.ts
git commit -m "refactor(frontend): move editorTheme to src/lib as shared utility"
```

---

## Task 5: Add Dialog component, update types, create RawPayloadModal

**Files:**
- Install: shadcn Dialog
- Modify: `frontend/src/types/events.ts`
- Create: `frontend/src/features/events/RawPayloadModal.tsx`
- Create: `frontend/tests/features/events/RawPayloadModal.test.tsx`

- [ ] **Step 1: Add shadcn Dialog component**

```bash
cd frontend && npx shadcn add dialog
```

Expected: creates `frontend/src/components/ui/dialog.tsx`.

- [ ] **Step 2: Add `dedup_key` to `EventRecord`**

In `frontend/src/types/events.ts`, add inside the `EventRecord` interface after `agent_version?`:

```ts
dedup_key?: string
```

- [ ] **Step 3: Write the failing RawPayloadModal tests**

Create `frontend/tests/features/events/RawPayloadModal.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RawPayloadModal } from '@/features/events/RawPayloadModal'

function renderModal(props: Partial<Parameters<typeof RawPayloadModal>[0]> = {}) {
  return render(
    <RawPayloadModal
      dedupKey="abc123"
      label="PreToolUse · Bash · 10:23:01"
      open={true}
      onClose={vi.fn()}
      {...props}
    />
  )
}

describe('RawPayloadModal', () => {
  afterEach(() => vi.clearAllMocks())

  it('shows loading skeleton while fetching', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    renderModal()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  it('renders CodeMirror editor after fetch succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ raw_payload: { tool: 'Bash', input: 'echo hi' } }),
      })
    )
    renderModal()
    await waitFor(() => expect(document.querySelector('.cm-editor')).not.toBeNull())
  })

  it('shows error message when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(/failed to load raw payload/i)).toBeTruthy()
    )
  })

  it('shows error message when fetch returns non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404 })
    )
    renderModal()
    await waitFor(() =>
      expect(screen.getByText(/failed to load raw payload/i)).toBeTruthy()
    )
  })

  it('does not fetch when modal is closed', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderModal({ open: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run tests/features/events/RawPayloadModal.test.tsx
```

Expected: FAIL with module not found or import error.

- [ ] **Step 5: Create `RawPayloadModal.tsx`**

Create `frontend/src/features/events/RawPayloadModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { json } from '@codemirror/lang-json'
import { EditorView } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { argusEditorTheme, argusHighlighting } from '@/lib/editorTheme'
import { CopyIconButton } from './renderers/CopyIconButton'

type RawPayloadModalProps = {
  dedupKey: string
  label: string
  open: boolean
  onClose: () => void
}

export function RawPayloadModal({ dedupKey, label, open, onClose }: RawPayloadModalProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [rawJson, setRawJson] = useState('')

  useEffect(() => {
    if (!open) return
    setStatus('loading')
    setRawJson('')
    void fetch(`/api/events/raw?key=${encodeURIComponent(dedupKey)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        const data = (await res.json()) as { raw_payload: unknown }
        setRawJson(JSON.stringify(data.raw_payload, null, 2))
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }, [open, dedupKey])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex max-h-[80vh] max-w-3xl flex-col gap-3">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="font-mono text-xs text-[#8b949e]">{label}</DialogTitle>
            {status === 'ready' && <CopyIconButton text={rawJson} label="raw payload" />}
          </div>
        </DialogHeader>
        {status === 'loading' && <Skeleton className="h-64 w-full" aria-busy="true" />}
        {status === 'error' && (
          <Alert variant="destructive">
            <AlertDescription>Failed to load raw payload.</AlertDescription>
          </Alert>
        )}
        {status === 'ready' && (
          <div className="overflow-auto rounded-md">
            <CodeMirror
              value={rawJson}
              extensions={[
                json(),
                argusEditorTheme,
                argusHighlighting,
                EditorView.lineWrapping,
                EditorView.editable.of(false),
              ]}
              basicSetup={false}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd frontend && npx vitest run tests/features/events/RawPayloadModal.test.tsx
```

Expected: all 5 tests PASS.

- [ ] **Step 7: Type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ui/dialog.tsx frontend/src/types/events.ts frontend/src/features/events/RawPayloadModal.tsx frontend/tests/features/events/RawPayloadModal.test.tsx
git commit -m "feat(frontend): add RawPayloadModal component with CodeMirror JSON viewer"
```

---

## Task 6: Wire trigger button into EventRow

**Files:**
- Modify: `frontend/src/features/events/EventRow.tsx`
- Modify: `frontend/tests/features/events/EventRow.test.tsx`

- [ ] **Step 1: Add button visibility tests to `EventRow.test.tsx`**

Add to the existing `EventRow.test.tsx`, at the end of the file:

```tsx
describe('EventRow raw payload button', () => {
  it('shows raw payload button when dedup_key is present', () => {
    render(<EventRow event={buildEvent({ dedup_key: 'abc123' })} searchQuery="" />)
    expect(screen.getByRole('button', { name: /raw payload/i })).toBeTruthy()
  })

  it('does not show raw payload button when dedup_key is absent', () => {
    render(<EventRow event={buildEvent()} searchQuery="" />)
    expect(screen.queryByRole('button', { name: /raw payload/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run tests/features/events/EventRow.test.tsx
```

Expected: 2 new tests FAIL (button not present yet).

- [ ] **Step 3: Update `EventRow.tsx` imports**

At the top of `frontend/src/features/events/EventRow.tsx`, add to the existing React import:

```tsx
import { useEffect, useRef, useState } from 'react'
```

And add `Braces` to the lucide-react import (create it if not present, or add to existing):

```tsx
import { Braces } from 'lucide-react'
```

And add the RawPayloadModal import after the `EventBadges` import:

```tsx
import { RawPayloadModal } from './RawPayloadModal'
```

- [ ] **Step 4: Add modal state and restructure the header line**

Inside the `EventRow` function body, after the existing `suppressDragRef` ref, add:

```tsx
const [rawModalOpen, setRawModalOpen] = useState(false)
```

Find the header line `<div>` (the comment says `{/* Header line: hook, model, path */}`). Replace:

```tsx
{/* Header line: hook, model, path */}
<div>
  {e.hook_event_name && (
    <span className={`hook hook-${e.hook_event_name}`}>{e.hook_event_name}</span>
  )}
  {(e.hook_event_name === 'PreToolUse' ||
    e.hook_event_name === 'PostToolUse' ||
    e.hook_event_name === 'PreCompact' ||
    e.hook_event_name === 'PostCompact') &&
    e.model && <span className="event-model">{displayModel(e.model)}</span>}
  {e.action !== 'BASH' && (highlight(e.path || '', searchQuery) as ReactNode)}
</div>
```

with:

```tsx
{/* Header line: hook, model, path */}
<div className="flex items-start justify-between gap-2">
  <div className="min-w-0">
    {e.hook_event_name && (
      <span className={`hook hook-${e.hook_event_name}`}>{e.hook_event_name}</span>
    )}
    {(e.hook_event_name === 'PreToolUse' ||
      e.hook_event_name === 'PostToolUse' ||
      e.hook_event_name === 'PreCompact' ||
      e.hook_event_name === 'PostCompact') &&
      e.model && <span className="event-model">{displayModel(e.model)}</span>}
    {e.action !== 'BASH' && (highlight(e.path || '', searchQuery) as ReactNode)}
  </div>
  {e.dedup_key && (
    <button
      type="button"
      data-event-drag-ignore
      onClick={() => setRawModalOpen(true)}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#8f8f8f] transition hover:bg-white/[0.08] hover:text-[#d0d0d0]"
      aria-label="View raw payload"
      title="Raw payload"
    >
      <Braces className="h-3.5 w-3.5" />
    </button>
  )}
</div>
```

- [ ] **Step 5: Add modal render at the bottom of EventRow return, before the closing `</div>`**

Just before the final closing `</div>` of the outermost `return (` block, add:

```tsx
{e.dedup_key && (
  <RawPayloadModal
    dedupKey={e.dedup_key}
    label={[e.hook_event_name, e.action, new Date(e.time).toLocaleTimeString([], { hour12: false })]
      .filter(Boolean)
      .join(' · ')}
    open={rawModalOpen}
    onClose={() => setRawModalOpen(false)}
  />
)}
```

- [ ] **Step 6: Run EventRow tests**

```bash
cd frontend && npx vitest run tests/features/events/EventRow.test.tsx
```

Expected: all tests PASS including the 2 new ones.

- [ ] **Step 7: Run full test suite and type check**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: no type errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/events/EventRow.tsx frontend/tests/features/events/EventRow.test.tsx
git commit -m "feat(frontend): add raw payload trigger button to EventRow"
```

---

## Final verification

- [ ] **Step 1: Full backend verification**

```bash
cd backend && go build ./... && go test ./... && golangci-lint run ./...
```

Expected: no errors.

- [ ] **Step 2: Full frontend verification**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: no errors, all tests pass.

- [ ] **Step 3: Manual smoke test**

Start backend and frontend dev servers, navigate to Events page, click the `{ }` button on any event, verify modal opens with syntax-highlighted JSON, copy button works, modal closes with Esc or clicking outside.
