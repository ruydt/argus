package codex

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"slices"
	"strings"

	"hooker/internal/domain"
	"hooker/internal/fileutil"
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

var hunkHeader = regexp.MustCompile(`^@@(?:\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?)?`)
var lineNumPrefix = regexp.MustCompile(`^\s*\d+\s+`)

// ParseHunk represents a single diff hunk with its extracted lines.
type ParseHunk struct {
	StartLine   int
	OldLines    []string
	NewLines    []string
	SearchLines []string // Including context for searching
	PrefixLines int      // Context lines before the first change
}

// ParseApplyPatch extracts all unified-diff hunks from an apply_patch command body.
func ParseApplyPatch(command string) (filePath string, hunks []ParseHunk) {
	if !strings.Contains(command, "*** Begin Patch") {
		return "", nil
	}

	lines := strings.Split(command, "\n")
	var hunkIndent string
	inHunk := false
	var currentHunk *ParseHunk

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !inHunk {
			if p := patchFilePathFromHeader(trimmed); p != "" {
				filePath = p
				continue
			}
			if m := hunkHeader.FindStringSubmatch(trimmed); m != nil {
				idx := strings.Index(line, "@@")
				if idx >= 0 {
					hunkIndent = line[:idx]
				}
				inHunk = true
			}
			continue
		}

		if strings.HasPrefix(trimmed, "@@") {
			idx := strings.Index(line, "@@")
			if idx >= 0 {
				hunkIndent = line[:idx]
			}
			currentHunk = nil
			continue
		}

		if strings.HasPrefix(trimmed, "*** End Patch") {
			break
		}
		if strings.HasPrefix(trimmed, `\ No newline`) {
			continue
		}

		if !strings.HasPrefix(line, hunkIndent) {
			continue
		}
		actualLine := line[len(hunkIndent):]
		if len(actualLine) == 0 {
			continue
		}

		marker := actualLine[0]
		content := actualLine[1:]
		cleaned := lineNumPrefix.ReplaceAllString(content, "")

		// Force a new hunk for EVERY minus line or EVERY context block
		// to ensure they each get a separate FindStartLine call.
		if marker == '-' || (marker == ' ' && currentHunk != nil && (len(currentHunk.OldLines) > 0 || len(currentHunk.NewLines) > 0)) {
			currentHunk = nil
		}

		if currentHunk == nil {
			hunks = append(hunks, ParseHunk{})
			currentHunk = &hunks[len(hunks)-1]
		}

		switch marker {
		case ' ':
			currentHunk.SearchLines = append(currentHunk.SearchLines, cleaned)
		case '-':
			currentHunk.OldLines = append(currentHunk.OldLines, cleaned)
			currentHunk.SearchLines = append(currentHunk.SearchLines, cleaned)
		case '+':
			currentHunk.NewLines = append(currentHunk.NewLines, cleaned)
		}
	}

	return filePath, hunks
}

func patchFilePathFromHeader(trimmed string) string {
	switch {
	case strings.HasPrefix(trimmed, "*** Update File: "):
		return strings.TrimPrefix(trimmed, "*** Update File: ")
	case strings.HasPrefix(trimmed, "*** Add File: "):
		return strings.TrimPrefix(trimmed, "*** Add File: ")
	case strings.HasPrefix(trimmed, "*** Delete File: "):
		return strings.TrimPrefix(trimmed, "*** Delete File: ")
	case strings.HasPrefix(trimmed, "*** Move to: "):
		return strings.TrimPrefix(trimmed, "*** Move to: ")
	default:
		return ""
	}
}

func patchSnippetStrings(hunks []ParseHunk) (oldStr, newStr string) {
	var oldLines, newLines []string
	for _, h := range hunks {
		oldLines = append(oldLines, h.OldLines...)
		newLines = append(newLines, h.NewLines...)
	}
	return strings.Join(oldLines, "\n"), strings.Join(newLines, "\n")
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

const codexNormalizerVersion = "codex/1"

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

	isApplyPatchTool := strings.Contains(strings.ToLower(p.ToolName), "apply_patch")

	if path == "" && cmd != "" && action != "BASH" && !isApplyPatchTool {
		path = fileutil.ResolvePath(p.CWD, fileutil.ExtractPathFromCommand(cmd))
	}

	displayPath := path
	if action == "BASH" && cmd != "" {
		displayPath = "cmd: " + cmd
	}

	oldStr, newStr := Diff(DiffInput{
		OldStr: firstNonEmpty(p.ToolInput.OldStr, p.ToolInput.OldString),
		NewStr: firstNonEmpty(p.ToolInput.NewStr, p.ToolInput.NewString),
	})
	var startLine int
	if isApplyPatchTool {
		patchPath, hunks := ParseApplyPatch(cmd)
		patchOld, patchNew := patchSnippetStrings(hunks)
		if oldStr == "" {
			oldStr = patchOld
		}
		if newStr == "" {
			newStr = patchNew
		}

		if path == "" && patchPath != "" {
			path = fileutil.ResolvePath(p.CWD, patchPath)
			displayPath = path
		}

		// Reconstruct a "perfect" patch with real line numbers
		var perfectLines []string
		perfectLines = append(perfectLines, "*** Begin Patch")
		if path != "" {
			perfectLines = append(perfectLines, "*** "+path)
		}

		for _, h := range hunks {
			actualStart := h.StartLine
			searchStr := strings.Join(h.SearchLines, "\n")

			foundLine := 0
			if path != "" {
				// 1. Try to find the whole block first
				if searchStr != "" {
					foundLine = fileutil.FindStartLine(path, searchStr)
				}

				// 2. Fallback: Try to find based on the LONGEST (most unique) context line
				if foundLine == 0 {
					bestLine := ""
					bestIdx := -1
					for idx, line := range h.SearchLines {
						trimmed := strings.TrimSpace(line)
						if len(trimmed) > 10 { // Only trust lines with significant length
							if len(trimmed) > len(bestLine) {
								bestLine = trimmed
								bestIdx = idx
							}
						}
					}

					if bestLine != "" {
						if found := fileutil.FindStartLine(path, bestLine); found > 0 {
							// found is the line of bestLine, so start is found - bestIdx
							foundLine = found - bestIdx
						}
					}
				}
			}

			if foundLine > 0 {
				actualStart = foundLine + h.PrefixLines
			}
			if actualStart <= 0 {
				actualStart = 1
			}

			// Set the overall event startLine to the first hunk's start
			if startLine == 0 {
				startLine = actualStart
			}

			perfectLines = append(perfectLines, fmt.Sprintf("@@ -%d,1 +%d,1 @@", actualStart, actualStart))
			for _, line := range h.SearchLines {
				perfectLines = append(perfectLines, " "+line)
			}
			for _, line := range h.NewLines {
				perfectLines = append(perfectLines, "+"+line)
			}
		}
		perfectLines = append(perfectLines, "*** End Patch")

		// Use this perfect patch as the command for the UI to render
		p.ToolInput.Command = strings.Join(perfectLines, "\n")
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
		StartLine:           startLine,
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
		Trigger:             p.Trigger,
		NormalizerVersion:   codexNormalizerVersion,
		NormalizationStatus: "ok",
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

func truncate(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	return s[:limit] + "\n...[truncated]"
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
