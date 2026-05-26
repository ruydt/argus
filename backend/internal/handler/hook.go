package handler

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

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
		var normalizeErr error
		switch {
		case claudecode.MatchesTranscript(meta.TranscriptPath):
			e, normalizeErr = claudecode.Normalize(raw)
		case geminicli.MatchesTranscript(meta.TranscriptPath) || meta.Source == "gemini":
			e, normalizeErr = geminicli.Normalize(raw)
		default:
			e, normalizeErr = codex.Normalize(raw)
		}

		// Degraded mode (MODEL-04, D-03): unknown payloads are ingested rather than dropped.
		// A normalization failure (parse error) OR a completely unrecognized payload (no session,
		// no hook event, no tool — all agent parsers accept any valid JSON) both trigger degraded.
		// The degraded check combines both cases to catch the full range of unrecognizable inputs.
		isDegraded := normalizeErr != nil || (e.Session == "" && e.HookEventName == "" && e.Tool == "")
		if isDegraded {
			// Compute a stable dedup key from the raw bytes so two different unknown payloads
			// don't collide at the INSERT OR IGNORE level.
			rawHash := fmt.Sprintf("%x", sha256.Sum256(raw))
			e = domain.NormalizedEvent{
				Time:                time.Now().UTC().Format(time.RFC3339),
				Agent:               "unknown",
				Session:             "degraded-" + rawHash[:16],
				RawPayload:          raw,
				NormalizationStatus: "degraded",
				NormalizerVersion:   "hooker/1",
			}
			if normalizeErr != nil {
				slog.Warn("degraded ingest (parse error)", "err", normalizeErr, "raw_len", len(raw))
			} else {
				slog.Warn("degraded ingest (unrecognized payload)", "raw_len", len(raw))
			}
		} else {
			e.NormalizationStatus = "ok"
			// NormalizerVersion already set by agent Normalize() (Task 1).
			// AgentVersion (MODEL-03): neither Claude Code nor Codex currently expose a version
			// field in their hook payloads, so e.AgentVersion remains "" (the zero value). The
			// field is stored as an empty string in the DB. When a payload version field is
			// identified in a future adapter update, set it here via meta.AgentVersion.
			// For now, the empty string is the correct and intentional value per RESEARCH.md Q3.
			_ = e.AgentVersion // explicit acknowledgement: remains "" — best-effort field per MODEL-03
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

		slog.Info("hook", "agent", e.Agent, "session", e.Session, "tool", e.Tool, "action", e.Action, "path", e.Path)

		if err := svc.AddEvent(e); err != nil {
			slog.Error("hook store event", "err", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusAccepted)
			_, _ = w.Write([]byte(`{}`))
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
