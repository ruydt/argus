# Coding Conventions

**Analysis Date:** 2026-05-24

## Naming Patterns

**Files:**

- Frontend React components use `PascalCase.tsx` (for example `frontend/src/components/Layout.tsx`, `frontend/src/features/events/EventRow.tsx`).
- Frontend hooks use `useX.ts`/`useX.tsx` (for example `frontend/src/hooks/useSessions.ts`, `frontend/src/features/events/hooks/useEvents.ts`).
- Frontend utility and config files use `kebab-case` or lowercase (`frontend/src/lib/format.ts`, `frontend/vite.config.ts`).
- Backend Go files use `snake_case.go` by area (`backend/internal/service/event_service.go`, `backend/internal/repository/sqlite/sqlite.go`).
- Tests use `*.test.ts[x]` and `*_test.go` (`frontend/tests/features/events/useEvents.test.tsx`, `backend/tests/internal/config/config_test.go`).

**Functions:**

- Frontend exported functions/components use `camelCase`/`PascalCase` (`useEvents`, `CommandBlock` in `frontend/src/features/events/hooks/useEvents.ts`, `frontend/src/features/events/renderers/CommandBlock.tsx`).
- Backend exported functions and methods use `PascalCase`; internal helpers use `camelCase` (`Events`, `GetDashboardStats`, `listEvents` in `backend/internal/handler/events.go`, `backend/internal/repository/sqlite/sqlite.go`).

**Variables:**

- Use `camelCase` for locals and constants in TS/TSX (`sessionFilter`, `textToCopy` in `frontend/src/features/events/hooks/useEvents.ts`, `frontend/src/features/events/renderers/CommandBlock.tsx`).
- Go uses short meaningful locals and `camelCase` constants (`sqliteBusyTimeoutMS`, `sqliteWriteTimeout` in `backend/internal/repository/sqlite/sqlite.go`).

**Types:**

- Frontend prop and data types use `PascalCase` with `type` aliases (`CommandBlockProps`, `EventRecord` usage in `frontend/src/features/events/renderers/CommandBlock.tsx`).
- Go domain structs and interfaces use `PascalCase` in `backend/internal/domain/*.go` and `backend/internal/repository/repository.go`.

## Code Style

**Formatting:**

- Frontend uses Prettier from `frontend/.prettierrc`.
- Key settings: `semi: false`, `singleQuote: true`, `tabWidth: 2`, `trailingComma: "es5"`, `printWidth: 100`.
- Backend formatting is Go-standard (`gofmt` style) with lint enforcement via `backend/.golangci.yml`.

**Linting:**

- Frontend uses flat ESLint config at `frontend/eslint.config.js`.
- Enabled sets: `@eslint/js` recommended, `typescript-eslint` recommended, `react-hooks`, `react-refresh`, and `eslint-config-prettier`.
- `dist` and `src/components/ui/**` are globally ignored in ESLint (`frontend/eslint.config.js`).
- Backend uses `golangci-lint` with explicit linters (`errcheck`, `govet`, `revive`, `staticcheck`, etc.) in `backend/.golangci.yml`.

## Import Organization

**Order:**

1. External packages first (`react`, `@testing-library/*`, `vitest` in `frontend/tests/features/events/useEvents.test.tsx`; stdlib in Go files).
2. Internal aliased imports next (`@/features/...`, `@/types` in frontend source and tests).
3. Relative imports last when needed (`../eventKey` in `frontend/src/features/events/hooks/useEvents.ts`).

**Path Aliases:**

- Frontend alias `@` points to `frontend/src` via `frontend/vite.config.ts`.

## Error Handling

**Patterns:**

- Frontend async flows use `try/catch/finally` with stateful UI errors (`setError`) in hooks (`frontend/src/features/events/hooks/useEvents.ts`).
- Backend returns errors up call chain and maps HTTP errors with status codes in handlers (`backend/internal/handler/events.go`).
- Go tests favor fatal failure for setup/critical paths (`t.Fatalf`) and non-fatal checks for assertions (`t.Errorf`) (`backend/tests/internal/repository/sqlite/sqlite_test.go`).

## Logging

**Framework:** `console` not detected in app code; Go uses stdlib `log`.

**Patterns:**

- Backend logs recoverable service errors without aborting request path (`log.Printf` in `backend/internal/service/event_service.go`, `backend/internal/repository/sqlite/sqlite.go`).

## Comments

**When to Comment:**

- Comments explain concurrency, ordering, SQLite behavior, and safety invariants rather than obvious code (`backend/internal/handler/events.go`, `backend/internal/repository/sqlite/sqlite.go`).

**JSDoc/TSDoc:**

- Not detected in sampled frontend/backend implementation files.

## Function Design

**Size:**

- Frontend hooks/components are generally focused but can contain complete flow logic in one function (`useEvents` in `frontend/src/features/events/hooks/useEvents.ts`).
- Backend repository/service methods can be long when orchestrating SQL + mapping (`GetDashboardStats`, `GetSessionTree` in `backend/internal/repository/sqlite/sqlite.go`).

**Parameters:**

- Frontend prefers optional params with defaults (`sessionFilterOverride = ''` in `useEvents`).
- Backend methods pass explicit domain-specific argument lists (`UpsertSession(...)` in `backend/internal/repository/sqlite/sqlite.go`).

**Return Values:**

- Frontend hooks return structured state/action objects (`{ events, error, refreshing, reload }` in `useEvents`).
- Go methods return value-plus-error tuples and sometimes total counts for pagination (`ListSessionsByCWDPage`, `GetDashboardStats` in `backend/internal/repository/sqlite/sqlite.go`).

## Module Design

**Exports:**

- Frontend exports named hooks/components/utilities from feature modules (`frontend/src/features/**`, `frontend/src/lib/utils.ts`).
- Backend packages expose constructors and handlers with package-level encapsulation (`backend/internal/service/event_service.go`, `backend/internal/handler/events.go`).

**Barrel Files:**

- Minimal barrel use detected; feature and component modules are usually imported directly by file path.

---

_Convention analysis: 2026-05-24_
