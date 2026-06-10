package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"argus/internal/domain"
	"argus/internal/service"
)

func FileChanges(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sessionID := r.URL.Query().Get("session_id")
		if sessionID == "" {
			http.Error(w, "session_id required", http.StatusBadRequest)
			return
		}
		groups, err := svc.GetFileChanges(sessionID)
		if err != nil {
			http.Error(w, "get file changes", http.StatusInternalServerError)
			return
		}
		if groups == nil {
			groups = []domain.FileChangeGroup{}
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(groups); err != nil {
			log.Printf("[handler] encode %T: %v", groups, err)
		}
	})
}
