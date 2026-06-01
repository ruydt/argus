# Phase 11: Frontend Polish & UX — Research

**Researched:** 2026-06-01
**Domain:** React frontend UX patterns + Go service TTL cache
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Backend 30s TTL in-memory cache — add `diagnosticsCache struct { result *domain.Diagnostics; cachedAt time.Time }` + `diagMu sync.RWMutex` to `EventService`. `DiagnosticsWithOptions()` checks cache first; on miss runs queries and stores. Cache is time-based only, no write invalidation.
- **D-02:** Log scale on `YAxis` — `scale="log"` + `domain={[1, 'auto']}`. Existing `tickFormatter` unchanged. Tooltip exact values unchanged.
- **D-03:** Hover-reveal clipboard icon in `AgentSession` header. Copy via `navigator.clipboard.writeText(sessionId)`. Swap `Copy` → `Check` for 1500ms then revert. Stop propagation on click. `useState<boolean>` for `copied`.
- **D-04:** Click `ChangeRow` to toggle expanded `<pre>` code block. Show `new_string` if present, else `old_string`, else no expansion. Line numbers start from `start_line` if present else 1. Format `{lineNum} │ {codeLine}`. Truncate at 200 lines. `useState<boolean>` for `expanded`.
- **D-05:** Surface triage bugs during 11-01/11-02 implementation — none pre-specified.

### Claude's Discretion

- `useDiagnostics` module-level cache pattern (structure mirrors `useDashboardStats`)
- Exact chevron icon for ChangeRow expand toggle
- Whether to extract a `useCopied` helper or inline the pattern in `AgentSession`

### Deferred Ideas (OUT OF SCOPE)

- Index additions on `hook_events`
- Diff view (old → new) in FileChangesDrawer
- Toast notifications for copy feedback
- Changes to diagnostics query logic beyond caching
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID        | Description                                                                           | Research Support                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| FRONT-01  | Diagnostics page caches loaded data; re-fetches only on explicit refresh button press | Backend 30s TTL cache in `EventService`; frontend module-level cache in `useDiagnostics` mirroring `useDashboardStats` pattern            |
| FRONT-02  | Dashboard chart displays token values at all magnitudes                               | `scale="log"` is a first-class `ScaleType` in Recharts 3.8.1 YAxis; `domain={[1,'auto']}` avoids log(0)                                   |
| UX-01     | User can copy session ID from Events page with one click                              | `CopyIconButton` component already exists at `features/events/renderers/CopyIconButton.tsx` — reuse pattern directly                      |
| UX-02     | Session file-change view shows line numbers alongside changed code                    | `ChangeRow` already receives `FileChangeEvent` which carries `new_string?`, `start_line?`; inline expansion with `<pre>` is additive-only |
| TRIAGE-01 | UI bugs fixed during implementation                                                   | Surface during 11-01/11-02 development and testing                                                                                        |

</phase_requirements>

---

## Summary

Phase 11 is a five-requirement polish sprint. All changes are well-contained: two backend (TTL cache struct on `EventService`, handler is already a pass-through), three frontend (YAxis prop addition, copy icon in session header, expandable code in change row). No schema changes, no new API endpoints, no new packages.

The codebase already has canonical patterns for every new requirement. The TTL cache follows standard Go service struct + `sync.RWMutex` idiom. The frontend clipboard copy pattern is already implemented and tested in `CopyIconButton`. The module-level cache for re-mount avoidance is already demonstrated in `useDashboardStats`. The expandable row pattern already exists in `FileRow` within the same `FileChangesDrawer.tsx` file.

**Primary recommendation:** Implement in two plans — Plan 11-01 (backend TTL cache + `useDiagnostics` module cache) and Plan 11-02 (YAxis log scale + copy icon + expandable ChangeRow). Tests must cover the cache invalidation logic in Go and the new interactive behaviors in the frontend.

---

## Architectural Responsibility Map

| Capability                      | Primary Tier                   | Secondary Tier | Rationale                                                                                                    |
| ------------------------------- | ------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------ |
| Diagnostics response caching    | API / Backend (`EventService`) | Frontend hook  | 6m30s TTFB is a backend query problem; cache at source. Frontend cache prevents re-fetch on navigation only. |
| Chart Y-axis scale              | Browser / Client               | —              | Pure rendering prop on `<YAxis>` — no data shape change                                                      |
| Session ID clipboard copy       | Browser / Client               | —              | `navigator.clipboard` API; no server involvement                                                             |
| File-change line number display | Browser / Client               | —              | `start_line` already in `FileChangeEvent` type — display-only                                                |

---

## Standard Stack

### Core (all pre-existing — no new installs)

| Library      | Installed Version               | Purpose                     | Where used                                  |
| ------------ | ------------------------------- | --------------------------- | ------------------------------------------- |
| Recharts     | 3.8.1 [VERIFIED: node_modules]  | Chart rendering             | `TokenUsageChart.tsx`                       |
| lucide-react | 1.14.0 [VERIFIED: node_modules] | Icons                       | `AgentSession.tsx`, `FileChangesDrawer.tsx` |
| Go `sync`    | stdlib                          | `RWMutex` for cache         | `event_service.go`                          |
| Go `time`    | stdlib                          | TTL check with `time.Since` | `event_service.go`                          |

### Verified icon availability in lucide-react 1.14.0

Both `Clipboard` and `Copy` are available [VERIFIED: node_modules/lucide-react]. `Copy` is already used in `CopyIconButton` and `DiagnosticsPage`. Use `Copy` for session ID (matches existing icon vocabulary). `Check` is also available (used in `CopyIconButton` for copied state).

**Installation:** No new packages required.

---

## Architecture Patterns

### System Architecture — Cache Layer

```
GET /api/diagnostics
    → handler.Diagnostics()
        → svc.DiagnosticsWithOptions(opts, ready)
              diagMu.RLock → check cache freshness (time.Since < 30s)
              → HIT: return cached domain.Diagnostics
              → MISS: diagMu.RUnlock → diagMu.Lock
                       → repo.DiagnosticsStorageStats()
                       → repo.DiagnosticsAgentStats()
                       → build domain.Diagnostics
                       → store in diagnosticsCache + cachedAt
                       → diagMu.Unlock → return result
```

### Backend: TTL Cache on EventService (D-01)

**Pattern:** Embed cache struct fields directly on `EventService`. Use `sync.RWMutex` for read-heavy (many HTTP requests), write-rare (cache miss) access. Check `time.Since(s.diagCachedAt) < 30*time.Second` for freshness.

**What the cache wraps:** The full `domain.Diagnostics` result (after all assembly — version, health, storage, agents, privacy, security). Not the raw repo stats. This means the OS file stat (`os.Stat(opts.DBPath)`) is also cached, which is fine for a 30s window.

**Implication for `ready` param:** The handler passes `ready()` (a live function call) at each request. The cache must also store the `ready` state since it's part of `domain.Diagnostics.Health`. Accept this: diagnostics is an admin view; 30s stale health state is fine.

**Implication for `opts` param:** `opts` (DBPath, HookConfig, IgnoreFile, Addr, AllowRemote, CORSOrigins) are static after server startup. The cache struct does not need to key on opts — it is a single-slot cache (one server, one config).

```go
// Source: [VERIFIED: service/event_service.go + domain/diagnostics.go — inferred from types]
type EventService struct {
    repo        repository.EventRepository
    subscribers sync.Map

    diagMu       sync.RWMutex
    diagCache    *domain.Diagnostics
    diagCachedAt time.Time
}

func (s *EventService) DiagnosticsWithOptions(opts DiagnosticsOptions, ready bool) (domain.Diagnostics, error) {
    const ttl = 30 * time.Second

    s.diagMu.RLock()
    if s.diagCache != nil && time.Since(s.diagCachedAt) < ttl {
        result := *s.diagCache
        s.diagMu.RUnlock()
        return result, nil
    }
    s.diagMu.RUnlock()

    // ... run queries, build result ...

    s.diagMu.Lock()
    s.diagCache = &result
    s.diagCachedAt = time.Now()
    s.diagMu.Unlock()
    return result, nil
}
```

**Key detail:** Double-checked locking — after upgrading to write lock, check again whether another goroutine already populated the cache. Omit double-check for simplicity: two concurrent misses both run queries and the last writer wins. For a 30s-TTL admin endpoint, this is acceptable.

### Frontend: Module-Level Cache in useDiagnostics (FRONT-01)

**Pattern:** Module-level variable outside the hook, mirroring the established `useDashboardStats` pattern [VERIFIED: `frontend/src/features/dashboard/hooks/useDashboardStats.ts` line 81].

```typescript
// Source: [VERIFIED: mirroring useDashboardStats.ts:81 pattern]
let diagnosticsCache: Diagnostics | null = null;
let diagnosticsCachedAt: Date | null = null;

export function useDiagnostics() {
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState<Diagnostics | null>(() => diagnosticsCache);
  // ...

  useEffect(() => {
    // Skip fetch if cache is fresh and this is a mount (not explicit reload)
    if (reloadKey === 0 && diagnosticsCache !== null) {
      setData(diagnosticsCache);
      setLastUpdatedAt(diagnosticsCachedAt);
      setLoading(false);
      return;
    }
    // ... fetch, then: diagnosticsCache = json; diagnosticsCachedAt = new Date()
  }, [reloadKey]);
}
```

**Cache lifetime:** Module-level — persists across React navigations within the same browser session (SPA). Cleared on full page reload. No TTL on the frontend side — the backend TTL (30s) governs data freshness; the frontend cache only prevents duplicate fetches on tab navigation.

**`lastUpdatedAt` behavior:** Set from `diagnosticsCachedAt` on cache hit, so the "Updated X ago" display reflects when the data was actually fetched.

### Frontend: Log Scale on TokenUsageChart (D-02)

**`scale="log"` is officially supported in Recharts 3.8.1** [VERIFIED: `YAxis.d.ts` line 63 — `@example <YAxis scale="log" />`]. It is in `ScaleType = 'auto' | RechartsScaleType` [VERIFIED: `util/types.d.ts` line 144].

**Stacked BarChart + log scale known behavior:** Log scale maps a stacked bar to the cumulative value (the bar visually spans from the base to its stacked sum). Each segment renders at its stacked-sum position, not its individual value. This is correct visual behavior — the axis represents total height. The limitation is that models with 0 tokens across all categories produce a zero-height bar; `domain={[1,'auto']}` ensures the axis baseline is 1 rather than log(0)=-Infinity.

**Zero-value segment handling:** Individual `<Bar>` segments with value=0 within a stack render as zero-height slices — not broken. Recharts handles this internally for stacked bars. The `domain` protects the axis calculation; individual zero-height segments are fine.

**Minimal change:**

```tsx
// Source: [VERIFIED: TokenUsageChart.tsx:60 — current YAxis, plus D-02 decision]
<YAxis
  scale="log"
  domain={[1, "auto"]}
  fontSize={10}
  axisLine={false}
  tickLine={false}
  tickFormatter={(value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return value;
  }}
/>
```

### Frontend: Copy Session ID (D-03)

**Established pattern:** `CopyIconButton` at `features/events/renderers/CopyIconButton.tsx` [VERIFIED: source read]. It uses `useState<boolean>(false)` for `copied`, `useEffect` with `window.setTimeout` cleanup, and `navigator.clipboard.writeText`. Timeout is 1200ms in `CopyIconButton`; D-03 specifies 1500ms — inline the pattern rather than reusing the component (different timeout, different positioning context).

**Stop propagation is critical:** The session header is wrapped in `<CollapsibleTrigger asChild>` [VERIFIED: `AgentSession.tsx:77`]. Without `e.stopPropagation()`, clicking the copy icon collapses/expands the session.

**Hover-reveal:** Use Tailwind `group` + `group-hover:opacity-100 opacity-0` on the icon. The hover group should be on the innermost container that contains the session ID text and the copy icon, not the whole header row (which also has drag behavior).

**Icon choice:** Use `Copy` from lucide-react (consistent with existing copy interactions in the codebase) [VERIFIED: `CopyIconButton.tsx:1`]. Switch to `Check` on copied state [VERIFIED: `CopyIconButton.tsx:1`].

```tsx
// Source: [VERIFIED: CopyIconButton.tsx pattern, adapted for inline use]
const [copied, setCopied] = useState(false)

useEffect(() => {
  if (!copied) return
  const id = window.setTimeout(() => setCopied(false), 1500)
  return () => window.clearTimeout(id)
}, [copied])

// In header div — add group class
<div className="group inline-flex min-w-0 items-center gap-2 ...">
  <span>{highlight(sessionId, searchQuery)}</span>
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation()
      navigator.clipboard.writeText(sessionId).then(() => setCopied(true)).catch(() => {})
    }}
    className="opacity-0 group-hover:opacity-100 transition-opacity ..."
    aria-label={copied ? 'Copied' : 'Copy session ID'}
  >
    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
  </button>
</div>
```

### Frontend: Expandable ChangeRow (D-04)

**`ChangeRow` already has the `ev: FileChangeEvent` in scope** [VERIFIED: `FileChangesDrawer.tsx:109`]. `FileChangeEvent` already has `new_string?`, `old_string?`, `start_line?` [VERIFIED: `types/sessions.ts:23-30`].

**Existing expand pattern to mirror:** `FileRow` (same file, lines 71-104) already uses `useState<boolean>(false)` for `open`, toggles on button click, and conditionally renders children. Use the same pattern for `ChangeRow`.

**Pre-existing chevrons:** `ChevronDown` and `ChevronRight` are already imported in the file [VERIFIED: `FileChangesDrawer.tsx:2`].

**200-line truncation:** Check `lines.length > 200` before rendering. Show first 200 lines + a `… {N} more lines` note in dimmed text.

**Line number column alignment:** Use `String(lineNum).padStart(maxLineNumWidth, ' ')` to align numbers. `maxLineNumWidth = String(startLine + lines.length - 1).length`. Render in a `<pre>` with monospace font.

**Expand trigger:** The `ChangeRow` div becomes a `<button>` (or adds `onClick`) only when content exists. If `new_string == null && old_string == null`, the row remains non-interactive (no chevron shown).

```tsx
// Source: [VERIFIED: FileChangesDrawer.tsx ChangeRow:109, FileChangeEvent types:23]
function ChangeRow({ ev, sessionStart }: ChangeRowProps) {
  const content = ev.new_string ?? ev.old_string ?? null;
  const canExpand = content !== null;
  const [expanded, setExpanded] = useState(false);

  const lines = content?.split("\n") ?? [];
  const startLine = ev.start_line ?? 1;
  const truncated = lines.length > 200;
  const displayLines = truncated ? lines.slice(0, 200) : lines;
  const maxWidth = String(startLine + lines.length - 1).length;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-0.5",
          canExpand && "cursor-pointer",
        )}
        onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
        role={canExpand ? "button" : undefined}
      >
        {/* ... existing label, relTime, lineInfo spans ... */}
        {canExpand &&
          (expanded ? (
            <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-white/35" />
          ) : (
            <ChevronRight className="ml-auto h-3 w-3 shrink-0 text-white/35" />
          ))}
        {!canExpand && diffLines !== null && (
          <span className="ml-auto shrink-0 font-mono text-[10px] text-white/35">
            {diffLines} {diffLines === 1 ? "line" : "lines"}
          </span>
        )}
      </div>

      {expanded && canExpand && (
        <pre className="mt-1 overflow-x-auto rounded bg-black/30 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-blue-100/80">
          {displayLines.map(
            (line, i) =>
              `${String(startLine + i).padStart(maxWidth, " ")} │ ${line}\n`,
          )}
          {truncated && (
            <span className="text-white/35">{`… ${lines.length - 200} more lines`}</span>
          )}
        </pre>
      )}
    </div>
  );
}
```

---

## Don't Hand-Roll

| Problem                     | Don't Build                 | Use Instead                                                               | Why                                            |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| Copy-with-feedback icon     | Custom clipboard hook       | Inline the `CopyIconButton` pattern (or use the component)                | Pattern is already tested and in-codebase      |
| Module-level frontend cache | localStorage, React context | Module-level `let` variable (same as `statsCache` in `useDashboardStats`) | SPA scope is sufficient; no persistence needed |
| Log axis scale              | Custom tick calculation     | Recharts `scale="log"`                                                    | d3-scale is already bundled with Recharts      |
| Go TTL cache                | External caching lib        | `sync.RWMutex` + `time.Time` field on struct                              | No dependency needed; stdlib-only              |

---

## Common Pitfalls

### Pitfall 1: `log(0) = -Infinity` breaks Recharts stacked bar

**What goes wrong:** A model entry where all four token categories are 0 causes the stacked bar height to be log(0) = -Infinity, rendering a broken chart.
**Why it happens:** Recharts maps 0 to log(0) before computing bar height.
**How to avoid:** Set `domain={[1, 'auto']}` on `<YAxis>`. This clips the domain minimum at 1, so a zero-value bar renders at the baseline height (1) rather than -Infinity.
**Warning signs:** Chart container renders empty or throws a React error in the Recharts internals when data contains a model with all-zero tokens.

### Pitfall 2: Stop-propagation missed on copy icon click

**What goes wrong:** Clicking the copy icon also toggles the `Collapsible` open/close state because `CollapsibleTrigger` wraps the entire header `div`.
**Why it happens:** The header is a `<CollapsibleTrigger asChild>` wrapper [VERIFIED: `AgentSession.tsx:77`]. All click events bubble up to it.
**How to avoid:** Always call `e.stopPropagation()` on the copy button's `onClick`.
**Warning signs:** Clicking copy icon collapses or expands the session in addition to copying.

### Pitfall 3: `navigator.clipboard` is undefined in test environment

**What goes wrong:** Tests throw `TypeError: Cannot read properties of undefined (reading 'writeText')` because jsdom does not implement `navigator.clipboard`.
**Why it happens:** jsdom does not ship a Clipboard API implementation.
**How to avoid:** Add `Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, writable: true })` in the test's `beforeEach`. Existing tests in `DiagnosticsPage.test.tsx` already do this [VERIFIED: line 88]. Copy this pattern.
**Warning signs:** Test suite error mentioning clipboard is undefined.

### Pitfall 4: Backend cache stores pointer — concurrent mutation

**What goes wrong:** Two concurrent requests read the same `*domain.Diagnostics` pointer and one of them (or a later cache store) mutates fields.
**Why it happens:** Go slices (e.g., `Agents []DiagnosticsAgent`) are reference types; if any code downstream modifies the slice, the cached value is corrupted.
**How to avoid:** Return a copy on cache hit: `result := *s.diagCache` dereferences the struct (shallow copy). The `Agents` slice inside is still shared, but `diagnosticsAgents()` builds a new slice on every call — and on a cache hit we never rebuild — so the hit path is safe. The cached value is never mutated after assignment.
**Warning signs:** Flaky tests where agent count or warnings differ across repeated calls.

### Pitfall 5: Frontend module cache not cleared between Vitest test files

**What goes wrong:** A test that populates `diagnosticsCache` leaves stale data for the next test file because module-level variables persist across test runs in the same Vitest worker.
**Why it happens:** Vitest workers cache modules unless `vi.resetModules()` is called.
**How to avoid:** In tests that exercise `useDiagnostics` with module cache, reset the cache between tests by calling the cache-reset escape hatch (export a `_resetDiagnosticsCache` function for testing, or use `vi.resetModules()`). The `DiagnosticsPage.test.tsx` currently stubs `fetch` — once the cache is added, tests that expect a fresh fetch on mount will fail unless the cache is cleared.
**Warning signs:** Test passes in isolation but fails when run with the full suite.

### Pitfall 6: Recharts stacked bar with log scale renders negative or NaN ticks

**What goes wrong:** The auto-computed tick values include 0 or negative numbers when `domain={[1,'auto']}` is set but data has very small values (e.g., 1).
**Why it happens:** Recharts tick generation with log scale can produce unexpected intermediate values.
**How to avoid:** The existing `tickFormatter` already handles small values gracefully (returns raw number for < 1000). No additional handling needed beyond `domain={[1,'auto']}`.

---

## Runtime State Inventory

Step 2.5 SKIPPED: Phase 11 is not a rename/refactor/migration phase. No stored data, live service config, OS-registered state, secrets, or build artifacts are renamed.

---

## Environment Availability

| Dependency     | Required By   | Available | Version                         | Fallback |
| -------------- | ------------- | --------- | ------------------------------- | -------- |
| Go toolchain   | Backend cache | ✓         | 1.25.0 [VERIFIED: go.mod]       | —        |
| Node.js / pnpm | Frontend      | ✓         | (running tests confirmed)       | —        |
| Recharts       | FRONT-02      | ✓         | 3.8.1 [VERIFIED: node_modules]  | —        |
| lucide-react   | UX-01, UX-02  | ✓         | 1.14.0 [VERIFIED: node_modules] | —        |

No missing dependencies.

---

## Validation Architecture

### Test Framework

| Property            | Value                                                         |
| ------------------- | ------------------------------------------------------------- |
| Backend framework   | Go `testing` package                                          |
| Frontend framework  | Vitest 4.1.5 + Testing Library                                |
| Backend config      | `backend/.golangci.yml`, `go.mod`                             |
| Frontend config     | `frontend/vite.config.ts` (test.environment: jsdom)           |
| Backend quick run   | `cd backend && go test ./internal/service/...`                |
| Backend full suite  | `cd backend && go test ./...` (173 tests, currently passing)  |
| Frontend quick run  | `cd frontend && npx vitest run tests/features/diagnostics/`   |
| Frontend full suite | `cd frontend && npx vitest run` (78 tests, currently passing) |

### Phase Requirements → Test Map

| Req ID              | Behavior                                                          | Test Type     | Automated Command                                                   | File Exists?                              |
| ------------------- | ----------------------------------------------------------------- | ------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| FRONT-01 (backend)  | Cache hit skips repo calls                                        | unit          | `go test ./tests/internal/service/... -run TestDiagnosticsCache`    | ❌ Wave 0                                 |
| FRONT-01 (backend)  | Cache expires after 30s                                           | unit          | `go test ./tests/internal/service/... -run TestDiagnosticsCacheTTL` | ❌ Wave 0                                 |
| FRONT-01 (frontend) | `useDiagnostics` does not re-fetch on re-mount when cache is warm | unit          | `npx vitest run tests/features/diagnostics/`                        | ❌ Wave 0                                 |
| FRONT-02            | YAxis renders with log scale (smoke — no crash)                   | unit (mocked) | `npx vitest run tests/features/dashboard/`                          | ✅ (mocked in token-usage-panel.test.tsx) |
| UX-01               | Copy icon appears; click copies sessionId to clipboard            | unit          | `npx vitest run tests/features/events/`                             | ❌ Wave 0                                 |
| UX-02               | Click ChangeRow expands code with line numbers                    | unit          | `npx vitest run tests/features/sessions/`                           | ❌ Wave 0                                 |

### Sampling Rate

- **Per task commit:** quick run for affected feature only (e.g., `go test ./tests/internal/service/...` or `npx vitest run tests/features/diagnostics/`)
- **Per wave merge:** full suite (`go test ./...` + `npx vitest run`)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

**Backend (add to `tests/internal/service/event_service_test.go`):**

- [ ] `TestDiagnosticsCacheReturnsCachedResult` — second call within TTL does not invoke `diagnosticsCalls` again (already tracked by `mockRepo.diagnosticsCalls` counter)
- [ ] `TestDiagnosticsCacheExpires` — after injecting a past `cachedAt`, next call hits repo again

**Frontend (new test files):**

- [ ] `tests/features/events/__tests__/AgentSession.test.tsx` — covers UX-01 clipboard copy + stop-propagation
- [ ] `tests/features/sessions/FileChangesDrawer.test.tsx` — covers UX-02 ChangeRow expand/collapse + line number rendering
- [ ] Update `tests/features/diagnostics/DiagnosticsPage.test.tsx` — add "no fetch on re-mount" test after module cache is introduced (requires `vi.resetModules()` or exported reset function)

---

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json`, so this section is required.

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                                                                     |
| --------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | no      | —                                                                                                                                                                    |
| V3 Session Management | no      | —                                                                                                                                                                    |
| V4 Access Control     | no      | —                                                                                                                                                                    |
| V5 Input Validation   | no      | No new user input. Session IDs are read from existing domain data. Line content (`new_string`) is rendered verbatim in a `<pre>` — React escapes HTML automatically. |
| V6 Cryptography       | no      | —                                                                                                                                                                    |

### Known Threat Patterns for this phase

| Pattern                      | STRIDE             | Standard Mitigation                                                                   |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------------------- |
| XSS via `new_string` content | Spoofing/Tampering | React `<pre>` renders as text (not `dangerouslySetInnerHTML`) — auto-escaped          |
| Cache poisoning              | Tampering          | Backend cache is server-internal only; no user input affects cached value             |
| Clipboard content leakage    | Info Disclosure    | Session IDs are not sensitive beyond normal operational context; no mitigation needed |

**Privacy note (from CLAUDE.md):** `new_string` in file changes may contain prompts, diffs, and file paths. These are already stored in SQLite and displayed in the sessions view — Phase 11 only adds a display toggle, not new data access.

---

## Assumptions Log

| #   | Claim                                                                                                                                  | Section                          | Risk if Wrong                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Stacked BarChart + `scale="log"` + `domain={[1,'auto']}` renders correctly with the actual chart data shape (stacked by `stackId="a"`) | Standard Stack / Common Pitfalls | Low — documented in Recharts YAxis.d.ts and working for non-zero data; edge case only when all 4 token categories are 0                                     |
| A2  | The `diagnosticsCache` single-slot design is safe because `opts` (server config) is static after startup                               | Architecture Patterns — Backend  | Low — if opts changed dynamically, cached result would be stale; by inspection of `handler/diagnostics.go` opts is constructed at handler registration time |

---

## Open Questions

1. **TokenUsageChart: what if all models have 0 tokens in one category?**
   - What we know: `domain={[1,'auto']}` prevents log(0); bars with 0-value segments render as zero-height slices in Recharts stacked mode.
   - What's unclear: Whether Recharts 3.8.1 emits a console warning for stacked log scale with zero-value segments.
   - Recommendation: Accept the behavior; the `tickFormatter` already skips values < 1000. Verify visually after implementation.

2. **ChangeRow: should the "N lines" count be hidden when expanded?**
   - What we know: D-04 says "toggle chevron replaces the static 'N lines' count display (or shows alongside)".
   - What's unclear: Whether to keep the lines count alongside the chevron or remove it.
   - Recommendation: Hide the lines count when content is available (chevron provides expand affordance); keep it only when `canExpand = false`.

---

## Sources

### Primary (HIGH confidence)

- `[VERIFIED: node_modules/recharts/types/cartesian/YAxis.d.ts]` — `scale="log"` officially documented with `@example`, `ScaleType` union includes `'log'`
- `[VERIFIED: node_modules/recharts/types/util/types.d.ts]` — `ScaleType = 'auto' | RechartsScaleType`, `RechartsScaleType` includes `'log'`
- `[VERIFIED: frontend/src/features/events/renderers/CopyIconButton.tsx]` — established clipboard copy pattern with `useEffect` cleanup
- `[VERIFIED: frontend/src/features/dashboard/hooks/useDashboardStats.ts:81]` — module-level `const statsCache = new Map()` pattern for cross-navigation cache
- `[VERIFIED: frontend/src/features/sessions/FileChangesDrawer.tsx]` — `ChangeRow` at line 109, `FileRow` expand pattern at lines 71-104, lucide imports
- `[VERIFIED: frontend/src/types/sessions.ts:23-30]` — `FileChangeEvent` fields `new_string?`, `old_string?`, `start_line?`
- `[VERIFIED: frontend/src/features/events/AgentSession.tsx:77]` — `CollapsibleTrigger asChild` wrapping header
- `[VERIFIED: backend/internal/service/event_service.go]` — `EventService` struct, `DiagnosticsWithOptions` method signature
- `[VERIFIED: backend/internal/domain/diagnostics.go]` — `domain.Diagnostics` type (full struct)
- `[VERIFIED: backend/tests/internal/service/event_service_test.go:34]` — `mockRepo.diagnosticsCalls` counter already exists for testing cache hits
- `[VERIFIED: node_modules/lucide-react/dist/cjs/lucide-react.js]` — `Clipboard`, `Copy`, `Check` all available in v1.14.0

### Secondary (MEDIUM confidence)

- `[VERIFIED: frontend/src/test/setup.ts]` — jsdom does not include clipboard; tests must mock it via `Object.defineProperty`

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries verified from installed node_modules and Go source
- Architecture patterns: HIGH — derived from reading actual source files; patterns are direct extensions of existing code
- Pitfalls: HIGH (pitfalls 1-4), MEDIUM (pitfalls 5-6) — pitfalls 1-4 derived from source reading; pitfalls 5-6 from knowledge of Vitest module isolation

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (stable stack — Recharts, lucide-react, Go stdlib — unlikely to change)
