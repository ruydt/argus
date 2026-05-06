# shadcn/ui Frontend Refactor Design

**Date:** 2026-05-06  
**Status:** Approved  
**Scope:** Frontend only (`/frontend/src/`)

## Goal

Refactor existing raw-HTML + custom-CSS frontend into shadcn/ui components with Tailwind CSS. Keep design identical (same colors, layout, spacing, visual hierarchy). Keep all features. Produce clean, composable codebase for future development.

## Approach: Hybrid Tailwind + Custom CSS

- Tailwind CSS v3 for layout/spacing/utilities
- shadcn/ui components for interactive elements and data display
- Custom CSS retained only for UI patterns with no shadcn equivalent (diff viewer, hook event badges)
- Existing CSS design tokens mapped into `tailwind.config.js` as custom colors

## Styling Architecture

### Token Mapping (`tailwind.config.js`)

```js
colors: {
  bg: '#0c0c0c',
  header: '#1e1e1e',
  text: '#cccccc',
  dim: '#666',
  accent: '#47ff9c',
  border: '#333',
  delete: '#ff5f56',
  create: '#47ff9c',
  edit: '#3fa5ff',
  bash: '#f5a623',
  'agent-codex': '#5cceff',
  'agent-claude': '#e8845c',
}
```

shadcn dark theme base. All component semantic colors (`bg-background`, `text-muted-foreground`) mapped to existing hex tokens.

### `index.css` — Retained Custom CSS Only

- JetBrains Mono font import
- Diff viewer styles (`.diff-line`, `.diff-added`, `.diff-removed`, `.diff-ctx`, `.diff-marker`)
- Hook event badge colors (`.hook-SessionStart`, `.hook-PreToolUse`, etc.)
- Agent-specific badge colors (`.agent-codex`, `.agent-claude`)

Everything else migrates to Tailwind utilities.

## Component Mapping

| Current | shadcn Replacement | Notes |
|---|---|---|
| `<button>` sidebar toggle | `Button variant="ghost"` | |
| `<NavLink>` sidebar nav | `Button variant="ghost"` + NavLink `asChild` | active state via `cn()` |
| `<select>` filters | `Select` + `SelectItem` inside `SelectGroup` | |
| `<input>` search | `Input` | |
| `<input type="password">` | `Input type="password"` | |
| Badge spans (hook, model, agent, usage) | `Badge` | custom color variants |
| Stat cards (Usage page) | `Card` + `CardHeader` + `CardContent` | |
| Session cards | `Collapsible` + `Card` | replaces manual collapsed class toggling |
| Recharts wrappers | `Chart` (shadcn wraps Recharts) | Recharts stays |
| Divider elements | `Separator` | |
| Loading states | `Skeleton` | |

## Component Architecture

### Merged: `AgentSession.tsx`

CodexSession and ClaudeSession are ~90% identical. Merge into single `AgentSession` component:

```tsx
interface AgentSessionProps {
  agent: AgentConfig   // contains logo component + badge class
  session: SessionGroup
  // ...rendering props
}
```

Eliminates duplicate file. Agent-specific rendering handled by AgentConfig (already exists in `agents/` registry).

### Extracted: `Sidebar.tsx`

Sidebar logic extracted from Layout.tsx into its own component. Layout becomes a thin wrapper with grid structure and `<Outlet>`.

### Extracted: `useEvents.ts`

1s polling + session-usage lazy fetching extracted from Events.tsx into custom hook. Events.tsx becomes pure UI component.

## File Structure

```
frontend/
├── src/
│   ├── agents/              # unchanged
│   ├── components/
│   │   ├── ui/              # shadcn auto-generated (untouched)
│   │   ├── events/
│   │   │   └── AgentSession.tsx
│   │   ├── Layout.tsx       # thin grid wrapper + Outlet
│   │   └── Sidebar.tsx      # extracted from Layout
│   ├── pages/
│   │   ├── Events.tsx       # pure UI, uses useEvents hook
│   │   └── Usage.tsx
│   ├── lib/
│   │   └── utils.ts         # shadcn cn() + shared helpers
│   ├── hooks/
│   │   └── useEvents.ts     # polling + session-usage fetch
│   ├── index.css            # minimal: font + diff + badge colors
│   ├── App.tsx
│   └── main.tsx
├── tailwind.config.js
├── components.json          # shadcn config
└── ...
```

## shadcn Components to Install

- `button`
- `input`
- `select`
- `badge`
- `card`
- `collapsible`
- `separator`
- `skeleton`
- `chart` (wraps Recharts)
- `tooltip`
- `scroll-area`

## React Best Practices Applied

- **`rerender-no-inline-components`** — no component definitions inside render
- **`rerender-derived-state-no-effect`** — filter/sort state derived during render, not in effects
- **`js-index-maps`** — event grouping by session uses `Map` (O(1) lookups vs repeated `filter()`)
- **`rendering-hoist-jsx`** — static JSX (logos, static badge content) hoisted outside components
- **`bundle-barrel-imports`** — import shadcn components directly from `@/components/ui/button`, not barrel `@/components/ui`
- **`rerender-functional-setstate`** — use functional setState for collapsed session Set updates

## What Does NOT Change

- All features (filtering, search, sorting, time ranges, diff viewer, session collapsing, usage charts)
- All visual design (colors, typography, spacing proportions, dark theme)
- API integration (`/api/events`, `/api/session-usage`, `/api/openai/usage/completions`)
- Routing structure (React Router v7, Layout + Outlet)
- Agent registry system (`agents/` directory)
- Recharts (kept, wrapped in shadcn Chart)
- localStorage persistence patterns

## Success Criteria

1. Visual output identical to current design (pixel-level comparison for colors/layout)
2. All filtering, sorting, time range, search features work
3. Session collapsing works
4. Diff viewer renders correctly
5. Usage page charts render with correct data
6. No raw `<input>`, `<select>`, `<button>` outside `components/ui/` (all via shadcn)
7. No duplicate component logic (AgentSession merged)
8. `index.css` < 100 lines
