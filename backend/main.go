package main

import (
	"bufio"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

type fileEvent struct {
	Time           string `json:"time"`
	Action         string `json:"action"`
	Path           string `json:"path"`
	Command        string `json:"command,omitempty"`
	Session        string `json:"session,omitempty"`
	TranscriptPath string `json:"transcript_path,omitempty"`
	Tool           string `json:"tool,omitempty"`
	HookEventName  string `json:"hook_event_name,omitempty"`
	TurnID         string `json:"turn_id,omitempty"`
	ToolUseID      string `json:"tool_use_id,omitempty"`
	Source         string `json:"source,omitempty"`
	Model          string `json:"model,omitempty"`
	CWD            string `json:"cwd,omitempty"`
	Prompt         string `json:"prompt,omitempty"`
	Description    string `json:"description,omitempty"`
	OldString      string     `json:"old_string,omitempty"`
	NewString      string     `json:"new_string,omitempty"`
	StartLine      int        `json:"start_line,omitempty"`
	CtxBefore      []ctxLine  `json:"ctx_before,omitempty"`
	CtxAfter       []ctxLine  `json:"ctx_after,omitempty"`
}

type ctxLine struct {
	Num  int    `json:"num"`
	Text string `json:"text"`
}
// hookPayload mirrors the Codex hook payload schema.
type hookPayload struct {
	SessionID      string `json:"session_id"`
	TranscriptPath string `json:"transcript_path"`
	CWD            string `json:"cwd"`
	HookEventName  string `json:"hook_event_name"`
	Model          string `json:"model"`
	Source         string `json:"source"`
	TurnID         string `json:"turn_id"`
	ToolName       string `json:"tool_name"`
	ToolUseID      string `json:"tool_use_id"`
	Prompt         string `json:"prompt"`

	ToolInput struct {
		FilePath    string `json:"file_path"`
		Command     string `json:"command"`
		Description string `json:"description"`
		// Claude Code Edit tool
		OldString string `json:"old_string"`
		NewString string `json:"new_string"`
		// Codex str_replace tool (different field names)
		OldStr string `json:"old_str"`
		NewStr string `json:"new_str"`
	} `json:"tool_input"`

	FilePath string `json:"file_path"`
}

type usageBucket struct {
	Date     string  `json:"date"`
	Model    string  `json:"model"`
	Requests int     `json:"requests"`
	Tokens   int     `json:"tokens"`
	CostUSD  float64 `json:"cost_usd"`
	Project  string  `json:"project"`
	User     string  `json:"user"`
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

type appState struct {
	mu          sync.RWMutex
	events      []fileEvent
	seen        map[string]bool
	sessionModel map[string]string // session_id → model
}

func (s *appState) addEvent(e fileEvent) {
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

func (s *appState) eventsForSelected() []fileEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]fileEvent, 0, len(s.events))
	for _, e := range s.events {
		out = append(out, e)
	}
	return out
}

// ---------------------------------------------------------------------------
// Helpers — model + line-number resolution
// ---------------------------------------------------------------------------

// modelFromTranscript scans a Claude Code session JSONL for the first
// assistant message and returns its model string.
func modelFromTranscript(transcriptPath string) string {
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

// computeContext returns ctxLines lines before/after the changed region, reading filePath.
// changeStart is 1-based. changeLen is the number of lines in the changed block.
func computeContext(filePath string, changeStart, changeLen, ctxLines int) (before, after []ctxLine) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return
	}
	lines := strings.Split(string(data), "\n")
	n := len(lines)
	// convert to 0-based
	s := changeStart - 1
	e := s + changeLen - 1
	for i := max(0, s-ctxLines); i < s && i < n; i++ {
		before = append(before, ctxLine{Num: i + 1, Text: lines[i]})
	}
	for i := e + 1; i <= e+ctxLines && i < n; i++ {
		after = append(after, ctxLine{Num: i + 1, Text: lines[i]})
	}
	return
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

type sessionUsage struct {
	InputTokens         int `json:"input_tokens"`
	OutputTokens        int `json:"output_tokens"`
	CacheCreationTokens int `json:"cache_creation_tokens"`
	CacheReadTokens     int `json:"cache_read_tokens"`
	Turns               int `json:"turns"`
}

func computeUsage(transcriptPath string) sessionUsage {
	f, err := os.Open(transcriptPath)
	if err != nil {
		return sessionUsage{}
	}
	defer f.Close()
	var u sessionUsage
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 4*1024*1024), 4*1024*1024)
	for scanner.Scan() {
		var entry struct {
			Type    string `json:"type"`
			Message struct {
				Usage struct {
					InputTokens         int `json:"input_tokens"`
					OutputTokens        int `json:"output_tokens"`
					CacheCreationTokens int `json:"cache_creation_input_tokens"`
					CacheReadTokens     int `json:"cache_read_input_tokens"`
				} `json:"usage"`
			} `json:"message"`
		}
		if json.Unmarshal(scanner.Bytes(), &entry) == nil && entry.Type == "assistant" {
			u.InputTokens += entry.Message.Usage.InputTokens
			u.OutputTokens += entry.Message.Usage.OutputTokens
			u.CacheCreationTokens += entry.Message.Usage.CacheCreationTokens
			u.CacheReadTokens += entry.Message.Usage.CacheReadTokens
			u.Turns++
		}
	}
	return u
}

// findStartLine returns the 1-based line number where oldStr begins in the file.
func findStartLine(filePath, oldStr string) int {
	if filePath == "" || oldStr == "" {
		return 0
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return 0
	}
	idx := strings.Index(string(data), oldStr)
	if idx < 0 {
		return 0
	}
	return strings.Count(string(data)[:idx], "\n") + 1
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

func main() {
	st := &appState{}

	mux := http.NewServeMux()

	mux.HandleFunc("/api/events", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"events": st.eventsForSelected()})
	})

	mux.HandleFunc("/api/session-usage", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Query().Get("path")
		if path == "" {
			http.Error(w, "missing path", http.StatusBadRequest)
			return
		}
		writeJSON(w, computeUsage(path))
	})

	mux.HandleFunc("/api/openai/", func(w http.ResponseWriter, r *http.Request) {
		apiKey := r.Header.Get("Authorization")
		if apiKey == "" {
			http.Error(w, "missing auth", http.StatusUnauthorized)
			return
		}
		
		path := strings.TrimPrefix(r.URL.Path, "/api/openai/")
		targetURL := "https://api.openai.com/v1/organization/" + path
		
		req, err := http.NewRequest("GET", targetURL+"?"+r.URL.RawQuery, nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		req.Header.Set("Authorization", apiKey)
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	})

	// /api/hook — receives every hook event from Codex
	mux.HandleFunc("/api/hook", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var p hookPayload
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		// Cache model per session — SessionStart carries it; others don't.
		// Fall back to scanning the transcript JSONL when not yet cached.
		if p.SessionID != "" {
			st.mu.Lock()
			if st.sessionModel == nil {
				st.sessionModel = map[string]string{}
			}
			if p.Model != "" {
				st.sessionModel[p.SessionID] = p.Model
			} else if st.sessionModel[p.SessionID] == "" && p.TranscriptPath != "" {
				if m := modelFromTranscript(p.TranscriptPath); m != "" {
					st.sessionModel[p.SessionID] = m
				}
			}
			st.mu.Unlock()
		}

		path := p.ToolInput.FilePath
		cmd := p.ToolInput.Command
		if path == "" {
			path = p.FilePath
		}
		if path == "" && cmd != "" && toolToAction(p.ToolName) != "BASH" {
			path = extractPathFromCommand(cmd)
		}

		action := toolToAction(p.ToolName)
		displayPath := path
		if action == "BASH" && cmd != "" {
			displayPath = "cmd: " + cmd
		}

		if displayPath != "" {
			log.Printf("[hook] session=%s model=%s tool=%s action=%s path=%s",
				p.SessionID, p.Model, p.ToolName, action, displayPath)

			// Resolve diff strings per-agent to avoid mixing formats
			var oldStr, newStr string
			isClaudeCode := strings.Contains(p.TranscriptPath, "/.claude/")
			if isClaudeCode {
				oldStr = p.ToolInput.OldString
				newStr = p.ToolInput.NewString
			} else {
				// Codex uses old_str/new_str field names
				oldStr = p.ToolInput.OldStr
				newStr = p.ToolInput.NewStr
			}

			// For Edit PreToolUse the file still has old_string — find its line.
			// For PostToolUse the file has new_string — find that instead.
			startLine := 0
			var ctxBefore, ctxAfter []ctxLine
			if action != "BASH" && p.ToolInput.FilePath != "" {
				if p.HookEventName == "PreToolUse" && oldStr != "" {
					startLine = findStartLine(p.ToolInput.FilePath, oldStr)
					if startLine > 0 {
						ctxBefore, ctxAfter = computeContext(p.ToolInput.FilePath, startLine, len(strings.Split(oldStr, "\n")), 3)
					}
				} else if p.HookEventName == "PostToolUse" && newStr != "" {
					startLine = findStartLine(p.ToolInput.FilePath, newStr)
					if startLine > 0 {
						ctxBefore, ctxAfter = computeContext(p.ToolInput.FilePath, startLine, len(strings.Split(newStr, "\n")), 3)
					}
				}
			}

			// Use cached model if this payload doesn't carry one
			model := p.Model
			if model == "" && p.SessionID != "" {
				st.mu.RLock()
				model = st.sessionModel[p.SessionID]
				st.mu.RUnlock()
			}

			st.addEvent(fileEvent{
				Time:           time.Now().Format(time.RFC3339),
				Action:         action,
				Path:           displayPath,
				Command:        cmd,
				Session:        p.SessionID,
				TranscriptPath: p.TranscriptPath,
				Tool:           p.ToolName,
				HookEventName:  p.HookEventName,
				TurnID:         p.TurnID,
				ToolUseID:      p.ToolUseID,
				Source:         p.Source,
				Model:          model,
				CWD:            p.CWD,
				Prompt:         p.Prompt,
				Description:    p.ToolInput.Description,
				OldString:      oldStr,
				NewString:      newStr,
				StartLine:      startLine,
				CtxBefore:      ctxBefore,
				CtxAfter:       ctxAfter,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{}`))
	})

	addr := "127.0.0.1:8765"
	log.Printf("Hook endpoint → POST http://%s/api/hook", addr)
	http.ListenAndServe(addr, mux)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func toolToAction(tool string) string {
	t := strings.ToLower(tool)
	switch {
	case strings.Contains(t, "bash") || strings.Contains(t, "shell"):
		return "BASH"
	default:
		return "EDIT"
	}
}

func extractPathFromCommand(cmd string) string {
	for _, tok := range strings.Fields(cmd) {
		tok = strings.Trim(tok, `"'`)
		if (strings.HasPrefix(tok, "/") || strings.HasPrefix(tok, "./")) &&
			strings.Contains(tok, ".") {
			return tok
		}
	}
	return ""
}
