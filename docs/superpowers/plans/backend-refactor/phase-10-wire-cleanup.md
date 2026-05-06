# Phase 10 — Wire Up + Cleanup

> **Status:** ⬜ Pending — update STATUS.md to ✅ when done

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

**Repo:** `/Users/duytran/GitHub/codex-test` | **Backend:** `backend/` | **Module:** `agent-monitor` | **Go:** 1.23

**Goal:** Create `cmd/server/main.go`, delete the old `main.go` and `internal/events/events.go`, update Dockerfile, verify full build + test suite passes.

**Depends on:** All previous phases (1–9)

**This is the final phase.**

---

## Files

| Action | Path |
|--------|------|
| Create | `backend/cmd/server/main.go` |
| Delete | `backend/main.go` |
| Delete | `backend/internal/events/events.go` |
| Modify | `Dockerfile` (root of repo) |

---

## Steps

- [ ] **Step 1: Create `backend/cmd/server/main.go`**

```go
package main

import (
	"log"
	"net/http"

	"agent-monitor/internal/config"
	"agent-monitor/internal/repository/sqlite"
	"agent-monitor/internal/server"
	"agent-monitor/internal/service"
)

func main() {
	cfg := config.Load()

	repo, err := sqlite.New(cfg.DBPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}

	svc := service.New(repo)
	h := server.NewRouter(svc)

	log.Printf("hook endpoint  → POST http://%s/api/hook", cfg.Addr)
	log.Printf("events SSE     → GET  http://%s/api/events/stream", cfg.Addr)
	log.Printf("db             → %s", cfg.DBPath)

	if err := http.ListenAndServe(cfg.Addr, h); err != nil {
		log.Fatalf("listen: %v", err)
	}
}
```

- [ ] **Step 2: Build cmd/server**

```bash
cd backend && go build ./cmd/server/
```

Expected: produces `./server` binary, no errors.

- [ ] **Step 3: Run full test suite**

```bash
cd backend && go test ./...
```

Expected: all packages pass. If any package fails due to a lingering import of `agent-monitor/internal/events`, fix that import now before proceeding.

- [ ] **Step 4: Delete old files**

```bash
rm backend/main.go
rm backend/internal/events/events.go
```

- [ ] **Step 5: Rebuild to confirm no broken imports**

```bash
cd backend && go build ./...
```

Expected: no output, exit 0.

- [ ] **Step 6: Run tests again after deletion**

```bash
cd backend && go test ./...
```

Expected: all packages pass.

- [ ] **Step 7: Update Dockerfile**

The root `Dockerfile` currently references `main.go` directly. Replace its entire content with:

```dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN go build -o agent-monitor ./cmd/server

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /app/agent-monitor .
EXPOSE 8765
CMD ["./agent-monitor"]
```

- [ ] **Step 8: Final commit**

```bash
git add backend/cmd/ Dockerfile
git rm backend/main.go backend/internal/events/events.go
git commit -m "feat: wire up cmd/server/main.go, delete old main.go and events package

Backend now follows golang-standards/project-layout:
- cmd/server/main.go wires config -> sqlite repo -> service -> router
- SQLite persistence via modernc.org/sqlite (no CGO)
- SSE stream at /api/events/stream replaces frontend polling
- Agent adapter pattern: Normalize() per agent, raw_payload stored for extensibility
- hook_events + sessions tables replace in-memory Store"
```

- [ ] **Step 9: Smoke test (manual)**

```bash
cd backend && ./server
```

Expected output:
```
hook endpoint  → POST http://127.0.0.1:8765/api/hook
events SSE     → GET  http://127.0.0.1:8765/api/events/stream
db             → agent-monitor.db
```

In a second terminal:
```bash
curl -s http://localhost:8765/api/events | head -c 100
```

Expected: `{"events":[]}`

```bash
curl -s -N http://localhost:8765/api/events/stream &
curl -s -X POST http://localhost:8765/api/hook \
  -H "Content-Type: application/json" \
  -d '{"session_id":"s1","transcript_path":"/home/.claude/x.jsonl","hook_event_name":"PreToolUse","tool_name":"Edit","tool_use_id":"u1","turn_id":"t1","cwd":"/tmp","tool_input":{"file_path":"foo.go"}}'
```

Expected: SSE stream prints a `data: {...}` line within 1 second.

Kill the background curl with `kill %1` when done.

- [ ] **Step 10: Mark complete — update STATUS.md phase 10 to ✅**
