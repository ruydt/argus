# Codebase Structure

**Analysis Date:** 2026-05-24

## Directory Layout

```
hooker/
├── backend/               # Go backend services and binaries
│   ├── cmd/               # Executable entrypoints
│   ├── internal/          # Application code (handlers/service/repository/ui)
│   └── tests/             # Backend test suites
├── frontend/              # React + Vite SPA
│   ├── src/               # App source (app shell, features, hooks, components)
│   └── tests/             # Frontend test suites
└── .planning/codebase/    # Mapping outputs used by GSD workflows
```

## Directory Purposes

**`backend/cmd/`:**

- Purpose: Process entrypoints.
- Contains: `server/main.go`, `watcher/main.go`, `seed/main.go`.
- Key files: `backend/cmd/server/main.go`.

**`backend/internal/server/`:**

- Purpose: HTTP router and middleware.
- Contains: `router.go`, `middleware.go`.
- Key files: `backend/internal/server/router.go`, `backend/internal/server/middleware.go`.

**`backend/internal/handler/`:**

- Purpose: Endpoint handlers by concern.
- Contains: `hook.go`, `events.go`, `dashboard.go`, `sessions.go`, `projects.go`, `usage.go`, `traces.go`, `file_changes.go`, `proxy.go`, `version.go`.
- Key files: `backend/internal/handler/hook.go`, `backend/internal/handler/events.go`.

**`backend/internal/service/`:**

- Purpose: Business logic orchestration.
- Contains: `event_service.go`.
- Key files: `backend/internal/service/event_service.go`.

**`backend/internal/repository/`:**

- Purpose: Storage abstraction.
- Contains: `repository.go` interface and `sqlite/` implementation.
- Key files: `backend/internal/repository/repository.go`, `backend/internal/repository/sqlite/sqlite.go`.

**`backend/internal/domain/`:**

- Purpose: Shared backend domain types.
- Contains: `event.go`, `hook.go`.
- Key files: `backend/internal/domain/event.go`.

**`backend/internal/ui/`:**

- Purpose: Serve embedded frontend build.
- Contains: `ui.go`, embedded `dist/` assets.
- Key files: `backend/internal/ui/ui.go`.

**`frontend/src/app/`:**

- Purpose: App shell and navigation layout.
- Contains: `Layout.tsx`, `Sidebar.tsx`.
- Key files: `frontend/src/app/Layout.tsx`, `frontend/src/app/Sidebar.tsx`.

**`frontend/src/features/`:**

- Purpose: Feature-sliced UI modules.
- Contains: `dashboard/`, `events/`, `projects/`, `sessions/`, `usage/`.
- Key files: `frontend/src/features/events/EventsPage.tsx`, `frontend/src/features/dashboard/hooks/useDashboardStats.ts`.

**`frontend/src/components/`:**

- Purpose: Reusable UI building blocks.
- Contains: `ui/` primitives and `shared/` components.
- Key files: `frontend/src/components/ui/button.tsx`.

## Key File Locations

**Entry Points:**

- `backend/cmd/server/main.go`: API/UI server startup and dependency wiring.
- `backend/cmd/watcher/main.go`: transcript watcher worker startup.
- `frontend/src/main.tsx`: React app mount.
- `frontend/src/App.tsx`: frontend route tree and lazy page imports.

**Configuration:**

- `backend/internal/config/config.go`: server address and DB path.
- `frontend/vite.config.ts`: alias, test config, and dev API proxy.
- `backend/go.mod`: backend module/dependencies.
- `frontend/package.json`: frontend scripts/dependencies.

**Core Logic:**

- `backend/internal/handler/hook.go`: hook ingestion and normalization dispatch.
- `backend/internal/service/event_service.go`: event/session/dashboard service behavior.
- `backend/internal/repository/sqlite/sqlite.go`: migrations and persistence.

**Testing:**

- `backend/tests/internal/**`: backend tests by layer/package.
- `frontend/tests/**`: frontend tests by feature.
- `frontend/src/test/setup.ts`: frontend test setup.

## Naming Conventions

**Files:**

- Backend: snake_case Go files grouped by concern (example `file_changes.go`).
- Frontend components/pages: PascalCase `.tsx` files (example `EventsPage.tsx`, `SessionFileChangesPage.tsx`).
- Frontend hooks/utils/types: camelCase `.ts` files (example `useEvents.ts`, `useFileChanges.ts`).

**Directories:**

- Backend internal directories are lowercase by layer (`handler`, `service`, `repository`, `domain`).
- Frontend feature directories are lowercase by domain (`events`, `dashboard`, `sessions`, `usage`).

## Where to Add New Code

**New Feature:**

- Primary backend API code: `backend/internal/handler/` + `backend/internal/service/` (+ `backend/internal/repository/sqlite/` if persistence needed).
- Primary frontend UI code: `frontend/src/features/<feature>/`.
- Tests: `backend/tests/internal/...` and `frontend/tests/features/<feature>/`.

**New Component/Module:**

- Feature component: `frontend/src/features/<feature>/`.
- Shared reusable component: `frontend/src/components/shared/` or `frontend/src/components/ui/`.

**Utilities:**

- Backend helpers: `backend/internal/fileutil/` (or new focused package under `backend/internal/`).
- Frontend shared helpers: `frontend/src/lib/`.

## Special Directories

**`backend/internal/ui/dist/`:**

- Purpose: Built SPA assets embedded into backend binary.
- Generated: Yes.
- Committed: Yes.

**`backend/internal/repository/sqlite/migrations/`:**

- Purpose: Versioned SQL schema migrations embedded at build time.
- Generated: No.
- Committed: Yes.

**`.planning/codebase/`:**

- Purpose: Architecture/stack/quality mapping documents for GSD planning/execution.
- Generated: Yes (by mapping workflow).
- Committed: Yes.

---

_Structure analysis: 2026-05-24_
