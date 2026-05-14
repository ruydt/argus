# Gemini CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class support for Gemini CLI agent monitoring.

**Architecture:** Create a new `geminicli` agent package in the backend and a corresponding agent configuration in the frontend. Implement transcript-based token usage computation for Gemini CLI sessions.

**Tech Stack:** Go (Backend), React/TypeScript (Frontend).

---

### Task 1: Backend `geminicli` Package

**Files:**
- Create: `backend/internal/agents/geminicli/geminicli.go`
- Test: `backend/tests/internal/agents/geminicli/normalize_test.go`

- [ ] **Step 1: Create `geminicli` package with normalization logic**

```go
package geminicli

import (
	"encoding/json"
	"strings"

	"hooker/internal/domain"
	"hooker/internal/fileutil"
)

func AgentName() string {
	return "geminicli"
}

func MatchesTranscript(transcriptPath string) bool {
	return strings.Contains(transcriptPath, "/.gemini/")
}

func Normalize(raw []byte) (domain.NormalizedEvent, error) {
	var p domain.RawPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return domain.NormalizedEvent{}, err
	}

	path := fileutil.ResolvePath(p.CWD, firstNonEmpty(p.ToolInput.FilePath, p.FilePath))
	cmd := p.ToolInput.Command
	action := fileutil.HookEventAction(p.HookEventName)
	if action == "" {
		action = fileutil.ToolToAction(p.ToolName)
	}

	displayPath := path
	if action == "BASH" && cmd != "" {
		displayPath = "cmd: " + cmd
	}

	return domain.NormalizedEvent{
		Agent:               AgentName(),
		Session:             p.SessionID,
		HookEventName:       p.HookEventName,
		TurnID:              p.TurnID,
		ToolUseID:           p.ToolUseID,
		Tool:                p.ToolName,
		Model:               p.Model,
		Source:              p.Source,
		CWD:                 p.CWD,
		TranscriptPath:      p.TranscriptPath,
		Prompt:              p.Prompt,
		Description:         p.ToolInput.Description,
		Action:              action,
		Path:                displayPath,
		Command:             cmd,
		OldString:           firstNonEmpty(p.ToolInput.OldString, p.ToolInput.OldStr),
		NewString:           firstNonEmpty(p.ToolInput.NewString, p.ToolInput.NewStr, p.ToolInput.Content),
		RawPayload:          raw,
		PermissionMode:      p.PermissionMode,
		Response:            firstNonEmpty(p.Response, p.LastAssistantMessage),
		ErrorMessage:        firstNonEmpty(p.ErrorMessage, p.Error),
		ErrorType:           p.ErrorType,
		SubagentID:          p.AgentID,
		SubagentType:        p.AgentType,
		TaskID:              p.TaskID,
		TaskTitle:           p.TaskTitle,
		TaskDescription:     p.TaskDescription,
		NotificationType:    p.NotificationType,
		NotificationTitle:   p.Title,
		NotificationMessage: p.Message,
		ChangeType:          p.ChangeType,
		OldCWD:              p.OldCWD,
		NewCWD:              p.NewCWD,
		DurationMS:          p.DurationMS,
		Trigger:             p.Trigger,
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

// ComputeUsage placeholder for now
func ComputeUsage(transcriptPath string) domain.SessionUsage {
	return domain.SessionUsage{}
}

func ComputeUsageBreakdown(transcriptPath string) domain.UsageBreakdown {
	return domain.UsageBreakdown{}
}
```

- [ ] **Step 2: Write normalization test**

```go
package geminicli_test

import (
	"testing"
	"hooker/internal/agents/geminicli"
)

func TestNormalizeGeminiPayload(t *testing.T) {
	raw := []byte(`{
		"session_id":"gemini-1",
		"transcript_path":"/home/user/.gemini/history/proj/session.jsonl",
		"cwd":"/tmp",
		"hook_event_name":"PreToolUse",
		"model":"gemini-1.5-pro",
		"tool_name":"run_shell_command",
		"tool_input":{
			"command":"ls -al"
		}
	}`)

	got, err := geminicli.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize: %v", err)
	}
	if got.Agent != "geminicli" {
		t.Errorf("Agent = %q, want geminicli", got.Agent)
	}
	if got.Action != "BASH" {
		t.Errorf("Action = %q, want BASH", got.Action)
	}
}
```

- [ ] **Step 3: Run tests**

Run: `go test ./internal/agents/geminicli/...` (or equivalent test command)

### Task 2: Wire Gemini CLI into Backend Handlers

**Files:**
- Modify: `backend/internal/handler/hook.go`
- Modify: `backend/internal/handler/usage.go`
- Modify: `backend/internal/service/event_service.go`

- [ ] **Step 1: Update `hook.go` detection**

```go
// In Hook handler
if claudecode.MatchesTranscript(meta.TranscriptPath) {
    e, err = claudecode.Normalize(raw)
} else if geminicli.MatchesTranscript(meta.TranscriptPath) {
    e, err = geminicli.Normalize(raw)
} else {
    e, err = codex.Normalize(raw)
}
```

- [ ] **Step 2: Update `usage.go` detection**

```go
if geminicli.MatchesTranscript(path) {
    _ = json.NewEncoder(w).Encode(geminicli.ComputeUsage(path))
    return
}
```

- [ ] **Step 3: Update `event_service.go` usage computation**

```go
func computeUsageBreakdown(agent, transcriptPath string) domain.UsageBreakdown {
    if agent == "geminicli" || geminicli.MatchesTranscript(transcriptPath) {
        return geminicli.ComputeUsageBreakdown(transcriptPath)
    }
    // ... existing logic
}
```

### Task 3: Frontend Gemini CLI Support

**Files:**
- Create: `frontend/src/agents/geminicli/index.ts`
- Modify: `frontend/src/agents/index.ts`
- Modify: `frontend/src/agents/logos.tsx`

- [ ] **Step 1: Add Gemini logo**

```tsx
export function GeminiLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-label="Gemini">
        <path d="M12 24c-1.325 0-2.4-.675-2.4-1.5 0-.825 1.075-1.5 2.4-1.5s2.4.675 2.4 1.5c0 .825-1.075 1.5-2.4 1.5zM12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 22C6.486 22 2 17.514 2 12S6.486 2 12 2s10 4.486 10 10-4.486 10-10 10zm-1-17h2v2h-2zm0 4h2v8h-2z"/>
    </svg>
  )
}
```
*(Note: Use a proper Gemini logo SVG path)*

- [ ] **Step 2: Create Gemini agent config**

```tsx
import type { AgentConfig } from '../types'
import { GeminiLogo } from '../logos'

export const geminiCliAgent: AgentConfig = {
  id: 'geminicli',
  label: 'Gemini CLI',
  badgeClass: 'gemini',
  Logo: GeminiLogo,
  supportsSessionUsage: true,
  matchesEvent: (event) => Boolean(event.transcript_path?.includes('/.gemini/')),
  buildUsageItems: (usage, formatTokens) => [
      // Similar to claudecode items
  ],
}
```

- [ ] **Step 3: Register agent in `index.ts`**

```tsx
export const AGENTS: AgentConfig[] = [claudeCodeAgent, geminiCliAgent, codexAgent]
```

### Task 4: Gemini CLI Configuration and Documentation

- [ ] **Step 1: Document Gemini CLI setup in `README.md` or `docs/hooks.md`**

Add instructions on how to use `rtk hook gemini` and forward to `http://127.0.0.1:8765/api/hook`.

- [ ] **Step 2: Provide a sample Gemini CLI `settings.json` hook config.**

```json
{
  "hooks": {
    "BeforeTool": [
      {
        "matcher": ".*",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://127.0.0.1:8765/api/hook -H 'Content-Type: application/json' -d @-"
          }
        ]
      }
    ]
  }
}
```
(Need to verify if `rtk hook gemini` should be used directly in `settings.json` or wrapped)
