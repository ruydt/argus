package fileutil

import (
	"os"
	"path/filepath"
	"strings"

	"agent-monitor/internal/domain"
)

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
	case "SubagentStart", "SubagentStop", "TeammateIdle":
		return "AGENT"
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
	default:
		return ""
	}
}

func ExtractPathFromCommand(cmd string) string {
	for _, tok := range strings.Fields(cmd) {
		tok = strings.Trim(tok, `"'`)
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
	for i := range len(fileLines) - len(searchLines) + 1 {
		match := true
		for j := range len(searchLines) {
			if strings.TrimSpace(fileLines[i+j]) != strings.TrimSpace(searchLines[j]) {
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
