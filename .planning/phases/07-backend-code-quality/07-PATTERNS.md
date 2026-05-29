# Phase 7: Backend Code Quality - Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 13 (10 modified + 2 modified for BACK-02 + 1 new)
**Analogs found:** 13 / 13

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/internal/handler/dashboard.go` | handler | request-response | `backend/internal/handler/events.go` | exact |
| `backend/internal/handler/diagnostics.go` | handler | request-response | `backend/internal/handler/projects.go` | exact |
| `backend/internal/handler/events.go` | handler | request-response | self (modify in place) | exact |
| `backend/internal/handler/file_changes.go` | handler | request-response | `backend/internal/handler/projects.go` | exact |
| `backend/internal/handler/projects.go` | handler | request-response | `backend/internal/handler/events.go` | exact |
| `backend/internal/handler/sessions.go` | handler | CRUD + request-response | self (modify in place) | exact |
| `backend/internal/handler/sessions_tree.go` | handler | request-response | `backend/internal/handler/events.go` | exact |
| `backend/internal/handler/traces.go` | handler | CRUD + request-response | self (modify in place) | exact |
| `backend/internal/handler/usage.go` | handler | request-response | `backend/internal/handler/version.go` | role-match |
| `backend/internal/handler/version.go` | handler | request-response | `backend/internal/handler/projects.go` | exact |
| `backend/internal/handler/helpers.go` | utility | — (new file, no data flow) | `backend/internal/handler/sessions.go` lines 18–29 | extract |
| `backend/tests/internal/handler/dashboard_health_usage_version_test.go` | test | request-response | `backend/tests/internal/handler/projects_sessions_traces_test.go` | exact |

---

## Pattern Assignments

### BACK-01: JSON Encode Error Handling (10 handler files)

**Analog:** Every handler file — the pattern is identical at all 14 sites.

**Current pattern to replace** (example from `backend/internal/handler/events.go` line 27):
```go
_ = json.NewEncoder(w).Encode(map[string]any{"events": events})
```

**Target pattern** (D-01, D-02 — inline at each call site, no shared helper):
```go
if err := json.NewEncoder(w).Encode(map[string]any{"events": events}); err != nil {
    log.Printf("[handler] encode %T: %v", map[string]any{}, err)
}
```

**Log format rule (D-02):** `[handler] encode %T: %v` — `%T` is the Go type of the value being encoded, matching the existing `[handler] key=val` convention from CLAUDE.md.

**Import addition needed:** `"log"` must be added to each file's import block that does not already import it. The existing import pattern (from `backend/internal/handler/dashboard.go` lines 1–9) is:
```go
import (
    "encoding/json"
    "log"
    "net/http"
    "time"

    "hooker/internal/service"
)
```

**All 14 call sites by file:**

| File | Line (approx) | Encoded value type |
|------|---------------|--------------------|
| `dashboard.go` | ~50 | `*domain.DashboardStats` (struct pointer) |
| `diagnostics.go` | ~19 | struct (return of `svc.DiagnosticsWithOptions`) |
| `events.go` | ~27 | `map[string]any{"events": events}` |
| `file_changes.go` | ~27 | `[]domain.FileChangeGroup` |
| `projects.go` | ~23 | `map[string]any{"projects": projects}` |
| `sessions.go` | ~40 | `map[string]any{"sessions":..., "total":..., ...}` |
| `sessions.go` | ~67 | `[]domain.Session` (non-paginated) |
| `sessions_tree.go` | ~25 | `map[string]any{"sessions": tree}` |
| `traces.go` | ~41 | `map[string]any{"traces":..., "total":..., ...}` |
| `traces.go` | ~56 | `map[string]any{"traces": traces}` |
| `usage.go` | ~22 | `claudecode.ComputeUsage(path)` return |
| `usage.go` | ~25 | `geminicli.ComputeUsage(path)` return |
| `usage.go` | ~28 | `codex.ComputeUsage(path)` return |
| `version.go` | ~13 | anonymous struct with `version/commit/buildDate` |

---

### BACK-02: Pagination Helper — `backend/internal/handler/helpers.go` (new file)

**Analog:** Duplicated block in `backend/internal/handler/sessions.go` lines 21–29 and `backend/internal/handler/traces.go` lines 22–29.

**Source block to extract from `sessions.go` (lines 21–29):**
```go
page, _ := strconv.Atoi(pageStr)
size, _ := strconv.Atoi(sizeStr)
if page < 1 {
    page = 1
}
if size < 1 || size > 200 {
    size = 20
}
```

**Source block to extract from `traces.go` (lines 22–29):**
```go
page, _ := strconv.Atoi(pageStr)
size, _ := strconv.Atoi(sizeStr)
if page < 1 {
    page = 1
}
if size < 1 || size > 500 {
    size = 50
}
```

**Note (D-05):** The two blocks differ in their `size` clamp bounds (sessions: 1–200, default 20; traces: 1–500, default 50). The helper must accept `minSize`, `maxSize`, and `defaultSize` parameters — or separate `defaultSize`/`maxSize` parameters — to preserve both behaviors without behavior change.

**New file structure for `helpers.go`:**
```go
package handler

import "strconv"

// parsePageSize parses page and size query params with silent-default behavior.
// strconv.Atoi failures default to 0, which is then clamped to the safe floor.
// No logging for invalid params (D-05: DRY extraction only, no behavior change).
func parsePageSize(pageStr, sizeStr string, defaultSize, maxSize int) (page, size int) {
    page, _ = strconv.Atoi(pageStr)
    size, _ = strconv.Atoi(sizeStr)
    if page < 1 {
        page = 1
    }
    if size < 1 || size > maxSize {
        size = defaultSize
    }
    return
}
```

**Replacement call in `sessions.go` (replaces lines 22–29):**
```go
page, size := parsePageSize(pageStr, sizeStr, 20, 200)
```

**Replacement call in `traces.go` (replaces lines 23–29):**
```go
page, size := parsePageSize(pageStr, sizeStr, 50, 500)
```

---

### BACK-03: New Test File — `backend/tests/internal/handler/dashboard_health_usage_version_test.go`

**Analog:** `backend/tests/internal/handler/projects_sessions_traces_test.go` (exact pattern — grouped multi-handler tests in one file, black-box package).

**Package and import pattern** (from `projects_sessions_traces_test.go` lines 1–12):
```go
package handler_test

import (
    "encoding/json"
    "net/http"
    "net/http/httptest"
    "testing"

    "hooker/internal/handler"
)
```

**`newTestService(t)` helper** (from `hook_test.go` lines 32–39) — reuse directly, defined once in `hook_test.go`, available to all files in `package handler_test`:
```go
func newTestService(t *testing.T) *service.EventService {
    t.Helper()
    db, err := sqlite.New(":memory:")
    if err != nil {
        t.Fatalf("sqlite.New: %v", err)
    }
    return service.New(db)
}
```

**Happy-path smoke test structure** (D-07 — HTTP 200, valid JSON, no panics; from `projects_sessions_traces_test.go` lines 14–45):
```go
func TestDashboardStatsReturns200(t *testing.T) {
    svc := newTestService(t)
    h := handler.DashboardStats(svc)
    req := httptest.NewRequest(http.MethodGet, "/api/dashboard/stats", nil)
    rec := httptest.NewRecorder()
    h.ServeHTTP(rec, req)

    if rec.Code != http.StatusOK {
        t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
    }
    // Optionally decode to confirm valid JSON
    var payload any
    if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
        t.Fatalf("response is not valid JSON: %v", err)
    }
}
```

**Health handler test pattern** — `Healthz()` takes no args; `Readyz(ready func() bool)` takes a ready func:
```go
func TestHealthzReturns200(t *testing.T) {
    h := handler.Healthz()
    req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
    rec := httptest.NewRecorder()
    h.ServeHTTP(rec, req)
    if rec.Code != http.StatusOK {
        t.Fatalf("status = %d, want 200", rec.Code)
    }
}
```

**Usage handler test pattern** — requires `?path=` query param; no `*service.EventService` needed (handler takes no svc):
```go
func TestUsageHandlerReturnsBadRequestWithoutPath(t *testing.T) {
    h := handler.Usage()
    req := httptest.NewRequest(http.MethodGet, "/api/usage", nil)
    rec := httptest.NewRecorder()
    h.ServeHTTP(rec, req)
    if rec.Code != http.StatusBadRequest {
        t.Fatalf("status = %d, want 400", rec.Code)
    }
}
```

**Version handler test pattern** — no svc, no params:
```go
func TestVersionReturns200WithJSON(t *testing.T) {
    h := handler.Version()
    req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
    rec := httptest.NewRecorder()
    h.ServeHTTP(rec, req)
    if rec.Code != http.StatusOK {
        t.Fatalf("status = %d, want 200", rec.Code)
    }
    var payload struct {
        Version   string `json:"version"`
        Commit    string `json:"commit"`
        BuildDate string `json:"buildDate"`
    }
    if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
        t.Fatalf("response is not valid JSON: %v", err)
    }
}
```

**Five handlers to cover (D-09):** `dashboard`, `file_changes`, `health`, `usage`, `version`.

**`file_changes` handler note:** Requires `?session_id=` query param; returns 400 without it. For a 200 smoke test, either seed an event via `addHandlerEvent` or test the 400 path as the smoke test.

---

## Shared Patterns

### Handler constructor signature
**Source:** All handlers in `backend/internal/handler/*.go`
**Apply to:** `helpers.go` (no constructor needed — package-level function only)
```go
func HandlerName(svc *service.EventService) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // ...
    })
}
```

### JSON response pattern (before BACK-01 fix)
**Source:** `backend/internal/handler/events.go` line 26–27
```go
w.Header().Set("Content-Type", "application/json")
_ = json.NewEncoder(w).Encode(v)
```

### Error response pattern
**Source:** `backend/internal/handler/events.go` lines 21–24
```go
if err != nil {
    http.Error(w, "list events", http.StatusInternalServerError)
    return
}
```

### Logging convention
**Source:** CLAUDE.md and `backend/internal/handler/hook.go`
**Apply to:** All 14 encode sites after BACK-01
```go
log.Printf("[handler] encode %T: %v", v, err)
```

### Test helper reuse
**Source:** `backend/tests/internal/handler/hook_test.go` lines 32–39 (`newTestService`) and lines 127–135 (`addHandlerEvent` in `projects_sessions_traces_test.go`)
**Apply to:** `dashboard_health_usage_version_test.go` — both helpers are in `package handler_test` and available without re-declaration.

---

## No Analog Found

All files have close analogs. No entries.

---

## Metadata

**Analog search scope:** `backend/internal/handler/`, `backend/tests/internal/handler/`
**Files scanned:** 14 handler source files, 3 test files
**Pattern extraction date:** 2026-05-29
