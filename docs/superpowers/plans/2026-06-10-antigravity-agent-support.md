# Antigravity Agent Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Antigravity (`~/.gemini/antigravity/`) as a third supported agent alongside Claude Code and Codex, with full event ingestion, hooks config UI, dashboard color, and install.sh auto-wiring.

**Architecture:** New `backend/internal/agents/antigravity/` package normalizes the Antigravity hook payload (camelCase fields, hook type inferred from payload shape) into `domain.NormalizedEvent`. Detection is added to `handler/hook.go` between the existing Claude Code and Codex branches. Frontend gets a third tab in HooksConfigPage and an explicit chart color; all other pages receive events automatically.

**Tech Stack:** Go 1.25 (backend agent + handler), React/TypeScript (hooks-config UI, dashboard), bash + python3 (install.sh wiring)

---

## File Map

| Action | File |
|---|---|
| Create | `backend/internal/agents/antigravity/antigravity.go` |
| Create | `backend/internal/agents/antigravity/antigravity_test.go` |
| Modify | `backend/internal/handler/hook.go` |
| Modify | `backend/tests/internal/handler/hook_test.go` |
| Modify | `frontend/src/features/hooks-config/types.ts` |
| Modify | `frontend/src/features/hooks-config/hookTemplates.ts` |
| Modify | `frontend/src/features/hooks-config/StructuredEditor.tsx` |
| Modify | `frontend/src/features/hooks-config/HooksConfigPage.tsx` |
| Modify | `frontend/src/features/dashboard/ActivityPanel.tsx` |
| Modify | `frontend/src/features/dashboard/TokenTimelineChart.tsx` |
| Modify | `install.sh` |
| Modify | `uninstall.sh` |

---

## Task 1: Antigravity Agent Package

**Files:**
- Create: `backend/internal/agents/antigravity/antigravity.go`
- Create: `backend/internal/agents/antigravity/antigravity_test.go`

- [ ] **Step 1: Write the failing tests**

Create `backend/internal/agents/antigravity/antigravity_test.go`:

```go
package antigravity_test

import (
	"encoding/json"
	"testing"

	"argus/internal/agents/antigravity"
)

func TestMatchesTranscript(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/Users/dev/.gemini/antigravity/brain/abc/.system_generated/logs/transcript.jsonl", true},
		{"/Users/dev/.claude/projects/abc.jsonl", false},
		{"", false},
	}
	for _, c := range cases {
		if got := antigravity.MatchesTranscript(c.path); got != c.want {
			t.Errorf("MatchesTranscript(%q) = %v, want %v", c.path, got, c.want)
		}
	}
}

func TestNormalizePreInvocation(t *testing.T) {
	raw := []byte(`{
		"conversationId": "conv-123",
		"transcriptPath": "/home/dev/.gemini/antigravity/brain/conv-123/.system_generated/logs/transcript.jsonl",
		"workspacePaths": ["/home/dev/project"],
		"stepIdx": 9,
		"toolCall": null,
		"error": ""
	}`)

	e, err := antigravity.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize error: %v", err)
	}
	if e.Agent != "antigravity" {
		t.Errorf("Agent = %q, want %q", e.Agent, "antigravity")
	}
	if e.Session != "conv-123" {
		t.Errorf("Session = %q, want %q", e.Session, "conv-123")
	}
	if e.CWD != "/home/dev/project" {
		t.Errorf("CWD = %q, want %q", e.CWD, "/home/dev/project")
	}
	if e.HookEventName != "PreInvocation" {
		t.Errorf("HookEventName = %q, want %q", e.HookEventName, "PreInvocation")
	}
	if e.Action != "AGENT" {
		t.Errorf("Action = %q, want %q", e.Action, "AGENT")
	}
	if e.Tool != "" {
		t.Errorf("Tool = %q, want empty", e.Tool)
	}
}

func TestNormalizePreToolUse(t *testing.T) {
	// PreToolUse: toolCall present, NO "error" key
	raw := []byte(`{
		"conversationId": "conv-123",
		"transcriptPath": "/home/dev/.gemini/antigravity/brain/conv-123/.system_generated/logs/transcript.jsonl",
		"workspacePaths": ["/home/dev/project"],
		"stepIdx": 11,
		"toolCall": {
			"name": "list_dir",
			"args": {"DirectoryPath": "/home/dev/project"}
		}
	}`)

	e, err := antigravity.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize error: %v", err)
	}
	if e.HookEventName != "PreToolUse" {
		t.Errorf("HookEventName = %q, want %q", e.HookEventName, "PreToolUse")
	}
	if e.Tool != "list_dir" {
		t.Errorf("Tool = %q, want %q", e.Tool, "list_dir")
	}
	if e.Action != "READ" {
		t.Errorf("Action = %q, want %q", e.Action, "READ")
	}
	if e.Command == "" {
		t.Error("Command should contain JSON-encoded args")
	}
	var args map[string]interface{}
	if err := json.Unmarshal([]byte(e.Command), &args); err != nil {
		t.Errorf("Command is not valid JSON: %v", err)
	}
	if _, ok := args["DirectoryPath"]; !ok {
		t.Error("Command args should contain DirectoryPath")
	}
}

func TestNormalizePostToolUse(t *testing.T) {
	// PostToolUse: toolCall present, "error" key present
	raw := []byte(`{
		"conversationId": "conv-123",
		"transcriptPath": "/home/dev/.gemini/antigravity/brain/conv-123/.system_generated/logs/transcript.jsonl",
		"workspacePaths": ["/home/dev/project"],
		"stepIdx": 11,
		"toolCall": {
			"name": "list_dir",
			"args": {
				"DirectoryPath": "/home/dev/project",
				"toolAction": "Listing directory contents",
				"toolSummary": "List workspace directory"
			}
		},
		"error": ""
	}`)

	e, err := antigravity.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize error: %v", err)
	}
	if e.HookEventName != "PostToolUse" {
		t.Errorf("HookEventName = %q, want %q", e.HookEventName, "PostToolUse")
	}
	if e.Description != "List workspace directory" {
		t.Errorf("Description = %q, want %q", e.Description, "List workspace directory")
	}
	// toolAction and toolSummary must be excluded from Command args
	var args map[string]interface{}
	if err := json.Unmarshal([]byte(e.Command), &args); err != nil {
		t.Fatalf("Command is not valid JSON: %v", err)
	}
	if _, ok := args["toolSummary"]; ok {
		t.Error("toolSummary should be excluded from Command args")
	}
	if _, ok := args["toolAction"]; ok {
		t.Error("toolAction should be excluded from Command args")
	}
}

func TestNormalizeEmptyWorkspacePaths(t *testing.T) {
	raw := []byte(`{
		"conversationId": "conv-456",
		"transcriptPath": "/home/dev/.gemini/antigravity/brain/conv-456/.system_generated/logs/transcript.jsonl",
		"workspacePaths": [],
		"stepIdx": 1,
		"toolCall": null,
		"error": ""
	}`)

	e, err := antigravity.Normalize(raw)
	if err != nil {
		t.Fatalf("Normalize error: %v", err)
	}
	if e.CWD != "" {
		t.Errorf("CWD = %q, want empty when workspacePaths is empty", e.CWD)
	}
}

func TestComputeUsageReturnsEmpty(t *testing.T) {
	usage := antigravity.ComputeUsage("/any/path")
	if usage.InputTokens != 0 || usage.OutputTokens != 0 {
		t.Errorf("expected empty usage, got %+v", usage)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && go test ./internal/agents/antigravity/... 2>&1
```

Expected: `cannot find package "argus/internal/agents/antigravity"`

- [ ] **Step 3: Implement the agent package**

Create `backend/internal/agents/antigravity/antigravity.go`:

```go
package antigravity

import (
	"encoding/json"
	"strings"
	"time"

	"argus/internal/domain"
	"argus/internal/fileutil"
)

const antigravityNormalizerVersion = "antigravity/1"

// AgentName returns the canonical agent identifier used in NormalizedEvent.Agent.
func AgentName() string { return "antigravity" }

// MatchesTranscript reports whether the transcript path belongs to an Antigravity session.
func MatchesTranscript(transcriptPath string) bool {
	return strings.Contains(transcriptPath, "/.gemini/antigravity/")
}

type antigravityPayload struct {
	ConversationID string          `json:"conversationId"`
	TranscriptPath string          `json:"transcriptPath"`
	WorkspacePaths []string        `json:"workspacePaths"`
	StepIdx        int             `json:"stepIdx"`
	ToolCall       *toolCallData   `json:"toolCall"`
	// ErrorRaw is nil when "error" key is absent (PreToolUse) and non-nil when present (PostToolUse).
	ErrorRaw json.RawMessage `json:"error"`
}

type toolCallData struct {
	Name string                 `json:"name"`
	Args map[string]interface{} `json:"args"`
}

func inferHookType(p antigravityPayload) string {
	if p.ToolCall == nil {
		return "PreInvocation"
	}
	if p.ErrorRaw == nil {
		return "PreToolUse"
	}
	return "PostToolUse"
}

// filteredArgs returns tool args excluding Antigravity-internal metadata keys.
func filteredArgs(args map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(args))
	for k, v := range args {
		if k == "toolAction" || k == "toolSummary" {
			continue
		}
		out[k] = v
	}
	return out
}

// Normalize converts a raw Antigravity hook payload into a canonical NormalizedEvent.
func Normalize(raw []byte) (domain.NormalizedEvent, error) {
	var p antigravityPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return domain.NormalizedEvent{}, err
	}

	cwd := ""
	if len(p.WorkspacePaths) > 0 {
		cwd = p.WorkspacePaths[0]
	}

	hookType := inferHookType(p)

	var toolName, cmd, description string
	if p.ToolCall != nil {
		toolName = p.ToolCall.Name
		if filtered := filteredArgs(p.ToolCall.Args); len(filtered) > 0 {
			if b, err := json.Marshal(filtered); err == nil {
				cmd = string(b)
			}
		}
		if hookType == "PostToolUse" {
			if summary, ok := p.ToolCall.Args["toolSummary"]; ok {
				if s, ok := summary.(string); ok {
					description = s
				}
			}
		}
	}

	action := fileutil.HookEventAction(hookType)
	if action == "" {
		if toolName != "" {
			action = fileutil.ToolToAction(toolName)
		} else {
			// PreInvocation has no toolName; treat like BeforeAgent.
			action = "AGENT"
		}
	}

	return domain.NormalizedEvent{
		Time:              time.Now().UTC().Format(time.RFC3339),
		Agent:             AgentName(),
		Session:           p.ConversationID,
		HookEventName:     hookType,
		TranscriptPath:    p.TranscriptPath,
		CWD:               cwd,
		Tool:              toolName,
		Action:            action,
		Command:           cmd,
		Description:       description,
		RawPayload:        raw,
		NormalizerVersion: antigravityNormalizerVersion,
	}, nil
}

// ComputeUsage returns empty usage — Antigravity does not expose token counts.
func ComputeUsage(_ string) domain.SessionUsage {
	return domain.SessionUsage{}
}

// ComputeUsageBreakdown returns empty breakdown — Antigravity does not expose token counts.
func ComputeUsageBreakdown(_ string) domain.UsageBreakdown {
	return domain.UsageBreakdown{}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && go test ./internal/agents/antigravity/... -v 2>&1
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Verify build**

```bash
cd backend && go build ./... 2>&1
```

Expected: no output (clean build).

- [ ] **Step 6: Commit**

```bash
git add backend/internal/agents/antigravity/
git commit -m "feat(agents): add Antigravity agent package with Normalize and hook type inference"
```

---

## Task 2: Wire Antigravity Detection in Handler

**Files:**
- Modify: `backend/internal/handler/hook.go`
- Modify: `backend/tests/internal/handler/hook_test.go`

- [ ] **Step 1: Write failing handler test**

In `backend/tests/internal/handler/hook_test.go`, add after `TestHookHandlerAcceptsValidPayload`:

```go
func TestHookHandlerAcceptsAntigravityPayload(t *testing.T) {
	svc := newTestService(t)
	h := newHook(svc)

	body := []byte(`{
		"conversationId": "conv-abc",
		"transcriptPath": "/home/dev/.gemini/antigravity/brain/conv-abc/.system_generated/logs/transcript.jsonl",
		"workspacePaths": ["/home/dev/project"],
		"stepIdx": 9,
		"toolCall": null,
		"error": ""
	}`)

	req := httptest.NewRequest(http.MethodPost, "/api/hook", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", rec.Code, rec.Body.String())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	events, _, err := svc.ListEvents(ctx, domain.EventFilter{})
	if err != nil {
		t.Fatalf("ListEvents: %v", err)
	}
	if len(events) == 0 {
		t.Fatal("expected event to be stored")
	}
	if events[0].Agent != "antigravity" {
		t.Errorf("Agent = %q, want %q", events[0].Agent, "antigravity")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && go test ./tests/internal/handler/ -run TestHookHandlerAcceptsAntigravityPayload -v 2>&1
```

Expected: FAIL — antigravity payload treated as codex (Agent = "codex", not "antigravity").

- [ ] **Step 3: Add antigravity detection to hook.go**

In `backend/internal/handler/hook.go`, add the import and detection branch.

Add to imports:
```go
"argus/internal/agents/antigravity"
```

Change the `switch` block from:
```go
switch {
case claudecode.MatchesTranscript(meta.TranscriptPath):
    e, normalizeErr = claudecode.Normalize(raw)
default:
    e, normalizeErr = codex.Normalize(raw)
}
```

To:
```go
switch {
case claudecode.MatchesTranscript(meta.TranscriptPath):
    e, normalizeErr = claudecode.Normalize(raw)
case antigravity.MatchesTranscript(meta.TranscriptPath):
    e, normalizeErr = antigravity.Normalize(raw)
default:
    e, normalizeErr = codex.Normalize(raw)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && go test ./tests/internal/handler/ -run TestHookHandlerAcceptsAntigravityPayload -v 2>&1
```

Expected: PASS.

- [ ] **Step 5: Run full backend test suite**

```bash
cd backend && go test ./... 2>&1
```

Expected: all tests PASS.

- [ ] **Step 6: Lint**

```bash
cd backend && golangci-lint run ./... 2>&1
```

Expected: no lint errors.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/handler/hook.go backend/tests/internal/handler/hook_test.go
git commit -m "feat(handler): add Antigravity agent detection in hook ingestion"
```

---

## Task 3: Frontend Types and Hook Templates

**Files:**
- Modify: `frontend/src/features/hooks-config/types.ts`
- Modify: `frontend/src/features/hooks-config/hookTemplates.ts`
- Modify: `frontend/src/features/hooks-config/StructuredEditor.tsx`

- [ ] **Step 1: Add `'antigravity'` to AgentKey**

In `frontend/src/features/hooks-config/types.ts`, change:

```ts
export type AgentKey = 'claudecode' | 'codex'
```

To:

```ts
export type AgentKey = 'claudecode' | 'codex' | 'antigravity'
```

- [ ] **Step 2: Add antigravity hook templates**

In `frontend/src/features/hooks-config/hookTemplates.ts`, add after the `const BASE_CODEX` block and before `export const HOOK_TEMPLATES`:

```ts
const BASE_AG = {
  conversationId: 'sim-conv-abc123',
  transcriptPath:
    '/Users/dev/.gemini/antigravity/brain/sim-conv-abc123/.system_generated/logs/transcript.jsonl',
  workspacePaths: ['/Users/dev/project'],
  stepIdx: 1,
  error: '',
}
```

Add `antigravity` to `HOOK_TEMPLATES`. Find the closing `},` of the `codex` entry and append after it (before the closing `}`):

```ts
  antigravity: {
    PreInvocation: {
      ...BASE_AG,
      toolCall: null,
    },
    PreToolUse: {
      ...BASE_AG,
      toolCall: {
        name: 'list_dir',
        args: { DirectoryPath: '/Users/dev/project' },
      },
    },
    PostToolUse: {
      ...BASE_AG,
      toolCall: {
        name: 'list_dir',
        args: {
          DirectoryPath: '/Users/dev/project',
          toolAction: 'Listing directory contents',
          toolSummary: 'List workspace directory',
        },
      },
    },
  },
```

- [ ] **Step 3: Add `ANTIGRAVITY_EVENT_TYPES` to StructuredEditor**

In `frontend/src/features/hooks-config/StructuredEditor.tsx`, after the `CODEX_EVENT_TYPES` array (line 77), add:

```ts
const ANTIGRAVITY_EVENT_TYPES = ['PreInvocation', 'PreToolUse', 'PostToolUse']
```

Then change line 110 from:
```ts
const knownEvents = agent === 'claudecode' ? CLAUDE_EVENT_TYPES : CODEX_EVENT_TYPES
```

To:
```ts
const knownEvents =
  agent === 'claudecode'
    ? CLAUDE_EVENT_TYPES
    : agent === 'antigravity'
      ? ANTIGRAVITY_EVENT_TYPES
      : CODEX_EVENT_TYPES
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/hooks-config/types.ts \
        frontend/src/features/hooks-config/hookTemplates.ts \
        frontend/src/features/hooks-config/StructuredEditor.tsx
git commit -m "feat(hooks-config): add Antigravity AgentKey, hook templates, and event types"
```

---

## Task 4: HooksConfigPage Third Tab

**Files:**
- Modify: `frontend/src/features/hooks-config/HooksConfigPage.tsx`

- [ ] **Step 1: Add `antigravityState` and update all agent branches**

In `frontend/src/features/hooks-config/HooksConfigPage.tsx`:

**a) Fix the `useState` initialiser** (line 185):
```ts
// from:
return stored === 'codex' ? 'codex' : 'claudecode'
// to:
return stored === 'codex' ? 'codex' : stored === 'antigravity' ? 'antigravity' : 'claudecode'
```

**b) Add `antigravityState` after `codexState` (line 222)**:
```ts
const claudeState = useHooksConfig('claudecode')
const codexState = useHooksConfig('codex')
const antigravityState = useHooksConfig('antigravity')
```

**c) Update `activeState` (line 224)**:
```ts
// from:
const activeState = activeAgent === 'claudecode' ? claudeState : codexState
// to:
const activeState =
  activeAgent === 'claudecode'
    ? claudeState
    : activeAgent === 'antigravity'
      ? antigravityState
      : codexState
```

**d) Update `handleSimulatorApply` state lookup (line 227)**:
```ts
// from:
const state = activeAgent === 'claudecode' ? claudeState : codexState
// to:
const state =
  activeAgent === 'claudecode'
    ? claudeState
    : activeAgent === 'antigravity'
      ? antigravityState
      : codexState
```

**e) Update docs URL (lines 306–309)**:
```ts
// from:
activeAgent === 'claudecode'
  ? 'https://code.claude.com/docs/en/hooks'
  : 'https://developers.openai.com/codex/hooks'
// to:
activeAgent === 'claudecode'
  ? 'https://code.claude.com/docs/en/hooks'
  : activeAgent === 'antigravity'
    ? 'https://antigravity.google/docs/hooks#hooks'
    : 'https://developers.openai.com/codex/hooks'
```

**f) Add third tab trigger and content** (lines 358–395):
```tsx
<TabsList>
  <TabsTrigger value="claudecode">Claude Code</TabsTrigger>
  <TabsTrigger value="codex">Codex</TabsTrigger>
  <TabsTrigger value="antigravity">Antigravity</TabsTrigger>
</TabsList>
```

After the `<TabsContent value="codex">` block, add:
```tsx
<TabsContent value="antigravity">
  <AgentTabContent
    agent="antigravity"
    state={antigravityState}
    viewMode={viewMode}
    sim={simProps}
  />
</TabsContent>
```

- [ ] **Step 2: Type-check and test**

```bash
cd frontend && npx tsc --noEmit 2>&1 && npx vitest run 2>&1
```

Expected: no type errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/hooks-config/HooksConfigPage.tsx
git commit -m "feat(hooks-config): add Antigravity tab to hooks configuration page"
```

---

## Task 5: Dashboard Agent Color

**Files:**
- Modify: `frontend/src/features/dashboard/ActivityPanel.tsx`
- Modify: `frontend/src/features/dashboard/TokenTimelineChart.tsx`

- [ ] **Step 1: Add antigravity color to ActivityPanel**

In `frontend/src/features/dashboard/ActivityPanel.tsx`, find the `agentColor` function (~line 177):

```ts
function agentColor(agent: string, index: number) {
  if (agent === 'codex') return 'var(--chart-2)'
  if (agent === 'claudecode') return 'var(--chart-1)'
  return agentPalette[index % agentPalette.length]
}
```

Change to:
```ts
function agentColor(agent: string, index: number) {
  if (agent === 'codex') return 'var(--chart-2)'
  if (agent === 'claudecode') return 'var(--chart-1)'
  if (agent === 'antigravity') return 'var(--chart-3)'
  return agentPalette[index % agentPalette.length]
}
```

- [ ] **Step 2: Add antigravity color to TokenTimelineChart**

In `frontend/src/features/dashboard/TokenTimelineChart.tsx`, find the equivalent `agentColor` function (~line 30):

```ts
if (agent === 'codex') return 'var(--chart-2)'
if (agent === 'claudecode') return 'var(--chart-1)'
```

Add after those two lines:
```ts
if (agent === 'antigravity') return 'var(--chart-3)'
```

- [ ] **Step 3: Type-check and test**

```bash
cd frontend && npx tsc --noEmit 2>&1 && npx vitest run 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/dashboard/ActivityPanel.tsx \
        frontend/src/features/dashboard/TokenTimelineChart.tsx
git commit -m "feat(dashboard): add chart-3 color for Antigravity agent"
```

---

## Task 6: install.sh and uninstall.sh

**Files:**
- Modify: `install.sh`
- Modify: `uninstall.sh`

- [ ] **Step 1: Add antigravity hook script creation to install.sh**

In `install.sh`, find the section that creates `$HOOKS_DIR` and other hook scripts. After the existing hook file creation, add the antigravity hook script:

```bash
# ── antigravity hook script ────────────────────────────────────────────────
ANTIGRAVITY_HOOK="$HOOKS_DIR/antigravity.sh"
cat > "$ANTIGRAVITY_HOOK" << HOOKEOF
#!/bin/bash
PAYLOAD=\$(cat)
curl -sf -X POST http://127.0.0.1:${ARGUS_PORT}/api/hook \\
  -H "Content-Type: application/json" \\
  -d "\$PAYLOAD" > /dev/null 2>&1
echo '{"continue":true}'
HOOKEOF
chmod +x "$ANTIGRAVITY_HOOK"
echo "  → wrote $ANTIGRAVITY_HOOK"
```

- [ ] **Step 2: Add antigravity hooks.json wiring to install.sh**

After the existing `~/.claude/settings.json` hook wiring block, add a new section:

```bash
# ── Wire hooks in ~/.gemini/config/hooks.json (Antigravity) ────────────────

GEMINI_CONFIG_DIR="$HOME/.gemini/config"
GEMINI_HOOKS_JSON="$GEMINI_CONFIG_DIR/hooks.json"

if [ -d "$GEMINI_CONFIG_DIR" ]; then
  if ! command -v python3 &>/dev/null; then
    echo "warning: python3 not found — add Antigravity hooks manually to $GEMINI_HOOKS_JSON"
    echo "  command: $ANTIGRAVITY_HOOK"
  else
    python3 - "$GEMINI_HOOKS_JSON" "$ANTIGRAVITY_HOOK" << 'PYEOF'
import json, sys, os

hooks_path, hook_script = sys.argv[1], sys.argv[2]

config = {}
if os.path.exists(hooks_path):
    with open(hooks_path) as f:
        try:
            config = json.load(f)
        except json.JSONDecodeError as e:
            print(f"error: {hooks_path} contains invalid JSON: {e}", file=sys.stderr)
            print("Fix the JSON manually, then re-run install.sh", file=sys.stderr)
            sys.exit(1)

hook_entry = {"type": "command", "command": hook_script}
hook_group = {"hooks": [hook_entry]}

argus = config.setdefault("argus", {})

def already_registered(event_type):
    for group in argus.get(event_type, []):
        for h in group.get("hooks", []):
            if h.get("command") == hook_script:
                return True
    return False

changed = False
for event_type in ("PreInvocation", "PreToolUse", "PostToolUse"):
    if not already_registered(event_type):
        argus.setdefault(event_type, []).append(hook_group)
        changed = True

if changed:
    os.makedirs(os.path.dirname(hooks_path), exist_ok=True)
    with open(hooks_path, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")
    print(f"  → wired Antigravity hooks in {hooks_path}")
else:
    print(f"  → Antigravity hooks already registered in {hooks_path}")
PYEOF
  fi
else
  echo "  → Antigravity not installed (no $GEMINI_CONFIG_DIR), skipping hook wiring"
fi
```

- [ ] **Step 3: Add antigravity cleanup to uninstall.sh**

In `uninstall.sh`, after the existing Claude Code settings.json cleanup, add:

```bash
# ── Remove Antigravity hooks from ~/.gemini/config/hooks.json ──────────────
GEMINI_HOOKS_JSON="$HOME/.gemini/config/hooks.json"
if [ -f "$GEMINI_HOOKS_JSON" ] && command -v python3 &>/dev/null; then
  python3 - "$GEMINI_HOOKS_JSON" << 'PYEOF'
import json, sys, os

hooks_path = sys.argv[1]
if not os.path.exists(hooks_path):
    sys.exit(0)

with open(hooks_path) as f:
    try:
        config = json.load(f)
    except json.JSONDecodeError:
        sys.exit(0)

if "argus" in config:
    del config["argus"]
    with open(hooks_path, "w") as f:
        json.dump(config, f, indent=2)
        f.write("\n")
    print(f"  → removed argus hooks from {hooks_path}")
PYEOF
fi

# Remove antigravity hook script
ANTIGRAVITY_HOOK="$HOOKS_DIR/antigravity.sh"
if [ -f "$ANTIGRAVITY_HOOK" ]; then
  rm "$ANTIGRAVITY_HOOK"
  echo "  → removed $ANTIGRAVITY_HOOK"
fi
```

- [ ] **Step 4: Test install.sh syntax**

```bash
bash -n install.sh && echo "syntax OK"
bash -n uninstall.sh && echo "syntax OK"
```

Expected: both print `syntax OK`.

- [ ] **Step 5: Commit**

```bash
git add install.sh uninstall.sh
git commit -m "feat(install): wire Antigravity hooks in ~/.gemini/config/hooks.json"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Full backend test + lint**

```bash
cd backend && go test ./... 2>&1 && golangci-lint run ./... 2>&1
```

Expected: all tests pass, no lint errors.

- [ ] **Step 2: Full frontend test + typecheck + format**

```bash
cd frontend && npx tsc --noEmit 2>&1 && npx vitest run 2>&1 && npx prettier --check . 2>&1
```

Expected: no errors.

- [ ] **Step 3: Wire test capture hook and verify end-to-end**

```bash
# Send a simulated PreInvocation payload
curl -s -X POST http://127.0.0.1:10804/api/hook \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "e2e-test-conv",
    "transcriptPath": "/Users/dev/.gemini/antigravity/brain/e2e-test-conv/.system_generated/logs/transcript.jsonl",
    "workspacePaths": ["/tmp"],
    "stepIdx": 1,
    "toolCall": null,
    "error": ""
  }'
```

Expected: `{}` (200 OK).

```bash
# Verify it appears in the event list
curl -s http://127.0.0.1:10804/api/events | python3 -c "
import json,sys
data = json.load(sys.stdin)
events = data.get('events', data) if isinstance(data, dict) else data
ag = [e for e in events if e.get('agent') == 'antigravity']
print(f'Found {len(ag)} antigravity events')
if ag: print(json.dumps(ag[0], indent=2))
"
```

Expected: `Found 1 antigravity events` with correct fields.

- [ ] **Step 4: Verify Antigravity tab appears in hooks config UI**

Open http://127.0.0.1:10804 → Hooks Config page. Confirm three tabs: Claude Code, Codex, Antigravity. Antigravity tab shows structured editor with PreInvocation/PreToolUse/PostToolUse event types.

- [ ] **Step 5: Final commit if any formatting fixes needed**

```bash
cd frontend && npx prettier --write . 2>/dev/null
git add -p  # stage any prettier fixes
git commit -m "style: prettier formatting for Antigravity frontend changes" 2>/dev/null || echo "nothing to commit"
```
