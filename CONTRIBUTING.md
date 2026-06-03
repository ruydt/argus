# Contributing

Thanks for contributing to `hooker`. This guide is the quick path for making safe,
reviewable changes without breaking the local-first data model.

## Prerequisites

- Go `1.25.0+`
- Node.js `18+`
- `pnpm`

Install frontend dependencies once:

```bash
cd frontend
pnpm install
```

## Common Commands

Start the backend:

```bash
cd backend
go run ./cmd/server/main.go
```

By default, the backend listens on `127.0.0.1:8765` and stores SQLite data in
`backend/hooker.db`. Use `DB_PATH=/absolute/path/to/my.db` when you need a separate
database.

Start the frontend dev server:

```bash
cd frontend
pnpm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to the backend.

Run checks before opening a PR:

```bash
cd backend
go build ./...
go test ./...
golangci-lint run ./...
```

```bash
cd frontend
pnpm run check
pnpm exec vitest run
pnpm run build
```

## Project Structure

- `backend/cmd/server/` wires config, SQLite, services, router, and the HTTP server.
- `backend/internal/server/` owns router and middleware composition.
- `backend/internal/handler/` converts HTTP requests into service calls.
- `backend/internal/service/` owns event workflows, session updates, dashboard data, and SSE broadcast.
- `backend/internal/repository/` defines the storage interface.
- `backend/internal/repository/sqlite/` implements SQLite persistence and migrations.
- `backend/internal/domain/` contains canonical Go data contracts such as `NormalizedEvent`.
- `backend/internal/agents/` contains in-tree agent adapters for Claude Code and Codex.
- `frontend/src/features/` contains feature UI, feature hooks, and feature renderers.
- `frontend/src/types/` contains frontend API/domain contracts.
- `docs/` contains user-facing and architecture documentation.

## Backend Layer Boundaries

Keep dependency direction simple: `handler -> service -> repository -> domain`.

- `handler` validates HTTP inputs, selects the right adapter for hook ingestion, and maps errors to HTTP responses.
- `service` owns workflows such as `AddEvent`, session upserts, usage aggregation, and SSE fanout.
- `repository` is the storage boundary. Service code should depend on `repository.EventRepository`, not concrete SQLite types.
- `domain` defines shared structs and JSON tags. It should not import higher layers.
- `agents` parse source-specific payloads into `domain.NormalizedEvent`. Do not parse agent-specific payload fields in handlers or services.

When adding backend behavior, keep it in the lowest layer that owns the concern. For example,
query shape belongs in the repository, workflow decisions belong in the service, and HTTP
status handling belongs in the handler.

## Frontend Boundaries

- Feature pages and feature-specific hooks live under `frontend/src/features/<feature>/`.
- Shared primitives live under `frontend/src/components/`.
- Shared formatting and utilities live under `frontend/src/lib/`.
- Backend response types live under `frontend/src/types/`.

Use existing shadcn primitives from `frontend/src/components/ui/` before adding raw form or
button elements. Feature modules should import specific files directly instead of adding new
barrel files.

## Common Change Flows

### Add or Change a Backend Endpoint

1. Add or update the domain type if the response shape changes.
2. Add repository methods only if new storage access is required.
3. Add service methods for workflow logic.
4. Add or update the handler.
5. Wire the route in `backend/internal/server/router.go`.
6. Add backend tests for the new handler/service behavior.
7. Run backend build, tests, and lint.

### Add or Change Frontend Data

1. Update `frontend/src/types/events.ts` or the relevant type file.
2. Update the feature hook that fetches the data.
3. Update components and tests that render the field.
4. Run `pnpm run check`, `pnpm exec vitest run`, and `pnpm run build`.

### Add a Database Field

Add a new DB column when the value is part of the stable queryable model, is needed for
filtering or aggregation, or must be exposed consistently through the API.

Use existing extension fields or raw payload data when the value is source-specific,
experimental, rarely queried, or only needed for troubleshooting. Raw payloads are for
preserving source fidelity; they are not a replacement for a stable column when UI, API, or
repository logic needs to query the field.

When adding a column:

1. Add a new numbered SQL migration under `backend/internal/repository/sqlite/migrations/`.
2. Never edit existing migrations.
3. Update `backend/internal/domain/event.go` if the field is part of the public event contract.
4. Update SQLite insert/select mapping and tests.
5. Update frontend types and tests if the API exposes the field.

## Agent Adapter Changes

Agent adapters live under `backend/internal/agents/<agent>/`. A new or changed adapter must
include both a fixture payload and a normalization test under
`backend/tests/internal/agents/<agent>/`.

Adapter steps:

1. Capture a small fixture payload that represents the new or changed hook shape.
2. Implement or update `MatchesTranscript`, `Normalize`, `ComputeUsage`, and
   `ComputeUsageBreakdown` as needed.
3. Normalize into `domain.NormalizedEvent`; do not add agent-specific parsing to
   `backend/internal/handler/hook.go`.
4. Add a normalization test that proves canonical fields such as `Agent`, `Session`, `CWD`,
   `Path`, `Action`, `Tool`, `NormalizerVersion`, and `NormalizationStatus`.
5. If a new canonical field is required, follow the frontend-backend contract checklist.

## Frontend-backend contract checklist

Use this checklist whenever an API response, event field, JSON tag, or frontend type changes.

1. Update `backend/internal/domain/event.go` and confirm JSON tags match the intended wire shape.
2. Update `frontend/src/types/events.ts` with the matching TypeScript field.
3. Update fixture payloads or API fixtures that exercise the field.
4. Add or update backend tests proving normalization, persistence, and handler output.
5. Add or update frontend tests proving the field is typed and rendered correctly.
6. Run backend and frontend CI-equivalent commands locally.
7. Include the CI proof in the PR description.

There is no transformation layer between the Go domain shape and frontend types. A mismatch
between `backend/internal/domain/event.go` and `frontend/src/types/events.ts` is a contract
bug even if one side still compiles.

## Privacy and Local-First Scope

Hooker captures prompts, diffs, file paths, tool outputs, raw payloads, and exports locally.
Do not add behavior that implies cloud sync, multi-tenant access, or supported remote sharing.
Remote exposure is advanced and unsupported unless explicit security work lands with it.

When changing capture behavior, update the relevant privacy docs and make sure ignored data is
not persisted or broadcast.

## Pull Request Guidelines

- Keep PRs focused on one topic.
- Explain what changed, why it changed, and how it was verified.
- Link related issues or planning tasks.
- Include screenshots or short recordings for visible UI changes.
- Update docs when behavior, commands, privacy posture, or contracts change.

## Hook Data Troubleshooting

Dashboard data depends on hook events being sent to `http://127.0.0.1:8765/api/hook`.

If the dashboard looks empty, verify:

- backend is running,
- hook forwarding is configured,
- frontend is pointing to backend through the Vite `/api` proxy,
- privacy ignore rules are not excluding the working directory or event path.
