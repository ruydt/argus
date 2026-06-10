package fileutil

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"argus/internal/domain"
)

func FirstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func Truncate(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	return s[:limit] + "\n...[truncated]"
}

func MarshalToolCalls(calls []domain.ToolCall) string {
	if len(calls) == 0 {
		return ""
	}
	b, _ := json.Marshal(calls)
	return string(b)
}

func ToolResultStdout(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var obj struct {
		Stdout string `json:"stdout"`
	}
	if json.Unmarshal(raw, &obj) == nil && obj.Stdout != "" {
		return Truncate(obj.Stdout, 4096)
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return Truncate(s, 4096)
	}
	return ""
}

func ToolResultStderr(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var obj struct {
		Stderr string `json:"stderr"`
	}
	if json.Unmarshal(raw, &obj) == nil {
		return Truncate(obj.Stderr, 1024)
	}
	return ""
}

func ResolvePath(cwd, path string) string {
	if path == "" {
		return ""
	}
	if filepath.IsAbs(path) {
		return path
	}
	return filepath.Join(cwd, path)
}

func ToolToAction(tool string) string {
	if tool == "" {
		return ""
	}
	t := strings.ToLower(tool)
	switch {
	case strings.Contains(t, "bash") || strings.Contains(t, "shell"):
		return "BASH"
	case strings.Contains(t, "read") || strings.Contains(t, "grep") ||
		strings.Contains(t, "glob") || strings.Contains(t, "search") ||
		strings.Contains(t, "list") || t == "ls" || strings.Contains(t, "view") ||
		strings.Contains(t, "cat"):
		return "READ"
	case strings.Contains(t, "edit") || strings.Contains(t, "write") ||
		strings.Contains(t, "create") || strings.Contains(t, "replace") ||
		strings.Contains(t, "patch") || strings.Contains(t, "insert") ||
		strings.Contains(t, "delete") || strings.Contains(t, "remove"):
		return "EDIT"
	default:
		return "TOOL"
	}
}

func HookEventAction(hookName string) string {
	switch hookName {
	case "SessionStart", "SessionEnd", "Setup":
		return "SESSION"
	case "Stop", "StopFailure":
		return "STOP"
	case "UserPromptSubmit", "UserPromptExpansion":
		return "PROMPT"
	case "SubagentStart", "SubagentStop", "TeammateIdle", "BeforeAgent", "AfterAgent":
		return "AGENT"
	case "BeforeModel", "AfterModel":
		return "MODEL"
	case "TaskCreated", "TaskCompleted":
		return "TASK"
	case "Notification":
		return "NOTIFY"
	case "PreCompact", "PostCompact":
		return "COMPACT"
	case "FileChanged":
		return "FILE"
	case "ConfigChange":
		return "CONFIG"
	case "WorktreeCreate", "WorktreeRemove":
		return "WORKTREE"
	case "PermissionRequest", "PermissionDenied":
		return "PERMISSION"
	case "CwdChanged":
		return "CWD"
	case "PostToolBatch":
		return "BATCH"
	case "InstructionsLoaded":
		return "INSTRUCT"
	case "MessageDisplay":
		return "DISPLAY"
	case "Elicitation", "ElicitationResult":
		return "ELICIT"
	default:
		return ""
	}
}

func ExtractPathFromCommand(cmd string) string {
	for _, tok := range strings.Fields(cmd) {
		tok = sanitizePathToken(tok)
		if tok == "" {
			continue
		}
		if strings.Trim(tok, "/") == "" {
			// Ignore bare slash/comment-like tokens such as "/" or "//".
			continue
		}
		if !strings.HasPrefix(tok, "/") && !strings.HasPrefix(tok, "./") {
			continue
		}
		// Accept if it looks like a file (has extension) or has multiple segments.
		if strings.Contains(tok, ".") || strings.Count(tok, "/") >= 2 {
			return tok
		}
	}
	return ""
}

func sanitizePathToken(tok string) string {
	tok = strings.TrimSpace(tok)
	tok = strings.Trim(tok, `"'`)
	tok = strings.TrimLeft(tok, "([{")
	tok = strings.TrimRight(tok, `),;]}`)
	tok = strings.Trim(tok, `"'`)
	return tok
}

// FindStartLine returns the 1-based line number where oldStr begins in filePath.
// Comparison ignores leading/trailing whitespace per line.
func FindStartLine(filePath, oldStr string) int {
	if filePath == "" || oldStr == "" {
		return 0
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return 0
	}
	fileLines := strings.Split(string(data), "\n")
	searchLines := strings.Split(strings.TrimRight(oldStr, "\n"), "\n")
	if len(searchLines) == 0 {
		return 0
	}
	for i := 0; i <= len(fileLines)-len(searchLines); i++ {
		match := true
		for j := 0; j < len(searchLines); j++ {
			f := strings.TrimSpace(fileLines[i+j])
			s := strings.TrimSpace(searchLines[j])
			if f != s {
				// Special case: allow empty lines to match even if they have different whitespace
				if f == "" && s == "" {
					continue
				}
				match = false
				break
			}
		}
		if match {
			return i + 1
		}
	}
	return 0
}

// ComputeContext returns ctxLines lines before/after a changed region.
// changeStart is 1-based. changeLen is the number of lines in the changed block.
func ComputeContext(filePath string, changeStart, changeLen, ctxLines int) (before, after []domain.CtxLine) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return
	}
	lines := strings.Split(string(data), "\n")
	n := len(lines)
	start := changeStart - 1
	end := start + changeLen - 1
	for i := max(0, start-ctxLines); i < start && i < n; i++ {
		before = append(before, domain.CtxLine{Num: i + 1, Text: lines[i]})
	}
	for i := end + 1; i <= end+ctxLines && i < n; i++ {
		after = append(after, domain.CtxLine{Num: i + 1, Text: lines[i]})
	}
	return
}
