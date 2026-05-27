---
phase: 03-mature-local-product
reviewed: 2026-05-27T08:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - CONTRIBUTING.md
  - Dockerfile
  - README.md
  - backend/cmd/server/main.go
  - backend/cmd/server/main_test.go
  - backend/internal/config/config.go
  - backend/internal/handler/hook.go
  - backend/internal/privacy/ignore/ignore.go
  - backend/internal/privacy/ignore/ignore_test.go
  - backend/internal/server/middleware.go
  - backend/internal/server/router.go
  - backend/tests/internal/config/config_test.go
  - backend/tests/internal/handler/export_test.go
  - backend/tests/internal/handler/hook_test.go
  - backend/tests/internal/server/router_test.go
  - docs/adr/0001-sqlite-local-storage.md
  - docs/adr/0002-hook-normalization-strategy.md
  - docs/adr/0003-local-first-positioning.md
  - docs/adr/0004-proxy-scope.md
  - docs/install.md
  - docs/privacy.md
  - docs/quickstart.md
  - docs/security.md
  - scripts/hooker
findings:
  critical: 3
  warning: 6
  info: 3
  total: 12
status: fixed
---

# Phase 03: Code Review Report

**Reviewed:** 2026-05-27
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

This phase adds the privacy ignore gate (D-03 through D-09), the `HOOKER_ALLOW_REMOTE` bind guard, the `HOOKER_IGNORE` config surface, CORS hardening, and companion tests. The core logic is sound and the test coverage is intentional. Three BLOCKER-level defects were found: a broken IPv6 loopback check in the `hostHeader` middleware that turns a security guard into a DoS condition for IPv6 users, a missing request-body size limit on the hook endpoint, and a silent pass-through of non-preflight cross-origin requests in the CORS middleware. Six WARNING-level issues cover dead code, test reliability gaps, and documentation omissions.

---

## Critical Issues

### CR-01: `hostHeader` middleware rejects all IPv6 loopback requests

**File:** `backend/internal/server/middleware.go:96-111`

**Issue:** The `allowed` map uses `"[::1]"` as the IPv6 loopback key. When Go's `net.SplitHostPort` strips the port from a request `Host` header such as `[::1]:8765` it returns the bare `"::1"` (without brackets). The code then looks up `"::1"` in the map, finds nothing, and returns 403. A user who binds on `[::1]:8765` receives 403 on every request from an IPv6 browser tab, effectively breaking the application for that bind address while appearing to start normally. The test suite does not exercise any request with `Host: [::1]:8765`, so this regression is invisible.

Verified with `net.SplitHostPort("[::1]:8765")` → `host="::1"`.

**Fix:**
```go
// In hostHeader, change the allowed map to use the bare address:
allowed := map[string]bool{
    "localhost": true,
    "127.0.0.1": true,
    "::1":       true,  // SplitHostPort strips brackets; store bare form
}
```

Also add a router test:
```go
func TestHostHeaderAllowsIPv6Loopback(t *testing.T) {
    req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
    req.Host = "[::1]:8765"
    rec := httptest.NewRecorder()
    newTestRouter().ServeHTTP(rec, req)
    if rec.Code == http.StatusForbidden {
        t.Fatalf("status = %d, want 200 for [::1]:8765", rec.Code)
    }
}
```

---

### CR-02: No request-body size limit on `POST /api/hook`

**File:** `backend/internal/handler/hook.go:34`

**Issue:** `io.ReadAll(r.Body)` reads the full body without any size cap. Because `POST /api/hook` is unauthenticated on the loopback, any local process (or any remote process when `HOOKER_ALLOW_REMOTE=1`) can send an arbitrarily large body. This will exhaust server memory and OOM-kill the backend, taking down all monitoring with it. A 100 MB payload in a tight loop is sufficient to crash the process. The server sets `ReadTimeout: 30s` but that only limits total time, not body size.

**Fix:**
```go
// Wrap r.Body before io.ReadAll — 1 MB is generous for any real hook payload:
const maxHookBodyBytes = 1 << 20 // 1 MiB
r.Body = http.MaxBytesReader(w, r.Body, maxHookBodyBytes)
raw, err := io.ReadAll(r.Body)
if err != nil {
    // MaxBytesReader returns a *http.MaxBytesError when the limit is hit.
    http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
    return
}
```

---

### CR-03: CORS middleware passes non-`OPTIONS` requests from disallowed origins to handlers

**File:** `backend/internal/server/middleware.go:82-88`

**Issue:** When an `Origin` header is present but not in the allowlist and the method is not `OPTIONS`, the middleware calls `next.ServeHTTP(w, r)` — the handler executes. For `POST /api/hook`, this means a cross-origin non-preflight request still runs the ingestion pipeline. Modern browsers always send a CORS preflight for JSON `POST` requests, so the real attack surface is narrow. However, the invariant the comment establishes ("allowed origins get CORS headers; others are rejected") is silently violated for simple cross-origin requests (e.g., `text/plain` body), and the code will be confusing to future maintainers who may inadvertently weaken the guard further. The `hostHeader` guard is the last line of defense here, but defense-in-depth requires the CORS layer to also reject.

**Fix:**
```go
// Origin present but not in allowlist — reject regardless of method.
http.Error(w, "forbidden", http.StatusForbidden)
return
```

This is safe: non-CORS requests (no `Origin`) already bypass this branch and reach `next` normally. Only requests that actively present a disallowed origin are affected.

---

## Warnings

### WR-01: `matchDirPattern` contains an exact duplicate loop — dead code

**File:** `backend/internal/privacy/ignore/ignore.go:174-186`

**Issue:** The function contains two `for i := 0; i <= len(candidateSegs)-pLen; i++` loops with identical bodies and no state change between them. The second loop (lines 181-186), introduced with the comment "Also match if the pattern is a prefix of the candidate", is strictly dead: any match it could find was already found and returned by the first loop. This is a maintenance hazard — a future diff may attempt to fix one loop and leave the dead copy inconsistent.

**Fix:** Delete lines 181-186. The first loop already covers prefix, infix, and exact matches within the fixed-window approach. If deeper-path prefix matching is needed in future, the correct fix is to extend the first loop or switch to `matchGlobRec`, not a duplicate.

---

### WR-02: `**` with zero intermediate segments not matched for directory patterns

**File:** `backend/internal/privacy/ignore/ignore.go:160-187`

**Issue:** `matchDirPattern` uses `matchGlobSegments` (fixed-length window matching) for relative patterns. `matchGlobSegments` treats `**` as a wildcard that matches exactly one segment in the fixed-length window. This means `frontend/**/dist/` does not match `frontend/dist` (zero segments between `frontend` and `dist`) — the window of length 3 `["frontend","**","dist"]` can never hit a 2-segment candidate slice `["frontend","dist"]`.

The gitignore spec says `**` matches zero or more path components. The test suite does not include a `frontend/dist` (zero-intermediate) case for the double-star pattern, so this gap is untested.

**Fix:** Replace the `matchGlobSegments` sliding-window approach in `matchDirPattern` with a call to `matchGlobRec` over all candidate suffix positions:

```go
// Relative pattern: try matching from every start offset.
for start := 0; start < len(candidateSegs); start++ {
    if matchGlobRec(patternSegs, candidateSegs, 0, start) {
        return true
    }
}
return false
```

Add the missing test case:
```go
{
    name:  "CWD matches double star with zero intermediates",
    event: domain.NormalizedEvent{CWD: "/home/user/project/frontend/dist"},
    want:  true,
},
```

---

### WR-03: `scripts/hooker doctor` ADDR loopback check breaks for IPv6

**File:** `scripts/hooker:221-225`

**Issue:** The doctor script extracts the host from `ADDR` using `cut -d: -f1`. For `ADDR=[::1]:8765` this produces `[` (the first character before the first colon), which is neither `127.0.0.1`, `localhost`, nor `::1`. The doctor then emits a "Non-loopback bind" warning even though the address is the IPv6 loopback. This is a false-positive warning that could confuse a user who bound to `[::1]:8765` and is told their install is unsafe when it is not.

**Fix:**
```bash
# Strip brackets and port for IPv6 ADDR values:
addr_host="$(printf '%s' "$addr" | sed 's/^\[\(.*\)\]:.*/\1/; s/:.*//')"
if [ "$addr_host" = "127.0.0.1" ] || [ "$addr_host" = "localhost" ] || [ "$addr_host" = "::1" ]; then
```

---

### WR-04: `config_test.go` uses `os.Unsetenv` without test-safe cleanup

**File:** `backend/tests/internal/config/config_test.go:14,38-43,67-70,114-115`

**Issue:** Several tests call `os.Unsetenv` directly instead of `t.Setenv` (which registers automatic `t.Cleanup` restoration). If the test process is interrupted or panics mid-run, the env var is left unset for all subsequent tests in the same process. Because `os.Unsetenv` does not register a cleanup handler, the restore-on-failure guarantee that `t.Setenv` provides is absent. The affected tests are `TestLoad_IgnorePath_Default`, `TestLoad_defaults`, `TestLoad_CORSOrigins_DefaultFromAddr`, and `TestLoad_AllowRemote_Default`.

**Fix:** Replace each `os.Unsetenv` + error check pattern with `t.Setenv`:

```go
// Instead of:
if err := os.Unsetenv("HOOKER_IGNORE"); err != nil {
    t.Fatalf("Unsetenv HOOKER_IGNORE: %v", err)
}

// Use:
t.Setenv("HOOKER_IGNORE", "")
// or, if the test specifically needs the var absent rather than empty:
// os.Unsetenv is fine here but requires a manual t.Cleanup:
t.Cleanup(func() { os.Setenv("HOOKER_IGNORE", os.Getenv("HOOKER_IGNORE")) })
```

The simplest fix is `t.Setenv("KEY", "")`: `envOr` treats an empty string as absent and falls back to the default.

---

### WR-05: `TestMatchEvent_ReasonDoesNotContainSensitiveFields` uses equality not substring check

**File:** `backend/internal/privacy/ignore/ignore_test.go:281`

**Issue:** The condition `if reason == sensitive || len(reason) > 0 && reason == sensitive` is logically identical to `if reason == sensitive` — the second disjunct adds nothing (operator precedence: `&&` binds tighter than `||`). More importantly, the check verifies only exact equality, not that the reason _contains_ the sensitive value as a substring. A future regression where `reason` were to embed the matched CWD (e.g., `pattern "/secret" matched cwd "/secret"`) would not be caught by this test.

**Fix:**
```go
for _, sensitive := range []string{
    "super secret prompt text",
    "tool output data",
    "old code string",
    "new code string",
} {
    if strings.Contains(reason, sensitive) {
        t.Errorf("reason contains sensitive data %q: got %q", sensitive, reason)
    }
}
```

---

### WR-06: `install.md` config table omits three environment variables introduced in this phase

**File:** `docs/install.md:69-73`

**Issue:** The configuration reference table lists only `ADDR` and `DB_PATH`. Three new env vars introduced in this phase — `HOOKER_IGNORE`, `HOOKER_CORS_ORIGINS`, and `HOOKER_ALLOW_REMOTE` — are absent from the table. `HOOKER_IGNORE` appears only in `privacy.md`. `HOOKER_CORS_ORIGINS` appears nowhere in user-facing docs. `HOOKER_ALLOW_REMOTE` is documented in `security.md` but not in the install reference. A developer consulting the configuration table will not discover these controls.

**Fix:** Expand the table:

```markdown
| Variable               | Default                       | Purpose                                      |
| ---------------------- | ----------------------------- | -------------------------------------------- |
| `ADDR`                 | `127.0.0.1:8765`              | Backend listen address                       |
| `DB_PATH`              | `backend/hooker.db`           | SQLite database path                         |
| `HOOKER_IGNORE`        | `~/.config/hooker/ignore`     | Path to gitignore-style privacy ignore file  |
| `HOOKER_CORS_ORIGINS`  | _(loopback origins for port)_ | Extra comma-separated CORS origin allowlist  |
| `HOOKER_ALLOW_REMOTE`  | _(unset)_                     | Set to `1` to allow non-loopback bind        |
```

---

## Info

### IN-01: `isLoopbackHost` accepts `"[::1]"` as a loopback value but this form never appears after `SplitHostPort`

**File:** `backend/cmd/server/main.go:132-137`

**Issue:** `isLoopbackHost` has a case for `"[::1]"` (with brackets). The only caller is `validateBind`, which first calls `net.SplitHostPort` to extract the host. `SplitHostPort` always strips brackets from IPv6 addresses, returning `"::1"` — so the `"[::1]"` case in the switch is dead code. This is low risk (the `"::1"` case correctly handles it) but the dead branch adds confusion alongside the CR-01 bug where `hostHeader` has the opposite problem.

**Fix:** Remove the `"[::1]"` case from `isLoopbackHost`:
```go
func isLoopbackHost(host string) bool {
    switch host {
    case "localhost", "127.0.0.1", "::1":
        return true
    }
    return false
}
```

---

### IN-02: `corsAllowlist` sends CORS response headers on `OPTIONS` requests without an `Origin` header

**File:** `backend/internal/server/middleware.go:61-65`

**Issue:** When `Origin` is absent and the method is `OPTIONS`, the middleware sets `Access-Control-Allow-Headers` and `Access-Control-Allow-Methods` and returns 204. A plain `OPTIONS` request with no `Origin` is not a CORS preflight — it is a regular HTTP options inquiry. Sending CORS-specific headers on it is harmless but technically incorrect and may confuse debugging tools.

**Fix:**
```go
if r.Method == http.MethodOptions {
    // Plain OPTIONS — not a CORS preflight. Let the mux handle it or return 204 without CORS headers.
    w.WriteHeader(http.StatusNoContent)
    return
}
```

---

### IN-03: `TestLoad_defaults` does not isolate against `HOOKER_CORS_ORIGINS` and `HOOKER_ALLOW_REMOTE` pollution

**File:** `backend/tests/internal/config/config_test.go:37-51`

**Issue:** `TestLoad_defaults` unsets `ADDR` and `DB_PATH` but does not unset `HOOKER_CORS_ORIGINS` or `HOOKER_ALLOW_REMOTE`. If those vars are present in the environment (e.g., set by a previous test that used `t.Setenv` and is still in scope in a parallel harness, or set in the developer's shell), the test's assertions about `CORSOrigins` length and `AllowRemote` may silently pass or fail unexpectedly.

**Fix:** Add explicit cleanup for all `Load()`-consumed env vars at the start of `TestLoad_defaults`:
```go
for _, k := range []string{"ADDR", "DB_PATH", "HOOKER_CORS_ORIGINS", "HOOKER_ALLOW_REMOTE", "HOOKER_IGNORE"} {
    t.Setenv(k, "")
}
```

---

_Reviewed: 2026-05-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
