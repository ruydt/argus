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
}

type CtxLine struct {
	Num  int    `json:"num"`
	Text string `json:"text"`
}
