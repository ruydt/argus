# CONCERNS.md — Technical Debt & Concerns

**Last mapped:** 2026-05-05

---

## Bugs (Known)

### codex.ComputeUsage uses `=` instead of `+=`
**File:** `backend/internal/agents/codex/codex.go`
**Impact:** Only the last turn's token counts are accumulated — all prior turns are overwritten. Usage totals are always wrong for multi-turn sessions.
**Fix:** Change `=` to `+=` for token accumulation.

### ParseApplyPatch breaks on first `@@` hunk
**File:** `backend/internal/agents/codex/codex.go`
**Impact:** Multi-hunk patches are silently truncated. Only first hunk's diff is shown.

### `http.ListenAndServe` error silently discarded
**File:** `backend/main.go`
**Impact:** If port 8765 is already bound, server silently exits with no error message.
**Fix:** `log.Fatal(http.ListenAndServe(addr, mux))`

---

## Security

### Unauthenticated endpoints
`/api/hook` and `/api/events` have zero authentication. Protected only by loopback binding (`127.0.0.1`). Safe when ngrok is inactive.

### Arbitrary file read via `/api/session-usage`
**File:** `backend/main.go`
```go
path := r.URL.Query().Get("path")  // no prefix validation
```
Accepts any filesystem path. An attacker with network access can read any file the process has permission to read.
**Fix:** Validate path has expected prefix (e.g., `~/.claude/` or `~/.codex/`).

### Hardcoded ngrok hostname committed to git
**File:** `frontend/vite.config.ts`
`nonendemic-intermolar-exie.ngrok-free.dev` is committed. When tunnel is active, all unauthenticated endpoints become publicly reachable.

### OpenAI admin API key persisted to localStorage
**File:** `frontend/src/pages/Usage.tsx`
Key stored in `localStorage` on every keystroke. Exposed to any JS running on the page (XSS risk). Use `sessionStorage` at minimum; better: server-side secret management.

### No request body size limit on `/api/hook`
**File:** `backend/main.go`
`json.NewDecoder(r.Body).Decode(...)` reads unbounded body. An attacker can exhaust memory.
**Fix:** `http.MaxBytesReader(w, r.Body, 1<<20)` before decode.

---

## Tech Debt

### Pervasive `any` typing in frontend
All event/session data typed as `any`. No `FileEvent` interface on the frontend. Type errors in event processing are silent at runtime.

### `useOutletContext<any>()` bypasses type safety
**Files:** `frontend/src/pages/Events.tsx`, `frontend/src/pages/Usage.tsx`
Props passed through outlet context are completely untyped.

### ClaudeSession and CodexSession are near-identical duplicates
**Files:** `frontend/src/components/events/ClaudeSession.tsx`, `CodexSession.tsx`
~117 lines each, structurally identical. Render helpers (`renderDiffLines`, `renderPatchDiff`, `highlight`) are duplicated and prop-drilled 3 levels.
**Fix:** Extract shared `SessionCard` base component.

### `ToolToAction` defaults everything to `"EDIT"`
**File:** `backend/internal/events/events.go`
Any unknown tool name silently maps to `EDIT`. New tool types from future agent versions will be misclassified without warning.

### Custom `atoi` and `max` instead of stdlib
**File:** `backend/internal/agents/codex/codex.go`
`strconv.Atoi` and Go 1.21+ builtin `max` exist but custom helpers are used instead.

---

## Performance

### 1-second full-replacement polling
Frontend replaces entire event list every second. No incremental updates, no delta protocol.

### `groupEvents.sort()` mutates during render
Mutates the events array in place during React render — potential for subtle render bugs.

### `Math.max(...array.map(...))` spread on large arrays
Can hit JS call stack limits for sessions with thousands of events.

### Unbounded in-memory maps
`seen` dedup map and `sessionModel` map in the Store grow without bound. Events are capped at 1000 but these maps are never pruned.

---

## Missing Critical Features

| Feature | Impact |
|---------|--------|
| Zero persistence | All event history lost on backend restart |
| Zero tests | No safety net for any changes |
| No graceful shutdown | In-flight requests dropped on SIGTERM |
| No error boundary | Frontend crash on one bad event kills entire UI |
