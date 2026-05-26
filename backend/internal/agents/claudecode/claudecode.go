package claudecode

import (
	"bufio"
	"encoding/json"
	"os"
	"slices"
	"strings"

	"hooker/internal/domain"
	"hooker/internal/fileutil"
)

type DiffInput struct {
	OldString string
	NewString string
}

func MatchesTranscript(transcriptPath string) bool {
	return strings.Contains(transcriptPath, "/.claude/")
}

func Diff(input DiffInput) (oldStr, newStr string) {
	return input.OldString, input.NewString
}

// ModelFromTranscript scans a Claude Code session JSONL for the first
// assistant message and returns its model string.
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
			Type    string `json:"type"`
			Message struct {
				Model string `json:"model"`
			} `json:"message"`
		}
		if json.Unmarshal(scanner.Bytes(), &entry) == nil &&
			entry.Type == "assistant" && entry.Message.Model != "" {
			return entry.Message.Model
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
			Type    string `json:"type"`
			Message struct {
				Model string `json:"model"`
				Usage struct {
					InputTokens         int `json:"input_tokens"`
					OutputTokens        int `json:"output_tokens"`
					CacheCreationTokens int `json:"cache_creation_input_tokens"`
					CacheReadTokens     int `json:"cache_read_input_tokens"`
				} `json:"usage"`
			} `json:"message"`
		}
		if json.Unmarshal(scanner.Bytes(), &entry) == nil && entry.Type == "assistant" {
			usage := byModel[entry.Message.Model]
			if usage == nil {
				usage = &domain.ModelUsageBreakdown{Model: entry.Message.Model}
				byModel[entry.Message.Model] = usage
			}
			usage.InputTokens += entry.Message.Usage.InputTokens
			usage.OutputTokens += entry.Message.Usage.OutputTokens
			usage.CacheCreationTokens += entry.Message.Usage.CacheCreationTokens
			usage.CacheReadTokens += entry.Message.Usage.CacheReadTokens
			usage.Turns++
		}
	}
	breakdown := domain.UsageBreakdown{
		Models: make([]domain.ModelUsageBreakdown, 0, len(byModel)),
	}
	for _, usage := range byModel {
		breakdown.Total.InputTokens += usage.InputTokens
		breakdown.Total.OutputTokens += usage.OutputTokens
		breakdown.Total.CacheCreationTokens += usage.CacheCreationTokens
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

const claudecodeNormalizerVersion = "claudecode/1"

func AgentName() string {
	return "claudecode"
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

	isApplyPatchTool := strings.Contains(strings.ToLower(p.ToolName), "apply_patch")
	if path == "" && cmd != "" && action != "BASH" && !isApplyPatchTool {
		path = fileutil.ResolvePath(p.CWD, fileutil.ExtractPathFromCommand(cmd))
	}

	displayPath := path
	if action == "BASH" && cmd != "" {
		displayPath = "cmd: " + cmd
	}

	oldStr := fileutil.FirstNonEmpty(p.ToolInput.OldString, p.ToolInput.OldStr)
	newStr := fileutil.FirstNonEmpty(p.ToolInput.NewString, p.ToolInput.NewStr, p.ToolInput.Content)

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
		OldString:           oldStr,
		NewString:           newStr,
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
		NormalizerVersion:   claudecodeNormalizerVersion,
	}, nil
}
