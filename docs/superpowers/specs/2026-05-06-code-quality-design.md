# Code Quality: Types, Lint, Format Design

**Date:** 2026-05-06
**Status:** Approved
**Scope:** `frontend/` only

## Goal

Fix all ESLint errors, add Prettier formatting, and add a single `check` script that runs typecheck + lint + format check. Result: `npm run check` passes clean with zero errors.

## Type Definitions

New file `src/types.ts` — all types derived directly from Go backend structs.

```ts
export interface CtxLine {
  num: number
  text: string
}

export interface EventRecord {
  time: string
  action: string
  path: string
  command?: string
  session?: string
  transcript_path?: string
  tool?: string
  hook_event_name?: string
  turn_id?: string
  tool_use_id?: string
  source?: string
  model?: string
  cwd?: string
  prompt?: string
  description?: string
  old_string?: string
  new_string?: string
  start_line?: number
  ctx_before?: CtxLine[]
  ctx_after?: CtxLine[]
}

export interface SessionUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  turns: number
}

export interface SessionGroup {
  sessionId: string
  transcriptPath: string
  events: EventRecord[]
}
```

Used by: `useEvents.ts`, `Events.tsx`, `AgentSession.tsx`, `Layout.tsx`.

`SessionGroup` is a derived frontend grouping type (not a backend response), computed from `EventRecord[]` grouped by `session`.

## Prettier

Install: `prettier`, `eslint-config-prettier`

`.prettierrc`:
```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

`.prettierignore`:
```
dist/
node_modules/
```

`eslint.config.js` — add `eslintConfigPrettier` at end of extends array to disable conflicting rules.

Add ESLint ignore for `src/components/ui/**` (shadcn auto-generated files — not owned by this project, formatting should not be enforced).

## Scripts

`package.json`:
```json
"typecheck": "tsc --noEmit",
"format": "prettier --write .",
"format:check": "prettier --check .",
"check": "npm run typecheck && npm run lint && npm run format:check"
```

## Lint Fixes

### `no-explicit-any` (22 violations)

Replace `any` with types from `src/types.ts`:

| File | Fix |
|------|-----|
| `useEvents.ts` | `events: EventRecord[]`, response typed as `{ events: EventRecord[] }` |
| `Events.tsx` | `events: EventRecord[]`, session map typed as `Map<string, SessionGroup>` |
| `AgentSession.tsx` | props typed with `EventRecord`, `SessionGroup`, `SessionUsage` |
| `Layout.tsx` | outlet context typed as `{ collapsedSessions: Set<string>; setCollapsedSessions: ... ; sessionUsage: Record<string, SessionUsage>; setSessionUsage: ... }` |
| `Usage.tsx` | OpenAI API response typed as `OpenAIUsageResponse` (see below) |

### `no-unused-vars` (3 violations)

Delete the unused variables. No suppression.

### `no-empty` in `useEvents.ts`

Add `error` state to `useEvents`:
```ts
const [error, setError] = useState<string | null>(null)
// in catch: setError('Failed to fetch events')
```
Expose `error` in return value. Callers can ignore it if they want — no UI change required.

### `react-hooks/set-state-in-effect` in `Usage.tsx`

Restructure the effect to not call setState unconditionally inside useEffect body. Pattern: fetch → compute → single setState call at the end.

### `react-hooks/purity` + `react-hooks/exhaustive-deps` in `Events.tsx`

- Move impure computation (date math, `new Date()`) out of render into a stable derived value
- Add missing effect dependencies or stabilize with `useCallback`/`useMemo`

### `react-refresh/only-export-components` in `badge.tsx`, `button.tsx`

Add ESLint disable comment to `src/components/ui/` via ESLint config ignore pattern — these are shadcn auto-generated files.

### OpenAI Usage Response (inline in `Usage.tsx`)

Derived from actual field access in component:

```ts
interface OpenAIBucketResult {
  num_model_requests?: number
  input_tokens?: number
  output_tokens?: number
  model?: string
  api_key_id?: string
}

interface OpenAIBucket {
  start_time_iso: string
  results?: OpenAIBucketResult[]
}

interface OpenAIUsageResponse {
  data?: OpenAIBucket[]
  error?: { message?: string }
}
```

## Success Criteria

1. `npm run check` exits 0 with no errors
2. `npm run build` exits 0 (already passing)
3. No `// eslint-disable` suppressions in `src/` outside `components/ui/`
4. All API response types defined in `src/types.ts`, no `any` in public interfaces
