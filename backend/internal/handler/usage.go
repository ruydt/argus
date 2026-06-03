package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"hooker/internal/agents/claudecode"
	"hooker/internal/agents/codex"
)

func Usage() http.Handler {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Printf("[handler] Usage: cannot determine home dir: %v", err)
		homeDir = ""
	}
	allowedRoot := filepath.Clean(homeDir)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Query().Get("path")
		if path == "" {
			http.Error(w, "missing path", http.StatusBadRequest)
			return
		}

		// Validate that the path resolves within the user's home directory.
		// This prevents arbitrary filesystem reads via the ?path= parameter.
		clean := filepath.Clean(path)
		if allowedRoot == "" || !strings.HasPrefix(clean, allowedRoot+string(filepath.Separator)) {
			http.Error(w, "path not allowed", http.StatusForbidden)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if claudecode.MatchesTranscript(path) {
			result := claudecode.ComputeUsage(path)
			if err := json.NewEncoder(w).Encode(result); err != nil {
				log.Printf("[handler] encode %T: %v", result, err)
			}
			return
		}
		result := codex.ComputeUsage(path)
		if err := json.NewEncoder(w).Encode(result); err != nil {
			log.Printf("[handler] encode %T: %v", result, err)
		}
	})
}
