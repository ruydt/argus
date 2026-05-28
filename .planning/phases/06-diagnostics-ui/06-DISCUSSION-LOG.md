# Phase 6: Diagnostics UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-28T09:15:28Z
**Phase:** 06-Diagnostics UI
**Areas discussed:** Page Composition, Warning Severity, Empty And Error States, Refresh Behavior, Privacy Panel Tone

---

## Page Composition

| Option | Description | Selected |
|--------|-------------|----------|
| Status-first | Top row gives health/readiness, then system facts and agent/privacy panels below. | ✓ |
| Agent-first | Agent connectivity table is the main focus, with system/privacy details secondary. | |
| Facts-first | Dense system/storage facts lead the page, optimized for quick debugging over warning triage. | |

**User's choice:** Status-first
**Notes:** The page should be status-first, with four top summary tiles: readiness, events/latest event, agent warnings, and privacy/security warnings. Main status derives from health/readiness plus a separate warning count. Below the summary row, use two desktop columns and stack on mobile.

---

## Warning Severity

| Option | Description | Selected |
|--------|-------------|----------|
| Inline badges + summary count | Keep the top status stable, show warning counts in summary tiles, and use small badges in rows/panels. | ✓ |
| Section banners | Show prominent banners above affected sections like "Agent warnings" or "Privacy warnings". | |
| Color-coded rows only | No separate warning messages; rows and values carry the severity visually. | |

**User's choice:** Inline badges + summary count
**Notes:** Count actionable warnings only: degraded agents, missing configured hooks, remote enabled, extra CORS origins, and DB not ready. Agent `no events` is a soft notice, not a warning. Hook config `unknown` is caution, not failure; count it only when paired with no activity or degraded activity.

---

## Empty And Error States

| Option | Description | Selected |
|--------|-------------|----------|
| Retry panel | Keep the page shell, show a compact error panel with Retry and the failed endpoint. | ✓ |
| Full-page error | Replace the page content with a larger failure state. | |
| Toast + stale data | Keep last loaded data visible and show an error notice. | |

**User's choice:** Retry panel
**Notes:** `health.ready=false` still renders the page with the top health tile saying "Not ready" and showing the reason. Zero total events plus both agents `no events` should show a soft setup hint, not a warning. Missing ignore file status `missing_ok` means missing but OK and zero active rules.

---

## Refresh Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Manual refresh only | Fetch on page load and when the user clicks refresh. | ✓ |
| Refresh on focus | Also refetch when the browser tab/window regains focus. | |
| Auto-refresh | Poll periodically while the page is open. | |

**User's choice:** Manual refresh only
**Notes:** Refresh keeps current data visible and spins/disables the refresh icon. Show a small "Updated ..." timestamp near the refresh button. Initial page visit uses skeleton sections.

---

## Privacy Panel Tone

| Option | Description | Selected |
|--------|-------------|----------|
| Calm checklist | Facts with small status badges: ignore file, active rules, bind posture, CORS counts, export warning. | ✓ |
| Warning-focused | Make the export sensitivity warning the dominant element. | |
| Compact facts table | Minimal copy, mostly labels and values. | |

**User's choice:** Calm checklist
**Notes:** Export sensitivity warning is always visible as a compact persistent note. Remote enabled and extra CORS origins are security posture items with warning badges. DB and ignore file paths use monospace truncation with a copy affordance or full-value title.

---

## the agent's Discretion

None.

## Deferred Ideas

None.
