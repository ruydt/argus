# Phase 7 — Agent Adapters (Add Normalize)

> **Status:** ⬜ Pending — update STATUS.md to ✅ when done

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

**Repo:** `/Users/duytran/GitHub/codex-test` | **Backend:** `backend/` | **Module:** `agent-monitor` | **Go:** 1.23

**Goal:** Add `Normalize(raw []byte) (domain.NormalizedEvent, error)` and `AgentName() string` to both existing agent packages. These are the only changes to `internal/agents/` — all existing parsing functions stay untouched.

**Depends on:** Phase 1 (domain), Phase 3 (fileutil)

**Next phase:** [phase-08-handlers.md](phase-08-handlers.md)

---

## Files

| Action | Path |
|--------|------|
| Create | `backend/internal/agents/claudecode/normalize_test.go` |
| Create | `backend/internal/agents/codex/normalize_test.go` |
| Modify | `backend/internal/agents/claudecode/claudecode.go` |
| Modify | `backend/internal/agents/codex/codex.go` |

---

## Current state of these files

Both files already exist with parsing logic. You are **appending** new functions only — do not remove or change existing functions.

- `claudecode.go` already has: `MatchesTranscript`, `Diff`, `ModelFromTranscript`, `ComputeUsage`
- `codex.go` already has: `MatchesTranscript`, `Diff`, `ParseApplyPatch`, `ComputeUsage`, `atoi`

---

## Steps

- [ ] **Step 1: Write failing normalization tests**

```go
// backend/internal/agents/claudecode/normalize_test.go
package claudecode_test

import (
	"testing"

	"agent-monitor/internal/agents/claudecode"
)

func TestNormalize_editPayload(t *testing.T) {
	raw := []byte(`{
		"session_id":"s1",
		"transcript_path":"/home/user/.claude/sessions/abc.jsonl",
		"cwd":"/tmp",
		"hook_event_name":"PreToolUse",
		"model":"claude-opus-4-1",
		"source":"startup",
		"turn_id":"t1",
		"tool_name":"Edit",
		"tool_use_id":"u1",
		"prompt":"p",
		"tool_input":{
			"file_path":"foo.go",
			"description":"edit foo",
			"old_string":"old line",
			"new_string":"new line"
		}
	}`)

	got, err := claudecode.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.Agent != "claudecode" {
		t.Errorf("Agent = %q, want claudecode", got.Agent)
	}
	if got.Path != "/tmp/foo.go" {
		t.Errorf("Path = %q, want /tmp/foo.go", got.Path)
	}
	if got.Action != "EDIT" {
		t.Errorf("Action = %q, want EDIT", got.Action)
	}
	if got.OldString != "old line" || got.NewString != "new line" {
		t.Errorf("diff = (%q, %q), want old/new lines", got.OldString, got.NewString)
	}
}
```

```go
// backend/internal/agents/codex/normalize_test.go
package codex_test

import (
	"testing"

	"agent-monitor/internal/agents/codex"
)

func TestNormalize_applyPatchFallsBackToCommandDiff(t *testing.T) {
	raw := []byte(`{
		"session_id":"s2",
		"transcript_path":"/tmp/codex-session.jsonl",
		"cwd":"/tmp",
		"hook_event_name":"PostToolUse",
		"turn_id":"t2",
		"tool_name":"apply_patch",
		"tool_use_id":"u2",
		"tool_input":{
			"file_path":"foo.go",
			"command":"*** Begin Patch\n*** Update File: foo.go\n@@ -1 +1 @@\n-old line\n+new line\n*** End Patch\n"
		}
	}`)

	got, err := codex.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.Agent != "codex" {
		t.Errorf("Agent = %q, want codex", got.Agent)
	}
	if got.Path != "/tmp/foo.go" {
		t.Errorf("Path = %q, want /tmp/foo.go", got.Path)
	}
	if got.OldString != "old line" || got.NewString != "new line" {
		t.Errorf("diff = (%q, %q), want old/new lines", got.OldString, got.NewString)
	}
}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && go test ./internal/agents/...
```

Expected: FAIL — `undefined: Normalize` in both agent packages.

- [ ] **Step 3: Add imports and functions to `backend/internal/agents/claudecode/claudecode.go`**

Add these imports to the existing import block (merge with existing):

```go
import (
    "bufio"
    "encoding/json"
    "os"
    "strings"

    "agent-monitor/internal/domain"
    "agent-monitor/internal/fileutil"
)
```

Append these functions at the bottom of the file:

```go
func AgentName() string { return "claudecode" }

func Normalize(raw []byte) (domain.NormalizedEvent, error) {
	var p domain.RawPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return domain.NormalizedEvent{}, err
	}

	path := fileutil.ResolvePath(p.CWD, firstNonEmpty(p.ToolInput.FilePath, p.FilePath))
	cmd := p.ToolInput.Command
	action := fileutil.ToolToAction(p.ToolName)

	if path == "" && cmd != "" && action != "BASH" {
		path = fileutil.ExtractPathFromCommand(cmd)
	}

	displayPath := path
	if action == "BASH" && cmd != "" {
		displayPath = "cmd: " + cmd
	}

	oldStr, newStr := Diff(DiffInput{
		OldString: firstNonEmpty(p.ToolInput.OldString, p.ToolInput.OldStr),
		NewString: firstNonEmpty(p.ToolInput.NewString, p.ToolInput.NewStr),
	})

	return domain.NormalizedEvent{
		Agent:          AgentName(),
		Session:        p.SessionID,
		HookEventName:  p.HookEventName,
		TurnID:         p.TurnID,
		ToolUseID:      p.ToolUseID,
		Tool:           p.ToolName,
		Model:          p.Model,
		Source:         p.Source,
		CWD:            p.CWD,
		TranscriptPath: p.TranscriptPath,
		Prompt:         p.Prompt,
		Description:    p.ToolInput.Description,
		Action:         action,
		Path:           displayPath,
		Command:        cmd,
		OldString:      oldStr,
		NewString:      newStr,
		RawPayload:     raw,
	}, nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
```

- [ ] **Step 4: Add imports and functions to `backend/internal/agents/codex/codex.go`**

Add these imports to the existing import block (merge with existing):

```go
import (
    "bufio"
    "encoding/json"
    "os"
    "regexp"
    "strings"

    "agent-monitor/internal/domain"
    "agent-monitor/internal/fileutil"
)
```

Append these functions at the bottom of the file:

```go
func AgentName() string { return "codex" }

func Normalize(raw []byte) (domain.NormalizedEvent, error) {
	var p domain.RawPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return domain.NormalizedEvent{}, err
	}

	path := fileutil.ResolvePath(p.CWD, firstNonEmpty(p.ToolInput.FilePath, p.FilePath))
	cmd := p.ToolInput.Command
	action := fileutil.ToolToAction(p.ToolName)

	if path == "" && cmd != "" && action != "BASH" {
		path = fileutil.ExtractPathFromCommand(cmd)
	}

	displayPath := path
	if action == "BASH" && cmd != "" {
		displayPath = "cmd: " + cmd
	}

	oldStr, newStr := Diff(DiffInput{
		OldStr: firstNonEmpty(p.ToolInput.OldStr, p.ToolInput.OldString),
		NewStr: firstNonEmpty(p.ToolInput.NewStr, p.ToolInput.NewString),
	})

	// apply_patch carries diff in command body; handler enriches line context later.
	if oldStr == "" && newStr == "" && strings.Contains(strings.ToLower(p.ToolName), "apply_patch") {
		oldStr, newStr, _ = ParseApplyPatch(cmd)
	}

	return domain.NormalizedEvent{
		Agent:          AgentName(),
		Session:        p.SessionID,
		HookEventName:  p.HookEventName,
		TurnID:         p.TurnID,
		ToolUseID:      p.ToolUseID,
		Tool:           p.ToolName,
		Model:          p.Model,
		Source:         p.Source,
		CWD:            p.CWD,
		TranscriptPath: p.TranscriptPath,
		Prompt:         p.Prompt,
		Description:    p.ToolInput.Description,
		Action:         action,
		Path:           displayPath,
		Command:        cmd,
		OldString:      oldStr,
		NewString:      newStr,
		RawPayload:     raw,
	}, nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
```

- [ ] **Step 5: Run tests**

```bash
cd backend && go test ./internal/agents/...
```

Expected: `ok` for both packages.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/agents/
git commit -m "feat(agents): add Normalize() and AgentName() to claudecode and codex adapters"
```

- [ ] **Step 7: Mark complete — update STATUS.md phase 7 to ✅**
