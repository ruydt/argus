# Phase 6: Diagnostics UI - Context

**Gathered:** 2026-05-28T09:15:28Z
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 builds the React Diagnostics page for the already-completed backend diagnostics contract. It adds `/diagnostics` navigation, frontend types/hooks, a compact operator page, loading/error/empty/warning/healthy/manual-refresh states, and frontend tests. Backend diagnostics behavior is locked from Phases 4 and 5; this phase should not add backend features or new diagnostics capabilities.

</domain>

<decisions>
## Implementation Decisions

### Page Composition
- **D-01:** `/diagnostics` should use a status-first layout. The first viewport should quickly tell the operator whether hooker is healthy and whether there are warnings.
- **D-02:** The main status should derive from health/readiness plus a separate warning count. Do not let the worst warning automatically override the main health status.
- **D-03:** The top summary row should contain four compact tiles: readiness, total events/latest event, agent warnings, and privacy/security warnings.
- **D-04:** Below the summary row, use a two-column desktop layout: agent connectivity table on the left, system facts and privacy/security panels on the right. Stack sections on mobile.

### Warning Severity
- **D-05:** Use inline badges plus summary counts rather than section banners or row color alone.
- **D-06:** Top-level warning count includes actionable warnings only: degraded agents, missing configured hooks, remote enabled, extra CORS origins, and DB not ready.
- **D-07:** Agent `no events` is a soft notice with muted inline badge text such as "No events yet"; it is not counted as a warning.
- **D-08:** Hook config `unknown` is caution, not failure. Show an amber badge and short non-sensitive reason when present; count it only when paired with no activity or degraded activity.

### Empty And Error States
- **D-09:** If `/api/diagnostics` fails to load, keep the page shell and show a compact retry panel that names the failed endpoint and provides Retry.
- **D-10:** If the backend responds with `health.ready=false`, still render all available diagnostics. The top health tile should say "Not ready" and show the provided reason.
- **D-11:** If total events are zero and both agents show `no events`, show a soft setup hint such as "No activity observed yet" and point to hook setup/doctor. Do not treat this as a warning.
- **D-12:** Ignore file status `missing_ok` means missing but OK: explain that no ignore file is configured and zero rules are active. Do not warn.

### Refresh Behavior
- **D-13:** Diagnostics refresh is manual only. Fetch on page load and when the user clicks refresh; do not add polling or focus-refresh behavior in this phase.
- **D-14:** Manual refresh keeps current data visible and shows a quiet spinner/disabled state on the refresh icon.
- **D-15:** Show a small "Updated ..." timestamp near the refresh button.
- **D-16:** Initial page load should render skeleton sections, not a blank page or centered spinner.

### Privacy Panel Tone
- **D-17:** Privacy/security posture should read as a calm checklist: ignore file, active rules, bind posture, CORS counts, and export warning with small status badges.
- **D-18:** The export sensitivity warning should always be visible as a compact persistent note below privacy/security facts.
- **D-19:** Remote bind and extra CORS origins are security posture items. Remote enabled and extra origins should receive warning badges.
- **D-20:** File paths such as DB path and ignore file path should be monospace, visually truncated when needed, and provide a copy affordance or title/full-value access.

### the agent's Discretion
No areas were delegated to the agent. All selected gray areas were decided explicitly.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning and Requirements
- `.planning/ROADMAP.md` — Phase 6 goal, success criteria, and frontend plan split.
- `.planning/REQUIREMENTS.md` — Phase 6 UI and TEST requirements.
- `.planning/PROJECT.md` — local-first/privacy constraints, v1.1 Diagnostics milestone goal, and current backend contract summary.
- `.planning/STATE.md` — current phase position and recent milestone status.
- `.planning/phases/05-hook-and-privacy-diagnostics/05-CONTEXT.md` — locked backend diagnostics semantics: two-agent contract, no backend stale threshold, warning semantics, privacy/security posture fields.
- `.planning/phases/05-hook-and-privacy-diagnostics/05-VERIFICATION.md` — confirms backend diagnostics contract passed verification.

### Codebase Maps
- `.planning/codebase/CONVENTIONS.md` — frontend naming, formatting, imports, and test conventions.
- `.planning/codebase/STRUCTURE.md` — where to add frontend feature code and tests.
- `.planning/codebase/STACK.md` — React/Vite/React Router/shadcn/lucide stack and test tooling.

### Existing Frontend Code
- `frontend/src/App.tsx` — route tree and lazy page import pattern.
- `frontend/src/app/Sidebar.tsx` — sidebar navigation item pattern, lucide icons, collapsed tooltips, and mobile nav behavior.
- `frontend/src/app/Layout.tsx` — shell layout, mobile drawer behavior, outlet context, and page container expectations.
- `frontend/src/pages/Dashboard.tsx` — compact dashboard page layout, refresh icon behavior, skeleton pattern, tabs, and max-width content container.
- `frontend/src/features/dashboard/hooks/useDashboardStats.ts` — fetch/reload hook pattern with loading and refreshing states.
- `frontend/tests/features/dashboard/DashboardPage.test.tsx` — frontend page test style for loading and loaded states.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/App.tsx` — add a lazy `DiagnosticsPage` route under the existing `Layout`.
- `frontend/src/app/Sidebar.tsx` — add a Diagnostics nav item with a lucide icon, preserving desktop collapsed tooltip and mobile navigation behavior.
- `frontend/src/pages/Dashboard.tsx` — reuse its page header, constrained content width, manual refresh button, skeleton-first load, and compact operational page rhythm.
- `frontend/src/features/dashboard/hooks/useDashboardStats.ts` — model a `useDiagnostics` hook on the same fetch/reload/loading/refreshing shape.
- `frontend/src/components/ui/button.tsx`, `frontend/src/components/ui/alert.tsx`, and existing shadcn primitives — use existing UI primitives rather than introducing a new component library.

### Established Patterns
- Frontend feature code belongs under `frontend/src/features/<feature>/`, with page-level components in feature folders or `frontend/src/pages` according to existing route conventions.
- Routes are lazy-loaded in `frontend/src/App.tsx` inside `Suspense fallback={null}`.
- Sidebar nav items are centralized in `NAV_ITEMS` and use `Button asChild` plus `NavLink`.
- Manual refresh interactions use lucide `RefreshCw`, disabled button state, and `animate-spin` when refreshing.
- Tests use Vitest, Testing Library, `vi.stubGlobal('fetch')`, and `MemoryRouter`.

### Integration Points
- Add `GET /api/diagnostics` frontend types matching the Phase 5 backend response.
- Add `/diagnostics` route and sidebar item.
- Add frontend tests for route/sidebar navigation and page states: loading, fetch error, healthy, warning, empty/no-events, not-ready, and manual refresh.
- Do not modify backend diagnostics behavior in this phase unless planning discovers a frontend contract blocker.

</code_context>

<specifics>
## Specific Ideas

- The Diagnostics UI should feel like an operator surface: quiet, compact, and scannable.
- The top row should answer "is hooker healthy right now?" while still surfacing warning counts.
- The agent table is important but should sit below the status summary, not dominate the first viewport.
- Privacy/security copy should be calm and factual, not alarmist.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 6-Diagnostics UI*
*Context gathered: 2026-05-28T09:15:28Z*
