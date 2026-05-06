# CONVENTIONS.md — Code Conventions

**Last mapped:** 2026-05-05

---

## Go Backend

### Formatting
- `gofmt` standard formatting enforced
- No extra linter config (no golangci-lint, no `.golangci.yml`)

### Naming
- Exported symbols: `PascalCase` — `Store`, `FileEvent`, `AddEvent`, `MatchesTranscript`
- Unexported: `camelCase` — `firstNonEmpty`, `writeJSON`
- Struct JSON tags: `json:"snake_case"` with `,omitempty` on optional fields

### Imports
- Stdlib only (zero external dependencies)
- Internal packages: `agent-monitor/internal/agents/claudecode`
- Blank line separates stdlib from internal imports

### Error Handling
- `if err != nil` at call site
- Zero-value returns on failure
- HTTP errors via `http.Error(w, msg, statusCode)`
- No wrapping (`fmt.Errorf`, `errors.As`) — direct returns

### Logging
- `log.Printf` with structured key=value pairs:
  ```go
  log.Printf("[hook] session=%s model=%s tool=%s action=%s path=%s", ...)
  ```
- No log levels (no slog, no zerolog)

### Concurrency
- `sync.RWMutex` in `Store` for concurrent read/write safety
- Lazy map init inside lock guards

### Patterns
- Single-package internal packages (`internal/events`, `internal/agents/claudecode`)
- No interfaces for internal types — direct struct usage
- Custom `atoi`/`max` helpers instead of stdlib (minor inconsistency — `strconv.Atoi` and Go 1.21 builtin `max` exist)

---

## TypeScript / React Frontend

### Formatting
- 2-space indentation, single quotes
- No Prettier config detected — formatting unenforced by tooling

### Linting
- ESLint flat config (`frontend/eslint.config.js`)
- `typescript-eslint` recommended rules
- `eslint-plugin-react-hooks` — hooks rules enforced
- `eslint-plugin-react-refresh` — HMR safety

### TypeScript Style
- Strict mode: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`
- `verbatimModuleSyntax` forces `import type` for type-only imports
- Prefer `type` over `interface` throughout codebase
- `any` used liberally for raw event/session data — no typed `FileEvent` interface on frontend

### Component Patterns
- Named exports: `export function ClaudeSession(...)` — NOT default exports
- Exception: `App.tsx` uses default export
- Props typed inline or via local `type Props = {...}`
- State lifted to `Layout.tsx`, passed down via `useOutletContext<any>()`

### Import Order
1. React (`react`, `react-dom`)
2. Router (`react-router-dom`)
3. Third-party (recharts, lucide-react)
4. Internal components/pages
5. `import type` statements

### Error Handling
- Polling errors: silent `catch (e) { }` — failures ignored
- User-visible errors: `setError()` state in Usage page
- No global error boundary

### State Management
- No global state library (no Redux, no Zustand, no Context API)
- Shared state lifted to nearest common ancestor (`Layout.tsx`)
- Passed to child routes via `useOutletContext<any>()`
