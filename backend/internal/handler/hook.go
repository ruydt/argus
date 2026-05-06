package handler

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"agent-monitor/internal/agents/claudecode"
	"agent-monitor/internal/agents/codex"
	"agent-monitor/internal/domain"
	"agent-monitor/internal/fileutil"
	"agent-monitor/internal/service"
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
		if claudecode.MatchesTranscript(meta.TranscriptPath) {
			e, err = claudecode.Normalize(raw)
		} else {
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

	if e.HookEventName == "PreToolUse" && e.OldString != "" {
		if startLine := fileutil.FindStartLine(e.Path, e.OldString); startLine > 0 {
			e.StartLine = startLine
			e.CtxBefore, e.CtxAfter = fileutil.ComputeContext(
				e.Path, startLine, len(strings.Split(e.OldString, "\n")), 3,
			)
		}
	} else if e.HookEventName == "PostToolUse" && e.NewString != "" {
		if startLine := fileutil.FindStartLine(e.Path, e.NewString); startLine > 0 {
			e.StartLine = startLine
			e.CtxBefore, e.CtxAfter = fileutil.ComputeContext(
				e.Path, startLine, len(strings.Split(e.NewString, "\n")), 3,
			)
		}
	}

	return e
}
