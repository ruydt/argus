---
phase: "03"
fixed_at: "2026-05-27T08:16:00Z"
review_path: ".planning/phases/03-mature-local-product/03-REVIEW.md"
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-05-27T08:16:00Z
**Source review:** `.planning/phases/03-mature-local-product/03-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (CR-01, CR-02, CR-03, WR-01, WR-02, WR-03, WR-04, WR-05, WR-06 — plus IN-01 applied while touching main.go)
- Fixed: 9 (+ IN-01)
- Skipped: 0

## Fixed Issues

### CR-01: hostHeader IPv6 `[::1]` key mismatch

**Files modified:** `backend/internal/server/middleware.go`, `backend/tests/internal/server/router_test.go`
**Commit:** 2b2e0f6
**Applied fix:** Changed `"[::1]": true` to `"::1": true` in the `hostHeader` allowed map, since `net.SplitHostPort` always strips brackets from IPv6 addresses before comparison. Added `TestHostHeaderAllowsIPv6Loopback` to router_test.go that sends `Host: [::1]:8765` and asserts it is not rejected with 403.

### CR-02: No body size limit on POST /api/hook

**Files modified:** `backend/internal/handler/hook.go`
**Commit:** 53f490a
**Applied fix:** Added `const maxHookBodyBytes = 1 << 20` (1 MiB) and wrapped `r.Body` with `http.MaxBytesReader(w, r.Body, maxHookBodyBytes)` before `io.ReadAll`. Changed error handling to detect `*http.MaxBytesError` and return HTTP 413 instead of 400. Added `"errors"` import.

### CR-03: CORS passes non-OPTIONS disallowed-origin requests

**Files modified:** `backend/internal/server/middleware.go`
**Commit:** 2b2e0f6 (committed together with CR-01 — both in middleware.go)
**Applied fix:** In `corsAllowlist`, replaced the `if r.Method == http.MethodOptions { ... } next.ServeHTTP(w, r)` branch for disallowed origins with an unconditional `http.Error(w, "forbidden", http.StatusForbidden); return`. Non-OPTIONS requests with an Origin header not in the allowlist now also receive 403.

### WR-01: Dead duplicate loop in matchDirPattern

**Files modified:** `backend/internal/privacy/ignore/ignore.go`
**Commit:** 879a4c5 (committed together with WR-02)
**Applied fix:** Removed the duplicate `for i := 0; i <= len(candidateSegs)-pLen; i++` loop (the second identical copy with the comment "Also match if the pattern is a prefix of the candidate"). Replaced both loops with a single `matchGlobPrefix`-based approach (see WR-02).

### WR-02: `**` with zero intermediate segments not matched

**Files modified:** `backend/internal/privacy/ignore/ignore.go`, `backend/internal/privacy/ignore/ignore_test.go`
**Commit:** 879a4c5
**Applied fix:** Replaced the `matchGlobSegments` fixed-window sliding loop in `matchDirPattern` with a new `matchGlobPrefix`/`matchGlobPrefixRec` pair. This function matches a pattern against a *prefix* of a candidate segment slice (not requiring the full candidate to be consumed), so `frontend/**/dist` correctly matches `frontend/dist` (zero intermediate segments) as well as `frontend/app/dist`. Added test case `"CWD matches double star with zero intermediates"` (CWD=`/home/user/project/frontend/dist`, pattern=`frontend/**/dist/`, expected=true) to `TestMatchEvent_DoubleStarPattern`.

### WR-03: scripts/hooker doctor IPv6 ADDR false-positive warning

**Files modified:** `scripts/hooker`
**Commit:** 3d7323f
**Applied fix:** Replaced `cut -d: -f1` with a conditional that uses `sed 's/^\[//; s/\]:.*//'` for bracket-prefixed IPv6 addresses (e.g. `[::1]:8765` -> `::1`) and falls back to `cut -d: -f1` for IPv4/hostname addresses. This eliminates the false-positive non-loopback warning when `ADDR=[::1]:8765`.

### WR-04: os.Unsetenv without cleanup in config_test.go

**Files modified:** `backend/tests/internal/config/config_test.go`
**Commit:** 2fab970
**Applied fix:** Replaced all `os.Unsetenv("KEY")` patterns in `TestLoad_IgnorePath_Default`, `TestLoad_defaults`, `TestLoad_CORSOrigins_DefaultFromAddr`, and `TestLoad_AllowRemote_Default` with `t.Setenv("KEY", "")`. `t.Setenv` automatically restores the original value after each test; `envOr` treats empty string identically to absent.

### WR-05: Sensitive field check uses equality not strings.Contains

**Files modified:** `backend/internal/privacy/ignore/ignore_test.go`
**Commit:** 40f39a7
**Applied fix:** In `TestMatchEvent_ReasonDoesNotContainSensitiveFields`, replaced `reason == sensitive || len(reason) > 0 && reason == sensitive` with `strings.Contains(reason, sensitive)`. The equality check could never fire since `reason` is `"pattern X (line N)"` — a substring check is the correct guard. Added `"strings"` import.

### WR-06: install.md missing three new env vars

**Files modified:** `docs/install.md`
**Commit:** 6ee3057
**Applied fix:** Expanded the configuration table in the Configuration section to include `HOOKER_IGNORE` (path to privacy exclusion file, default `~/.config/hooker/ignore`), `HOOKER_CORS_ORIGINS` (extra comma-separated CORS origins, default derived from ADDR), and `HOOKER_ALLOW_REMOTE` (set to `1` to allow non-loopback bind).

### IN-01: Remove dead `[::1]` case from isLoopbackHost

**Files modified:** `backend/cmd/server/main.go`
**Commit:** a50f7a3
**Applied fix:** Removed `"[::1]"` from the switch cases in `isLoopbackHost`. `net.SplitHostPort` always strips brackets, so `isLoopbackHost` receives `"::1"` — the bracketed form was unreachable dead code.

## Skipped Issues

None — all findings were fixed.

---

_Fixed: 2026-05-27T08:16:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
