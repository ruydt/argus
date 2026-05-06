# Phase 8 — HTTP Handlers

> **Status:** ⬜ Pending — update STATUS.md to ✅ when done

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

**Repo:** `/Users/duytran/GitHub/codex-test` | **Backend:** `backend/` | **Module:** `agent-monitor` | **Go:** 1.23

**Goal:** Four handler files — one per route group. Handlers are thin: decode → call service → encode. All business logic stays in the service layer.

**Depends on:** Phase 1 (domain), Phase 3 (fileutil), Phase 6 (service), Phase 7 (agent adapters)

**Next phase:** [phase-09-router.md](phase-09-router.md)

---

## Files

| Action | Path |
|--------|------|
| Create | `backend/internal/handler/hook.go` |
| Create | `backend/internal/handler/events.go` |
| Create | `backend/internal/handler/usage.go` |
| Create | `backend/internal/handler/proxy.go` |
| Create | `backend/internal/handler/hook_test.go` |

---

## Steps

- [ ] **Step 1: Write failing hook handler test**

```go
// backend/internal/handler/hook_test.go
package handler_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"agent-monitor/internal/handler"
	"agent-monitor/internal/repository/sqlite"
	"agent-monitor/internal/service"
)

func newTestService(t *testing.T) *service.EventService {
	t.Helper()
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	return service.New(db)
}

func TestHookHandler_rejectsGET(t *testing.T) {
	h := handler.Hook(newTestService(t))
	req := httptest.NewRequest(http.MethodGet, "/api/hook", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("status = %d, want 405", rec.Code)
	}
}

func TestHookHandler_acceptsValidPayload(t *testing.T) {
	h := handler.Hook(newTestService(t))

	body := []byte(`{
		"session_id": "s1",
		"transcript_path": "/home/user/.claude/sessions/abc.jsonl",
		"hook_event_name": "PreToolUse",
		"tool_name": "Edit",
		"tool_use_id": "tu1",
		"turn_id": "t1",
		"cwd": "/tmp",
		"tool_input": {"file_path": "foo.go"}
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}
}

func TestHookHandler_rejectsBadJSON(t *testing.T) {
	h := handler.Hook(newTestService(t))
	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader([]byte(`not json`)))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && go test ./internal/handler/...
```

Expected: FAIL — `no Go files in .../handler`

- [ ] **Step 3: Create `backend/internal/handler/hook.go`**

```go
package handler

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"agent-monitor/internal/agents/claudecode"
	"agent-monitor/internal/agents/codex"
	"agent-monitor/internal/domain"
	"agent-monitor/internal/fileutil"
	"agent-monitor/internal/service"
)

func Hook(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		raw, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "read body", http.StatusBadRequest)
			return
		}

		// Detect agent via transcript path using the shared RawPayload.
		var meta domain.RawPayload
		if err := json.Unmarshal(raw, &meta); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		var e domain.NormalizedEvent
		if claudecode.MatchesTranscript(meta.TranscriptPath) {
			e, err = claudecode.Normalize(raw)
		} else {
			e, err = codex.Normalize(raw)
		}
		if err != nil {
			http.Error(w, "normalize payload", http.StatusBadRequest)
			return
		}

		// Only store events with a resolvable path (preserves original behaviour).
		if e.Path == "" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{}`))
			return
		}

		// Enrich with line context by reading the file on disk.
		e = enrichContext(e)

		// Fall back to cached session model if this event didn't carry one.
		if e.Model == "" && e.Session != "" {
			if m, _ := svc.SessionModel(e.Session); m != "" {
				e.Model = m
			}
		}

		log.Printf("[hook] agent=%s session=%s tool=%s action=%s path=%s",
			e.Agent, e.Session, e.Tool, e.Action, e.Path)

		if err := svc.AddEvent(e); err != nil {
			http.Error(w, "store event", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{}`))
	})
}

// enrichContext computes start_line and surrounding context lines by reading
// the file on disk. Called after normalization, before storage.
func enrichContext(e domain.NormalizedEvent) domain.NormalizedEvent {
	if e.Action == "BASH" || e.Path == "" {
		return e
	}
	if e.HookEventName == "PreToolUse" && e.OldString != "" {
		if sl := fileutil.FindStartLine(e.Path, e.OldString); sl > 0 {
			e.StartLine = sl
			e.CtxBefore, e.CtxAfter = fileutil.ComputeContext(
				e.Path, sl, len(strings.Split(e.OldString, "\n")), 3,
			)
		}
	} else if e.HookEventName == "PostToolUse" && e.NewString != "" {
		if sl := fileutil.FindStartLine(e.Path, e.NewString); sl > 0 {
			e.StartLine = sl
			e.CtxBefore, e.CtxAfter = fileutil.ComputeContext(
				e.Path, sl, len(strings.Split(e.NewString, "\n")), 3,
			)
		}
	}
	return e
}
```

- [ ] **Step 4: Create `backend/internal/handler/events.go`**

```go
package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"agent-monitor/internal/service"
)

// Events returns all stored events as JSON.
func Events(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		events, err := svc.ListEvents(1000)
		if err != nil {
			http.Error(w, "list events", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"events": events})
	})
}

// EventsStream opens an SSE connection. It first sends all existing events
// (initial hydration), then streams new events as they arrive.
// Frontend: replace setInterval polling with:
//
//	const es = new EventSource('http://localhost:8765/api/events/stream')
//	es.onmessage = (e) => { const event = JSON.parse(e.data); /* append */ }
func EventsStream(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		// Initial hydration: send all existing events so the client doesn't
		// need a separate GET /api/events call on startup.
		if existing, err := svc.ListEvents(1000); err == nil {
			for _, e := range existing {
				sendSSE(w, e)
			}
			flusher.Flush()
		}

		ch := svc.Subscribe()
		defer svc.Unsubscribe(ch)

		for {
			select {
			case e, ok := <-ch:
				if !ok {
					return
				}
				sendSSE(w, e)
				flusher.Flush()
			case <-r.Context().Done():
				return
			}
		}
	})
}

func sendSSE(w http.ResponseWriter, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	fmt.Fprintf(w, "data: %s\n\n", b)
}
```

- [ ] **Step 5: Create `backend/internal/handler/usage.go`**

```go
package handler

import (
	"encoding/json"
	"net/http"

	"agent-monitor/internal/agents/claudecode"
	"agent-monitor/internal/agents/codex"
)

func Usage() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Query().Get("path")
		if path == "" {
			http.Error(w, "missing path", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if claudecode.MatchesTranscript(path) {
			json.NewEncoder(w).Encode(claudecode.ComputeUsage(path))
			return
		}
		json.NewEncoder(w).Encode(codex.ComputeUsage(path))
	})
}
```

- [ ] **Step 6: Create `backend/internal/handler/proxy.go`**

```go
package handler

import (
	"io"
	"net/http"
	"strings"
)

// OpenAIProxy forwards GET requests to the OpenAI organization API.
// The Authorization header from the client is passed through unchanged.
// Upstream status code and body are preserved verbatim.
func OpenAIProxy() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiKey := r.Header.Get("Authorization")
		if apiKey == "" {
			http.Error(w, "missing auth", http.StatusUnauthorized)
			return
		}

		path := strings.TrimPrefix(r.URL.Path, "/api/openai/")
		targetURL := "https://api.openai.com/v1/organization/" + path

		req, err := http.NewRequest(http.MethodGet, targetURL+"?"+r.URL.RawQuery, nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		req.Header.Set("Authorization", apiKey)
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	})
}
```

- [ ] **Step 7: Run tests**

```bash
cd backend && go test ./internal/handler/...
```

Expected: `ok  agent-monitor/internal/handler`

- [ ] **Step 8: Commit**

```bash
git add backend/internal/handler/
git commit -m "feat(handler): add Hook, Events, EventsStream, Usage, OpenAIProxy handlers"
```

- [ ] **Step 9: Mark complete — update STATUS.md phase 8 to ✅**
