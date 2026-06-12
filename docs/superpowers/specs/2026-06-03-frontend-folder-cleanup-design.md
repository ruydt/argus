# Frontend Folder Cleanup — Design

Date: 2026-06-03

## Goal

Remove dead shim files, unused template assets, and normalize Dashboard page location to match the rest of the codebase.

## Problems being solved

| Problem | Location | Impact |
|---|---|---|
| Dead shim re-exports | `src/components/Layout.tsx`, `src/components/Sidebar.tsx`, `src/types.ts` | Confuse readers, no callers |
| Unused Vite template assets | `src/App.css`, `src/assets/react.svg`, `src/assets/vite.svg` | Noise |
| Dashboard in wrong location | `src/pages/Dashboard.tsx` | Inconsistent; every other page lives in its feature folder |
| Empty `pages/` directory | `src/pages/` | Leftover after Dashboard moves |

## Changes

### 1. Delete dead shim files
- `src/components/Layout.tsx` — re-export stub, zero real imports
- `src/components/Sidebar.tsx` — re-export stub, zero real imports
- `src/types.ts` — re-export stub; `@/types` will resolve to `src/types/index.ts` directly once this is gone

### 2. Delete unused assets
- `src/App.css`
- `src/assets/react.svg`
- `src/assets/vite.svg`

### 3. Move Dashboard page into its feature
- `src/pages/Dashboard.tsx` → `src/features/dashboard/DashboardPage.tsx`
- Rename exported component `Dashboard` → `DashboardPage` to match project naming convention
- Delete `src/pages/` directory

### 4. Update callers (two files only)
- `src/App.tsx` — update lazy import path and component name
- `tests/features/dashboard/DashboardPage.test.tsx` — update import path and component name

## Invariants

- No behaviour changes. Pure file moves and deletions.
- `src/components/ui/` is untouched (shadcn-generated).
- `src/components/shared/` is untouched.
- `src/app/Layout.tsx` and `src/app/Sidebar.tsx` stay where they are.
- TypeScript resolution: removing `src/types.ts` makes `@/types` resolve to `src/types/index.ts` — identical exports, no callers change.

## Verification

```
cd frontend
npx tsc --noEmit    # no type errors
npx vitest run      # all tests pass
```
