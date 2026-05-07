package domain

import "encoding/json"

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

	// Permission / approval fields
	PermissionMode string `json:"permission_mode"`

	// Error fields
	Error        string `json:"error"`
	ErrorType    string `json:"error_type"`
	ErrorMessage string `json:"error_message"`

	// Stop / completion fields
	Response             string `json:"response"`
	LastAssistantMessage string `json:"last_assistant_message"`
	StopHookActive       bool   `json:"stop_hook_active"`

	// Subagent / teammate fields
	AgentID   string `json:"agent_id"`
	AgentType string `json:"agent_type"`

	// Task fields
	TaskID          string `json:"task_id"`
	TaskTitle       string `json:"task_title"`
	TaskDescription string `json:"task_description"`

	// Notification fields
	NotificationType string `json:"notification_type"`
	Title            string `json:"title"`
	Message          string `json:"message"`

	// File change fields
	ChangeType string `json:"change_type"`

	// CWD change fields
	OldCWD string `json:"old_cwd"`
	NewCWD string `json:"new_cwd"`

	// Setup / trigger fields
	Trigger string `json:"trigger"`

	// Worktree fields
	Branch string `json:"branch"`

	// Elicitation fields
	ServerName string `json:"server_name"`

	// UserPromptExpansion fields
	ExpansionType string `json:"expansion_type"`
	CommandName   string `json:"command_name"`

	// InstructionsLoaded fields
	MemoryType string `json:"memory_type"`
	LoadReason string `json:"load_reason"`

	// PostToolBatch fields
	ToolCalls []ToolCall `json:"tool_calls"`

	// PostToolUse result fields
	ToolResponse json.RawMessage `json:"tool_response"`
	DurationMS   int             `json:"duration_ms"`
}

type ToolInput struct {
	FilePath    string `json:"file_path"`
	Command     string `json:"command"`
	Description string `json:"description"`
	OldString   string `json:"old_string"`
	NewString   string `json:"new_string"`
	OldStr      string `json:"old_str"`
	NewStr      string `json:"new_str"`
	Content     string `json:"content"`
}

// ToolCall is one entry in the PostToolBatch tool_calls array.
type ToolCall struct {
	ToolName     string    `json:"tool_name"`
	ToolInput    ToolInput `json:"tool_input"`
	ToolUseID    string    `json:"tool_use_id"`
	ToolResponse string    `json:"tool_response"`
}
