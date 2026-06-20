package domain

import (
	"crypto/sha256"
	"fmt"
)

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
	DedupKey       string    `json:"dedup_key,omitempty"`

	// Extended fields for new hook events
	PermissionMode            string `json:"permission_mode,omitempty"`
	ToolInputQuestionsJSON    string `json:"tool_input_questions_json,omitempty"`
	PermissionSuggestionsJSON string `json:"permission_suggestions_json,omitempty"`
	Response                  string `json:"response,omitempty"`
	ErrorMessage              string `json:"error_message,omitempty"`
	ErrorType                 string `json:"error_type,omitempty"`
	SubagentID                string `json:"subagent_id,omitempty"`
	SubagentType              string `json:"subagent_type,omitempty"`
	TaskID                    string `json:"task_id,omitempty"`
	TaskTitle                 string `json:"task_title,omitempty"`
	TaskDescription           string `json:"task_description,omitempty"`
	NotificationType          string `json:"notification_type,omitempty"`
	NotificationTitle         string `json:"notification_title,omitempty"`
	NotificationMessage       string `json:"notification_message,omitempty"`
	ChangeType                string `json:"change_type,omitempty"`
	OldCWD                    string `json:"old_cwd,omitempty"`
	NewCWD                    string `json:"new_cwd,omitempty"`
	ToolCallsJSON             string `json:"tool_calls_json,omitempty"`
	ToolResultStdout          string `json:"tool_result_stdout,omitempty"`
	ToolResultStderr          string `json:"tool_result_stderr,omitempty"`
	DurationMS                int    `json:"duration_ms,omitempty"`
	Trigger                   string `json:"trigger,omitempty"`

	// New event type fields
	ExpansionType string `json:"expansion_type,omitempty"`
	CommandName   string `json:"command_name,omitempty"`
	MemoryType    string `json:"memory_type,omitempty"`
	LoadReason    string `json:"load_reason,omitempty"`
	Branch        string `json:"branch,omitempty"`
	ServerName    string `json:"server_name,omitempty"`

	// Normalization metadata — set by ingestion pipeline.
	NormalizationStatus string `json:"normalization_status,omitempty"`
	NormalizerVersion   string `json:"normalizer_version,omitempty"`
	AgentVersion        string `json:"agent_version,omitempty"`
}

// ComputeDedupKey returns the SHA-256-based dedup key for an event.
// Used by both the repository (insert) and service (broadcast).
// Prompt and Response are included so events with the same session/turn/time
// but different content (e.g. consecutive UserPromptSubmit or Stop events)
// get distinct keys and are not silently dropped by INSERT OR IGNORE.
func ComputeDedupKey(e NormalizedEvent) string {
	h := sha256.Sum256([]byte(
		e.Session + "|" + e.TurnID + "|" + e.ToolUseID + "|" + e.HookEventName + "|" + e.Time + "|" + e.Prompt + "|" + e.Response,
	))
	return fmt.Sprintf("%x", h)
}

type CtxLine struct {
	Num  int    `json:"num"`
	Text string `json:"text"`
}

type Session struct {
	SessionID      string `json:"session_id"`
	Agent          string `json:"agent"`
	Model          string `json:"model"`
	Source         string `json:"source"`
	CWD            string `json:"cwd"`
	TranscriptPath string `json:"transcript_path"`
	StartedAt      string `json:"started_at"`
	LastSeenAt     string `json:"last_seen_at"`
	EndedAt        string `json:"ended_at,omitempty"`
}

// CompactResult reports the outcome of a database compaction (gzip-backfill of
// legacy raw_payload rows + VACUUM).
type CompactResult struct {
	RowsCompressed int   `json:"rows_compressed"`
	BeforeBytes    int64 `json:"before_bytes"`
	AfterBytes     int64 `json:"after_bytes"`
}
