package domain

import (
	"crypto/sha256"
	"fmt"
	"slices"
	"strings"
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

type SessionUsage struct {
	InputTokens         int `json:"input_tokens"`
	OutputTokens        int `json:"output_tokens"`
	CacheCreationTokens int `json:"cache_creation_tokens"`
	CacheReadTokens     int `json:"cache_read_tokens"`
	Turns               int `json:"turns"`
}

type Session struct {
	SessionID       string       `json:"session_id"`
	Agent           string       `json:"agent"`
	Model           string       `json:"model"`
	Source          string       `json:"source"`
	CWD             string       `json:"cwd"`
	TranscriptPath  string       `json:"transcript_path"`
	StartedAt       string       `json:"started_at"`
	LastSeenAt      string       `json:"last_seen_at"`
	EndedAt         string       `json:"ended_at,omitempty"`
	Usage           SessionUsage `json:"usage"`
	FileChangeCount int          `json:"file_change_count,omitempty"`
}

type FileChangeEvent struct {
	Time      string `json:"time"`
	Tool      string `json:"tool"`
	Action    string `json:"action,omitempty"`
	OldString string `json:"old_string,omitempty"`
	NewString string `json:"new_string,omitempty"`
	StartLine int    `json:"start_line,omitempty"`
}

type FileChangeGroup struct {
	Path    string            `json:"path"`
	Count   int               `json:"count"`
	Changes []FileChangeEvent `json:"changes"`
}

type Project struct {
	CWD          string   `json:"cwd"`
	Name         string   `json:"name"`
	SessionCount int      `json:"session_count"`
	LastActivity string   `json:"last_activity"`
	TotalTokens  int      `json:"total_tokens"`
	Agents       []string `json:"agents"`
	LiveCount    int      `json:"live_count"`
}

type SessionTreeNode struct {
	Session  Session           `json:"session"`
	AgentID  string            `json:"agent_id,omitempty"`
	Children []SessionTreeNode `json:"children"`
}

type DashboardStats struct {
	TotalSessions        int                        `json:"total_sessions"`
	TotalEvents          int                        `json:"total_events"`
	TotalInputTokens     int                        `json:"total_input_tokens"`
	TotalOutputTokens    int                        `json:"total_output_tokens"`
	TimelineGranularity  string                     `json:"timeline_granularity"`
	Timeline             []TimelineBucket           `json:"timeline"`
	TimelineByAgent      []AgentTimelineBucket      `json:"timeline_by_agent"`
	TokenTimeline        []TokenTimelineBucket      `json:"token_timeline"`
	TokenTimelineByAgent []TokenTimelineAgentBucket `json:"token_timeline_by_agent"`
	TopActions           []ActionCount              `json:"top_actions"`
	AgentUsage           []AgentModelUsage          `json:"agent_usage"`
	SessionUsage         []DashboardSessionUsage    `json:"session_usage"`
}

type TokenTimelineBucket struct {
	Date          string `json:"date"`
	Input         int    `json:"input"`
	Output        int    `json:"output"`
	CacheCreation int    `json:"cache_creation"`
	CacheRead     int    `json:"cache_read"`
}

type TokenTimelineAgentBucket struct {
	Date  string `json:"date"`
	Agent string `json:"agent"`
	Total int    `json:"total"`
}

type TimelineBucket struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type ActionCount struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}

type AgentTimelineBucket struct {
	Date  string `json:"date"`
	Agent string `json:"agent"`
	Count int    `json:"count"`
}

type AgentModelUsage struct {
	Provider      string `json:"provider"`
	Agent         string `json:"agent"`
	Model         string `json:"model"`
	Input         int    `json:"input"`
	Output        int    `json:"output"`
	CacheCreation int    `json:"cache_creation"`
	CacheRead     int    `json:"cache_read"`
}

type ModelUsageBreakdown struct {
	Model               string `json:"model"`
	InputTokens         int    `json:"input_tokens"`
	OutputTokens        int    `json:"output_tokens"`
	CacheCreationTokens int    `json:"cache_creation_tokens"`
	CacheReadTokens     int    `json:"cache_read_tokens"`
	Turns               int    `json:"turns"`
}

type UsageBreakdown struct {
	Total  SessionUsage          `json:"total"`
	Models []ModelUsageBreakdown `json:"models"`
}

// BuildUsageBreakdown finalizes a per-model accumulation map into a
// UsageBreakdown: it sums every model into Total and returns Models sorted by
// (input+output) tokens descending, then model name. Shared by every agent's
// ComputeUsageBreakdown so the finalization logic lives in one place.
func BuildUsageBreakdown(byModel map[string]*ModelUsageBreakdown) UsageBreakdown {
	breakdown := UsageBreakdown{
		Models: make([]ModelUsageBreakdown, 0, len(byModel)),
	}
	for _, usage := range byModel {
		breakdown.Total.InputTokens += usage.InputTokens
		breakdown.Total.OutputTokens += usage.OutputTokens
		breakdown.Total.CacheCreationTokens += usage.CacheCreationTokens
		breakdown.Total.CacheReadTokens += usage.CacheReadTokens
		breakdown.Total.Turns += usage.Turns
		breakdown.Models = append(breakdown.Models, *usage)
	}
	slices.SortFunc(breakdown.Models, func(a, b ModelUsageBreakdown) int {
		at := a.InputTokens + a.OutputTokens
		bt := b.InputTokens + b.OutputTokens
		if at != bt {
			return bt - at
		}
		return strings.Compare(a.Model, b.Model)
	})
	return breakdown
}

type DashboardSessionUsage struct {
	SessionID  string                `json:"session_id"`
	Agent      string                `json:"agent"`
	Provider   string                `json:"provider"`
	Model      string                `json:"model"`
	StartedAt  string                `json:"started_at"`
	LastSeenAt string                `json:"last_seen_at"`
	Input      int                   `json:"input"`
	Output     int                   `json:"output"`
	Models     []DashboardModelUsage `json:"models"`
}

type DashboardModelUsage struct {
	Provider      string `json:"provider"`
	Agent         string `json:"agent"`
	Model         string `json:"model"`
	Input         int    `json:"input"`
	Output        int    `json:"output"`
	CacheCreation int    `json:"cache_creation"`
	CacheRead     int    `json:"cache_read"`
	Turns         int    `json:"turns"`
}
