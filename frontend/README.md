# argus frontend

React + TypeScript + Vite SPA for [argus](https://github.com/ruydt/argus) — the hooks
config editor and simulator, live event feed, dashboard, sessions/projects explorer,
diagnostics, and the script collection. In production it is built to static assets and
embedded into the Go binary; in development it runs against the backend through a dev proxy.

## Prerequisites

- Node.js 18+
- pnpm 10.x (`corepack enable && corepack prepare pnpm@10.23.0 --activate`)

## Develop

```bash
pnpm install
pnpm run dev
```

The Vite dev server proxies `/api` to the backend at `http://127.0.0.1:10804`, so run the
backend alongside it (`cd ../backend && go run ./cmd/server`). Dev server: <http://localhost:5173>.

## Checks

```bash
pnpm exec tsc --noEmit          # types
pnpm exec vitest run            # tests
pnpm run build                  # production build
pnpm exec eslint src            # lint
pnpm exec prettier --check src  # formatting
```

## Conventions

- `@` aliases `src/` (see `vite.config.ts`).
- Check `src/components/ui/` (shadcn-generated — never hand-edit) before writing any raw
  HTML element; add new primitives with `npx shadcn add <component>`.
- Prettier: no semicolons, single quotes, 2-space indent, 100-char width.
- Named exports only; no barrel files inside feature directories.

See [CONTRIBUTING.md](../CONTRIBUTING.md) and the repo [CLAUDE.md](../CLAUDE.md) for the
full architecture and frontend rules.
