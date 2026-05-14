package handler

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"hooker/internal/agents/claudecode"
	"hooker/internal/agents/codex"
	"hooker/internal/agents/geminicli"
	"hooker/internal/domain"
	"hooker/internal/fileutil"
	"hooker/internal/service"
)

func Hook(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		raw, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "read body", http.StatusBadRequest)
			return
		}

		var meta domain.RawPayload
		if err := json.Unmarshal(raw, &meta); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}

		var e domain.NormalizedEvent
		switch {
		case claudecode.MatchesTranscript(meta.TranscriptPath):
			e, err = claudecode.Normalize(raw)
		case geminicli.MatchesTranscript(meta.TranscriptPath) || meta.Source == "gemini":
			e, err = geminicli.Normalize(raw)
		default:
			e, err = codex.Normalize(raw)
		}
		if err != nil {
			http.Error(w, "normalize payload", http.StatusBadRequest)
			return
		}

		e = enrichContext(e)

		if e.Model == "" && e.Session != "" {
			if model, err := svc.SessionModel(e.Session); err == nil && model != "" {
				e.Model = model
			}
		}
		if e.Model == "" && e.TranscriptPath != "" {
			if claudecode.MatchesTranscript(e.TranscriptPath) {
				e.Model = claudecode.ModelFromTranscript(e.TranscriptPath)
			} else if geminicli.MatchesTranscript(e.TranscriptPath) {
				e.Model = geminicli.ModelFromTranscript(e.TranscriptPath)
			}
		}

		log.Printf("[hook] agent=%s session=%s tool=%s action=%s path=%s", e.Agent, e.Session, e.Tool, e.Action, e.Path)

		if err := svc.AddEvent(e); err != nil {
			http.Error(w, "store event", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{}`))
	})
}

func enrichContext(e domain.NormalizedEvent) domain.NormalizedEvent {
	if e.Action == "BASH" || e.Path == "" {
		return e
	}

	searchStr := ""
	switch {
	case e.HookEventName == "PreToolUse" && e.OldString != "":
		searchStr = e.OldString
	case e.HookEventName == "PostToolUse" && e.NewString != "":
		searchStr = e.NewString
	case e.Action == "EDIT":
		// General EDIT action fallback
		switch {
		case e.OldString != "":
			searchStr = e.OldString
		case e.NewString != "":
			searchStr = e.NewString
		}
	}

	if searchStr == "" {
		return e
	}

	startLine := e.StartLine
	// If startLine is 0 or 1, it might be missing or snippet-relative.
	// Try to find the actual position in the file.
	if startLine <= 1 {
		if found := fileutil.FindStartLine(e.Path, searchStr); found > 0 {
			startLine = found
		}
	}

	if startLine > 0 {
		e.StartLine = startLine
		// Only compute context if not already present or if we found a better startLine
		if len(e.CtxBefore) == 0 && len(e.CtxAfter) == 0 {
			lineCount := len(strings.Split(strings.TrimRight(searchStr, "\n"), "\n"))
			e.CtxBefore, e.CtxAfter = fileutil.ComputeContext(e.Path, startLine, lineCount, 3)
		}
	}

	return e
}
