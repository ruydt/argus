package handler

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"hooker/internal/agents/claudecode"
	"hooker/internal/agents/codex"
	"hooker/internal/domain"
	"hooker/internal/fileutil"
	"hooker/internal/notify"
	"hooker/internal/service"
)

// IgnoreMatcher is the interface satisfied by privacy/ignore.Matcher.
// Accepted by Hook so tests can inject allow-none or match-all stubs.
type IgnoreMatcher interface {
	MatchEvent(e domain.NormalizedEvent) (bool, string)
}

type permissionResponse struct {
	Decision string `json:"decision"`
	Reason   string `json:"reason,omitempty"`
}

func Hook(svc *service.EventService, matcher IgnoreMatcher, notifier notify.Notifier) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		const maxHookBodyBytes = 1 << 20 // 1 MiB
		r.Body = http.MaxBytesReader(w, r.Body, maxHookBodyBytes)
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			var maxErr *http.MaxBytesError
			if errors.As(err, &maxErr) {
				http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
				return
			}
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

		// Privacy gate (D-03): apply ignore matcher after CWD/Path are canonical.
		// Gate is before session-model backfill, hook logging, and svc.AddEvent so
		// no data is persisted or broadcast for matched events (T-03-02-01).
		if matched, reason := matcher.MatchEvent(e); matched {
			// Metadata-only log: agent/session/action/reason only — no path, prompt,
			// command, old_string, new_string, raw, stdout, or stderr (D-04, T-03-02-02).
			slog.Info("hook ignored", "agent", e.Agent, "session", e.Session, "action", e.Action, "reason", reason)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{}`))
			return
		}

		if e.Model == "" && e.Session != "" {
			if model, err := svc.SessionModel(e.Session); err == nil && model != "" {
				e.Model = model
			}
		}
		if e.Model == "" && e.TranscriptPath != "" {
			if claudecode.MatchesTranscript(e.TranscriptPath) {
				e.Model = claudecode.ModelFromTranscript(e.TranscriptPath)
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

		// Permission intercept: hold response open while user decides in native dialog.
		// Falls through (writes {}) on timeout, dismiss, or nil notifier.
		// Background context: decouples dialog lifetime from the HTTP request context so
		// the osascript process isn't killed if Claude Code's hook client times out first.
		if e.HookEventName == "PermissionRequest" && notifier != nil {
			notifyCtx, notifyCancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer notifyCancel()
			decision, notifyErr := notifier.ShowPermissionDialog(notifyCtx, e)
			if notifyErr == nil && decision.Action != "" {
				w.Header().Set("Content-Type", "application/json")
				if err := json.NewEncoder(w).Encode(permissionResponse{
					Decision: decision.Action,
					Reason:   decision.Reason,
				}); err != nil {
					slog.Error("hook encode permission response", "err", err)
				}
				return
			}
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
