# Scripts Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the scripts page to two tabs — Community (discover + install, default) and My Collection (unified local ∪ gist manager with save/install/publish/3-way-remove) — replacing the All/Installed/Bundles tabs.

**Architecture:** Backend gains a union `GET /api/collection` (`CollectionView`, auth-optional) plus a `/api/collection/local` route (GET body + DELETE). Frontend shrinks `ScriptsPage` to a 2-tab shell, rebuilds `CommunityTab` into Bundles + Single-scripts sections merging official (`/api/scripts/catalog`) and remote (`/api/community/catalog`), and rewrites `CollectionTab` into the union manager.

> **Current note:** Later scripts-v2/UI-tweaks/upload-share work supersedes the bundled sections and
> per-row Publish flow in this plan. Current sharing is **Upload & share** via
> `/api/registry/publish`; row source opens in a shared modal; collection entries include author/login.

**Tech Stack:** Go (`net/http`), React 19 + TS + Vite, Vitest + Testing Library, shadcn `Popover`.

**Spec:** `docs/superpowers/specs/2026-06-14-scripts-page-redesign-design.md`
**Branch:** continue on `feat/community-script-sharing` (already checked out).

---

## File Structure

**Backend**
- Modify `internal/domain/collection.go` — add `CollectionEntry`, `CollectionView`.
- Modify `internal/handler/collection.go` — rewrite `Collection` (union, auth-optional); add `CollectionLocal` (GET+DELETE) + local helpers; remove `markInstalled`.
- Modify `internal/server/router.go` — `Collection` gains `scriptSrc`; add `/api/collection/local` routes.
- Modify/extend `internal/handler/collection_test.go` (or `tests/internal/handler/...`) — union + local tests.

**Frontend**
- Modify `src/types/collection.ts` + barrel — add `CollectionEntry`, `CollectionView`.
- Rewrite `src/features/scripts/collection/useCollection.ts`.
- Rewrite `src/features/scripts/collection/CollectionRow.tsx` (union row + Popover remove).
- Rewrite `src/features/scripts/collection/CollectionTab.tsx` (always-rendered union + publish).
- Rewrite `src/features/scripts/community/CommunityTab.tsx` (Bundles + Single sections).
- Rewrite `src/features/scripts/ScriptsPage.tsx` (2-tab shell).
- Update tests: `tests/features/scripts/collection/useCollection.test.tsx`,
  `tests/features/scripts/collection/CollectionTab.test.tsx`,
  `tests/features/scripts/community/CommunityTab.test.tsx`.

---

## Task 1: Backend union collection view

**Files:**
- Modify: `backend/internal/domain/collection.go`
- Modify: `backend/internal/handler/collection.go`
- Modify: `backend/internal/server/router.go`
- Test: `backend/internal/handler/collection_view_test.go` (new)

- [ ] **Step 1: Add domain types**

Append to `backend/internal/domain/collection.go`:

```go
// CollectionEntry is one row in the unified collection view: a script that is
// installed locally and/or saved in the gist.
type CollectionEntry struct {
	ID       string `json:"id"`
	Filename string `json:"filename"`
	Title    string `json:"title"`
	Event    string `json:"event,omitempty"`
	Runtime  string `json:"runtime,omitempty"`
	Local    bool   `json:"local"`
	Gist     bool   `json:"gist"`
}

// CollectionView is the unified collection response: local ∪ gist.
type CollectionView struct {
	Authenticated bool              `json:"authenticated"`
	GistURL       string            `json:"gist_url,omitempty"`
	Entries       []CollectionEntry `json:"entries"`
}
```

- [ ] **Step 2: Write the failing test**

Create `backend/internal/handler/collection_view_test.go`:

```go
package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"argus/internal/github"
	"argus/internal/handler"
	"argus/internal/scriptcatalog"
)

// writeLocal drops a fake installed hook script into <argusDir>/hooks.
func writeLocal(t *testing.T, argusDir, filename, body string) {
	t.Helper()
	dir := filepath.Join(argusDir, "hooks")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, filename), []byte(body), 0o755); err != nil {
		t.Fatal(err)
	}
}

func TestCollectionViewLoggedOutListsLocalOnly(t *testing.T) {
	dir := t.TempDir()
	writeLocal(t, dir, "block-dangerous.js", "// hi\n")
	// An unauthenticated service: no token store written under dir.
	svc := github.NewService("test-client-id", dir)

	rr := httptest.NewRecorder()
	h := handler.Collection(svc, scriptcatalog.NewBundledSource(), dir)
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/collection", nil))

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 (no 401 when logged out), got %d", rr.Code)
	}
	var view struct {
		Authenticated bool `json:"authenticated"`
		Entries       []struct {
			Filename string `json:"filename"`
			Title    string `json:"title"`
			Local    bool   `json:"local"`
			Gist     bool   `json:"gist"`
		} `json:"entries"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &view); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if view.Authenticated {
		t.Fatal("expected authenticated=false")
	}
	if len(view.Entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(view.Entries))
	}
	e := view.Entries[0]
	if e.Filename != "block-dangerous.js" || !e.Local || e.Gist {
		t.Fatalf("unexpected entry: %+v", e)
	}
	// block-dangerous is a bundled script, so its title is enriched from the catalog.
	if e.Title != "Block dangerous commands" {
		t.Fatalf("expected enriched title, got %q", e.Title)
	}
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd /Users/duytran/GitHub/argus/backend && go test ./internal/handler/ -run CollectionView`
Expected: FAIL — `handler.Collection` signature mismatch (too few args) / `CollectionView` fields.

- [ ] **Step 4: Rewrite the Collection handler + add helpers**

In `backend/internal/handler/collection.go`, replace the `markInstalled` function AND the `Collection`
handler with the following (delete `markInstalled` entirely — nothing else uses it). Keep all other
functions (`CollectionAdd`, `buildCollectionScript`, `CollectionRemove`, `CollectionInstall`) as-is:

```go
// listLocalHooks returns the basenames of installed hook scripts in ~/.argus/hooks.
func listLocalHooks(argusDir string) []string {
	ents, err := os.ReadDir(hooksDir(argusDir))
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range ents {
		if e.IsDir() {
			continue
		}
		switch filepath.Ext(e.Name()) {
		case ".js", ".sh", ".py":
			out = append(out, e.Name())
		}
	}
	return out
}

func idFromFilename(filename string) string {
	if ext := filepath.Ext(filename); ext != "" {
		return filename[:len(filename)-len(ext)]
	}
	return filename
}

func runtimeFromExt(filename string) string {
	switch filepath.Ext(filename) {
	case ".js":
		return "node"
	case ".py":
		return "python3"
	default:
		return "sh"
	}
}

// Collection returns the unified collection view: every script installed locally
// or saved in the gist, with independent Local/Gist flags. Auth is OPTIONAL — a
// logged-out user still sees their local scripts (never a 401).
func Collection(svc *github.Service, src scriptcatalog.ScriptSource, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		view := domain.CollectionView{}

		gistByFile := map[string]domain.CollectionScript{}
		switch col, err := svc.Collection(r.Context()); {
		case errors.Is(err, github.ErrNotAuthenticated):
			view.Authenticated = false
		case err != nil:
			log.Printf("[collection] list err=%v", err)
			http.Error(w, "github error", http.StatusBadGateway)
			return
		default:
			view.Authenticated = true
			view.GistURL = col.GistURL
			for _, s := range col.Scripts {
				gistByFile[s.Filename] = s
			}
		}

		localSet := map[string]bool{}
		for _, f := range listLocalHooks(argusDir) {
			localSet[f] = true
		}

		metaByFile := map[string]domain.ScriptPackage{}
		if cat, err := src.Catalog(r.Context()); err == nil {
			for _, p := range cat.Packages {
				metaByFile[p.Filename] = p
			}
		}

		names := map[string]bool{}
		for f := range gistByFile {
			names[f] = true
		}
		for f := range localSet {
			names[f] = true
		}
		sorted := make([]string, 0, len(names))
		for f := range names {
			sorted = append(sorted, f)
		}
		sort.Strings(sorted)

		for _, f := range sorted {
			e := domain.CollectionEntry{Filename: f, Local: localSet[f], Gist: false}
			if gs, ok := gistByFile[f]; ok {
				e.Gist = true
				e.ID = gs.ID
				e.Title = gs.Title
				e.Event = gs.Event
				e.Runtime = gs.Runtime
			} else if p, ok := metaByFile[f]; ok {
				e.ID = idFromFilename(f)
				e.Title = p.Title
				e.Event = p.Event
				e.Runtime = p.Runtime
			} else {
				e.ID = idFromFilename(f)
				e.Title = f
				e.Runtime = runtimeFromExt(f)
			}
			if e.ID == "" {
				e.ID = idFromFilename(f)
			}
			view.Entries = append(view.Entries, e)
		}

		writeJSON(w, view)
	})
}
```

Add `"sort"` to the import block of `collection.go` (keep `os`, `path/filepath`, `errors`, `log`,
`net/http`, `encoding/json`, and the `argus/internal/...` imports already present).

- [ ] **Step 5: Update the router wiring**

In `backend/internal/server/router.go`, change the collection list route to pass `scriptSrc`:

```go
	mux.Handle("GET /api/collection", handler.Collection(ghSvc, scriptSrc, opts.ArgusDir))
```

(`scriptSrc` is already constructed earlier in the function.)

- [ ] **Step 6: Run to verify it passes + full suite**

Run: `cd /Users/duytran/GitHub/argus/backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: build clean; `TestCollectionViewLoggedOutListsLocalOnly` PASS; all prior tests PASS; lint clean.
(If `golangci-lint` is not on PATH, try `/tmp/glci/golangci-lint`.)

- [ ] **Step 7: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add backend/internal/domain/collection.go backend/internal/handler/collection.go backend/internal/server/router.go backend/internal/handler/collection_view_test.go
git commit -m "feat(collection): unified local-or-gist collection view (auth-optional)"
```

---

## Task 2: Backend `/api/collection/local` (GET body + DELETE)

**Files:**
- Modify: `backend/internal/handler/collection.go`
- Modify: `backend/internal/server/router.go`
- Test: `backend/internal/handler/collection_local_test.go` (new)

- [ ] **Step 1: Write the failing test**

Create `backend/internal/handler/collection_local_test.go`:

```go
package handler_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"argus/internal/handler"
)

func TestCollectionLocalGetReturnsBody(t *testing.T) {
	dir := t.TempDir()
	writeLocal(t, dir, "x.sh", "echo hi\n")
	rr := httptest.NewRecorder()
	handler.CollectionLocal(dir).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/collection/local?filename=x.sh", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d", rr.Code)
	}
	if want := `"body":"echo hi\n"`; !contains(rr.Body.String(), want) {
		t.Fatalf("body %q missing %q", rr.Body.String(), want)
	}
}

func TestCollectionLocalDeleteRemovesFile(t *testing.T) {
	dir := t.TempDir()
	writeLocal(t, dir, "x.sh", "echo hi\n")
	rr := httptest.NewRecorder()
	handler.CollectionLocal(dir).ServeHTTP(rr, httptest.NewRequest(http.MethodDelete, "/api/collection/local?filename=x.sh", nil))
	if rr.Code != http.StatusNoContent {
		t.Fatalf("status %d", rr.Code)
	}
	if _, err := os.Stat(filepath.Join(dir, "hooks", "x.sh")); !os.IsNotExist(err) {
		t.Fatalf("expected file removed, stat err=%v", err)
	}
}

func TestCollectionLocalRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	rr := httptest.NewRecorder()
	handler.CollectionLocal(dir).ServeHTTP(rr, httptest.NewRequest(http.MethodDelete, "/api/collection/local?filename=../evil.sh", nil))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for traversal, got %d", rr.Code)
	}
}

func contains(s, sub string) bool { return len(s) >= len(sub) && (indexOf(s, sub) >= 0) }

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/duytran/GitHub/argus/backend && go test ./internal/handler/ -run CollectionLocal`
Expected: FAIL — undefined `handler.CollectionLocal`.

- [ ] **Step 3: Implement the handler**

Append to `backend/internal/handler/collection.go`:

```go
// CollectionLocal serves a local hook script's body (GET) or removes it (DELETE).
// The filename is validated as a flat basename (no traversal).
func CollectionLocal(argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		filename := r.URL.Query().Get("filename")
		target, err := hookTarget(argusDir, filename)
		if err != nil {
			http.Error(w, "invalid filename", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodGet:
			body, err := os.ReadFile(target)
			if errors.Is(err, os.ErrNotExist) {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			if err != nil {
				log.Printf("[collection] local read %s err=%v", filename, err)
				http.Error(w, "read failed", http.StatusInternalServerError)
				return
			}
			writeJSON(w, map[string]string{"filename": filename, "body": string(body)})
		case http.MethodDelete:
			if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
				log.Printf("[collection] local delete %s err=%v", filename, err)
				http.Error(w, "delete failed", http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
}
```

- [ ] **Step 4: Wire routes**

In `backend/internal/server/router.go`, after the existing `POST /api/collection/install` line, add:

```go
	mux.Handle("GET /api/collection/local", handler.CollectionLocal(opts.ArgusDir))
	mux.Handle("DELETE /api/collection/local", handler.CollectionLocal(opts.ArgusDir))
```

- [ ] **Step 5: Run to verify + full suite + lint**

Run: `cd /Users/duytran/GitHub/argus/backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: 3 new CollectionLocal tests PASS; full suite PASS; lint clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add backend/internal/handler/collection.go backend/internal/server/router.go backend/internal/handler/collection_local_test.go
git commit -m "feat(collection): /api/collection/local body GET + delete"
```

---

## Task 3: Frontend types + `useCollection` rewrite

**Files:**
- Modify: `frontend/src/types/collection.ts`
- Modify: `frontend/src/types/index.ts`
- Rewrite: `frontend/src/features/scripts/collection/useCollection.ts`
- Rewrite test: `frontend/tests/features/scripts/collection/useCollection.test.tsx`

- [ ] **Step 1: Add frontend types**

Append to `frontend/src/types/collection.ts`:

```ts
export type CollectionEntry = {
  id: string
  filename: string
  title: string
  event?: string
  runtime?: string
  local: boolean
  gist: boolean
}

export type CollectionView = {
  authenticated: boolean
  gist_url?: string
  entries: CollectionEntry[]
}
```

In `frontend/src/types/index.ts`, extend the `./collection` re-export to include the new types:

```ts
export type {
  CollectionScript,
  Collection,
  CollectionEntry,
  CollectionView,
  GitHubAuthStatus,
  DeviceCodeResponse,
} from './collection'
```

- [ ] **Step 2: Rewrite the hook test**

Replace `frontend/tests/features/scripts/collection/useCollection.test.tsx` entirely with:

```tsx
import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCollection } from '@/features/scripts/collection/useCollection'

afterEach(() => vi.restoreAllMocks())

const view = {
  authenticated: true,
  gist_url: 'https://gist.github.com/x',
  entries: [
    { id: 'a', filename: 'a.js', title: 'A', local: true, gist: false },
    { id: 'b', filename: 'b.js', title: 'B', local: false, gist: true },
  ],
}

describe('useCollection', () => {
  it('loads the union view', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    const { result } = renderHook(() => useCollection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.authenticated).toBe(true)
    expect(result.current.entries).toHaveLength(2)
    expect(result.current.gistUrl).toBe('https://gist.github.com/x')
  })

  it('removeBoth deletes local then gist', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => view }) // initial load
      .mockResolvedValueOnce({ ok: true }) // DELETE local
      .mockResolvedValueOnce({ ok: true }) // DELETE gist
      .mockResolvedValueOnce({ ok: true, json: async () => view }) // reload
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCollection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.removeBoth({
        id: 'a',
        filename: 'a.js',
        title: 'A',
        local: true,
        gist: true,
      })
    })
    const urls = fetchMock.mock.calls.map((c) => c[0])
    expect(urls).toContain('/api/collection/local?filename=a.js')
    expect(urls).toContain('/api/collection?id=a')
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/scripts/collection/useCollection.test.tsx`
Expected: FAIL — `authenticated`/`entries`/`removeBoth` undefined on the old hook.

- [ ] **Step 4: Rewrite the hook**

Replace `frontend/src/features/scripts/collection/useCollection.ts` entirely with:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

import type { CollectionEntry, CollectionView, DeviceCodeResponse } from '@/types'

type State = {
  authenticated: boolean
  gistUrl?: string
  entries: CollectionEntry[]
  loading: boolean
  error: string | null
}

export function useCollection() {
  const [state, setState] = useState<State>({
    authenticated: false,
    entries: [],
    loading: true,
    error: null,
  })
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const reload = useCallback(async () => {
    try {
      const resp = await fetch('/api/collection')
      if (!resp.ok) throw new Error(`collection ${resp.status}`)
      const view: CollectionView = await resp.json()
      setState({
        authenticated: view.authenticated,
        gistUrl: view.gist_url,
        entries: view.entries ?? [],
        loading: false,
        error: null,
      })
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }))
    }
  }, [])

  useEffect(() => {
    void (async () => {
      await reload()
    })()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [reload])

  const startLogin = useCallback(async () => {
    const resp = await fetch('/api/github/device', { method: 'POST' })
    if (!resp.ok) throw new Error(`device ${resp.status}`)
    const dc: DeviceCodeResponse = await resp.json()
    setDeviceCode(dc)
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(
      async () => {
        const status = await (await fetch('/api/github/status')).json()
        if (status.authenticated) {
          if (pollRef.current) clearInterval(pollRef.current)
          setDeviceCode(null)
          await reload()
        }
      },
      (dc.interval || 5) * 1000
    )
  }, [reload])

  const cancelLogin = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
    setDeviceCode(null)
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/github/logout', { method: 'POST' })
    await reload()
  }, [reload])

  const saveToGist = useCallback(
    async (filename: string) => {
      const resp = await fetch('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: 'local', filename }),
      })
      if (!resp.ok && resp.status !== 409) throw new Error(`save ${resp.status}`)
      await reload()
    },
    [reload]
  )

  const install = useCallback(
    async (id: string) => {
      const resp = await fetch('/api/collection/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!resp.ok && resp.status !== 409) throw new Error(`install ${resp.status}`)
      await reload()
    },
    [reload]
  )

  const removeLocal = useCallback(async (filename: string) => {
    const resp = await fetch(`/api/collection/local?filename=${encodeURIComponent(filename)}`, {
      method: 'DELETE',
    })
    if (!resp.ok) throw new Error(`remove local ${resp.status}`)
  }, [])

  const removeGist = useCallback(async (id: string) => {
    const resp = await fetch(`/api/collection?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!resp.ok) throw new Error(`remove gist ${resp.status}`)
  }, [])

  const removeBoth = useCallback(
    async (entry: CollectionEntry) => {
      if (entry.local) await removeLocal(entry.filename)
      if (entry.gist) await removeGist(entry.id)
      await reload()
    },
    [removeLocal, removeGist, reload]
  )

  const removeLocalOnly = useCallback(
    async (filename: string) => {
      await removeLocal(filename)
      await reload()
    },
    [removeLocal, reload]
  )

  const removeGistOnly = useCallback(
    async (id: string) => {
      await removeGist(id)
      await reload()
    },
    [removeGist, reload]
  )

  const getLocalBody = useCallback(async (filename: string): Promise<string> => {
    const resp = await fetch(`/api/collection/local?filename=${encodeURIComponent(filename)}`)
    if (!resp.ok) throw new Error(`body ${resp.status}`)
    const data: { filename: string; body: string } = await resp.json()
    return data.body
  }, [])

  return {
    ...state,
    deviceCode,
    reload,
    startLogin,
    cancelLogin,
    logout,
    saveToGist,
    install,
    removeLocal: removeLocalOnly,
    removeGist: removeGistOnly,
    removeBoth,
    getLocalBody,
  }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/scripts/collection/useCollection.test.tsx && npx tsc --noEmit`
Expected: 2 tests PASS. (tsc may still report errors in `CollectionTab.tsx`/`CollectionRow.tsx` that consume the old hook — those are rewritten in Task 4. If tsc fails ONLY in those two files, that is expected; proceed.)

- [ ] **Step 6: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/types/collection.ts frontend/src/types/index.ts frontend/src/features/scripts/collection/useCollection.ts frontend/tests/features/scripts/collection/useCollection.test.tsx
git commit -m "feat(collection): rewrite useCollection for union view + 3-way remove"
```

---

## Task 4: Frontend My Collection tab (union manager)

**Files:**
- Rewrite: `frontend/src/features/scripts/collection/CollectionRow.tsx`
- Rewrite: `frontend/src/features/scripts/collection/CollectionTab.tsx`
- Rewrite test: `frontend/tests/features/scripts/collection/CollectionTab.test.tsx`

- [ ] **Step 1: Rewrite `CollectionRow.tsx`**

Replace `frontend/src/features/scripts/collection/CollectionRow.tsx` entirely with:

```tsx
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { CollectionEntry } from '@/types'

type CollectionRowProps = {
  entry: CollectionEntry
  index: number
  busy: boolean
  onSaveToGist: (filename: string) => void
  onInstall: (id: string) => void
  onPublish: (entry: CollectionEntry) => void
  onRemoveLocal: (filename: string) => void
  onRemoveGist: (id: string) => void
  onRemoveBoth: (entry: CollectionEntry) => void
}

export function CollectionRow({
  entry,
  index,
  busy,
  onSaveToGist,
  onInstall,
  onPublish,
  onRemoveLocal,
  onRemoveGist,
  onRemoveBoth,
}: CollectionRowProps) {
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.06] px-3 py-3 hover:bg-white/[0.02]">
      <span className="w-6 shrink-0 text-right text-[0.72rem] tabular-nums text-[#555]">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[#e5e5e5]">{entry.title}</span>
          <span className="truncate font-mono text-[0.7rem] text-[#666]">{entry.filename}</span>
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-1 md:flex">
        <Badge
          variant={entry.local ? 'secondary' : 'outline'}
          className={entry.local ? '' : 'opacity-40'}
        >
          Local
        </Badge>
        <Badge
          variant={entry.gist ? 'secondary' : 'outline'}
          className={entry.gist ? '' : 'opacity-40'}
        >
          Gist
        </Badge>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {entry.local && !entry.gist ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onSaveToGist(entry.filename)}
          >
            Save to gist
          </Button>
        ) : null}
        {entry.gist && !entry.local ? (
          <Button size="sm" disabled={busy} onClick={() => onInstall(entry.id)}>
            Install
          </Button>
        ) : null}
        {entry.local ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onPublish(entry)}>
            Publish
          </Button>
        ) : null}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy}>
              Remove ▾
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <div className="flex flex-col">
              {entry.local ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onRemoveLocal(entry.filename)}
                >
                  Remove local
                </Button>
              ) : null}
              {entry.gist ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onRemoveGist(entry.id)}
                >
                  Remove from gist
                </Button>
              ) : null}
              {entry.local && entry.gist ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-destructive"
                  onClick={() => onRemoveBoth(entry)}
                >
                  Remove both
                </Button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `CollectionTab.tsx`**

Replace `frontend/src/features/scripts/collection/CollectionTab.tsx` entirely with:

```tsx
import { useState } from 'react'
import { ExternalLink } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { CollectionEntry } from '@/types'

import { useCollection } from './useCollection'
import { DeviceFlowModal } from './DeviceFlowModal'
import { CollectionRow } from './CollectionRow'
import { buildMetaHeader, buildPublishUrl } from '../community/publishUrl'

type CollectionTabProps = {
  query: string
}

export function CollectionTab({ query }: CollectionTabProps) {
  const {
    authenticated,
    gistUrl,
    entries,
    loading,
    error,
    deviceCode,
    startLogin,
    cancelLogin,
    logout,
    saveToGist,
    install,
    removeLocal,
    removeGist,
    removeBoth,
    getLocalBody,
  } = useCollection()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch {
      setNotice('Action failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function guardedSave(filename: string) {
    if (!authenticated) {
      setNotice('Sign in with GitHub to back up to your gist.')
      void run(startLogin)
      return
    }
    void run(() => saveToGist(filename))
  }

  async function publish(entry: CollectionEntry) {
    if (!authenticated) {
      setNotice('Sign in with GitHub to publish.')
      void run(startLogin)
      return
    }
    try {
      const status = await (await fetch('/api/github/status')).json()
      if (!status.authenticated || !status.login) {
        setNotice('Sign in with GitHub to publish.')
        return
      }
      const body = await getLocalBody(entry.filename)
      const fields = {
        id: entry.id,
        title: entry.title,
        event: entry.event,
        runtime: entry.runtime,
        body,
      }
      const { url, prefilled } = buildPublishUrl(status.login, fields)
      if (!prefilled) {
        await navigator.clipboard.writeText(buildMetaHeader(fields) + '\n' + body)
        setNotice('Script copied — paste it into the new file on GitHub.')
      }
      window.open(url, '_blank', 'noopener')
    } catch {
      setNotice('Could not start publishing.')
    }
  }

  const filtered = entries.filter((e) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return e.title.toLowerCase().includes(q) || e.filename.toLowerCase().includes(q)
  })

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[0.72rem] text-[#888]">
        {authenticated ? (
          <span>Signed in to GitHub</span>
        ) : (
          <span>Sign in to save and share your favourite scripts.</span>
        )}
        <div className="flex items-center gap-2">
          {authenticated && gistUrl ? (
            <a
              href={gistUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              View scripts on Gist
            </a>
          ) : null}
          {authenticated ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(logout)}>
              Logout
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(startLogin)}>
              Sign in with GitHub
            </Button>
          )}
        </div>
      </div>

      {notice ? (
        <div className="flex items-center justify-between rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[0.78rem] text-[#bbb]">
          <span>{notice}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto px-1 py-0 text-[#777] hover:text-[#ccc]"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
          >
            ✕
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="overflow-hidden rounded-md border border-white/[0.06]">
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-[#777]">
            {query
              ? `No scripts match “${query}”.`
              : 'Nothing here yet. Install scripts from the Community tab.'}
          </p>
        ) : (
          filtered.map((e, i) => (
            <CollectionRow
              key={e.filename}
              entry={e}
              index={i + 1}
              busy={busy}
              onSaveToGist={guardedSave}
              onInstall={(id) => run(() => install(id))}
              onPublish={publish}
              onRemoveLocal={(filename) => run(() => removeLocal(filename))}
              onRemoveGist={(id) => run(() => removeGist(id))}
              onRemoveBoth={(entry) => run(() => removeBoth(entry))}
            />
          ))
        )}
      </div>

      <DeviceFlowModal device={deviceCode} onClose={cancelLogin} />
    </div>
  )
}
```

- [ ] **Step 3: Rewrite the tab test**

Replace `frontend/tests/features/scripts/collection/CollectionTab.test.tsx` entirely with:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CollectionTab } from '@/features/scripts/collection/CollectionTab'

afterEach(() => vi.restoreAllMocks())

const view = {
  authenticated: false,
  entries: [
    { id: 'a', filename: 'a.js', title: 'Alpha', local: true, gist: false },
    { id: 'b', filename: 'b.js', title: 'Beta', local: false, gist: true },
  ],
}

describe('CollectionTab', () => {
  it('lists union entries and shows Sign in when logged out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    render(<CollectionTab query="" />)
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in with github/i })).toBeInTheDocument()
  })

  it('filters by query', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    render(<CollectionTab query="alpha" />)
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.queryByText('Beta')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run tab tests + tsc**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/scripts/collection/ && npx tsc --noEmit`
Expected: collection tests PASS. tsc may still fail only in `ScriptsPage.tsx`/`CommunityTab.tsx` (rewritten in Tasks 5–6) — acceptable mid-stream.

- [ ] **Step 5: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/scripts/collection/CollectionRow.tsx frontend/src/features/scripts/collection/CollectionTab.tsx frontend/tests/features/scripts/collection/CollectionTab.test.tsx
git commit -m "feat(collection): union My Collection tab with save/install/publish/3-way-remove"
```

---

## Task 5: Frontend Community tab (Bundles + Single sections)

**Files:**
- Rewrite: `frontend/src/features/scripts/community/CommunityTab.tsx`
- Rewrite test: `frontend/tests/features/scripts/community/CommunityTab.test.tsx`

Context: reuse existing `useScriptCatalog` (official: `catalog.packages`, `catalog.bundles`,
`install`, `installBundle`), `useCommunity` (remote singles), `BundleCard`, `ScriptRow` (official
single rows), and `CommunityRow` (community single rows).

- [ ] **Step 1: Rewrite `CommunityTab.tsx`**

Replace `frontend/src/features/scripts/community/CommunityTab.tsx` entirely with:

```tsx
import { useMemo, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { PaginationBar } from '@/components/shared/PaginationBar'
import type { CommunityScript, ScriptPackage } from '@/types'

import { useScriptCatalog } from '../hooks/useScriptCatalog'
import { BundleCard } from '../BundleCard'
import { ScriptRow } from '../ScriptRow'
import { useCommunity } from './useCommunity'
import { CommunityRow } from './CommunityRow'

type CommunityTabProps = {
  query: string
}

type SingleItem =
  | { kind: 'official'; pkg: ScriptPackage }
  | { kind: 'community'; script: CommunityScript }

const PAGE_SIZE = 10

function matchesPkg(p: ScriptPackage, q: string) {
  return (
    p.title.toLowerCase().includes(q) ||
    p.id.toLowerCase().includes(q) ||
    p.purpose.toLowerCase().includes(q)
  )
}

function matchesCommunity(s: CommunityScript, q: string) {
  return (
    s.title.toLowerCase().includes(q) ||
    s.id.toLowerCase().includes(q) ||
    (s.purpose ?? '').toLowerCase().includes(q)
  )
}

export function CommunityTab({ query }: CommunityTabProps) {
  const {
    catalog,
    loading: officialLoading,
    install: installOfficial,
    installBundle,
  } = useScriptCatalog()
  const {
    scripts: community,
    install: installCommunity,
    getBody,
    simulate,
  } = useCommunity()
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(0)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const packages = useMemo(() => catalog?.packages ?? [], [catalog])
  const bundles = useMemo(() => catalog?.bundles ?? [], [catalog])

  const items = useMemo<SingleItem[]>(() => {
    const q = query.trim().toLowerCase()
    const official: SingleItem[] = packages
      .filter((p) => !q || matchesPkg(p, q))
      .map((p) => ({ kind: 'official', pkg: p }))
    const remote: SingleItem[] = community
      .filter((s) => !q || matchesCommunity(s, q))
      .map((s) => ({ kind: 'community', script: s }))
    return [...official, ...remote]
  }, [packages, community, query])

  if (officialLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )
  }

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages - 1)
  const start = clampedPage * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, items.length)
  const visible = items.slice(start, end)

  return (
    <div className="space-y-6">
      {bundles.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[0.78rem] font-semibold tracking-wide text-[#999] uppercase">
            Bundles
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {bundles.map((b) => (
              <BundleCard
                key={b.id}
                bundle={b}
                packages={packages}
                busy={busy}
                onInstallBundle={(id) => run(() => installBundle(id))}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-[0.78rem] font-semibold tracking-wide text-[#999] uppercase">
          Single scripts
        </h2>
        <div className="overflow-hidden rounded-md border border-white/[0.06]">
          {items.length > PAGE_SIZE ? (
            <PaginationBar
              page={clampedPage}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              totalItems={items.length}
              rangeStart={start}
              rangeEnd={end}
              defaultPageSize={PAGE_SIZE}
              onPageChange={setPage}
              onPageSizeChange={() => setPage(0)}
            />
          ) : null}
          {visible.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[#777]">
              {query ? `No scripts match “${query}”.` : 'No scripts available.'}
            </p>
          ) : (
            visible.map((item, i) =>
              item.kind === 'official' ? (
                <ScriptRow
                  key={`o:${item.pkg.id}`}
                  script={item.pkg}
                  index={start + i + 1}
                  busy={busy}
                  onInstall={(id) => run(() => installOfficial(id))}
                  onDelete={() => {}}
                />
              ) : (
                <CommunityRow
                  key={`c:${item.script.author}/${item.script.id}`}
                  script={item.script}
                  index={start + i + 1}
                  busy={busy}
                  onInstall={(id) => run(() => installCommunity(id))}
                  getBody={getBody}
                  simulate={simulate}
                />
              )
            )
          )}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite the tab test**

Replace `frontend/tests/features/scripts/community/CommunityTab.test.tsx` entirely with:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CommunityTab } from '@/features/scripts/community/CommunityTab'

afterEach(() => vi.restoreAllMocks())

const officialCatalog = {
  packages: [
    {
      id: 'block-dangerous',
      filename: 'block-dangerous.js',
      version: '1.0.0',
      title: 'Block dangerous commands',
      purpose: 'deny dangerous shell',
      event: 'PreToolUse',
      runtime: 'node',
      agents: ['claude-code'],
      author: 'argus',
      source: '',
      tier: 'official',
      checksum: '',
      body: '',
      installed: false,
      runtime_available: true,
    },
  ],
  bundles: [],
}

const communityScripts = [
  {
    id: 'git-autostash',
    author: 'alice',
    title: 'Auto-stash',
    purpose: 'stash',
    event: 'PreToolUse',
    runtime: 'node',
    tier: 'community',
    sha256: 'abc',
    source: 'scripts/alice/git-autostash.js',
    installed: false,
    runtime_available: true,
  },
]

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url === '/api/scripts/catalog')
        return Promise.resolve({ ok: true, json: async () => officialCatalog })
      if (url === '/api/community/catalog')
        return Promise.resolve({ ok: true, json: async () => communityScripts })
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })
  )
}

describe('CommunityTab', () => {
  it('renders official and community single scripts together', async () => {
    stubFetch()
    render(<CommunityTab query="" />)
    await waitFor(() => expect(screen.getByText('Block dangerous commands')).toBeInTheDocument())
    expect(screen.getByText('Auto-stash')).toBeInTheDocument()
    expect(screen.getByText('community')).toBeInTheDocument()
  })

  it('filters across both sources', async () => {
    stubFetch()
    render(<CommunityTab query="autostash" />)
    await waitFor(() => expect(screen.getByText('Auto-stash')).toBeInTheDocument())
    expect(screen.queryByText('Block dangerous commands')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests + tsc**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/scripts/community/ && npx tsc --noEmit`
Expected: community tests PASS. tsc may still fail only in `ScriptsPage.tsx` (rewritten in Task 6).

- [ ] **Step 4: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/scripts/community/CommunityTab.tsx frontend/tests/features/scripts/community/CommunityTab.test.tsx
git commit -m "feat(community): Community tab with Bundles + merged Single-scripts sections"
```

---

## Task 6: Frontend ScriptsPage 2-tab shell

**Files:**
- Rewrite: `frontend/src/features/scripts/ScriptsPage.tsx`

- [ ] **Step 1: Rewrite `ScriptsPage.tsx`**

Replace `frontend/src/features/scripts/ScriptsPage.tsx` entirely with:

```tsx
import { useState } from 'react'
import { Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { CommunityTab } from './community/CommunityTab'
import { CollectionTab } from './collection/CollectionTab'

type Tab = 'community' | 'collection'

export function ScriptsPage() {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('community')

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#666]" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search scripts…"
              aria-label="Search scripts"
              className="pl-9"
            />
          </div>

          <ToggleGroup
            type="single"
            value={tab}
            onValueChange={(v) => v && setTab(v as Tab)}
            className="justify-start"
          >
            <ToggleGroupItem value="community">Community</ToggleGroupItem>
            <ToggleGroupItem value="collection">My Collection</ToggleGroupItem>
          </ToggleGroup>

          {tab === 'community' ? (
            <CommunityTab query={query} />
          ) : (
            <CollectionTab query={query} />
          )}
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Full frontend gate**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx tsc --noEmit && npx vitest run && npx prettier --write src/features/scripts/ tests/features/scripts/`
Expected: tsc clean; ALL vitest tests PASS (the removed-tab behaviors are gone; remaining scripts
tests — `scriptFilters`, `useScriptCatalog`, `ScriptRow`, `GitHubLoginPanel` — still pass since those
units are unchanged); prettier formats.

- [ ] **Step 3: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/scripts/ScriptsPage.tsx frontend/src/features/scripts/ tests/features/scripts/
git commit -m "feat(scripts): collapse ScriptsPage to Community + My Collection tabs"
```

---

## Final verification (after all tasks)

```bash
cd /Users/duytran/GitHub/argus/backend && go build ./... && go test ./... && golangci-lint run ./...
cd ../frontend && npx tsc --noEmit && npx vitest run && npx prettier --check src/features/scripts
```
All must pass before finishing the branch (superpowers:finishing-a-development-branch).

**Manual smoke (optional, after build-local):** Community tab shows official scripts + Bundles even
with the registry repo absent; installing one makes it appear under My Collection as Local-on/Gist-off
with Save-to-gist + Publish + Remove ▾.

**Note on dead code:** `ScriptRow`'s `onAddToCollection`/`onPublish`/`canDelete` props and the
`DELETE /api/scripts/installed` route are no longer exercised by the new UI but are left in place
(harmless; removing them is out of scope per the spec).
```
