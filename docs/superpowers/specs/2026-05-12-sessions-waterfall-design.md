# Sessions Waterfall — Design Spec

**Date:** 2026-05-12  
**Status:** Approved

## Overview

Add a `/sessions` page that visualizes parent/child session trees in real time using a LangSmith-style split-pane trace waterfall. Each row in the left tree panel corresponds to a synchronized horizontal duration bar in the right Gantt panel. Clicking a row opens a bottom detail panel with metadata and a "view events →" link to the Events page filtered by that session.

Claude Code emits `SubagentStart` / `SubagentStop` hook events that carry `agent_id` (child) and `session_id` (parent), enabling parent→child linkage. Codex has no equivalent hooks; Codex sessions appear as leaf nodes with no children.

---

## Layout

Three-panel layout inside the existing `Layout` shell:

```
┌──────────────────────────────────────────────────┐
│ Top bar: session dropdown | live dot | time range │
├───────────────────┬──────────────────────────────┤
│  Left tree (260px)│  Right Gantt (flex-1)         │
│                   │  time axis + grid lines        │
│  root session     │  ████████████████████ 8m 22s  │
│  ↳ Explore        │    ████ 1m 45s                │
│  ↳ gsd-planner    │        ████████ 2m 48s        │
│  ↳ gsd-executor ● │                  ██████● run  │
├───────────────────┴──────────────────────────────┤
│  Bottom detail panel (~100px)                     │
│  Selected node: name · status · agent_id · events │
│                                    [view events →] │
└──────────────────────────────────────────────────┘
```

Design tokens: `--bg: #111111`, `--brand: #a78bfa`, `--app-border: #222`, JetBrains Mono font. Match existing page styling exactly.

---

## Backend

### 1. New domain type

Add to `backend/internal/domain/event.go`:

```go
type SessionTreeNode struct {
    Session  Session           `json:"session"`
    AgentID  string            `json:"agent_id,omitempty"`
    Children []SessionTreeNode `json:"children"`
}
```

### 2. Repository method

Add `GetSessionTree(since string) ([]SessionTreeNode, error)` to the `EventRepository` interface and implement in `sqlite.go`:

**Algorithm:**
1. Query sessions with `started_at >= since`
2. Query events with `hook_event_name = 'SubagentStart'` → collect `(session_id=parent, subagent_id=agent_id)` pairs
3. Query distinct `(session, subagent_id)` from all events where `subagent_id != ''` → maps `agent_id → child_session_id`
4. Build map: `parentSessionID → []childSessionID`
5. Recursively construct tree; root nodes are sessions not appearing as any child
6. Sessions referenced as children but missing from the sessions table (e.g. not yet recorded) still appear as `SessionTreeNode` with zero-value `Session` and `AgentID` set

### 3. Service method

Add `GetSessionTree(since string) ([]SessionTreeNode, error)` to `EventService` — delegates to repo.

### 4. Handler

New file `backend/internal/handler/sessions_tree.go`:

```go
GET /api/sessions/tree?since=<RFC3339>
→ 200 {"sessions": [SessionTreeNode, ...]}
```

- `since` defaults to `time.Now().AddDate(0, 0, -7)` if omitted or unparseable
- Returns 500 on service error

### 5. Router

Add to `backend/internal/server/router.go`:
```go
mux.Handle("GET /api/sessions/tree", handler.SessionsTree(svc))
```

---

## Frontend

### New files

```
frontend/src/
  features/sessions/
    SessionsPage.tsx          ← page component
    SessionTree.tsx            ← left panel tree rows
    SessionGantt.tsx           ← right panel time bars
    SessionDetail.tsx          ← bottom detail panel
    hooks/
      useSessionTree.ts        ← data fetching + SSE refetch
  types/
    sessions.ts                ← SessionTreeNode type
```

### Types (`types/sessions.ts`)

```typescript
export interface SessionTreeNode {
  session: Session           // existing Session domain type
  agent_id?: string
  children: SessionTreeNode[]
}
```

Export from `types/index.ts`.

### Hook (`useSessionTree.ts`)

- Accepts `timeRange: string` (ISO date string for `since`)
- Fetches `GET /api/sessions/tree?since=<timeRange>` on mount and when `timeRange` changes
- Subscribes to existing SSE stream at `/api/events/stream`
- On incoming SSE event with `hook_event_name === 'SubagentStart'` or `hook_event_name === 'SessionStart'` → re-fetch tree
- Returns `{ nodes: SessionTreeNode[], loading: boolean, error: string | null }`

### SessionsPage

State: `selectedRoot: SessionTreeNode | null`, `selectedNode: SessionTreeNode | null`, `timeRange: string` (default: 7 days ago ISO string), `expandedSessions: Set<string>`.

The page displays ONE root session at a time. `selectedRoot` is set from the session dropdown and defaults to the most recent root session. `SessionTree` and `SessionGantt` receive the flattened subtree of `selectedRoot` only.

Top bar:
- Session dropdown — lists all root nodes from `useSessionTree` by `session_id` (truncated) + agent + relative time; selecting an entry sets `selectedRoot`
- Live dot (green, pulsing) when SSE connected
- Time range `<select>`: Last 24h / Last 7 days / Last 30 days / All time → updates `timeRange`

Split pane: `SessionTree` (left, 260px, `border-right: 1px solid var(--app-border)`) + `SessionGantt` (right, flex-1). Both panels are wrapped in a shared scroll container so vertical scroll is naturally synchronized.

Bottom panel: renders `SessionDetail` when `selectedNode` is non-null; hidden otherwise.

### SessionTree

Props: `nodes`, `selectedNode`, `onSelect`, `expandedSessions`, `onToggleExpand`.

Renders flat list of rows in tree order (depth-first). Each row:
- Indented by `depth * 16px`
- Vertical + horizontal connector lines for depth > 0 (positioned absolutely, `background: #2a2a2a`)
- Expand/collapse icon (`▶` / `▼`) — shown only when `children.length > 0`; `—` for leaf nodes
- Type icon `◈` colored by agent type: `claudecode` → `var(--brand)`, `codex` → `var(--dim)`, others → `var(--agent)`
- Session ID (truncated to 12 chars), agent badge, duration
- Selected row: `background: #1a1428`, `border-left: 2px solid var(--brand)`
- Running indicator: green dot if `session.last_seen_at` is within last 10s

### SessionGantt

Props: `nodes` (same flattened list as tree), `selectedNode`, `totalDurationMs` (computed from root session span).

Time axis: renders 5 evenly spaced labels (0:00 → total). Grid: 4 vertical lines at 25% intervals (`background: #1a1a1a`).

Each bar row (height synced with tree row):
- `started_at` offset relative to root session `started_at`
- Width = `duration / totalDuration * 100%`
- Running bars: right edge = `(now - started_at) / totalDuration * 100%`, updated every second via `setInterval` in a `useEffect`; `totalDurationMs` for a still-running root session also updates each second (axis re-renders accordingly)
- Colors: parent root → `#7c3aed` (violet), `Explore` / general tools → `#1d4ed8` (blue), custom agents → `var(--brand)`, running → `#16a34a` (green)
- Label inside bar: duration string; omit if bar too narrow (< 60px)

### SessionDetail

Props: `node: SessionTreeNode | null`.

Shows: agent type, status badge, duration, parent session ID, CWD, `agent_id`.

"view events →" button: `navigate('/?session=<session_id>')` (Events page is the index route `/`).

### Routing (`App.tsx`)

```tsx
const Sessions = lazy(() =>
  import('./features/sessions/SessionsPage').then((m) => ({ default: m.SessionsPage }))
)
// Inside <Route path="/" element={<Layout />}>:
<Route path="sessions" element={<Suspense fallback={null}><Sessions /></Suspense>} />
```

### Sidebar (`Sidebar.tsx`)

Add to `NAV_ITEMS` after Events:
```typescript
{ to: '/sessions', label: 'Sessions', ariaLabel: 'Sessions Waterfall', icon: GitFork, end: false }
```

Use `GitFork` from `lucide-react`.

### Events page integration (`useEventFilters.ts`)

- On mount, read `new URLSearchParams(window.location.search).get('session')` 
- Add `sessionFilter: string` state (initial value from URL param or `''`)
- Add to `filteredEvents` memo: when `sessionFilter` non-empty, filter `e.session === sessionFilter`
- Add `sessionFilter` and its setter to returned values (consumed by `EventsPage` if a UI control is desired later)

---

## Testing

### Backend

File: `backend/internal/repository/sqlite/sqlite_test.go` (extend existing) and new `backend/internal/handler/sessions_tree_test.go`.

Cases:
- Session with no subagents → root node, `children: []`
- Session with 2 subagents → root node, 2 children with correct `agent_id`
- Nested subagent (subagent spawns subagent) → 3-level tree
- `since` param excludes sessions older than cutoff
- Agent_id with no matching child session → child node with zero-value `Session`, `AgentID` set
- `GET /api/sessions/tree` → 200 + correct `{"sessions": [...]}` shape
- `GET /api/sessions/tree` with no `since` → defaults to 7 days range
- Service error → 500

### Frontend

File: `frontend/src/features/sessions/__tests__/` (new directory).

Cases:
- `useSessionTree`: fetches correct URL with `since` param; refetches on `SubagentStart` SSE event; exposes loading/error states
- `SessionTree`: renders root + children with correct indentation; click calls `onSelect`; expand/collapse toggles
- `SessionGantt`: bar widths proportional to total duration; running bar has no fixed right edge
- `SessionDetail`: "view events →" navigates to `/events?session=<id>`
- `useEventFilters`: `?session=xxx` URL param filters events to that session only

---

## Codex limitation

Codex emits no `SubagentStart` events. Codex sessions appear as root nodes with `children: []`. No changes required to handle this — the tree assembly simply finds no children.

---

## Out of scope

- Nested subagents beyond 2 levels in the UI (rendered but no special treatment)
- Pagination of sessions beyond the `since` time window
- Manual refresh button (SSE-triggered refetch covers live use)
