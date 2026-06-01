---
phase: 09-frontend-test-coverage-docs-cleanup
reviewed: 2026-06-01T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx
  - frontend/tests/features/usage/UsagePage.test.tsx
  - frontend/tests/features/version/VersionBadge.test.tsx
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-06-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three test files were reviewed: `DiagnosticsPage.test.tsx`, `UsagePage.test.tsx`, and `VersionBadge.test.tsx`. The tests exercise real component logic without deep mocking, which is correct. No critical defects were found. Three warnings and three info items are present — the most actionable are the clipboard `Object.defineProperty` without `configurable: true` (which makes the mock leak across test runs when `unstubGlobals: true` is active), and a test that asserts nothing about the feature it claims to cover.

## Warnings

### WR-01: `navigator.clipboard` mock missing `configurable: true` — leaks between test files

**File:** `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx:88-91`

**Issue:** `Object.defineProperty(navigator, 'clipboard', { value: ..., writable: true })` sets the property as non-configurable. Vitest is configured with `unstubGlobals: true` (see `vite.config.ts:27`), which resets globals set via `vi.stubGlobal` but cannot reset properties set via `Object.defineProperty` without `configurable: true`. As a result, the `navigator.clipboard` mock installed by this file leaks into every subsequent test file that runs in the same jsdom environment, replacing any other clipboard mock those files intended to install. The same pattern exists in `DiagnosticsRoute.test.tsx` but not in `CopyButtons.test.tsx`, which correctly uses `configurable: true`. If these files run in an order where `DiagnosticsPage.test.tsx` precedes a file that does not install a clipboard mock, that file silently picks up a stale `vi.fn()` from a prior run without triggering any assertion failure.

**Fix:**
```tsx
// Before (non-configurable, leaks)
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn() },
  writable: true,
})

// After (configurable, safe to overwrite between test files)
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  writable: true,
  value: { writeText: vi.fn() },
})
```

---

### WR-02: `'renders provider selector trigger'` test body is a copy-paste of the prior test — asserts nothing about the selector

**File:** `frontend/tests/features/usage/UsagePage.test.tsx:59-64`

**Issue:** The test named `'renders provider selector trigger'` (lines 59-64) retrieves the input by its placeholder `'OpenAI Admin API Key...'` and asserts it is in the document. This is identical to the previous test `'renders API key input field'` (lines 53-57). The test description promises coverage of the `<Select>` trigger but the assertion body exercises the `<Input>` instead. The provider selector trigger is never asserted. This provides false confidence that the selector renders correctly — if `<SelectTrigger>` were accidentally removed from `UsagePanel`, this test would still pass.

**Fix:** Either assert the actual select trigger or remove the duplicate test. For example:
```tsx
it('renders provider selector trigger', () => {
  renderUsagePage()
  // The SelectTrigger renders a combobox role with "OpenAI" as the selected value
  expect(screen.getByRole('combobox')).toBeInTheDocument()
})
```

---

### WR-03: `'shows loading state'` test does not verify that the fetch mock is actually called — the loading state could be a false positive if `useOpenAIUsage` never fires

**File:** `frontend/tests/features/usage/UsagePage.test.tsx:71-88`

**Issue:** The test configures `localStorageMock.getItem` to return `'sk-test'` for `openai_admin_key` and uses a never-resolving fetch. It then asserts the `'Loading...'` button and `'Loading usage data...'` spinner text. This is correct for the happy path. However, the `useOpenAIUsage` hook fires `fetchUsage` from a `useEffect` keyed on `dashboardRange` (see `UsagePanel.tsx:41-46`), not on mount with a key present. The initial render with `loading=false` in the hook state means the `'Loading...'` button text appears only after the effect fires. The test makes no assertion that `fetch` was actually called (e.g., `expect(fetchMock).toHaveBeenCalled()`). If the auto-fetch effect were silently removed from `UsagePanel`, the test would fail only because the button would say `'Fetch'` — but for the wrong reason. A `toHaveBeenCalled()` assertion would make the coverage intent explicit and catch the removal immediately.

**Fix:**
```tsx
it('shows loading state when openai_admin_key is set and fetch is pending', () => {
  localStorageMock.getItem.mockImplementation((key: string) => {
    if (key === 'openai_admin_key') return 'sk-test'
    return null
  })
  const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}))
  vi.stubGlobal('fetch', fetchMock)

  renderUsagePage()

  expect(screen.getByText('OpenAI Usage')).toBeInTheDocument()
  const btn = screen.getByRole('button', { name: 'Loading...' })
  expect(btn).toBeDisabled()
  expect(screen.getByText('Loading usage data...')).toBeInTheDocument()
  // Verify that the auto-fetch was actually triggered
  expect(fetchMock).toHaveBeenCalled()
})
```

---

## Info

### IN-01: `VersionBadge` — no test for a commit hash shorter than 7 characters

**File:** `frontend/tests/features/version/VersionBadge.test.tsx:25-29`

**Issue:** All tests supply a commit of length >= 7 (`'abcdef123'`). `VersionBadge.tsx:7` slices to 7 with `info.commit.slice(0, 7)`. If the backend ever returns a short hash (e.g., `'abc'`), `slice(0, 7)` returns `'abc'` without error and the label would read `v1.2.3 (abc)` — which is not necessarily wrong, but there is no test that documents this behavior. This is an uncovered edge case, not a bug.

**Fix:** Add a test for a short commit:
```tsx
it('uses full commit string when shorter than 7 chars', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ version: '1.0.0', commit: 'abc', buildDate: '2026-05-31' }),
  }))
  renderBadge()
  const badge = await screen.findByLabelText('Application version: v1.0.0 (abc)')
  expect(badge).toHaveTextContent('v1.0.0 (abc)')
})
```

---

### IN-02: `DiagnosticsPage` — `'renders first-run hint'` test uses emptyDiagnostics where `agents.status` is `'no events'` but `status` field in `DiagnosticsAgent` is typed as `string` — no compile-time enforcement

**File:** `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx:63-76`

**Issue:** `emptyDiagnostics` maps agents to `status: 'no events'`. `DiagnosticsAgent.status` is typed as `string`, so any misspelling (e.g., `'no event'`) would still compile and the `isFirstRun` logic in `LoadedContent` (`data.agents.every((a) => a.status === 'no events')`) would silently return `false`, hiding the first-run hint. This is a type-narrowness issue in the source type, not in the test itself, but the test would benefit from a comment noting the exact string value required.

**Fix (in types.ts source, not the test):** Narrowing the type to a union literal would catch this at compile time:
```ts
status: 'healthy' | 'degraded' | 'stale' | 'no events' | string
```
or a dedicated enum. This is informational — the test as written is correct given the current type.

---

### IN-03: `UsagePage` test — `beforeEach` / `afterEach` both call `vi.clearAllMocks()`; `afterEach` call is redundant

**File:** `frontend/tests/features/usage/UsagePage.test.tsx:23-39`

**Issue:** `vi.clearAllMocks()` is called in both `beforeEach` (line 24) and `afterEach` (line 38). Since `beforeEach` runs before every test (including immediately after `afterEach`), the `afterEach` call has no effect on test isolation — the `beforeEach` on the next test will clear anyway. The `afterEach` call at line 38 is dead code. The same pattern appears in `DiagnosticsPage.test.tsx` (lines 87 and 99) and `VersionBadge.test.tsx` (lines 10 and 21).

**Fix:** Remove the `afterEach(() => { vi.clearAllMocks() })` blocks from all three files, or replace them with `vi.resetAllMocks()` if reset semantics (resetting implementations, not just call counts) are ever needed for cleanup.

---

_Reviewed: 2026-06-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
