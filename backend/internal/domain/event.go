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

	// Extended fields for new hook events
	PermissionMode      string `json:"permission_mode,omitempty"`
	Response            string `json:"response,omitempty"`
	ErrorMessage        string `json:"error_message,omitempty"`
	ErrorType           string `json:"error_type,omitempty"`
	SubagentID          string `json:"subagent_id,omitempty"`
	SubagentType        string `json:"subagent_type,omitempty"`
	TaskID              string `json:"task_id,omitempty"`
	TaskTitle           string `json:"task_title,omitempty"`
	TaskDescription     string `json:"task_description,omitempty"`
	NotificationType    string `json:"notification_type,omitempty"`
	NotificationTitle   string `json:"notification_title,omitempty"`
	NotificationMessage string `json:"notification_message,omitempty"`
	ChangeType          string `json:"change_type,omitempty"`
	OldCWD              string `json:"old_cwd,omitempty"`
	NewCWD              string `json:"new_cwd,omitempty"`
	ToolCallsJSON       string `json:"tool_calls_json,omitempty"`
	ToolResultStdout    string `json:"tool_result_stdout,omitempty"`
	ToolResultStderr    string `json:"tool_result_stderr,omitempty"`
	DurationMS          int    `json:"duration_ms,omitempty"`
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
	SessionID      string       `json:"session_id"`
	Agent          string       `json:"agent"`
	Model          string       `json:"model"`
	Source         string       `json:"source"`
	CWD            string       `json:"cwd"`
	TranscriptPath string       `json:"transcript_path"`
	StartedAt      string       `json:"started_at"`
	LastSeenAt     string       `json:"last_seen_at"`
	Usage          SessionUsage `json:"usage"`
}

type DashboardStats struct {
	TotalSessions     int                    `json:"total_sessions"`
	TotalEvents       int                    `json:"total_events"`
	TotalInputTokens  int                    `json:"total_input_tokens"`
	TotalOutputTokens int                    `json:"total_output_tokens"`
	Timeline          []TimelineBucket       `json:"timeline"`
	TopActions        []ActionCount          `json:"top_actions"`
	AgentUsage        []AgentModelUsage      `json:"agent_usage"`
}

type TimelineBucket struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type ActionCount struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}

type AgentModelUsage struct {
	Agent  string `json:"agent"`
	Model  string `json:"model"`
	Input  int    `json:"input"`
	Output int    `json:"output"`
}

