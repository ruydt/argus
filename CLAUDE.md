# CLAUDE.md — hooker

## Project overview

Hooker = AI coding session observer. Receives hook payloads from Claude Code and Codex via `POST /api/hook`, normalizes them, persists to SQLite, streams to browser via SSE. Frontend is a React SPA: live event feed, session waterfall, dashboard stats, usage breakdown.

Go backend + React frontend. No external infra. Ships as Docker image or local binary.

---

## What lives where

```
hooker/
├── backend/
│   ├── cmd/server/          # Binary entry point — wire config → repo → service → router
│   ├── cmd/seed/            # Dev data seeder
│   └── internal/
│       ├── agents/
│       │   ├── claudecode/  # Normalize + usage for Claude Code payloads
│       │   └── codex/       # Normalize + usage for Codex payloads
│       ├── config/          # Load runtime env vars (ADDR, DB_PATH)
│       ├── domain/          # Canonical types — NormalizedEvent, Session, DashboardStats
│       ├── fileutil/        # File line scanner for context enrichment
│       ├── handler/         # HTTP handlers — one file per endpoint group
│       ├── repository/
│       │   └── sqlite/      # SQLite persistence + versioned migrations (//go:embed)
│       ├── server/          # Router wiring + CORS/logging middleware
│       └── service/         # Business logic — AddEvent, broadcast, session upsert, stats
│
├── frontend/
│   └── src/
│       ├── app/             # Layout shell + Sidebar
│       ├── features/
│       │   ├── events/      # EventsPage, hooks/useEvents, hooks/useEventFilters, renderers/
│       │   ├── dashboard/   # DashboardPage, hooks/useDashboardStats, date-range helpers
│       │   ├── sessions/    # SessionsPage, TraceBlock, SessionDetail, hooks/useSessionTree
│       │   └── usage/       # UsagePage
│       ├── components/
│       │   ├── ui/          # shadcn-generated primitives — DO NOT lint, DO NOT hand-edit
│       │   └── shared/      # Custom shared components (PaginationBar, DashboardEmpty)
│       ├── hooks/           # Global hooks (useSessions)
│       ├── lib/             # utils.ts, format.ts
│       ├── pages/           # Thin route wrappers (Dashboard.tsx)
│       ├── types/           # Domain types (events.ts, usage.ts, sessions.ts) + barrel index.ts
│       └── test/            # Global Vitest setup (setup.ts)
│
├── docs/superpowers/
│   ├── specs/               # Design specs (brainstorm output)
│   └── plans/               # Implementation plans
│
├── .planning/codebase/      # Codebase intel — STACK.md, ARCHITECTURE.md, CONVENTIONS.md, TESTING.md
├── docker-compose.yml
└── plan.md                  # Current in-flight planning doc
```

---

## File structure and what owns what

### Sources of truth — edit only these

| File                                               | What it controls                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/internal/domain/event.go`                 | Canonical backend types. JSON tags must stay in sync with frontend `src/types/`.                                                                              |
| `backend/internal/repository/sqlite/migrations/`   | Schema migrations. Add new `.sql` file with next sequence number. Never edit existing migrations.                                                             |
| `backend/internal/agents/claudecode/claudecode.go` | Claude Code payload normalization. Single source — `handler/hook.go` calls `Normalize()` here.                                                                |
| `backend/internal/agents/codex/codex.go`           | Codex payload normalization. Same contract as claudecode.                                                                                                     |
| `backend/internal/service/event_service.go`        | Business logic. `AddEvent` → persist → broadcast. `GetDashboardStats` → SQL aggregate + transcript enrichment.                                                |
| `frontend/src/types/events.ts`                     | Frontend domain types. Must mirror `backend/internal/domain/event.go` JSON tags — no transformation layer.                                                    |
| `frontend/src/types/sessions.ts`                   | Session tree types. Mirror backend `domain.SessionTreeNode`.                                                                                                  |
| `frontend/src/features/sessions/utils.ts`          | Session display helpers — `isRunning`, `sessionDurationMs`, `formatDuration`, `formatTimeAxis`, `shortenCwd`. Single source for all session formatting logic. |

### Auto-generated — do not edit directly

| File                               | Synced from                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `frontend/src/components/ui/*.tsx` | Generated by `shadcn` CLI. Run `npx shadcn add <component>` to add new ones. Never hand-edit. |

---

## Architecture

```
AI Agent → POST /api/hook → handler.Hook → claudecode/codex.Normalize()
                                         → enrichContext() (file scan)
                                         → svc.AddEvent() → repo.Add() + broadcast()
                                                                     ↓
Browser ← GET /api/events/stream (SSE) ← EventService.subscribers (sync.Map)
        ← GET /api/sessions/tree
        ← GET /api/dashboard/stats
        ← GET /api/session-usage
```

**Dependency direction (backend):** handler → service → repository → domain. Never skip layers. Never import handler from service.

**Agent detection:** `transcript_path` string at ingest time. Paths containing `/.claude/` → Claude Code; others → Codex. This is the only detection mechanism.

**Frontend state:** No global store. `Layout.tsx` owns shared state (`searchQuery`, `collapsedSessions`, `sessionUsage`) and distributes via `useOutletContext<LayoutOutletContext>()`. Feature state lives in custom hooks.

---

## Frontend component rules

**Before writing any UI element, check `src/components/ui/` first.**

Available shadcn primitives:
`Alert` · `Badge` · `Button` · `Calendar` · `Card` · `Chart` (Recharts wrapper) · `Collapsible` · `Empty` · `Input` · `Popover` · `ScrollArea` · `Select` · `Separator` · `Skeleton` · `Table` · `Tabs` · `ToggleGroup` · `Toggle` · `Tooltip`

Use the primitive and override with `className` / inline `style` for custom colors. Do not reach for a raw `<button>`, `<select>`, or `<span>` when a shadcn component covers the case.

**Import order:**

1. React + framework (`react`, `react-router-dom`)
2. Third-party (`lucide-react`, `date-fns`)
3. shadcn UI (`@/components/ui/...`)
4. Shared lib + types (`@/lib/utils`, `@/types`)
5. Feature-local relative (`./hooks/...`, `./renderers/...`)

**Naming:**

- Components: PascalCase named exports
- Hooks: camelCase `use` prefix named exports
- Props type: `type ComponentNameProps = { ... }` co-located in the component file
- No default exports

**No barrel files in feature directories.** `src/types/` and `src/agents/` have barrel `index.ts` — features do not.

**Formatting:** Prettier config — no semicolons, single quotes, 2-space indent, trailing commas ES5, 100-char line width. Run `npx prettier --write` before committing.

---

## Backend rules

**Always debug and test backend changes.**

Before calling any backend task done:

1. Run `go build ./...` — no compilation errors
2. Run `go test ./...` — all tests pass
3. Run `golangci-lint run ./...` — no lint errors
4. If adding a new handler or service method, add a corresponding `_test.go` alongside it

**Test patterns:**

- Handler tests: `httptest.NewRequest` + `httptest.NewRecorder` against real handler with in-memory SQLite service. Package: `package handler_test` (black-box).
- Service tests: mock `repository.EventRepository` interface via `mockRepo` struct. Package: `package service_test`.
- Repository tests: real in-memory SQLite via `sqlite.New(":memory:")`. Package: `package sqlite_test`.
- Agent normalize tests: inline JSON payload → assert `NormalizedEvent` fields. No external deps needed.

**Run commands:**

```bash
cd backend
go test ./...                                    # all tests
go test -v ./internal/handler/...               # verbose handler tests
go test -run TestHookHandlerRejectsGET ./internal/handler/  # single test
golangci-lint run ./...                          # lint
```

**Error handling:**

- Return `(T, error)` from every function that can fail
- Handlers: `http.Error(w, msg, status); return`
- No panic recovery. No sentinel errors. Plain `errors.New` / `fmt.Errorf`
- Log with `log.Printf("[handler] key=val ...")`

**Adding a new agent:** Implement `MatchesTranscript()`, `Normalize()`, `ComputeUsage()`, `ComputeUsageBreakdown()` in a new `internal/agents/<name>/` package. Wire detection in `handler/hook.go`. Add normalization tests before touching the handler.

---

## Frontend testing rules

Run before calling any frontend task done:

```bash
cd frontend
npx tsc --noEmit          # no type errors
npx vitest run            # all tests pass
```

**Test file location:** co-located `__tests__/` subdirectory inside the feature or app directory. Not a top-level `tests/` directory — sessions feature is an exception (historical, keep consistent per-feature).

**Test structure:**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

function renderWith(props) {
  return render(
    <MemoryRouter>
      <Component {...props} />
    </MemoryRouter>,
  );
}
```

**Mock patterns:**

- Callbacks: `vi.fn()`
- Time: `vi.useFakeTimers()` + `vi.setSystemTime(new Date('...'))`
- Browser APIs: `Object.defineProperty` on `window` or `navigator`

---

## Key rules for agents working here

- **Frontend components:** Check `src/components/ui/` before writing any raw HTML element. If a shadcn primitive covers the case, use it.
- **Backend changes:** Always run `go build ./...` + `go test ./...` + `golangci-lint run ./...` before marking done. Add tests for any new handler/service/repository function.
- **Domain types:** Keep `backend/internal/domain/event.go` JSON tags in sync with `frontend/src/types/events.ts`. No transformation layer exists — any mismatch silently breaks the data contract.
- **Migrations:** New migration = new `.sql` file with the next sequence number. Never edit existing migrations.
- **Agent normalization:** Edit `internal/agents/claudecode/` or `internal/agents/codex/` for payload shape changes. Never parse agent-specific fields in the handler or service.
- **Single sources of truth:** Session display formatting lives in `features/sessions/utils.ts`. Architecture/conventions reference lives in `.planning/codebase/`. Design specs live in `docs/superpowers/specs/`. Plans live in `docs/superpowers/plans/`.
- **No barrel files in features.** Import from the specific file, not a feature `index.ts`.
- **No global state library.** Local React state + `useOutletContext` only.
- **SSE handler:** Subscribe to broadcaster before backfill. See `handler/events.go` — the order is intentional (prevents dropped events between the two operations).
- **Prettier + tsc before commit** on any frontend change. `go vet` + lint before commit on any backend change.

<!-- GSD:project-start source:PROJECT.md -->

## Project

**hooker**

hooker is a local-first monitoring dashboard for AI coding agent activity. It receives hook payloads from Claude Code, Codex, and Gemini CLI, normalizes them into a canonical event model, persists to SQLite, and streams to a React SPA in real time. Built for solo developers who want visibility into their coding agent sessions without cloud dependencies.

**Core Value:** A developer can install hooker from source in under 10 minutes and trust that it reliably captures, stores, and surfaces their coding agent activity without data loss, silent failures, or upgrade surprises.

### Constraints

- **Stack:** Go backend + React/TypeScript SPA — no new runtimes without strong justification
- **Storage:** SQLite for all local use — no alternative until real usage data demands it
- **Solo maintainer:** Avoid abstractions or CI overhead that creates maintenance tax without proportional value
- **Source install first:** Docs and scripts must support source install as the primary path; Docker is secondary
- **No breaking schema changes without migration + upgrade notes**
- **Privacy:** Product captures prompts, diffs, tool outputs, file paths — data handling must be explicit, not implicit
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- Go 1.25.0 - Backend API, ingestion, storage, and embedded UI serving in `backend/`
- TypeScript 6.0.2 - Frontend application and tests in `frontend/src/` and `frontend/tests/`
- SQL (SQLite migrations) - Schema and evolution in `backend/internal/repository/sqlite/migrations/`
- CSS - Styling in `frontend/src/index.css` and `frontend/src/styles/app.css`

## Runtime

- Go toolchain 1.25.0 (`backend/go.mod`)
- Node.js 18+ (`README.md` requirements)
- pnpm 10.23.0 (`frontend/package.json`)
- Lockfile: present (`frontend/pnpm-lock.yaml`)

## Frameworks

- React 19.2.5 - UI runtime (`frontend/package.json`)
- React Router DOM 7.14.2 - Client routing (`frontend/package.json`, `frontend/src/main.tsx`)
- Vite 8.0.10 - Frontend dev/build tooling (`frontend/package.json`, `frontend/vite.config.ts`)
- Go stdlib `net/http` - Backend HTTP server/router (`backend/internal/server/router.go`)
- Vitest 4.1.5 - Frontend tests (`frontend/package.json`, `frontend/vite.config.ts`)
- Testing Library (`@testing-library/react`, `@testing-library/jest-dom`) - React component tests (`frontend/package.json`)
- Go `testing` package - Backend tests in `backend/tests/`
- TypeScript compiler (`tsc -b`) - Type/build checks (`frontend/package.json`)
- ESLint 10 + typescript-eslint - Linting (`frontend/eslint.config.js`)
- Prettier 3.8.3 - Formatting (`frontend/package.json`)

## Key Dependencies

- `modernc.org/sqlite` v1.50.0 - Embedded SQLite driver for backend persistence (`backend/go.mod`, `backend/internal/repository/sqlite/sqlite.go`)
- `react` / `react-dom` v19.2.5 - UI rendering (`frontend/package.json`)
- `react-router-dom` v7.14.2 - App navigation (`frontend/package.json`)
- `@vitejs/plugin-react` v6.0.1 - React transform pipeline (`frontend/package.json`, `frontend/vite.config.ts`)
- `@tailwindcss/vite` v4.2.4 + `tailwindcss` v4.2.4 - Styling pipeline (`frontend/package.json`, `frontend/vite.config.ts`)
- `radix-ui`, `shadcn`, `lucide-react` - Component primitives and icon system (`frontend/package.json`, `frontend/components.json`)

## Configuration

- Backend runtime config via env vars `ADDR` and `DB_PATH` (`backend/internal/config/config.go`)
- Frontend uses Vite dev server proxy to backend (`frontend/vite.config.ts`)
- `.env*` files: Not detected in repository scan
- Frontend: `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/eslint.config.js`
- Backend build/runtime: `backend/go.mod`, `Dockerfile`, `docker-compose.yml`, `Makefile`

## Platform Requirements

- Go 1.25.0+, Node.js 18+, pnpm 10.x, curl (`README.md`)
- macOS/Linux/WSL preferred (`README.md`)
- Local-first single-binary backend serving API + UI on `127.0.0.1:8765` (`README.md`, `backend/cmd/server/main.go`)
- Optional container runtime via `Dockerfile` + `docker-compose.yml`
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Frontend React components use `PascalCase.tsx` (for example `frontend/src/app/Layout.tsx`, `frontend/src/features/events/EventRow.tsx`).
- Frontend hooks use `useX.ts`/`useX.tsx` (for example `frontend/src/hooks/useSessions.ts`, `frontend/src/features/events/hooks/useEvents.ts`).
- Frontend utility and config files use `kebab-case` or lowercase (`frontend/src/lib/format.ts`, `frontend/vite.config.ts`).
- Backend Go files use `snake_case.go` by area (`backend/internal/service/event_service.go`, `backend/internal/repository/sqlite/sqlite.go`).
- Tests use `*.test.ts[x]` and `*_test.go` (`frontend/tests/features/events/useEvents.test.tsx`, `backend/tests/internal/config/config_test.go`).
- Frontend exported functions/components use `camelCase`/`PascalCase` (`useEvents`, `CommandBlock` in `frontend/src/features/events/hooks/useEvents.ts`, `frontend/src/features/events/renderers/CommandBlock.tsx`).
- Backend exported functions and methods use `PascalCase`; internal helpers use `camelCase` (`Events`, `GetDashboardStats`, `listEvents` in `backend/internal/handler/events.go`, `backend/internal/repository/sqlite/sqlite.go`).
- Use `camelCase` for locals and constants in TS/TSX (`sessionFilter`, `textToCopy` in `frontend/src/features/events/hooks/useEvents.ts`, `frontend/src/features/events/renderers/CommandBlock.tsx`).
- Go uses short meaningful locals and `camelCase` constants (`sqliteBusyTimeoutMS`, `sqliteWriteTimeout` in `backend/internal/repository/sqlite/sqlite.go`).
- Frontend prop and data types use `PascalCase` with `type` aliases (`CommandBlockProps`, `EventRecord` usage in `frontend/src/features/events/renderers/CommandBlock.tsx`).
- Go domain structs and interfaces use `PascalCase` in `backend/internal/domain/*.go` and `backend/internal/repository/repository.go`.

## Code Style

- Frontend uses Prettier from `frontend/.prettierrc`.
- Key settings: `semi: false`, `singleQuote: true`, `tabWidth: 2`, `trailingComma: "es5"`, `printWidth: 100`.
- Backend formatting is Go-standard (`gofmt` style) with lint enforcement via `backend/.golangci.yml`.
- Frontend uses flat ESLint config at `frontend/eslint.config.js`.
- Enabled sets: `@eslint/js` recommended, `typescript-eslint` recommended, `react-hooks`, `react-refresh`, and `eslint-config-prettier`.
- `dist` and `src/components/ui/**` are globally ignored in ESLint (`frontend/eslint.config.js`).
- Backend uses `golangci-lint` with explicit linters (`errcheck`, `govet`, `revive`, `staticcheck`, etc.) in `backend/.golangci.yml`.

## Import Organization

- Frontend alias `@` points to `frontend/src` via `frontend/vite.config.ts`.

## Error Handling

- Frontend async flows use `try/catch/finally` with stateful UI errors (`setError`) in hooks (`frontend/src/features/events/hooks/useEvents.ts`).
- Backend returns errors up call chain and maps HTTP errors with status codes in handlers (`backend/internal/handler/events.go`).
- Go tests favor fatal failure for setup/critical paths (`t.Fatalf`) and non-fatal checks for assertions (`t.Errorf`) (`backend/tests/internal/repository/sqlite/sqlite_test.go`).

## Logging

- Backend logs recoverable service errors without aborting request path (`log.Printf` in `backend/internal/service/event_service.go`, `backend/internal/repository/sqlite/sqlite.go`).

## Comments

- Comments explain concurrency, ordering, SQLite behavior, and safety invariants rather than obvious code (`backend/internal/handler/events.go`, `backend/internal/repository/sqlite/sqlite.go`).
- Not detected in sampled frontend/backend implementation files.

## Function Design

- Frontend hooks/components are generally focused but can contain complete flow logic in one function (`useEvents` in `frontend/src/features/events/hooks/useEvents.ts`).
- Backend repository/service methods can be long when orchestrating SQL + mapping (`GetDashboardStats`, `GetSessionTree` in `backend/internal/repository/sqlite/sqlite.go`).
- Frontend prefers optional params with defaults (`sessionFilterOverride = ''` in `useEvents`).
- Backend methods pass explicit domain-specific argument lists (`UpsertSession(...)` in `backend/internal/repository/sqlite/sqlite.go`).
- Frontend hooks return structured state/action objects (`{ events, error, refreshing, reload }` in `useEvents`).
- Go methods return value-plus-error tuples and sometimes total counts for pagination (`ListSessionsByCWDPage`, `GetDashboardStats` in `backend/internal/repository/sqlite/sqlite.go`).

## Module Design

- Frontend exports named hooks/components/utilities from feature modules (`frontend/src/features/**`, `frontend/src/lib/utils.ts`).
- Backend packages expose constructors and handlers with package-level encapsulation (`backend/internal/service/event_service.go`, `backend/internal/handler/events.go`).
- Minimal barrel use detected; feature and component modules are usually imported directly by file path.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component           | Responsibility                                                   | File                                           |
| ------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| API bootstrap       | Build config, repository, service, and router, then start server | `backend/cmd/server/main.go`                   |
| Router              | Map API/UI routes and apply middleware                           | `backend/internal/server/router.go`            |
| Handlers            | Convert HTTP requests into service calls and encode responses    | `backend/internal/handler/*.go`                |
| Service             | Own event/session/dashboard workflows and SSE subscriptions      | `backend/internal/service/event_service.go`    |
| Repository contract | Define storage boundary used by service                          | `backend/internal/repository/repository.go`    |
| SQLite adapter      | Run migrations and execute SQL for events/sessions/aggregates    | `backend/internal/repository/sqlite/sqlite.go` |
| Embedded UI handler | Serve `dist/` static files and SPA fallback                      | `backend/internal/ui/ui.go`                    |
| Frontend app shell  | Browser route tree with lazy page loading                        | `frontend/src/App.tsx`                         |

## Pattern Overview

- HTTP layer depends only on `EventService`.
- Service layer depends on `EventRepository` interface, not concrete SQLite type.
- Frontend reads backend via `/api/*` and is served by the same Go process in production.

## Layers

- Purpose: Start processes and mount client app.
- Location: `backend/cmd/server`, `backend/cmd/watcher`, `frontend/src/main.tsx`
- Contains: Server bootstrap, watcher loop, React root mount.
- Depends on: Router/service/repository and browser runtime.
- Used by: Operators and browser clients.
- Purpose: Route, validate, and serialize HTTP/SSE traffic.
- Location: `backend/internal/server`, `backend/internal/handler`
- Contains: Route map, CORS/logging middleware, endpoint handlers.
- Depends on: `backend/internal/service`.
- Used by: Hook senders and frontend API calls.
- Purpose: Central event/session/usage orchestration.
- Location: `backend/internal/service`
- Contains: `AddEvent`, list/query methods, dashboard enrichment, SSE fanout.
- Depends on: `repository.EventRepository`, agent usage calculators.
- Used by: All handlers.
- Purpose: Durable storage and shared data contracts.
- Location: `backend/internal/repository`, `backend/internal/repository/sqlite`, `backend/internal/domain`
- Contains: Storage interface, SQLite queries/migrations, domain structs.
- Depends on: SQL driver `modernc.org/sqlite`.
- Used by: Service and tests.

## Data Flow

### Primary Request Path

### Secondary Flow Name

- Backend shared mutable state is `EventService.subscribers` (`sync.Map`) in `backend/internal/service/event_service.go`.
- Frontend state is local React hook/component state, with periodic polling in some hooks (`frontend/src/hooks/useSessions.ts`).

## Key Abstractions

- Purpose: Storage boundary between service and persistence.
- Examples: `backend/internal/repository/repository.go`, `backend/internal/repository/sqlite/sqlite.go`
- Pattern: Interface + adapter.
- Purpose: Application use-case facade for handlers.
- Examples: `backend/internal/service/event_service.go`
- Pattern: Single orchestrator service.
- Purpose: Convert source-specific payloads into `domain.NormalizedEvent`.
- Examples: `backend/internal/agents/claudecode`, `backend/internal/agents/codex`, `backend/internal/agents/geminicli`
- Pattern: Handler-selected strategy by transcript/source metadata.

## Entry Points

- Location: `backend/cmd/server/main.go`
- Triggers: Process startup.
- Responsibilities: Dependency wiring and HTTP lifecycle.
- Location: `backend/cmd/watcher/main.go`
- Triggers: Worker startup.
- Responsibilities: Poll transcript JSONL files and emit tool hooks.
- Location: `frontend/src/main.tsx`
- Triggers: Browser load.
- Responsibilities: Mount React tree.

## Architectural Constraints

- **Threading:** Concurrent request goroutines; SQLite serializes writes with busy/write timeouts in `backend/internal/repository/sqlite/sqlite.go`.
- **Global state:** Embedded dist filesystem in `backend/internal/ui/ui.go`; SSE subscriber registry in `backend/internal/service/event_service.go`.
- **Circular imports:** Not detected from indexed symbols.
- **Other constraint:** UI deployment is coupled to backend binary via embedded `dist/` assets in `backend/internal/ui/ui.go`.

## Anti-Patterns

### Service Concentration

### Repeated Query Parsing

## Error Handling

- Handlers use `http.Error` for malformed input or list/query failures (`backend/internal/handler/hook.go`, `backend/internal/handler/events.go`, `backend/internal/handler/sessions.go`).
- Hook endpoint can return accepted empty JSON when storage fails after parsing (`backend/internal/handler/hook.go`).

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

| Skill         | Description                                                                                                                                                                                              | Path                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| brainstorming | "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation." | `.agents/skills/brainstorming/SKILL.md` |

<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.

<!-- GSD:profile-end -->
