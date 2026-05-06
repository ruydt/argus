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
	Content     string `json:"content"`
}
