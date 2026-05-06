# Phase 1 — Domain Types

> **Status:** ⬜ Pending — update STATUS.md to ✅ when done

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

**Repo:** `/Users/duytran/GitHub/codex-test` | **Backend:** `backend/` | **Module:** `agent-monitor` | **Go:** 1.23

**Goal:** Create pure domain types shared across all layers. No external dependencies.

**Depends on:** nothing — start here.

**Next phase:** [phase-02-config.md](phase-02-config.md)

---

## Files

| Action | Path |
|--------|------|
| Create | `backend/internal/domain/event.go` |
| Create | `backend/internal/domain/hook.go` |

---

## Steps

- [ ] **Step 1: Create `backend/internal/domain/event.go`**

```go
package domain

// NormalizedEvent is the canonical representation of a hook event from any agent.
// JSON tags match the original FileEvent wire format — frontend requires no changes.
type NormalizedEvent struct {
	Time           string    `json:"time"`
	Action         string    `json:"action,omitempty"`
	Path           string    `json:"path,omitempty"`
	Command        string    `json:"command,omitempty"`
	Session        string    `json:"session,omitempty"`
	TranscriptPath string    `json:"transcript_path,omitempty"`
	Tool           string    `json:"tool,omitempty"`
	HookEventName  string    `json:"hook_event_name,omitempty"`
	TurnID         string    `json:"turn_id,omitempty"`
	ToolUseID      string    `json:"tool_use_id,omitempty"`
	Source         string    `json:"source,omitempty"`
	Model          string    `json:"model,omitempty"`
	CWD            string    `json:"cwd,omitempty"`
	Prompt         string    `json:"prompt,omitempty"`
	Description    string    `json:"description,omitempty"`
	OldString      string    `json:"old_string,omitempty"`
	NewString      string    `json:"new_string,omitempty"`
	StartLine      int       `json:"start_line,omitempty"`
	CtxBefore      []CtxLine `json:"ctx_before,omitempty"`
	CtxAfter       []CtxLine `json:"ctx_after,omitempty"`
	Agent          string    `json:"agent,omitempty"`
	RawPayload     []byte    `json:"-"`
}

type CtxLine struct {
	Num  int    `json:"num"`
	Text string `json:"text"`
}
```

- [ ] **Step 2: Create `backend/internal/domain/hook.go`**

```go
package domain

// RawPayload captures the shared hook fields present across all agent schemas.
// Agent-specific fields are handled by each agent's Normalize() function.
type RawPayload struct {
	SessionID      string    `json:"session_id"`
	TranscriptPath string    `json:"transcript_path"`
	CWD            string    `json:"cwd"`
	HookEventName  string    `json:"hook_event_name"`
	Model          string    `json:"model"`
	Source         string    `json:"source"`
	TurnID         string    `json:"turn_id"`
	ToolName       string    `json:"tool_name"`
	ToolUseID      string    `json:"tool_use_id"`
	Prompt         string    `json:"prompt"`
	FilePath       string    `json:"file_path"`
	ToolInput      ToolInput `json:"tool_input"`
}

type ToolInput struct {
	FilePath    string `json:"file_path"`
	Command     string `json:"command"`
	Description string `json:"description"`
	OldString   string `json:"old_string"`
	NewString   string `json:"new_string"`
	OldStr      string `json:"old_str"`
	NewStr      string `json:"new_str"`
}
```

- [ ] **Step 3: Verify package compiles**

```bash
cd backend && go build ./internal/domain/...
```

Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/domain/
git commit -m "feat(domain): add NormalizedEvent and RawPayload types"
```

- [ ] **Step 5: Mark complete — update STATUS.md phase 1 to ✅**
