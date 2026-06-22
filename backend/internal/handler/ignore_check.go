package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"argus/internal/domain"
)

type ignoreCheckRequest struct {
	Path string `json:"path"`
}

type ignoreCheckResponse struct {
	Ignored bool   `json:"ignored"`
	Reason  string `json:"reason"`
}

// IgnoreCheck reports whether a given path would be excluded from ingestion by the
// active privacy ignore rules. It reuses the same Matcher the hook ingest path uses
// (via the IgnoreMatcher interface), so the answer matches real ingestion exactly.
// Read-only: it inspects only the supplied path and returns the matched pattern,
// never any event data.
func IgnoreCheck(matcher IgnoreMatcher) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		const maxBody = 1 << 16 // 64 KiB — a path is tiny; cap defensively
		r.Body = http.MaxBytesReader(w, r.Body, maxBody)

		var req ignoreCheckRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		path := strings.TrimSpace(req.Path)
		if path == "" {
			http.Error(w, "path is required", http.StatusBadRequest)
			return
		}

		ignored, reason := matcher.MatchEvent(domain.NormalizedEvent{Path: path})

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(ignoreCheckResponse{Ignored: ignored, Reason: reason}); err != nil {
			log.Printf("[handler] encode ignore-check: %v", err)
		}
	})
}
