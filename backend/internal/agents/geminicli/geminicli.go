package geminicli

import (
	"bufio"
	"encoding/json"
	"os"
	"slices"
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

	path := fileutil.ResolvePath(p.CWD, fileutil.FirstNonEmpty(p.ToolInput.FilePath, p.FilePath))
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
		OldString:           fileutil.FirstNonEmpty(p.ToolInput.OldString, p.ToolInput.OldStr),
		NewString:           fileutil.FirstNonEmpty(p.ToolInput.NewString, p.ToolInput.NewStr, p.ToolInput.Content),
		RawPayload:          raw,
		PermissionMode:      p.PermissionMode,
		Response:            fileutil.FirstNonEmpty(p.Response, p.LastAssistantMessage),
		ErrorMessage:        fileutil.FirstNonEmpty(p.ErrorMessage, p.Error),
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
		ToolCallsJSON:       fileutil.MarshalToolCalls(p.ToolCalls),
		ToolResultStdout:    fileutil.ToolResultStdout(p.ToolResponse),
		ToolResultStderr:    fileutil.ToolResultStderr(p.ToolResponse),
		DurationMS:          p.DurationMS,
		Trigger:             p.Trigger,
	}, nil
}

// ModelFromTranscript scans a Gemini CLI session JSONL for the first
// entry with a model field and returns it.
func ModelFromTranscript(transcriptPath string) string {
	f, err := os.Open(transcriptPath)
	if err != nil {
		return ""
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 2*1024*1024), 2*1024*1024)
	for scanner.Scan() {
		var entry struct {
			Model string `json:"model"`
		}
		if json.Unmarshal(scanner.Bytes(), &entry) == nil && entry.Model != "" {
			return entry.Model
		}
	}
	return ""
}

func ComputeUsage(transcriptPath string) domain.SessionUsage {
	return ComputeUsageBreakdown(transcriptPath).Total
}

func ComputeUsageBreakdown(transcriptPath string) domain.UsageBreakdown {
	f, err := os.Open(transcriptPath)
	if err != nil {
		return domain.UsageBreakdown{}
	}
	defer f.Close()
	byModel := map[string]*domain.ModelUsageBreakdown{}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)
	for scanner.Scan() {
		var entry struct {
			Model  string `json:"model"`
			Tokens struct {
				Input  int `json:"input"`
				Output int `json:"output"`
				Cached int `json:"cached"`
			} `json:"tokens"`
		}
		if json.Unmarshal(scanner.Bytes(), &entry) == nil && entry.Model != "" && (entry.Tokens.Input > 0 || entry.Tokens.Output > 0) {
			usage := byModel[entry.Model]
			if usage == nil {
				usage = &domain.ModelUsageBreakdown{Model: entry.Model}
				byModel[entry.Model] = usage
			}
			usage.InputTokens += entry.Tokens.Input
			usage.OutputTokens += entry.Tokens.Output
			usage.CacheReadTokens += entry.Tokens.Cached
			usage.Turns++
		}
	}
	breakdown := domain.UsageBreakdown{
		Models: make([]domain.ModelUsageBreakdown, 0, len(byModel)),
	}
	for _, usage := range byModel {
		breakdown.Total.InputTokens += usage.InputTokens
		breakdown.Total.OutputTokens += usage.OutputTokens
		breakdown.Total.CacheReadTokens += usage.CacheReadTokens
		breakdown.Total.Turns += usage.Turns
		breakdown.Models = append(breakdown.Models, *usage)
	}
	slices.SortFunc(breakdown.Models, func(a, b domain.ModelUsageBreakdown) int {
		at := a.InputTokens + a.OutputTokens
		bt := b.InputTokens + b.OutputTokens
		if at != bt {
			return bt - at
		}
		return strings.Compare(a.Model, b.Model)
	})
	return breakdown
}
