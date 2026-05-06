# Phase 9 — Server Router + Middleware

> **Status:** ⬜ Pending — update STATUS.md to ✅ when done

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

**Repo:** `/Users/duytran/GitHub/codex-test` | **Backend:** `backend/` | **Module:** `agent-monitor` | **Go:** 1.23

**Goal:** Wire all handlers into a single `http.Handler` with logging and CORS middleware. Uses Go 1.22 `http.ServeMux` method+pattern routing (`"POST /api/hook"`).

**Depends on:** Phase 6 (service), Phase 8 (handlers)

**Next phase:** [phase-10-wire-cleanup.md](phase-10-wire-cleanup.md)

---

## Files

| Action | Path |
|--------|------|
| Create | `backend/internal/server/middleware.go` |
| Create | `backend/internal/server/router.go` |
| Create | `backend/internal/server/router_test.go` |

---

## Steps

- [ ] **Step 1: Write failing router test**

```go
// backend/internal/server/router_test.go
package server_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"agent-monitor/internal/domain"
	"agent-monitor/internal/server"
	"agent-monitor/internal/service"
)

type noopRepo struct{}

func (noopRepo) Add(domain.NormalizedEvent) error { return nil }
func (noopRepo) List(int) ([]domain.NormalizedEvent, error) { return nil, nil }
func (noopRepo) SessionModel(string) (string, error) { return "", nil }
func (noopRepo) UpsertSession(string, string, string, string, string, string) error { return nil }

func newTestRouter() http.Handler {
	return server.NewRouter(service.New(noopRepo{}))
}

func TestNewRouter_optionsReturnsCORSHeaders(t *testing.T) {
	req := httptest.NewRequest(http.MethodOptions, "/api/hook", nil)
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("allow-origin = %q, want *", rec.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestNewRouter_openAIRouteIsGETOnly(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/openai/models", nil)
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && go test ./internal/server/...
```

Expected: FAIL — `no Go files in .../server`

- [ ] **Step 3: Create `backend/internal/server/middleware.go`**

```go
package server

import (
	"log"
	"net/http"
	"time"
)

func logging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
```

- [ ] **Step 4: Create `backend/internal/server/router.go`**

```go
package server

import (
	"net/http"

	"agent-monitor/internal/handler"
	"agent-monitor/internal/service"
)

func NewRouter(svc *service.EventService) http.Handler {
	mux := http.NewServeMux()

	mux.Handle("POST /api/hook", handler.Hook(svc))
	mux.Handle("GET /api/events", handler.Events(svc))
	mux.Handle("GET /api/events/stream", handler.EventsStream(svc))
	mux.Handle("GET /api/session-usage", handler.Usage())
	mux.Handle("GET /api/openai/", handler.OpenAIProxy())

	return cors(logging(mux))
}
```

- [ ] **Step 5: Run tests**

```bash
cd backend && go test ./internal/server/...
```

Expected: `ok  agent-monitor/internal/server`

- [ ] **Step 6: Commit**

```bash
git add backend/internal/server/
git commit -m "feat(server): add router with CORS and logging middleware"
```

- [ ] **Step 7: Mark complete — update STATUS.md phase 9 to ✅**
