package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"argus/internal/github"
)

// GitHubDevice starts a device flow.
func GitHubDevice(svc *github.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		// ?share=1 requests the broader scope needed to publish to the registry.
		// A plain login omits it and is granted gist-only access.
		share := r.URL.Query().Get("share") == "1"
		dc, err := svc.StartDevice(r.Context(), share)
		if err != nil {
			log.Printf("[github] device err=%v", err)
			http.Error(w, "github unreachable", http.StatusBadGateway)
			return
		}
		writeJSON(w, dc)
	})
}

// GitHubStatus reports auth state (and advances a pending device flow).
func GitHubStatus(svc *github.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, svc.Status(r.Context()))
	})
}

// GitHubLogout deletes the stored token.
func GitHubLogout(svc *github.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if err := svc.Logout(); err != nil {
			http.Error(w, "logout failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("[github] encode %T: %v", v, err)
	}
}
