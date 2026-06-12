# Delete Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trash button on each Projects-page card that, after a confirm dialog, deletes the project's sessions and all their events via a new `DELETE /api/projects?cwd=...` endpoint.

**Architecture:** Backend follows the strict handler → service → repository layering: new `DeleteProjectByCWD` on the `EventRepository` interface (SQLite impl runs both deletes in one transaction), `DeleteProject` passthrough on `EventService`, and a method dispatch inside the existing `Projects` handler with a `DELETE /api/projects` route. Frontend adds a hover trash button to each card in `ProjectsPage.tsx` guarded by a shadcn `alert-dialog`.

**Tech Stack:** Go stdlib net/http + modernc SQLite, React 19 + shadcn/radix alert-dialog, Vitest + Testing Library, Go `testing`.

**Spec:** `docs/superpowers/specs/2026-06-11-delete-project-design.md`

**Caveat encoded in spec (do not "fix"):** a still-running agent session in that cwd re-creates the project on its next hook event. Delete = clear history.

**Repo-wide rules:** backend done = `go build ./... && go test ./... && golangci-lint run ./...` clean. Frontend done = `npx prettier --write` on touched files + `npx tsc --noEmit` + `npx vitest run` clean. Commit messages end with the Claude Code trailer. User has consented to commits on `main`. Repo has unrelated uncommitted changes — stage ONLY files listed in each commit step.

---

### Task 1: Repository — `DeleteProjectByCWD` cascade

**Files:**
- Modify: `backend/internal/repository/repository.go` (interface)
- Modify: `backend/internal/repository/sqlite/sqlite.go` (impl)
- Modify: `backend/tests/internal/service/event_service_test.go` (mockRepo gains method — compile requirement)
- Test: `backend/tests/internal/repository/sqlite/delete_project_test.go` (new)

- [ ] **Step 1: Write the failing repository test**

Create `backend/tests/internal/repository/sqlite/delete_project_test.go`. Follow the existing pattern in `sqlite_test.go` (package `sqlite_test`, `sqlite.New(":memory:")`):

```go
package sqlite_test

import (
	"testing"

	"argus/internal/domain"
	"argus/internal/repository/sqlite"
)

func TestDeleteProjectByCWDCascades(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	seed := func(session, cwd, ts string) {
		t.Helper()
		if err := db.Add(domain.NormalizedEvent{
			Time:          ts,
			Agent:         "claudecode",
			Session:       session,
			CWD:           cwd,
			HookEventName: "SessionStart",
			RawPayload:    []byte(`{}`),
		}); err != nil {
			t.Fatalf("add event: %v", err)
		}
		if err := db.UpsertSession(session, "claudecode", "", "", cwd, "", ts, "", domain.SessionUsage{}); err != nil {
			t.Fatalf("upsert session: %v", err)
		}
	}

	seed("doomed-1", "/work/doomed", "2026-06-11T10:00:00Z")
	seed("doomed-2", "/work/doomed", "2026-06-11T10:05:00Z")
	seed("survivor", "/work/keep", "2026-06-11T10:10:00Z")

	sessionsDeleted, eventsDeleted, err := db.DeleteProjectByCWD("/work/doomed")
	if err != nil {
		t.Fatalf("DeleteProjectByCWD: %v", err)
	}
	if sessionsDeleted != 2 {
		t.Errorf("sessionsDeleted = %d, want 2", sessionsDeleted)
	}
	if eventsDeleted != 2 {
		t.Errorf("eventsDeleted = %d, want 2", eventsDeleted)
	}

	// Doomed project gone, survivor untouched.
	doomed, err := db.ListSessionsByCWD("/work/doomed", "")
	if err != nil {
		t.Fatalf("list doomed: %v", err)
	}
	if len(doomed) != 0 {
		t.Errorf("doomed sessions remaining = %d, want 0", len(doomed))
	}
	kept, err := db.ListSessionsByCWD("/work/keep", "")
	if err != nil {
		t.Fatalf("list kept: %v", err)
	}
	if len(kept) != 1 {
		t.Errorf("kept sessions = %d, want 1", len(kept))
	}
	keptEvents, err := db.ListBySession("survivor", 10)
	if err != nil {
		t.Fatalf("list survivor events: %v", err)
	}
	if len(keptEvents) != 1 {
		t.Errorf("survivor events = %d, want 1", len(keptEvents))
	}
}

func TestDeleteProjectByCWDNoMatch(t *testing.T) {
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer db.Close()

	sessionsDeleted, eventsDeleted, err := db.DeleteProjectByCWD("/nope")
	if err != nil {
		t.Fatalf("DeleteProjectByCWD: %v", err)
	}
	if sessionsDeleted != 0 || eventsDeleted != 0 {
		t.Errorf("deleted = (%d, %d), want (0, 0)", sessionsDeleted, eventsDeleted)
	}
}
```

Note: if `sqlite_test.go` already has a seeding helper with this exact shape, reuse it instead of the local `seed` closure — check first.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && go test -run TestDeleteProjectByCWD ./tests/internal/repository/sqlite/`
Expected: FAIL — `db.DeleteProjectByCWD undefined`

- [ ] **Step 3: Add interface method**

In `backend/internal/repository/repository.go`, inside `EventRepository`, after the `UpsertSession` line:

```go
	DeleteProjectByCWD(cwd string) (sessionsDeleted, eventsDeleted int64, err error)
```

- [ ] **Step 4: Implement in SQLite adapter**

In `backend/internal/repository/sqlite/sqlite.go`, add (near `UpsertSession`; match file's comment style — comments explain SQLite behavior/invariants only):

```go
// DeleteProjectByCWD removes every event and session recorded under cwd in one
// transaction, so a half-deleted project can never be observed.
func (d *DB) DeleteProjectByCWD(cwd string) (int64, int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), sqliteWriteTimeout)
	defer cancel()

	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, 0, err
	}
	defer func() { _ = tx.Rollback() }()

	evRes, err := tx.ExecContext(ctx, `DELETE FROM hook_events WHERE cwd = ?`, cwd)
	if err != nil {
		return 0, 0, err
	}
	sessRes, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE cwd = ?`, cwd)
	if err != nil {
		return 0, 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, err
	}

	eventsDeleted, _ := evRes.RowsAffected()
	sessionsDeleted, _ := sessRes.RowsAffected()
	return sessionsDeleted, eventsDeleted, nil
}
```

- [ ] **Step 5: Extend mockRepo so service tests still compile**

In `backend/tests/internal/service/event_service_test.go`, alongside the other `mockRepo` methods:

```go
func (m *mockRepo) DeleteProjectByCWD(string) (int64, int64, error) {
	return 0, 0, nil
}
```

- [ ] **Step 6: Run tests to verify pass**

Run: `cd backend && go build ./... && go test ./...`
Expected: all PASS (new tests included)

- [ ] **Step 7: Lint**

Run: `cd backend && golangci-lint run ./...`
Expected: no issues

- [ ] **Step 8: Commit**

```bash
git add backend/internal/repository/repository.go backend/internal/repository/sqlite/sqlite.go backend/tests/internal/repository/sqlite/delete_project_test.go backend/tests/internal/service/event_service_test.go
git commit -m "feat: add DeleteProjectByCWD cascade to repository

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Service + handler + route — `DELETE /api/projects`

**Files:**
- Modify: `backend/internal/service/event_service.go` (add `DeleteProject`)
- Modify: `backend/internal/handler/projects.go` (method dispatch)
- Modify: `backend/internal/server/router.go` (add DELETE route)
- Test: `backend/tests/internal/handler/projects_sessions_test.go` (append tests)

- [ ] **Step 1: Write the failing handler tests**

Append to `backend/tests/internal/handler/projects_sessions_test.go` (uses existing `newTestService` / `addHandlerEvent` helpers from `hook_test.go`):

```go
func TestProjectsHandlerDeleteRequiresCWD(t *testing.T) {
	svc := newTestService(t)
	h := handler.Projects(svc)

	req := httptest.NewRequest(http.MethodDelete, "/api/projects", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body: %s", rec.Code, rec.Body.String())
	}
}

func TestProjectsHandlerDeleteCascades(t *testing.T) {
	svc := newTestService(t)
	addHandlerEvent(t, svc, domain.NormalizedEvent{
		Time:          "2026-06-11T10:00:00Z",
		Agent:         "claudecode",
		Session:       "doomed",
		CWD:           "/work/doomed",
		HookEventName: "SessionStart",
	})
	addHandlerEvent(t, svc, domain.NormalizedEvent{
		Time:          "2026-06-11T10:05:00Z",
		Agent:         "claudecode",
		Session:       "survivor",
		CWD:           "/work/keep",
		HookEventName: "SessionStart",
	})

	h := handler.Projects(svc)
	req := httptest.NewRequest(http.MethodDelete,
		"/api/projects?cwd="+url.QueryEscape("/work/doomed"), nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		SessionsDeleted int64 `json:"sessions_deleted"`
		EventsDeleted   int64 `json:"events_deleted"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.SessionsDeleted != 1 || resp.EventsDeleted != 1 {
		t.Fatalf("deleted = %+v, want 1 session 1 event", resp)
	}

	// Survivor project still listed; doomed gone.
	listReq := httptest.NewRequest(http.MethodGet, "/api/projects", nil)
	listRec := httptest.NewRecorder()
	h.ServeHTTP(listRec, listReq)
	var payload struct {
		Projects []domain.Project `json:"projects"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(payload.Projects) != 1 || payload.Projects[0].CWD != "/work/keep" {
		t.Fatalf("projects after delete = %+v, want only /work/keep", payload.Projects)
	}
}
```

`net/url`, `encoding/json`, `net/http`, `net/http/httptest`, `argus/internal/domain`, `argus/internal/handler` are already imported in this file (`url` is — check imports; add any missing).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && go test -run TestProjectsHandlerDelete ./tests/internal/handler/`
Expected: FAIL — DELETE without cwd currently runs the list path and returns 200

- [ ] **Step 3: Add service method**

In `backend/internal/service/event_service.go`, next to `ListProjects`:

```go
// DeleteProject removes all sessions and events recorded under cwd.
func (s *EventService) DeleteProject(cwd string) (sessionsDeleted, eventsDeleted int64, err error) {
	return s.repo.DeleteProjectByCWD(cwd)
}
```

(If the repo field on `EventService` has a different name than `repo`, match it — check the struct.)

- [ ] **Step 4: Add method dispatch in handler**

Replace the body of `Projects` in `backend/internal/handler/projects.go`:

```go
func Projects(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			cwd := r.URL.Query().Get("cwd")
			if cwd == "" {
				http.Error(w, "cwd query parameter required", http.StatusBadRequest)
				return
			}
			sessionsDeleted, eventsDeleted, err := svc.DeleteProject(cwd)
			if err != nil {
				http.Error(w, "delete project", http.StatusInternalServerError)
				return
			}
			log.Printf("[handler] project deleted cwd=%s sessions=%d events=%d", cwd, sessionsDeleted, eventsDeleted)
			w.Header().Set("Content-Type", "application/json")
			resp := map[string]any{
				"sessions_deleted": sessionsDeleted,
				"events_deleted":   eventsDeleted,
			}
			if err := json.NewEncoder(w).Encode(resp); err != nil {
				log.Printf("[handler] encode %T: %v", resp, err)
			}
			return
		}

		projects, err := svc.ListProjects()
		if err != nil {
			http.Error(w, "list projects", http.StatusInternalServerError)
			return
		}
		if projects == nil {
			projects = []domain.Project{}
		}

		w.Header().Set("Content-Type", "application/json")
		resp := map[string]any{"projects": projects}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			log.Printf("[handler] encode %T: %v", resp, err)
		}
	})
}
```

Note the handler signature changes `_ *http.Request` → `r *http.Request`.

- [ ] **Step 5: Add route**

In `backend/internal/server/router.go`, next to line 98 (`mux.Handle("GET /api/projects", ...)`):

```go
	mux.Handle("DELETE /api/projects", handler.Projects(svc))
```

- [ ] **Step 6: Run tests to verify pass**

Run: `cd backend && go build ./... && go test ./...`
Expected: all PASS

- [ ] **Step 7: Lint**

Run: `cd backend && golangci-lint run ./...`
Expected: no issues

- [ ] **Step 8: Commit**

```bash
git add backend/internal/service/event_service.go backend/internal/handler/projects.go backend/internal/server/router.go backend/tests/internal/handler/projects_sessions_test.go
git commit -m "feat: add DELETE /api/projects endpoint with session cascade

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Frontend — trash button + confirm dialog

**Files:**
- Create: `frontend/src/components/ui/alert-dialog.tsx` (via shadcn CLI — DO NOT hand-write)
- Modify: `frontend/src/features/projects/ProjectsPage.tsx`
- Test: `frontend/src/features/projects/__tests__/ProjectsPage.test.tsx` (new)

- [ ] **Step 1: Add shadcn alert-dialog primitive**

Run: `cd frontend && npx shadcn@latest add alert-dialog`
Expected: creates `src/components/ui/alert-dialog.tsx`. Generated file — never hand-edit, excluded from lint.

- [ ] **Step 2: Write the failing component test**

Create `frontend/src/features/projects/__tests__/ProjectsPage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectsPage } from '../ProjectsPage'

const PROJECT = {
  cwd: '/work/demo',
  name: 'demo',
  session_count: 3,
  last_activity: '2026-06-11T10:00:00Z',
  total_tokens: 1234,
  agents: ['claudecode'],
  live_count: 0,
}

function mockFetch(impl: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = impl(String(input), init)
      return new Response(JSON.stringify(body), { status: 200 })
    })
  )
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ProjectsPage />
    </MemoryRouter>
  )
}

describe('ProjectsPage delete', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens confirm dialog with session count and deletes on confirm', async () => {
    let deleted = false
    mockFetch((url, init) => {
      if (init?.method === 'DELETE') {
        deleted = true
        return { sessions_deleted: 3, events_deleted: 42 }
      }
      return { projects: deleted ? [] : [PROJECT] }
    })

    renderPage()
    const deleteBtn = await screen.findByRole('button', { name: /delete project demo/i })
    fireEvent.click(deleteBtn)

    expect(await screen.findByText(/permanently deletes 3 session/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
      const deleteCall = calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')
      expect(deleteCall?.[0]).toContain('/api/projects?cwd=' + encodeURIComponent('/work/demo'))
    })
    await waitFor(() => {
      expect(screen.queryByTestId('project-card')).not.toBeInTheDocument()
    })
  })

  it('cancel closes dialog without DELETE call', async () => {
    mockFetch((_url, init) => {
      if (init?.method === 'DELETE') throw new Error('must not delete')
      return { projects: [PROJECT] }
    })

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /delete project demo/i }))
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByText(/permanently deletes/i)).not.toBeInTheDocument()
    })
    const calls = (fetch as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/features/projects/`
Expected: FAIL — no delete button rendered

- [ ] **Step 4: Implement in ProjectsPage**

Rewrite `frontend/src/features/projects/ProjectsPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { Project } from '@/types/sessions'

async function loadProjects(signal: AbortSignal): Promise<Project[]> {
  const res = await fetch('/api/projects', { signal })
  if (!res.ok) return []
  const data = (await res.json()) as { projects?: Project[] }
  return data.projects || []
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    loadProjects(controller.signal)
      .then(setProjects)
      .catch((err: unknown) => {
        if ((err as Error).name !== 'AbortError') setProjects([])
      })
    const interval = window.setInterval(() => {
      loadProjects(controller.signal)
        .then(setProjects)
        .catch(() => {})
    }, 10_000)
    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [])

  async function handleDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/projects?cwd=${encodeURIComponent(pendingDelete.cwd)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        const controller = new AbortController()
        setProjects(await loadProjects(controller.signal))
      }
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  return (
    <div className="flex h-full flex-col bg-[#0a0a0a] text-white">
      <header className="border-b border-white/10 bg-black/40 px-6 py-4">
        <div className="text-[12px] font-semibold uppercase tracking-widest text-white/45">
          Projects
        </div>
        <h1 className="mt-1 text-xl font-semibold">Projects</h1>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {projects === null ? (
          <div className="text-sm text-white/45">Loading projects…</div>
        ) : projects.length === 0 ? (
          <div className="text-sm text-white/55">
            No projects yet. Start a Claude Code or Codex session to see it here.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.cwd}
                to={`/sessions/${encodeURIComponent(project.cwd)}`}
                title={project.cwd}
                data-testid="project-card"
                className="group relative rounded-lg border border-white/10 bg-white/[0.035] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete project ${project.name}`}
                  className="absolute right-2 top-2 size-7 text-white/30 opacity-0 transition-opacity hover:bg-white/10 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setPendingDelete(project)
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>

                <div className="flex items-start gap-3">
                  <div className="rounded-md border border-white/10 bg-black/30 p-2 text-white/70">
                    <FolderKanban className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-[15px] font-semibold">{project.name}</h2>
                    </div>
                    <div className="mt-1 truncate text-[12px] text-white/45">{project.cwd}</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3 text-[12px] text-white/60">
                  <span>
                    {project.session_count} {project.session_count === 1 ? 'session' : 'sessions'}
                  </span>
                  <span>{Number(project.total_tokens ?? 0).toLocaleString()} tokens</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {project.agents.map((agent) => (
                    <span
                      key={agent}
                      className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[11px] text-white/65"
                    >
                      {agent}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {pendingDelete?.session_count}{' '}
              {pendingDelete?.session_count === 1 ? 'session' : 'sessions'} and all their events.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

Import-order rule: React/router first, third-party (`lucide-react`), shadcn UI, shared types — already respected above.

- [ ] **Step 5: Run tests to verify pass**

Run: `cd frontend && npx vitest run src/features/projects/`
Expected: 2 PASS

- [ ] **Step 6: Full frontend verification**

Run: `cd frontend && npx prettier --write src/features/projects/ && npx tsc --noEmit && npx vitest run`
Expected: formatted, no type errors, full suite green

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ui/alert-dialog.tsx frontend/src/features/projects/ProjectsPage.tsx frontend/src/features/projects/__tests__/ProjectsPage.test.tsx frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat: add delete-project button with confirm dialog

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(`package.json`/`pnpm-lock.yaml` only if the shadcn CLI added the radix alert-dialog dependency — check `git status` and include only files it actually changed.)

---

### Task 4: End-to-end smoke

**Files:** none (verification only)

- [ ] **Step 1: Backend + frontend full suites**

Run:

```bash
cd backend && go build ./... && go test ./... && golangci-lint run ./...
cd ../frontend && npx tsc --noEmit && npx vitest run
```

Expected: everything green.

- [ ] **Step 2: Live smoke against running server (if argus is up on 10804)**

```bash
curl -s 'http://127.0.0.1:10804/api/projects' | head -c 300
```

Expected: project list JSON. Do NOT curl the DELETE endpoint against the live database — that destroys real data; the automated tests cover delete behavior on in-memory SQLite.
