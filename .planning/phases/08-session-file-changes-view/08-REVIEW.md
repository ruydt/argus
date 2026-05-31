---
phase: 08-session-file-changes-view
reviewed: 2026-05-31T11:36:53Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - backend/tests/internal/handler/file_changes_contract_test.go
  - frontend/src/features/sessions/FileChangesDrawer.tsx
  - frontend/src/features/sessions/FileChangesList.tsx
  - frontend/src/features/sessions/TraceViewPage.tsx
  - frontend/tests/features/sessions/project-session-traces.test.tsx
  - frontend/tests/features/sessions/useFileChanges.test.ts
findings:
  critical: 0
  warning: 3
  info: 0
  total: 3
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-05-31T11:36:53Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the session file-change view, its drawer/list components, and the associated frontend/backend tests. No critical security issues were found, but the frontend has state-lifetime bugs that can show stale file/session data and a route-decoding path that can crash the page for malformed URLs.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: File-change hook exposes stale groups after session changes or failed reloads

**File:** `frontend/src/features/sessions/hooks/useFileChanges.ts:17`
**Issue:** The hook sets `loading` and clears `error` for a new `sessionId`, but it does not clear the previous `groups` before the new request starts or when the request fails. `TraceViewPage` derives its header badge directly from `fileGroups.length`, so navigating from a session with changes to another session whose `/api/file-changes` request fails can leave the old file count and groups exposed under the new session route while the error is shown.
**Fix:** Clear stale data at the start of each non-empty fetch and in the error path, and cover the rerender/error case in `useFileChanges.test.ts`.

```ts
if (!cancelled) {
  setGroups([])
  setLoading(true)
  setError(null)
}

// ...
.catch((err: unknown) => {
  if (!cancelled) {
    setGroups([])
    setError(err instanceof Error ? err.message : 'error')
  }
})
```

### WR-02: Failed session metadata fetch leaves previous session details on the new trace route

**File:** `frontend/src/features/sessions/TraceViewPage.tsx:40`
**Issue:** `fetchSession` returns immediately when `/api/sessions?cwd=...` is not OK, without clearing the current `session` state. If the user navigates from one trace route to another and the second metadata request returns a 500/404, the page keeps rendering the previous session's started/duration/ended values beside the new `sessionId`.
**Fix:** Clear session state when a new lookup starts and when the response is not OK.

```tsx
async function fetchSession() {
  if (mounted) setSession(null)
  try {
    const res = await fetch(`/api/sessions?cwd=${encodeURIComponent(cwd)}`)
    if (!res.ok) {
      if (mounted) setSession(null)
      return
    }
    const data = (await res.json()) as SessionsResponse
    const sessions = getSessions(data)
    if (mounted) {
      setSession(sessions.find((item) => item.session_id === sessionId) || null)
    }
  } catch {
    if (mounted) setSession(null)
  }
}
```

### WR-03: Malformed encoded cwd route parameter can crash TraceViewPage

**File:** `frontend/src/features/sessions/TraceViewPage.tsx:29`
**Issue:** `decodeURIComponent(encodedCwd)` is called directly during render. A malformed route segment such as `/sessions/%/sess-1` throws `URIError`, which crashes the route before the component can render an error/empty state.
**Fix:** Decode defensively and fall back to the raw value or an empty cwd when decoding fails.

```tsx
function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const cwd = useMemo(() => safeDecodeURIComponent(encodedCwd), [encodedCwd])
```

---

_Reviewed: 2026-05-31T11:36:53Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
