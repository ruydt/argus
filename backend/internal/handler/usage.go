package handler

import (
	"encoding/json"
	"net/http"

	"agent-monitor/internal/agents/claudecode"
	"agent-monitor/internal/agents/codex"
)

func Usage() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Query().Get("path")
		if path == "" {
			http.Error(w, "missing path", http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if claudecode.MatchesTranscript(path) {
			_ = json.NewEncoder(w).Encode(claudecode.ComputeUsage(path))
			return
		}
		_ = json.NewEncoder(w).Encode(codex.ComputeUsage(path))
	})
}
