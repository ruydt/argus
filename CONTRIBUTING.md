# Contributing

Thanks for contributing to `hooker`.

## Development Setup

### Prerequisites

- Go `1.25.0+`
- Node.js `18+`
- `pnpm`

### 1) Start Backend

```bash
cd backend
go run ./cmd/server/main.go
```

By default, backend uses `hooker.db` in the current working directory.

If you want a custom DB file:

```bash
cd backend
DB_PATH=/absolute/path/to/my.db go run ./cmd/server/main.go
```

### 2) Start Frontend

```bash
cd frontend
pnpm install
pnpm run dev
```

Open `http://localhost:5173`.

## Quality Checks

Run these before opening a PR.

### Backend

```bash
cd backend
go test ./...
go vet ./...
```

### Frontend

```bash
cd frontend
npm run check
npx vitest run
npm run build
```

## Pull Request Guidelines

- Keep PRs focused on one topic.
- Include a clear description of what changed and why.
- Link related issues/tasks.
- For UI changes, include screenshots or short recordings.
- Update docs when behavior or commands change.

## Commit Guidelines

- Use clear, descriptive commit messages.
- Prefer small, reviewable commits over one large commit.

## Notes for Hook Data

- Dashboard data depends on hook events being sent to:
  - `http://127.0.0.1:8765/api/hook`
- If dashboard looks empty, verify:
  - backend is running,
  - hook forwarding is configured,
  - frontend is pointing to backend (`/api` proxy via Vite).
