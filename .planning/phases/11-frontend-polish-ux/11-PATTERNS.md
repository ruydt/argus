# Phase 11: Frontend Polish & UX — Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 5
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/internal/service/event_service.go` | service | request-response | `backend/internal/service/event_service.go` (self — add fields) | self-extend |
| `frontend/src/features/diagnostics/hooks/useDiagnostics.ts` | hook | request-response | `frontend/src/features/dashboard/hooks/useDashboardStats.ts` | exact |
| `frontend/src/features/dashboard/TokenUsageChart.tsx` | component | transform | `frontend/src/features/dashboard/TokenUsageChart.tsx` (self — prop addition) | self-extend |
| `frontend/src/features/events/AgentSession.tsx` | component | event-driven | `frontend/src/features/events/renderers/CopyIconButton.tsx` | role-match |
| `frontend/src/features/sessions/FileChangesDrawer.tsx` | component | event-driven | `frontend/src/features/sessions/FileChangesDrawer.tsx` (self — `FileRow` pattern) | self-extend (exact sub-pattern) |

---

## Pattern Assignments

### `backend/internal/service/event_service.go` (service, TTL cache addition)

**Analog:** Self (add fields to existing `EventService` struct; no external analog needed — pattern is stdlib Go)

**Current struct** (lines 18-21):
```go
type EventService struct {
	repo        repository.EventRepository
	subscribers sync.Map
}
```

**Target struct after D-01 — add three fields after `subscribers`:**
```go
type EventService struct {
	repo        repository.EventRepository
	subscribers sync.Map

	diagMu       sync.RWMutex
	diagCache    *domain.Diagnostics
	diagCachedAt time.Time
}
```

**`sync` and `time` are already imported** (lines 8-9 of the current file). No new imports needed.

**Current `DiagnosticsWithOptions` core pattern** (lines 90-141) — replace the body with cache-aware version:
```go
func (s *EventService) DiagnosticsWithOptions(opts DiagnosticsOptions, ready bool) (domain.Diagnostics, error) {
	const ttl = 30 * time.Second

	s.diagMu.RLock()
	if s.diagCache != nil && time.Since(s.diagCachedAt) < ttl {
		result := *s.diagCache   // shallow copy — safe; cached value is never mutated after store
		s.diagMu.RUnlock()
		return result, nil
	}
	s.diagMu.RUnlock()

	// ... existing query and assembly logic unchanged ...

	s.diagMu.Lock()
	s.diagCache = &result
	s.diagCachedAt = time.Now()
	s.diagMu.Unlock()
	return result, nil
}
```

**Key safety note:** Return `result := *s.diagCache` (dereference) not the pointer, so callers cannot mutate the cached value. The `Agents []DiagnosticsAgent` slice inside is not mutated in the call path — safe for the 30s window.

**Error handling pattern** (lines 91-98, preserved): `return domain.Diagnostics{}, err` on any repo error. Cache is only populated on successful assembly — error paths must not store to `diagCache`.

---

### `frontend/src/features/diagnostics/hooks/useDiagnostics.ts` (hook, module-level cache)

**Analog:** `frontend/src/features/dashboard/hooks/useDashboardStats.ts`

**Module-level cache pattern from analog** (line 81):
```typescript
const statsCache = new Map<string, DashboardStats>()
```

**For `useDiagnostics`, cache is a single slot (no key needed):**
```typescript
let diagnosticsCache: Diagnostics | null = null
let diagnosticsCachedAt: Date | null = null
```
Declare these at module scope (above the function), not inside it.

**Cache-aware `useEffect` pattern from analog** (lines 179-214) — adapted for `useDiagnostics`:
```typescript
// useDashboardStats checks cache on each effect run:
const cached = statsCache.get(cacheKey) ?? null
// ...calls fetch unconditionally (always re-fetches)

// useDiagnostics should SHORT-CIRCUIT on re-mount when cache is warm:
// (reloadKey === 0 means this is a navigation mount, not an explicit reload)
useEffect(() => {
  let mounted = true
  if (reloadKey === 0 && diagnosticsCache !== null) {
    // Cache hit: hydrate state from module cache, skip fetch
    setData(diagnosticsCache)
    setLastUpdatedAt(diagnosticsCachedAt)
    setLoading(false)
    setRefreshing(false)
    return
  }
  // Cache miss or explicit reload: run fetch, then store result
  // ... existing fetch logic ...
  .then((json: Diagnostics) => {
    if (!mounted) return
    diagnosticsCache = json
    diagnosticsCachedAt = new Date()
    setData(json)
    setLastUpdatedAt(diagnosticsCachedAt)
    hasDataRef.current = true
  })
  // ...
}, [reloadKey])
```

**`reload` callback** (existing, unchanged — lines 20 of current file):
```typescript
const reload = useCallback(() => setReloadKey((k) => k + 1), [])
```
When `reloadKey > 0`, the effect skips the cache short-circuit and always fetches.

**Test escape hatch** — export a reset function at module scope for Vitest isolation:
```typescript
export function _resetDiagnosticsCache() {
  diagnosticsCache = null
  diagnosticsCachedAt = null
}
```

---

### `frontend/src/features/dashboard/TokenUsageChart.tsx` (component, log scale prop addition)

**Analog:** Self — single-line change on the existing `<YAxis>` (lines 60-68).

**Current `<YAxis>` block** (lines 60-68):
```tsx
<YAxis
  fontSize={10}
  axisLine={false}
  tickLine={false}
  tickFormatter={(value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
    return value
  }}
/>
```

**Target `<YAxis>` after D-02 — add two props before `fontSize`:**
```tsx
<YAxis
  scale="log"
  domain={[1, 'auto']}
  fontSize={10}
  axisLine={false}
  tickLine={false}
  tickFormatter={(value) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
    return value
  }}
/>
```

No import changes. No other lines touched. `tickFormatter` and `TooltipContent` are unchanged.

---

### `frontend/src/features/events/AgentSession.tsx` (component, hover-reveal copy icon)

**Analog:** `frontend/src/features/events/renderers/CopyIconButton.tsx`

**Imports pattern from analog** (lines 1-3 of CopyIconButton):
```typescript
import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
```
Add `Check, Copy` to the existing `lucide-react` import line in `AgentSession.tsx`. Add `useEffect` to the existing `react` import (it is already imported — `useState` is already there on line 1; `useEffect` is also already imported on line 1).

**Core copy state pattern from analog** (lines 12-28 of CopyIconButton):
```typescript
const [copied, setCopied] = useState(false)

useEffect(() => {
  if (!copied) return
  const id = window.setTimeout(() => setCopied(false), 1500)  // 1500ms per D-03 (CopyIconButton uses 1200ms)
  return () => window.clearTimeout(id)
}, [copied])
```
Inline this pattern directly in `AgentSession` body (do not import `CopyIconButton` — the timeout differs and positioning is context-specific).

**Copy handler with stop-propagation** — critical because the header div is inside `<CollapsibleTrigger asChild>` (line 77):
```typescript
const onCopySessionId = (e: React.MouseEvent) => {
  e.stopPropagation()
  navigator.clipboard.writeText(sessionId).then(() => setCopied(true)).catch(() => {})
}
```

**Hover-reveal button placement** — inside the session ID `<div>` at line 90, using Tailwind `group` + `group-hover:opacity-100`:

Current session ID div (lines 90-99):
```tsx
<div className="inline-flex min-w-0 items-center gap-2 text-[0.8rem] font-bold text-[#47ff9c]">
  <span className={cn('agent-badge', `agent-${agent.badgeClass}`)}>
    <Logo size={12} />
  </span>
  <span className="min-w-0 break-words sm:break-all">
    {highlight(firstEvent.session || shortId(transcriptPath), searchQuery)}
  </span>
  <span className="ml-[10px] shrink-0 text-[0.7rem] text-[#666]">
    {isCollapsed ? '▼' : '▲'}
  </span>
</div>
```

Target — add `group` to outer div, insert copy button after session ID span:
```tsx
<div className="group inline-flex min-w-0 items-center gap-2 text-[0.8rem] font-bold text-[#47ff9c]">
  <span className={cn('agent-badge', `agent-${agent.badgeClass}`)}>
    <Logo size={12} />
  </span>
  <span className="min-w-0 break-words sm:break-all">
    {highlight(firstEvent.session || shortId(transcriptPath), searchQuery)}
  </span>
  <button
    type="button"
    onClick={onCopySessionId}
    className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex h-4 w-4 items-center justify-center rounded text-[#666] hover:text-[#47ff9c]"
    aria-label={copied ? 'Copied session ID' : 'Copy session ID'}
  >
    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
  </button>
  <span className="ml-[10px] shrink-0 text-[0.7rem] text-[#666]">
    {isCollapsed ? '▼' : '▲'}
  </span>
</div>
```

The `sessionId` value is already in scope via destructuring on line 43: `const { sessionId, transcriptPath, events } = session`.

---

### `frontend/src/features/sessions/FileChangesDrawer.tsx` (component, expandable ChangeRow)

**Analog:** `FileRow` in the same file (lines 71-104) — the expand/collapse pattern to copy.

**`FileRow` expand pattern** (lines 71-104):
```tsx
function FileRow({ group, sessionStart }: FileRowProps) {
  const [open, setOpen] = useState(false)
  // ...
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {/* ...content... */}
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-white/35" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-white/35" />
        )}
      </button>
      {open && (
        <div className="border-t border-white/10 px-3 py-2 space-y-1.5">
          {/* expanded content */}
        </div>
      )}
    </div>
  )
}
```

**`ChevronDown` and `ChevronRight` are already imported** on line 2 — no import changes needed.

**`ChangeRow` current structure** (lines 107-138) to extend:
```typescript
type ChangeRowProps = { ev: FileChangeEvent; sessionStart: string }

function ChangeRow({ ev, sessionStart }: ChangeRowProps) {
  const label = toolLabel(ev.tool)
  const color = toolColor(ev.tool)
  const relTime = formatRelativeTime(ev.time, sessionStart)
  const lineInfo = ev.start_line ? `L${ev.start_line}` : null
  const diffLines = ev.new_string
    ? ev.new_string.split('\n').length
    : ev.old_string
      ? ev.old_string.split('\n').length
      : null

  return (
    <div className="flex items-center gap-2 py-0.5">
      {/* label, relTime, lineInfo, diffLines spans */}
    </div>
  )
}
```

**Target `ChangeRow` after D-04** — add `useState`, content derivation, and conditional expand:
```tsx
function ChangeRow({ ev, sessionStart }: ChangeRowProps) {
  const label = toolLabel(ev.tool)
  const color = toolColor(ev.tool)
  const relTime = formatRelativeTime(ev.time, sessionStart)
  const lineInfo = ev.start_line ? `L${ev.start_line}` : null

  // D-04: expandable code block
  const content = ev.new_string ?? ev.old_string ?? null
  const canExpand = content !== null
  const [expanded, setExpanded] = useState(false)

  const lines = content?.split('\n') ?? []
  const startLine = ev.start_line ?? 1
  const truncated = lines.length > 200
  const displayLines = truncated ? lines.slice(0, 200) : lines
  const maxWidth = String(startLine + lines.length - 1).length

  // Only show diffLines count when canExpand is false (chevron replaces count when expandable)
  const diffLines =
    !canExpand && (ev.new_string
      ? ev.new_string.split('\n').length
      : ev.old_string
        ? ev.old_string.split('\n').length
        : null)

  return (
    <div>
      <div
        className={cn('flex items-center gap-2 py-0.5', canExpand && 'cursor-pointer hover:bg-white/[0.03] rounded')}
        onClick={canExpand ? () => setExpanded((v) => !v) : undefined}
        role={canExpand ? 'button' : undefined}
      >
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ background: color }}
        >
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-white/45">{relTime}</span>
        {lineInfo && (
          <span className="shrink-0 font-mono text-[10px] text-white/35">{lineInfo}</span>
        )}
        {canExpand && (
          <span className="ml-auto">
            {expanded
              ? <ChevronDown className="h-3 w-3 shrink-0 text-white/35" />
              : <ChevronRight className="h-3 w-3 shrink-0 text-white/35" />
            }
          </span>
        )}
        {!canExpand && diffLines !== null && (
          <span className="ml-auto shrink-0 font-mono text-[10px] text-white/35">
            {diffLines} {diffLines === 1 ? 'line' : 'lines'}
          </span>
        )}
      </div>

      {expanded && canExpand && (
        <pre className="mt-1 overflow-x-auto rounded bg-black/30 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-blue-100/80">
          {displayLines.map((line, i) =>
            `${String(startLine + i).padStart(maxWidth, ' ')} │ ${line}\n`
          )}
          {truncated && (
            <span className="text-white/35">{`… ${lines.length - 200} more lines`}</span>
          )}
        </pre>
      )}
    </div>
  )
}
```

The `cn` utility is not currently imported in `FileChangesDrawer.tsx` — add `import { cn } from '@/lib/utils'` if using `cn()`, or use a ternary string concatenation instead.

---

## Shared Patterns

### useState + useEffect timer for copy feedback
**Source:** `frontend/src/features/events/renderers/CopyIconButton.tsx` (lines 12-18)
**Apply to:** `AgentSession.tsx` (UX-01 copy icon)
```typescript
const [copied, setCopied] = useState(false)

useEffect(() => {
  if (!copied) return
  const id = window.setTimeout(() => setCopied(false), 1500)
  return () => window.clearTimeout(id)
}, [copied])
```
Note: `CopyIconButton` uses 1200ms; D-03 specifies 1500ms — use 1500ms in `AgentSession`.

### Expand/collapse with ChevronDown/ChevronRight
**Source:** `frontend/src/features/sessions/FileChangesDrawer.tsx` `FileRow` (lines 72, 88-93)
**Apply to:** `ChangeRow` in the same file (UX-02)
```typescript
const [open, setOpen] = useState(false)
// toggle: onClick={() => setOpen((v) => !v)}
// render: {open ? <ChevronDown .../> : <ChevronRight .../>}
```

### Module-level cache with single-slot variable
**Source:** `frontend/src/features/dashboard/hooks/useDashboardStats.ts` (line 81 — `const statsCache = new Map<string, DashboardStats>()`)
**Apply to:** `useDiagnostics.ts` (FRONT-01 navigation cache)
```typescript
// Single-slot variant (no key needed for diagnostics):
let diagnosticsCache: Diagnostics | null = null
let diagnosticsCachedAt: Date | null = null
```

### sync.RWMutex + time.Time TTL cache on service struct
**Source:** Go stdlib pattern — `event_service.go` already uses `sync.Map` (line 20); extend with `sync.RWMutex` for the new cache fields
**Apply to:** `EventService` struct and `DiagnosticsWithOptions` (D-01)
```go
// RLock to check freshness; RUnlock before write-lock upgrade
s.diagMu.RLock()
if s.diagCache != nil && time.Since(s.diagCachedAt) < ttl {
    result := *s.diagCache
    s.diagMu.RUnlock()
    return result, nil
}
s.diagMu.RUnlock()
// ... run queries ...
s.diagMu.Lock()
s.diagCache = &result
s.diagCachedAt = time.Now()
s.diagMu.Unlock()
```

---

## No Analog Found

None. All five files have direct analogs or self-extend from within the same file.

---

## Metadata

**Analog search scope:** `backend/internal/service/`, `frontend/src/features/dashboard/hooks/`, `frontend/src/features/events/renderers/`, `frontend/src/features/sessions/`, `frontend/src/features/events/`
**Files read:** 7 source files
**Pattern extraction date:** 2026-06-01
