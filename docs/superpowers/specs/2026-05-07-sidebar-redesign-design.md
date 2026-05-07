# Sidebar Redesign Design

**Date:** 2026-05-07  
**Status:** Approved  
**Scope:** Frontend sidebar shell only (`/frontend/src/components/Sidebar.tsx`, `/frontend/src/components/Layout.tsx`, supporting CSS only if required)

## Goal

Redesign `emruy` sidebar so it feels more intentional and polished without changing product theme. Keep current dark terminal/ops identity, keep existing font stack, keep existing color tokens, and use existing component primitives already present in project.

This is a structural and interaction redesign, not a visual-system rewrite.

## User-Approved Constraints

- Use existing components and project patterns
- Keep existing font theme
- Keep existing font colors and broader color/theme tokens
- Keep sidebar nav-only
- Keep product/tool identity focused on `Agent Monitor`
- Collapsed state should become icon rail, not full hide/show

## Design Direction

### Tone

Hybrid console + premium ops.

That means:

- terminal-grade density and discipline
- cleaner hierarchy and spacing
- subtle polish from alignment, icon rhythm, and surface treatment
- no new palette, no new typography system, no decorative rebrand

### What Changes

- Sidebar becomes a more deliberate vertical rail with clearer top identity
- Each route gets icon + label in expanded state
- Collapsed state becomes a narrow icon rail
- Active route gets stronger hierarchy using existing brand token and contrast
- Hover/focus states become more legible and consistent
- Header toggle styling aligns more closely with sidebar language

### What Does Not Change

- route structure
- page content
- overall app theme
- font imports / font stack
- core color tokens in `src/index.css`
- persistence of sidebar collapsed state in `localStorage`

## Component Strategy

Use only existing frontend building blocks already in repo:

- `Button`
- `Tooltip`
- `Separator` if needed
- `NavLink`
- `lucide-react` icons
- existing `cn()` utility

Do not introduce a new sidebar library or a new design system layer.

## Interaction Model

### Expanded State

- Width remains stable and close to current desktop footprint
- Top section presents `Agent Monitor` more clearly
- Navigation buttons use icon + label
- Layout emphasizes vertical scan order and cleaner spacing between identity and nav

### Collapsed State

- Sidebar remains visible as thin rail instead of disappearing
- Each item shows icon only
- Labels move to tooltips
- Toggle remains accessible from header and preserves current persistence behavior

### Active / Hover / Focus States

- Active route should be immediately distinct at a glance
- Use existing brand green and current dark surfaces only
- Prefer shape, border, contrast, and spacing improvements over new colors
- Keyboard focus must stay visible

## Layout Plan

### Sidebar

1. Top identity block
2. Divider or visual spacing break
3. Primary nav group
4. Optional bottom alignment only if needed for balance, not for new features

Sidebar remains nav-only. No live metrics, filters, or quick-action panels are added.

### Header

- Keep current toggle placement in header
- Restyle toggle to feel part of same UI language as sidebar nav buttons
- Keep current time display and route shell behavior

## Visual Rules

- Reuse existing semantic/tokenized colors from `src/index.css`
- Reuse existing font choices already configured in app
- Avoid raw new palette decisions
- Avoid card-heavy redesign
- Avoid adding descriptive product copy inside sidebar
- Keep shapes, spacing, and icon sizing consistent with existing shadcn usage

## Accessibility

- Collapsed icon rail must remain understandable via tooltip + accessible labels
- Navigation targets must keep comfortable hit area
- Active state must not rely on color alone
- Toggle button must keep clear `aria-label`

## Implementation Notes

### `Sidebar.tsx`

- Add route icons to nav config
- Render two presentation modes from same nav data: expanded and collapsed
- Keep implementation small and local rather than abstracting prematurely
- Prefer `Tooltip` around collapsed icon buttons only

### `Layout.tsx`

- Change grid column behavior from `0px / 250px` model to `icon rail / expanded rail`
- Keep `localStorage` persistence logic
- Update toggle button styling and accessible label

### `index.css`

- Avoid changes unless existing tokens are insufficient
- If any CSS is added, keep it minimal and token-based
- Prefer Tailwind utilities and semantic tokens over new custom classes

## Risks

1. Collapsed width can feel cramped if icon sizing and padding are not tuned carefully
2. Stronger active state can become noisy if border, background, and text contrast all compete
3. Header and sidebar can feel mismatched if toggle styling is updated in one place only

## Success Criteria

1. Sidebar looks materially more polished without introducing a new theme
2. Expanded state reads clearly with stronger `Agent Monitor` identity
3. Collapsed state works as icon rail and remains usable
4. Existing components, font stack, and color tokens remain intact
5. Sidebar still feels native to current app, not like a pasted-in redesign
6. No changes spill into unrelated pages or backend files
