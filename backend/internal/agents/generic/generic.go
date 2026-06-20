// Package generic normalizes hook payloads from agents that do not have a
// dedicated adapter (everything other than Claude Code and Codex). It maps each
// agent's field aliases onto the small set of canonical fields argus relies on
// for the cross-agent event row — hook_event_name, session, tool, cwd — and
// keeps the full original bytes in RawPayload, surfaced verbatim behind
// "view full payload". This avoids a brittle per-agent transformation layer:
// unknown shapes degrade to "raw only" rather than failing ingest.
package generic

import (
	"encoding/json"
	"strings"
	"time"

	"argus/internal/domain"
)

// aliases lists, per canonical field, the payload key names seen across agents.
// Dotted keys ("event.type") walk one level of nesting. Order is precedence.
var aliases = map[string][]string{
	"event": {
		"hook_event_name", "hookName", "hook_event", "agent_action_name",
		"eventType", "event_type", "event.type", "event",
	},
	"session": {
		"session_id", "sessionId", "sessionID", "conversation_id",
		"taskId", "trajectory_id", "thread.id", "thread_id", "threadId",
	},
	"tool":       {"tool_name", "toolName", "tool"},
	"cwd":        {"cwd", "working_dir", "workingDir", "directory", "project_dir"},
	"transcript": {"transcript_path", "transcriptPath"},
	"prompt":     {"prompt", "initialPrompt", "user_prompt"},
	"model":      {"model", "model_name", "modelName"},
}

// Normalize maps an arbitrary agent's payload onto the canonical core fields and
// stamps agentID as the event's agent. Time is the server receive time because
// per-agent timestamp formats vary and must not break display; the agent's own
// timestamp is preserved in the raw payload.
func Normalize(raw []byte, agentID string) (domain.NormalizedEvent, error) {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return domain.NormalizedEvent{}, err
	}

	return domain.NormalizedEvent{
		Time:                time.Now().UTC().Format(time.RFC3339),
		HookEventName:       firstString(m, aliases["event"]),
		Session:             firstString(m, aliases["session"]),
		Tool:                firstString(m, aliases["tool"]),
		CWD:                 firstCWD(m),
		TranscriptPath:      firstString(m, aliases["transcript"]),
		Prompt:              firstString(m, aliases["prompt"]),
		Model:               firstString(m, aliases["model"]),
		Agent:               agentID,
		RawPayload:          raw,
		NormalizationStatus: "ok",
		NormalizerVersion:   "argus/generic-1",
	}, nil
}

func firstString(m map[string]any, keys []string) string {
	for _, k := range keys {
		if v := lookup(m, k); v != "" {
			return v
		}
	}
	return ""
}

// lookup resolves a possibly-dotted key to a string value, or "" if absent or
// not a string.
func lookup(m map[string]any, key string) string {
	var cur any = m
	for _, p := range strings.Split(key, ".") {
		obj, ok := cur.(map[string]any)
		if !ok {
			return ""
		}
		cur = obj[p]
	}
	if s, ok := cur.(string); ok {
		return s
	}
	return ""
}

// firstCWD also handles workspace-root arrays (Cursor / Cline / Augment).
func firstCWD(m map[string]any) string {
	if s := firstString(m, aliases["cwd"]); s != "" {
		return s
	}
	for _, k := range []string{"workspace_roots", "workspaceRoots"} {
		if arr, ok := m[k].([]any); ok && len(arr) > 0 {
			if s, ok := arr[0].(string); ok {
				return s
			}
		}
	}
	return ""
}
