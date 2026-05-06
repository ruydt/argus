# STACK.md — Technology Stack

**Last mapped:** 2026-05-05

---

## Languages & Runtimes

| Layer | Language | Runtime |
|-------|----------|---------|
| Backend | Go 1.23 | Standard library only |
| Frontend | TypeScript 6.0.3 | Node 24 (dev), browser (prod) |

---

## Backend

**Module:** `agent-monitor` (`backend/go.mod`)

No external Go dependencies — pure stdlib.

| Package | Purpose |
|---------|---------|
| `net/http` | HTTP server, routing, request handling |
| `encoding/json` | JSON encode/decode |
| `sync` | `RWMutex` for Store concurrency |
| `log` | Structured key=value logging |
| `strings`, `time`, `io` | Utilities |

**Binary output:** `backend/agent-monitor`

**Listen address:** `127.0.0.1:8765` (loopback only)

---

## Frontend

**Root:** `frontend/`

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^19.2.5 | UI framework |
| `react-dom` | ^19.2.5 | DOM rendering |
| `react-router-dom` | ^7.14.2 | Client-side routing |
| `recharts` | ^3.8.1 | Charts (token usage visualization) |
| `lucide-react` | ^1.14.0 | Icon library |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `vite` | ^8.0.10 | Build tool / dev server |
| `@vitejs/plugin-react` | ^6.0.1 | React fast refresh |
| `typescript` | ~6.0.2 | Type checking |
| `typescript-eslint` | ^8.58.2 | TS linting |
| `eslint` | ^10.2.1 | Linting |
| `eslint-plugin-react-hooks` | ^7.1.1 | Hooks lint rules |
| `eslint-plugin-react-refresh` | ^0.5.2 | HMR safety |

**Build output:** `frontend/dist/`

---

## Configuration Files

| File | Purpose |
|------|---------|
| `frontend/vite.config.ts` | Vite + ngrok proxy config |
| `frontend/tsconfig.json` | TS project references |
| `frontend/tsconfig.app.json` | App strict TS config |
| `frontend/tsconfig.node.json` | Node/Vite config TS |
| `frontend/eslint.config.js` | ESLint flat config |
| `backend/go.mod` | Go module (no external deps) |
| `.gitignore` | Root gitignore |

---

## TypeScript Compiler Options (strict)

From `frontend/tsconfig.app.json`:
- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `verbatimModuleSyntax: true` (enforces `import type`)
