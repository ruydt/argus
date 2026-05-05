package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"agent-monitor/internal/agents/claudecode"
	"agent-monitor/internal/agents/codex"
	"agent-monitor/internal/events"
)

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

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

func main() {
	st := &events.Store{}

	mux := http.NewServeMux()

	mux.HandleFunc("/api/events", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"events": st.Events()})
	})

	mux.HandleFunc("/api/session-usage", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Query().Get("path")
		if path == "" {
			http.Error(w, "missing path", http.StatusBadRequest)
			return
		}
		if claudecode.MatchesTranscript(path) {
			writeJSON(w, claudecode.ComputeUsage(path))
			return
		}
		writeJSON(w, codex.ComputeUsage(path))
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

	// /api/hook receives hook events from supported agents.
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
			if p.Model != "" {
				st.RememberSessionModel(p.SessionID, p.Model)
			} else if st.SessionModel(p.SessionID) == "" && claudecode.MatchesTranscript(p.TranscriptPath) {
				if m := claudecode.ModelFromTranscript(p.TranscriptPath); m != "" {
					st.RememberSessionModel(p.SessionID, m)
				}
			}
		}

		path := events.ResolvePath(p.CWD, p.ToolInput.FilePath)
		cmd := p.ToolInput.Command
		if path == "" {
			path = events.ResolvePath(p.CWD, p.FilePath)
		}
		if path == "" && cmd != "" && events.ToolToAction(p.ToolName) != "BASH" {
			path = events.ExtractPathFromCommand(cmd)
		}

		action := events.ToolToAction(p.ToolName)
		displayPath := path
		if action == "BASH" && cmd != "" {
			displayPath = "cmd: " + cmd
		}

		if displayPath != "" {
			log.Printf("[hook] session=%s model=%s tool=%s action=%s path=%s",
				p.SessionID, p.Model, p.ToolName, action, displayPath)

			var oldStr, newStr string
			parsedStartLine := 0
			if claudecode.MatchesTranscript(p.TranscriptPath) {
				oldStr, newStr = claudecode.Diff(claudecode.DiffInput{
					OldString: firstNonEmpty(p.ToolInput.OldString, p.ToolInput.OldStr),
					NewString: firstNonEmpty(p.ToolInput.NewString, p.ToolInput.NewStr),
				})
			} else {
				oldStr, newStr = codex.Diff(codex.DiffInput{
					OldStr: firstNonEmpty(p.ToolInput.OldStr, p.ToolInput.OldString),
					NewStr: firstNonEmpty(p.ToolInput.NewStr, p.ToolInput.NewString),
				})
				if oldStr == "" && newStr == "" && strings.Contains(strings.ToLower(p.ToolName), "apply_patch") {
					oldStr, newStr, parsedStartLine = codex.ParseApplyPatch(cmd)
					if parsedStartLine == 0 && oldStr != "" && path != "" {
						parsedStartLine = events.FindStartLine(path, oldStr)
					}
				}
			}

			// For Edit PreToolUse the file still has old_string — find its line.
			// For PostToolUse the file has new_string — find that instead.
			startLine := 0
			var ctxBefore, ctxAfter []events.CtxLine
			if action != "BASH" && path != "" {
				if p.HookEventName == "PreToolUse" && oldStr != "" {
					startLine = events.FindStartLine(path, oldStr)
					if startLine > 0 {
						ctxBefore, ctxAfter = events.ComputeContext(path, startLine, len(strings.Split(oldStr, "\n")), 3)
					}
				} else if p.HookEventName == "PostToolUse" && newStr != "" {
					startLine = events.FindStartLine(path, newStr)
					if startLine > 0 {
						ctxBefore, ctxAfter = events.ComputeContext(path, startLine, len(strings.Split(newStr, "\n")), 3)
					}
				}
			}
			if startLine == 0 && parsedStartLine > 0 {
				startLine = parsedStartLine
			}

			// Use cached model if this payload doesn't carry one
			model := p.Model
			if model == "" && p.SessionID != "" {
				model = st.SessionModel(p.SessionID)
			}

			st.AddEvent(events.FileEvent{
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
