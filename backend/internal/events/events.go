package events

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
)

type FileEvent struct {
	Time           string    `json:"time"`
	Action         string    `json:"action"`
	Path           string    `json:"path"`
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
}

type CtxLine struct {
	Num  int    `json:"num"`
	Text string `json:"text"`
}

type Store struct {
	mu           sync.RWMutex
	events       []FileEvent
	seen         map[string]bool
	sessionModel map[string]string
}

func (s *Store) AddEvent(e FileEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.seen == nil {
		s.seen = map[string]bool{}
	}
	key := e.Time + "|" + e.Action + "|" + e.Path + "|" + e.Session + "|" + e.TranscriptPath
	if s.seen[key] {
		return
	}
	s.seen[key] = true
	s.events = append(s.events, e)
	if len(s.events) > 1000 {
		s.events = s.events[len(s.events)-1000:]
	}
}

func (s *Store) Events() []FileEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]FileEvent, 0, len(s.events))
	out = append(out, s.events...)
	return out
}

func (s *Store) RememberSessionModel(sessionID, model string) {
	if sessionID == "" || model == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.sessionModel == nil {
		s.sessionModel = map[string]string{}
	}
	s.sessionModel[sessionID] = model
}

func (s *Store) SessionModel(sessionID string) string {
	if sessionID == "" {
		return ""
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sessionModel[sessionID]
}

// ComputeContext returns ctxLines lines before/after the changed region, reading filePath.
// changeStart is 1-based. changeLen is the number of lines in the changed block.
func ComputeContext(filePath string, changeStart, changeLen, ctxLines int) (before, after []CtxLine) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return
	}
	lines := strings.Split(string(data), "\n")
	n := len(lines)
	start := changeStart - 1
	end := start + changeLen - 1
	for i := max(0, start-ctxLines); i < start && i < n; i++ {
		before = append(before, CtxLine{Num: i + 1, Text: lines[i]})
	}
	for i := end + 1; i <= end+ctxLines && i < n; i++ {
		after = append(after, CtxLine{Num: i + 1, Text: lines[i]})
	}
	return
}

// FindStartLine returns the 1-based line number where oldStr begins in the file.
// It performs a line-by-line comparison ignoring leading/trailing whitespace.
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
	t := strings.ToLower(tool)
	switch {
	case strings.Contains(t, "bash") || strings.Contains(t, "shell"):
		return "BASH"
	default:
		return "EDIT"
	}
}

func ExtractPathFromCommand(cmd string) string {
	for _, tok := range strings.Fields(cmd) {
		tok = strings.Trim(tok, `"'`)
		if (strings.HasPrefix(tok, "/") || strings.HasPrefix(tok, "./")) &&
			strings.Contains(tok, ".") {
			return tok
		}
	}
	return ""
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
