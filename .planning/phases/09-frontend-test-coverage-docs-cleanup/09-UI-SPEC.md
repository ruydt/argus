---
phase: 09
slug: frontend-test-coverage-docs-cleanup
status: draft
shadcn_initialized: true
preset: "b2fA (style: radix-nova, base: neutral, iconLibrary: lucide, font: geist)"
created: 2026-05-31
---

# Phase 09 - UI Design Contract

> Visual and interaction contract for Phase 9: Frontend Test Coverage & Docs Cleanup.

This phase is primarily test coverage and documentation cleanup. Production UI changes are out of scope unless a required test exposes a real bug or a concrete testability blocker. The executor should preserve the current DiagnosticsPage, UsagePage, and VersionBadge visuals and interactions while proving their existing rendering states through Vitest.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui |
| Preset | b2fA, radix-nova, neutral, Geist, default radius |
| Component library | Radix UI through shadcn |
| Icon library | lucide |
| Font | Geist Variable for shadcn surfaces; JetBrains Mono for app chrome, paths, timestamps, line numbers, code, and compact version text |

Sources: `frontend/components.json`, `npx shadcn@latest info --json` run on 2026-05-31, `frontend/src/index.css`, Phase 06/08 UI-SPECs.

No new shadcn component, registry block, layout primitive, page route, animation system, or icon set should be introduced for Phase 09.

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, badge gaps, inline metadata gaps |
| sm | 8px | Compact control spacing, table/cell interior gaps |
| md | 16px | Default card padding, page horizontal padding on mobile |
| lg | 24px | Page section gaps, diagnostics body grid gaps, UsagePanel block gaps |
| xl | 32px | Reserved for existing wide layout breathing room only |
| 2xl | 48px | Not used in this phase |
| 3xl | 64px | Not used in this phase |

Exceptions:

- Preserve existing Diagnostics summary grid `gap-3` and body gap of 24px (`gap-6`).
- Preserve existing UsagePanel 300px empty/loading panel height.
- Preserve existing VersionBadge compact line-height and 0.66rem text size.
- Do not change spacing to make tests easier; tests should adapt to the current UI contract.

Sources: `frontend/src/features/diagnostics/DiagnosticsPage.tsx`, `frontend/src/features/usage/UsagePanel.tsx`, `frontend/src/features/version/VersionBadge.tsx`.

---

## Typography

Use exactly these four size tiers for any production UI touched by this phase:

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| VersionBadge compact text | 0.66rem | 400 | existing compact line-height |
| Body / table / control / muted label text | 14px | 400 | 1.5 |
| Metric value | 20px | 600 | 1.2 |
| Page heading | 22px | 600 | 1.2 |

Allowed weights: regular 400 and semibold 600 only.

Rules:

- Keep `Diagnostics` and `OpenAI Usage` headings at 22px semibold.
- Keep Diagnostics metric values at 20px semibold.
- Keep VersionBadge at its existing compact `0.66rem` mono-style treatment; do not promote it into a visible loading/error badge.
- Do not add display typography, hero headings, explanatory in-app text, or larger marketing-style labels.

---

## Color

All values use existing CSS custom properties from `frontend/src/index.css`.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--background` / `#111111` | Page background, sidebar background |
| Secondary (30%) | `--card` / `#191919`, `--secondary` / `#1c1c1c` | Cards, panels, loading and empty containers |
| Accent (10%) | `--brand` / `#a78bfa`, semantic status tokens | Active navigation, status dots/badges, charts already rendered by UsageCharts |
| Destructive | `--destructive` / `#ff5f56` | Existing destructive alert/error badges only |

Accent reserved for:

- Existing active sidebar/nav indication.
- Existing Diagnostics status colors: `--worktree` green for healthy/configured, `--cwd` amber for warning/unknown/stale, `--destructive` red for degraded/missing/remote/error.
- Existing UsageCharts semantic chart palette.
- Existing VersionBadge subdued text color `#444`.

Do not introduce a new accent color, gradient, theme switcher, light mode, or redesigned status palette in Phase 09.

---

## State And Interaction Contracts

Primary visual hierarchy remains page heading first, then state panel content, then secondary metadata and status badges. Phase 09 tests should preserve that hierarchy and must not promote badges, helper text, or metadata above the page-level heading.

### DiagnosticsPage

Test and preserve these existing branches:

- Loading: page heading remains visible; body renders skeleton layout with `aria-busy="true"`; `Agent Connectivity` and `System Facts` are absent until data loads.
- Error: heading remains visible; compact retry panel shows `Failed to load diagnostics`, `Could not reach /api/diagnostics`, and `Retry Load`.
- Healthy: renders `Agent Connectivity`, `System Facts`, healthy readiness, configured agent badges, and the export warning.
- Degraded/warning: renders visible warning badges such as `Degraded`, extra CORS origin badge text, missing/unknown/stale hook statuses, and privacy/security warning badges using the existing status color mapping.
- First-run soft hint: when no events are present, renders `No activity observed yet` plus `hooker setup` / `hooker doctor` guidance.
- Not-ready: renders `Not ready` and the health reason while keeping other sections visible.
- Refresh: clicking `Refresh diagnostics` disables the button, spins the refresh icon, and keeps current data visible instead of replacing it with skeletons.

Do not redesign DiagnosticsPage, change copy, remove the compact retry panel, or hide available data during refresh.

### UsagePage

Test and preserve these existing branches:

- Empty state: without an admin API key, render `Admin API Key Required` and the local-storage disclosure copy.
- Loading state: with a key present and a pending usage fetch, keep the controls visible, disable the fetch button as `Loading...`, and render `Loading usage data...` in the existing 300px panel.
- Populated state: successful realistic usage data renders `UsageCharts` and `UsageTables` visible summary/chart/table content through the real `UsagePage` / `UsagePanel` / `useOpenAIUsage` path.
- Error state may be asserted if encountered while building fixtures, but this phase is not required to broaden UsagePage beyond TEST-02.

Do not replace the real hook with whole-component mocks unless a narrow browser API shim is needed. Use `vi.stubGlobal('localStorage')` and `vi.stubGlobal('fetch')` per the existing test convention.

### VersionBadge

Test and preserve these existing branches:

- Loaded state: successful `/api/version` renders `v{version}` and shortens non-`none` commits to 7 characters, with `aria-label="Application version: ..."` present.
- Loading state: pending fetch renders `null`.
- Error state: failed or non-OK fetch renders `null`.

Do not add a visible loading skeleton, error fallback, tooltip, retry control, or layout placeholder for VersionBadge in Phase 09.

### Docs Cleanup

Removing stale files under `docs/superpowers/specs/` and `docs/superpowers/plans/` has no production UI surface. It must not alter active app copy, navigation, pages, or documentation outside direct stale-reference cleanup.

---

## Component Inventory

Existing components that may appear in tested UI:

| Component | Current use |
|-----------|-------------|
| `Button` | Diagnostics refresh/retry, Usage fetch |
| `Input` | Usage admin API key field |
| `Select` | Usage provider selector |
| `Alert` | Usage error, Diagnostics privacy/export warning |
| `Badge` | Diagnostics status badges |
| `Card` | Diagnostics tiles, panels, retry state |
| `Skeleton` | Diagnostics initial loading state |
| `Table` | Diagnostics agent table and usage tables |
| `Separator` | Diagnostics facts panels |

No component additions are required. If implementation discovers a production UI defect requiring a new primitive, stop and update this UI-SPEC before adding it.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | `Fetch Usage` on UsagePage; `Retry Load` on DiagnosticsPage error |
| Diagnostics loading | Existing skeleton state; no visible loading sentence required |
| Diagnostics error heading | `Failed to load diagnostics` |
| Diagnostics error body | `Could not reach /api/diagnostics` |
| Diagnostics first-run heading | `No activity observed yet` |
| Diagnostics first-run body | `Run hooker setup or hooker doctor to configure hook integrations.` |
| Usage empty state heading | `Admin API Key Required` |
| Usage empty state body | `Enter your OpenAI Admin API key to view usage statistics. This key is stored locally in your browser.` |
| Usage loading | `Loading usage data...` |
| Version loaded label | `v{version}` or `v{version} ({commit7})` |
| Version loading/error | No visible copy; render `null` |
| Destructive confirmation | None; this phase has no destructive UI action |

Tests should assert user-visible copy and accessible labels where possible, not component internals.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Existing local `Button`, `Input`, `Select`, `Alert`, `Badge`, `Card`, `Skeleton`, `Table`, `Separator` | `npx shadcn@latest info --json` passed on 2026-05-31; no registry add required |
| third-party | none | Blocked for this phase; no third-party registry declared |

Third-party registries and shadcn block additions are out of scope for Phase 09.

---

## Verification Contract

Required verification:

- DiagnosticsPage tests cover loading, error, healthy, and degraded branches.
- UsagePage tests cover loading, empty, and populated branches through the real page/panel/hook path.
- VersionBadge tests cover loaded, loading, and error/null states.
- No placeholder/stale-reference content remains active under `docs/superpowers/specs/` or `docs/superpowers/plans/`.
- Frontend tests pass for the touched suites.
- Any production UI code change must be justified by a failing state test that exposes a real bug or testability blocker.

Manual UI smoke is not required unless production UI code changes. If production UI changes occur, smoke DiagnosticsPage, UsagePage, and sidebar VersionBadge at desktop and mobile widths for overlap, wrapping, and preserved empty/error/loading behavior.

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
