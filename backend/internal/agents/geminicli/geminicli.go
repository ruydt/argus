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

func ComputeUsage(transcriptPath string) domain.SessionUsage {
	return domain.SessionUsage{}
}

func ComputeUsageBreakdown(transcriptPath string) domain.UsageBreakdown {
	return domain.UsageBreakdown{}
}
