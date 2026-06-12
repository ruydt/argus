# Antigravity Agent Support Design

**Date:** 2026-06-10
**Status:** Approved
**Target:** v0.2.0

## Overview

Add Antigravity (Google's AI coding agent, `~/.gemini/antigravity/`) as a third supported agent alongside Claude Code and Codex. Argus receives hook payloads via `POST /api/hook`, normalizes them into the canonical `NormalizedEvent` model, and displays them in the existing event feed, sessions, and diagnostics UI. No new UI components needed.

---

## Research Findings

### Payload Schema

Captured from live Antigravity sessions via temporary capture hook. All three hook types share the same payload structure:

```json
{
  "conversationId": "f8cdcb41-5b2a-4e27-b235-9e9810d5a2ba",
  "artifactDirectoryPath": "/Users/<user>/.gemini/antigravity/brain/<id>",
  "transcriptPath": "/Users/<user>/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl",
  "workspacePaths": ["/Users/<user>/GitHub/argus"],
  "stepIdx": 11,
  "toolCall": {
    "name": "list_dir",
    "args": {
      "DirectoryPath": "/Users/<user>/GitHub/argus"
    }
  },
  "error": ""
}
```

`toolCall` is `null` for `PreInvocation`. `PostToolUse` adds `toolAction` and `toolSummary` into `toolCall.args`.

### Hook Type Inference

Antigravity does not include a hook type field in the payload. Type is inferred:

| Condition | Hook type |
|---|---|
| `toolCall == null` | `PreInvocation` |
| `toolCall != null` and no `error` key | `PreToolUse` |
| `toolCall != null` and `error` key present | `PostToolUse` |

### Hook Config Format

Hooks are configured in `~/.gemini/config/hooks.json`. Named groups at top level, event types as keys:

```json
{
  "argus": {
    "PreInvocation": [
      {
        "hooks": [
          { "type": "command", "command": "~/.argus/hooks/antigravity.sh" }
        ]
      }
    ],
    "PreToolUse": [ ... ],
    "PostToolUse": [ ... ]
  }
}
```

### Token Usage

**Not available.** Antigravity transcript JSONL contains only text content — no `input_tokens`/`output_tokens` fields. The `gen_metadata` protobuf blob is the system prompt context, not billing data. Hook payload has no usage fields.

Decision: stub usage for v0.2.0. Return empty `SessionUsage{}` and `UsageBreakdown{}`. Revisit if Google exposes token counts in a future release.

### Transcript Format

```json
{
  "step_index": 3,
  "source": "MODEL",
  "type": "PLANNER_RESPONSE",
  "status": "DONE",
  "created_at": "2026-06-10T03:04:34Z",
  "content": "...",
  "thinking": "..."
}
```

Types observed: `USER_INPUT`, `CONVERSATION_HISTORY`, `EPHEMERAL_MESSAGE`, `PLANNER_RESPONSE`, `LIST_DIRECTORY`.

---

## Architecture

### Detection

`handler/hook.go` detection order:

1. `claudecode.MatchesTranscript(transcriptPath)` — path contains `/.claude/`
2. `antigravity.MatchesTranscript(transcriptPath)` — path contains `/.gemini/antigravity/`
3. Fallback → Codex

### New Package

`backend/internal/agents/antigravity/antigravity.go`

```
MatchesTranscript(transcriptPath string) bool
Normalize(payload json.RawMessage) (domain.NormalizedEvent, error)
ComputeUsage(transcriptPath string) domain.SessionUsage
ComputeUsageBreakdown(transcriptPath string) domain.UsageBreakdown
```

### NormalizedEvent Mapping

| Antigravity field | NormalizedEvent field | Notes |
|---|---|---|
| `conversationId` | `SessionID` | UUID |
| `workspacePaths[0]` | `CWD` | First workspace path; empty string if absent |
| `transcriptPath` | `TranscriptPath` | Full path to JSONL |
| inferred | `HookEventName` | See inference table above |
| `toolCall.name` | `ToolName` | Empty when toolCall null |
| `toolCall.args` (filtered) | `ToolInput` | Exclude `toolAction`, `toolSummary` |
| `toolCall.args.toolSummary` | `ToolOutput` | PostToolUse only |
| `"antigravity"` | `AgentType` | Hardcoded |

### Usage Stubs

```go
func ComputeUsage(transcriptPath string) domain.SessionUsage {
    return domain.SessionUsage{}
}

func ComputeUsageBreakdown(transcriptPath string) domain.UsageBreakdown {
    return domain.UsageBreakdown{}
}
```

---

## install.sh Changes

### New hook script

`~/.argus/hooks/antigravity.sh` installed by `install.sh`:

```bash
#!/bin/bash
PAYLOAD=$(cat)
curl -sf -X POST http://127.0.0.1:10804/api/hook \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" > /dev/null 2>&1
echo '{"continue":true}'
```

### hooks.json wiring

New function `install_antigravity_hooks()`:

1. Check `~/.gemini/config/` exists — skip silently if antigravity not installed
2. Read existing `~/.gemini/config/hooks.json` or start with `{}`
3. Merge `"argus"` group (preserve all other groups)
4. Write back atomically

The merge must be non-destructive: other tools' hook groups (e.g., `claude-mem`) must survive intact. Only the `"argus"` key is owned by argus.

`uninstall.sh` removes the `"argus"` key from `hooks.json` and deletes `~/.argus/hooks/antigravity.sh`.

---

## Frontend

No new page components. Antigravity events flow through existing pages with the targeted changes below.

### Events feed
`EventBadges.tsx` — agent-agnostic, no changes needed. `"antigravity"` label renders automatically.

### Sessions page
`conversationId` maps to session identifier, `workspacePaths[0]` maps to CWD. Session tree and detail views are agent-agnostic — no changes needed.

### Dashboard — `ActivityPanel.tsx` + `TokenTimelineChart.tsx`
Both have `agentColor()` with hardcoded claudecode/codex branches and a palette fallback. Antigravity would fall to the palette (functional but inconsistent). Add explicit:
```ts
if (agent === 'antigravity') return 'var(--chart-3)'
```

### Hooks Config — `HooksConfigPage.tsx`
Currently hardcoded to 2 tabs. Three changes needed:
1. Add `'antigravity'` to the `AgentKey` type and tab toggle guard (`stored === 'codex' ? 'codex' : stored === 'antigravity' ? 'antigravity' : 'claudecode'`)
2. Add `useHooksConfig('antigravity')` state
3. Add 3rd `<TabsTrigger value="antigravity">Antigravity</TabsTrigger>` + `<TabsContent>` using existing `AgentTabContent` component

### Hooks Config — `StructuredEditor.tsx`
Line 110 branches `claudecode ? CLAUDE_EVENT_TYPES : CODEX_EVENT_TYPES`. Add:
```ts
const ANTIGRAVITY_EVENT_TYPES = ['PreInvocation', 'PreToolUse', 'PostToolUse']
// ...
const knownEvents = agent === 'claudecode'
  ? CLAUDE_EVENT_TYPES
  : agent === 'antigravity'
  ? ANTIGRAVITY_EVENT_TYPES
  : CODEX_EVENT_TYPES
```

### Hooks Config — `hookTemplates.ts`
Add `antigravity` key with templates for each of the 3 event types. Template shape mirrors existing claudecode/codex entries.

### Diagnostics
Agent stats table aggregates by `agent_type` from the database — antigravity row appears automatically once events flow in.

### Usage tab
Antigravity rows omitted or show `—` (no token data). No code change needed if usage is `0` — existing UI already handles zero-usage agents gracefully. Verify during implementation.

---

## Out of Scope for v0.2.0

- Token usage computation (no data source available)
- `PostToolUse` error surfacing in UI (error field captured but not displayed)
- Antigravity IDE variant (`~/.gemini/antigravity-ide/`) — identical hook mechanism, same agent package handles it if transcript path matches
- `PreCompress` / `Notification` hook types from `~/.gemini/settings.json` (Gemini CLI, different product)

---

## Testing

### Backend

- `antigravity_test.go`: normalize PreInvocation, PreToolUse, PostToolUse payloads → assert NormalizedEvent fields
- `MatchesTranscript` positive/negative cases
- Hook type inference for all three conditions
- Handler integration test: POST antigravity payload → 200, correct AgentType

### install.sh

- hooks.json created when absent
- hooks.json merged when existing groups present
- uninstall removes only `"argus"` key

---

## Open Questions

None. All design decisions resolved during research phase.
