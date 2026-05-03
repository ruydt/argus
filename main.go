package main

import (
	"encoding/json"
	"fmt"
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
}

// hookPayload mirrors the documented Codex hook payload.
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
		FilePath    string `json:"file_path"` // Write / Edit / MultiEdit
		Command     string `json:"command"`   // Bash tool
		Description string `json:"description"`
	} `json:"tool_input"`

	// Flat fallback for file-based tools.
	FilePath string `json:"file_path"`
}

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

type appState struct {
	mu     sync.RWMutex
	events []fileEvent
	seen   map[string]bool
}

func (s *appState) resolveHook(p hookPayload) string {
	return p.SessionID
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
// main
// ---------------------------------------------------------------------------

func main() {
	st := &appState{}

	mux := http.NewServeMux()
	mux.HandleFunc("/", serveUI)

	mux.HandleFunc("/api/events", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"events": st.eventsForSelected()})
	})

	// /api/hook — receives PostToolUse events directly from each agent.
	// Attribution is exact: the agent's own session_id arrives in the payload.
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

		// Resolve which file was affected
		path := p.ToolInput.FilePath
		cmd := p.ToolInput.Command
		if path == "" {
			path = p.FilePath
		}
		if path == "" && cmd != "" && toolToAction(p.ToolName) != "BASH" {
			path = extractPathFromCommand(cmd)
		}
		if path == "" {
			// Nothing actionable (e.g. a read tool)
			w.WriteHeader(http.StatusNoContent)
			return
		}

		action := toolToAction(p.ToolName)
		displayPath := path
		if action == "BASH" && cmd != "" {
			displayPath = "cmd: " + cmd
		}
		session := st.resolveHook(p)

		log.Printf("[hook] session=%s transcript=%s model=%s source=%s tool=%s action=%s file=%s",
			session, p.TranscriptPath, p.Model, p.Source, p.ToolName, action, displayPath)

		st.addEvent(fileEvent{
			Time:           time.Now().Format(time.RFC3339),
			Action:         action,
			Path:           displayPath,
			Command:        cmd,
			Session:        session,
			TranscriptPath: p.TranscriptPath,
			Tool:           p.ToolName,
			HookEventName:  p.HookEventName,
			TurnID:         p.TurnID,
			ToolUseID:      p.ToolUseID,
			Source:         p.Source,
			Model:          p.Model,
			CWD:            p.CWD,
			Prompt:         p.Prompt,
			Description:    p.ToolInput.Description,
		})

		// Empty JSON response — agent continues normally
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{}`))
	})

	addr := "127.0.0.1:8765"
	log.Printf("Agent Monitor ready  →  http://%s", addr)
	log.Printf("Hook endpoint        →  POST http://%s/api/hook", addr)
	http.ListenAndServe(addr, mux)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func serveUI(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	ui, err := os.ReadFile("ui.html")
	if err != nil {
		http.Error(w, "ui unavailable", http.StatusInternalServerError)
		return
	}
	fmt.Fprint(w, string(ui))
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func toolToAction(tool string) string {
	t := strings.ToLower(tool)
	switch {
	case strings.Contains(t, "write"):
		return "CREATE"
	case strings.Contains(t, "edit") || strings.Contains(t, "patch"):
		return "EDIT"
	case strings.Contains(t, "delete") || strings.Contains(t, "remove"):
		return "DELETE"
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
