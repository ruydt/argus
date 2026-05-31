---
phase: 08
slug: frontend-component-quality
status: approved
shadcn_initialized: true
preset: radix-nova b2fA
created: 2026-05-31
---

# Phase 08 - UI Design Contract

> Visual and interaction contract for Phase 8: Frontend Component Quality.

This phase is cleanup only. The UI must keep the existing dense, dark, operator-focused Sessions trace experience while replacing ad-hoc controls and static inline styling with maintainable component primitives.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui |
| Preset | radix-nova, neutral, Geist, radius default |
| Component library | radix |
| Icon library | lucide |
| Font | Geist for shadcn surfaces, JetBrains Mono for existing app body and code/path data |

Use existing local primitives from `frontend/src/components/ui/`. Do not add registry blocks for this phase. New behavior should compose `Button`, `Badge`, `Separator`, and the existing resizable panel primitives already present in the sessions feature.

---

## Scope Contract

### In Scope

- Replace raw `<button>` elements in:
  - `frontend/src/features/sessions/FileChangesDrawer.tsx`
  - `frontend/src/features/sessions/TraceViewPage.tsx`
  - `frontend/src/features/sessions/EventTimeline.tsx`
  - `frontend/src/features/sessions/TraceTreeNode.tsx`
- Remove static inline `style={{}}` declarations from `FileChangesDrawer` where the CSS is expressible as Tailwind classes.
- Refactor `TraceTreeNode` so session trace state and timeline metrics are not passed through more than 2 component levels.

### Out of Scope

- No new Sessions features, filters, timeline modes, or data fetching changes.
- No palette redesign.
- No new shadcn registry components.
- No replacement of data-driven timeline geometry with brittle class generation.

### Allowed Inline Style Exceptions

Dynamic timeline positioning may continue to use inline styles or typed CSS variables because the values are computed from runtime event/span timing:

- `width: contentWidth/timelineWidth`
- `left: tick.leftPx`, bar offsets, label offsets
- `transform` values that depend on first/last tick placement

Static CSS values in `FileChangesDrawer`, such as fixed shadows or tool badge gradients, must be class-based.

---

## Spacing Scale

Declared values are 4px based.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, badge inner gaps |
| sm | 8px | Compact row gaps, inline count badge padding |
| md | 16px | Drawer body padding, header horizontal rhythm |
| lg | 24px | Major panel padding if needed |
| xl | 32px | Not used in this cleanup |
| 2xl | 48px | Not used in this cleanup |
| 3xl | 64px | Not used in this cleanup |

Exceptions:

- Timeline rows keep `h-[44px]` because it is an established fixed row rhythm.
- Timeline bars keep `h-[26px]` because it is tied to the current visual density.
- Compact icon buttons use existing `size="icon-sm"` or `size="icon"` variants.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 12px to 14px | 400 | normal |
| Label | 10px to 12px | 600 to 700 | normal |
| Heading | 11px to 12px | 600 | normal |
| Display | not applicable | not applicable | not applicable |

Rules:

- Keep trace, path, timing, session ID, and line metadata mono-aligned.
- Keep drawer and timeline labels compact. Do not introduce hero-scale or marketing-style type.
- Do not add negative letter spacing. Existing uppercase tracking may remain for compact labels.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#0a0a0a`, `#111111` | Sessions page and app background |
| Secondary (30%) | `#101116`, `#111216`, `#191919` | Panels, drawer surfaces, headers |
| Accent (10%) | sky, amber, violet, emerald Tailwind utility gradients | Timeline semantic bars and active file panel state |
| Destructive | `#ff5f56` / `text-red-400` | Error states only |

Accent reserved for:

- Timeline span/event type bars.
- Active file panel button state.
- File change tool badges.
- Error text only for failed loading states.

Do not increase the dominant purple/violet presence. The UI already uses multiple semantic accents; the cleanup should preserve that balance.

---

## Component Contracts

### Button Primitive

Every interactive element currently rendered as a raw `<button>` in the scoped files must render through `Button`.

Accepted patterns:

- Compact toolbar action:
  - `variant="outline"`
  - `size="icon-sm"` for icon-only controls
  - `size="sm"` for text controls
- Timeline row action:
  - `variant="ghost"`
  - `className="h-[44px] w-full justify-start rounded-none px-0 text-left hover:bg-transparent"`
  - Preserve `onClick`, `onDoubleClick`, selected state ring, and full-row target.
- Expand/collapse node action:
  - `variant="ghost"`
  - `size="icon-xs"` or equivalent compact class
  - Use `aria-label` that names the action and span.
  - Stop propagation exactly as today.
- Mobile overlay dismiss action:
  - Render as `Button`, not raw `button`.
  - Use a visually neutral full-screen class such as `absolute inset-0 z-40 h-auto w-auto rounded-none bg-black/60 p-0 hover:bg-black/60`.
  - Keep `aria-label="Dismiss details overlay"`.
- File row disclosure:
  - Render as `Button`, not raw `button`.
  - Keep a full-width hit target and `text-left`.
  - Add `aria-expanded={open}`.

Do not use `Button` only for visible styling while leaving wrapper buttons around it. The DOM must not contain raw buttons in the scoped files after implementation.

### Icons

- Use lucide icons already imported by the scoped files.
- Prefer shadcn button sizing for icons inside `Button`.
- Add `data-icon="inline-start"` for icons in text buttons where practical.
- Icon-only buttons must have `aria-label` and `title` when the action is not visible as text.

### FileChangesDrawer Static Styling

Convert static inline styles to Tailwind classes:

- Drawer shadow: use arbitrary shadow utility on the root, for example `shadow-[-4px_0_24px_-8px_rgba(0,0,0,0.6)]`.
- Tool badge gradients: replace `toolColor()` string return with a `toolColorClass()` helper that returns Tailwind gradient classes.

Recommended tool badge classes:

- write/create: `bg-[linear-gradient(90deg,rgba(16,185,129,0.95),rgba(52,211,153,0.82))]`
- edit/str_replace: `bg-[linear-gradient(90deg,rgba(56,189,248,0.95),rgba(59,130,246,0.82))]`
- multiedit/notebook: `bg-[linear-gradient(90deg,rgba(139,92,246,0.95),rgba(168,85,247,0.82))]`
- fallback: `bg-[linear-gradient(90deg,rgba(249,115,22,0.95),rgba(251,146,60,0.82))]`

### Trace Prop Boundary

`TraceViewPage` should own data fetching, panel mode, zoom, and timeline width calculation. `TraceTreeNode` should not receive the full state bundle recursively.

Introduce a narrow shared context or equivalent local provider for the trace tree:

```tsx
type TraceTimelineContextValue = {
  selected: TraceSpan | null
  onSelect: (span: TraceSpan) => void
  onOpenPanel: () => void
  globalStart: number
  globalDuration: number
  timelineWidth: number
}
```

Contract:

- `TraceViewPage` provides the context at the tree rendering boundary.
- Root `TraceTreeNode` receives only `span` and `depth`.
- Recursive `TraceTreeNode` calls pass only `span` and `depth`.
- If context is not used, an equivalent single `timeline` object may be passed one level from `TraceViewPage` to a tree renderer, but not recursively through every node.

The final `TraceTreeNode` public props must be no more than 2 levels deep from `TraceViewPage` and must not include the current 7-prop timing/handler chain.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | Keep existing visible actions: `Fit`, `Files` |
| Empty state heading | Keep existing: `No file changes recorded for this session.` and `No traces found for this session.` |
| Empty state body | No new body copy in this cleanup phase |
| Error state | Keep existing file drawer pattern: `Failed to load: {error}` |
| Destructive confirmation | Not applicable |

No visible instructional copy should be added. This is a code-quality and consistency phase, not a user education phase.

---

## Accessibility Contract

- Full-row timeline and file-row actions must remain keyboard focusable after conversion to `Button`.
- Disclosure buttons must expose `aria-expanded`.
- Icon-only buttons must expose explicit labels.
- Double-click behavior may remain for pointer users, but single-click selection must remain the keyboard-accessible primary path.
- Focus rings from the shadcn `Button` primitive must not be removed.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Existing local `Button`, `Badge`, `Separator`, `Resizable` primitives | No registry add required |
| third-party | none | Not allowed for this phase |

No `npx shadcn add` is needed. If implementation discovers a missing primitive, stop and update this UI-SPEC before adding a registry component.

---

## Verification Contract

Implementation verification must include:

- `rg -n "<button" frontend/src/features/sessions/FileChangesDrawer.tsx frontend/src/features/sessions/TraceViewPage.tsx frontend/src/features/sessions/EventTimeline.tsx frontend/src/features/sessions/TraceTreeNode.tsx` returns no matches.
- `rg -n "style=\\{\\{" frontend/src/features/sessions/FileChangesDrawer.tsx` returns no matches.
- TypeScript passes for the frontend.
- Existing frontend test suite passes or any unrelated failures are documented.

Manual UI smoke:

- Trace rows still select spans on click.
- Trace rows still open the inspection panel on double-click.
- Nested trace nodes still expand and collapse.
- Mobile overlay still dismisses via backdrop.
- File drawer still opens, closes, expands file rows, and renders tool badges.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-05-31
