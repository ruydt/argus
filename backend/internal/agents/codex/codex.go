package codex

import (
	"bufio"
	"encoding/json"
	"os"
	"regexp"
	"slices"
	"strings"

	"agent-monitor/internal/domain"
	"agent-monitor/internal/fileutil"
)

type DiffInput struct {
	OldStr string
	NewStr string
}

func MatchesTranscript(transcriptPath string) bool {
	return !strings.Contains(transcriptPath, "/.claude/")
}

func Diff(input DiffInput) (oldStr, newStr string) {
	return input.OldStr, input.NewStr
}

var hunkHeader = regexp.MustCompile(`^@@\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?`)

// ParseApplyPatch extracts one unified-diff hunk from an apply_patch command body.
// It returns old/new text blocks and the old-file start line from the hunk header.
func ParseApplyPatch(command string) (oldStr, newStr string, startLine int) {
	if !strings.Contains(command, "*** Begin Patch") {
		return "", "", 0
	}

	lines := strings.Split(command, "\n")
	var oldLines, newLines []string
	inHunk := false

	for _, line := range lines {
		trimmed := strings.TrimLeft(line, " \t")
		if !inHunk {
			if m := hunkHeader.FindStringSubmatch(trimmed); m != nil {
				startLine = atoi(m[1])
				inHunk = true
			}
			continue
		}

		if strings.HasPrefix(trimmed, "@@") || strings.HasPrefix(trimmed, "*** End Patch") {
			break
		}
		if strings.HasPrefix(trimmed, `\ No newline`) {
			continue
		}
		if strings.HasPrefix(trimmed, " ") {
			text := strings.TrimPrefix(trimmed, " ")
			oldLines = append(oldLines, text)
			newLines = append(newLines, text)
			continue
		}
		if strings.HasPrefix(trimmed, "-") {
			oldLines = append(oldLines, strings.TrimPrefix(trimmed, "-"))
			continue
		}
		if strings.HasPrefix(trimmed, "+") {
			newLines = append(newLines, strings.TrimPrefix(trimmed, "+"))
			continue
		}
	}

	if len(oldLines) == 0 && len(newLines) == 0 {
		return "", "", 0
	}
	return strings.Join(oldLines, "\n"), strings.Join(newLines, "\n"), startLine
}

func atoi(s string) int {
	n := 0
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c < '0' || c > '9' {
			break
		}
		n = n*10 + int(c-'0')
	}
	return n
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

	var (
		currentModel string
		prevTotal    usageSnapshot
	)
	byModel := map[string]*domain.ModelUsageBreakdown{}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)
	for scanner.Scan() {
		var entry struct {
			Type    string `json:"type"`
			Payload struct {
				Model string `json:"model"`
				Type  string `json:"type"`
				Info  struct {
					Total usageSnapshot `json:"total_token_usage"`
					Last  usageSnapshot `json:"last_token_usage"`
				} `json:"info"`
			} `json:"payload"`
		}
		if json.Unmarshal(scanner.Bytes(), &entry) != nil {
			continue
		}
		if entry.Type == "turn_context" && entry.Payload.Model != "" {
			currentModel = entry.Payload.Model
			continue
		}
		if entry.Type != "event_msg" || entry.Payload.Type != "token_count" {
			continue
		}
		delta := entry.Payload.Info.Last
		if !delta.hasUsage() && entry.Payload.Info.Total.hasUsage() {
			delta = entry.Payload.Info.Total.minus(prevTotal)
		}
		if !delta.hasUsage() {
			continue
		}

		usage := byModel[currentModel]
		if usage == nil {
			usage = &domain.ModelUsageBreakdown{Model: currentModel}
			byModel[currentModel] = usage
		}
		usage.InputTokens += delta.InputTokens
		usage.CacheReadTokens += delta.CachedInputTokens
		usage.OutputTokens += delta.OutputTokens
		usage.Turns++
		prevTotal = entry.Payload.Info.Total
	}
	return codexBreakdown(byModel)
}

type usageSnapshot struct {
	InputTokens       int `json:"input_tokens"`
	CachedInputTokens int `json:"cached_input_tokens"`
	OutputTokens      int `json:"output_tokens"`
}

func (u usageSnapshot) hasUsage() bool {
	return u.InputTokens > 0 || u.CachedInputTokens > 0 || u.OutputTokens > 0
}

func (u usageSnapshot) minus(prev usageSnapshot) usageSnapshot {
	return usageSnapshot{
		InputTokens:       max(u.InputTokens-prev.InputTokens, 0),
		CachedInputTokens: max(u.CachedInputTokens-prev.CachedInputTokens, 0),
		OutputTokens:      max(u.OutputTokens-prev.OutputTokens, 0),
	}
}

func codexBreakdown(byModel map[string]*domain.ModelUsageBreakdown) domain.UsageBreakdown {
	breakdown := domain.UsageBreakdown{
		Models: make([]domain.ModelUsageBreakdown, 0, len(byModel)),
	}
	for _, usage := range byModel {
		breakdown.Total.InputTokens += usage.InputTokens
		breakdown.Total.OutputTokens += usage.OutputTokens
		breakdown.Total.CacheReadTokens += usage.CacheReadTokens
		breakdown.Total.CacheCreationTokens += usage.CacheCreationTokens
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

func AgentName() string {
	return "codex"
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

	if path == "" && cmd != "" && action != "BASH" {
		path = fileutil.ExtractPathFromCommand(cmd)
	}

	displayPath := path
	if action == "BASH" && cmd != "" {
		displayPath = "cmd: " + cmd
	}

	oldStr, newStr := Diff(DiffInput{
		OldStr: firstNonEmpty(p.ToolInput.OldStr, p.ToolInput.OldString),
		NewStr: firstNonEmpty(p.ToolInput.NewStr, p.ToolInput.NewString),
	})
	if oldStr == "" && newStr == "" && strings.Contains(strings.ToLower(p.ToolName), "apply_patch") {
		oldStr, newStr, _ = ParseApplyPatch(cmd)
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
		OldString:           oldStr,
		NewString:           newStr,
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
		ToolCallsJSON:       marshalToolCalls(p.ToolCalls),
		ToolResultStdout:    toolResultStdout(p.ToolResponse),
		ToolResultStderr:    toolResultStderr(p.ToolResponse),
		DurationMS:          p.DurationMS,
	}, nil
}

func toolResultStdout(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var obj struct {
		Stdout string `json:"stdout"`
	}
	if json.Unmarshal(raw, &obj) == nil && obj.Stdout != "" {
		return truncate(obj.Stdout, 4096)
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return truncate(s, 4096)
	}
	return ""
}

func toolResultStderr(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var obj struct {
		Stderr string `json:"stderr"`
	}
	if json.Unmarshal(raw, &obj) == nil {
		return truncate(obj.Stderr, 1024)
	}
	return ""
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "\n...[truncated]"
}

func marshalToolCalls(calls []domain.ToolCall) string {
	if len(calls) == 0 {
		return ""
	}
	b, _ := json.Marshal(calls)
	return string(b)
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
