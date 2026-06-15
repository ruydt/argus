package claudecode

import (
	"bufio"
	"encoding/json"
	"os"
	"strings"

	"argus/internal/domain"
	"argus/internal/fileutil"
)

// MatchesTranscript reports whether a transcript path belongs to Claude Code.
// Detection is path-based: Claude Code stores transcripts under a ".claude"
// directory. Both POSIX (/) and Windows (\) separators are recognized.
//
// LIMITATION: if CLAUDE_CONFIG_DIR points the transcript outside a ".claude"
// directory, Claude Code events fall through to the Codex default and are
// misclassified. This is the documented single detection mechanism; corroborating
// it would require agent-specific payload-shape signals.
func MatchesTranscript(transcriptPath string) bool {
	return strings.Contains(transcriptPath, "/.claude/") ||
		strings.Contains(transcriptPath, `\.claude\`)
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
	return domain.BuildUsageBreakdown(byModel)
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
		Agent:                     AgentName(),
		Session:                   p.SessionID,
		HookEventName:             p.HookEventName,
		TurnID:                    p.TurnID,
		ToolUseID:                 p.ToolUseID,
		Tool:                      p.ToolName,
		Model:                     p.Model,
		Source:                    p.Source,
		CWD:                       p.CWD,
		TranscriptPath:            p.TranscriptPath,
		Prompt:                    p.Prompt,
		Description:               p.ToolInput.Description,
		ToolInputQuestionsJSON:    marshalRawJSON(p.ToolInput.Questions),
		PermissionSuggestionsJSON: marshalRawJSON(p.PermissionSuggestions),
		Action:                    action,
		Path:                      displayPath,
		Command:                   cmd,
		OldString:                 oldStr,
		NewString:                 newStr,
		RawPayload:                raw,
		PermissionMode:            p.PermissionMode,
		Response:                  fileutil.FirstNonEmpty(p.Response, p.LastAssistantMessage),
		ErrorMessage:              fileutil.FirstNonEmpty(p.ErrorMessage, p.Error),
		ErrorType:                 p.ErrorType,
		SubagentID:                p.AgentID,
		SubagentType:              p.AgentType,
		TaskID:                    p.TaskID,
		TaskTitle:                 p.TaskTitle,
		TaskDescription:           p.TaskDescription,
		NotificationType:          p.NotificationType,
		NotificationTitle:         p.Title,
		NotificationMessage:       p.Message,
		ChangeType:                p.ChangeType,
		OldCWD:                    p.OldCWD,
		NewCWD:                    p.NewCWD,
		ToolCallsJSON:             fileutil.MarshalToolCalls(p.ToolCalls),
		ToolResultStdout:          fileutil.ToolResultStdout(p.ToolResponse),
		ToolResultStderr:          fileutil.ToolResultStderr(p.ToolResponse),
		DurationMS:                p.DurationMS,
		Trigger:                   p.Trigger,
		ExpansionType:             p.ExpansionType,
		CommandName:               p.CommandName,
		MemoryType:                p.MemoryType,
		LoadReason:                p.LoadReason,
		Branch:                    p.Branch,
		ServerName:                p.ServerName,
		NormalizerVersion:         claudecodeNormalizerVersion,
		NormalizationStatus:       "ok",
	}, nil
}

// marshalRawJSON converts a json.RawMessage to its string representation.
// Returns "" for nil or empty input so callers can use the zero value check.
func marshalRawJSON(b json.RawMessage) string {
	if len(b) == 0 {
		return ""
	}
	return string(b)
}
