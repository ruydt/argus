package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"argus/internal/domain"
	"argus/internal/service"
)

func Projects(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			cwd := r.URL.Query().Get("cwd")
			if cwd == "" {
				http.Error(w, "cwd query parameter required", http.StatusBadRequest)
				return
			}
			sessionsDeleted, eventsDeleted, err := svc.DeleteProject(cwd)
			if err != nil {
				http.Error(w, "delete project", http.StatusInternalServerError)
				return
			}
			log.Printf("[handler] project deleted cwd=%s sessions=%d events=%d", cwd, sessionsDeleted, eventsDeleted)
			w.Header().Set("Content-Type", "application/json")
			resp := map[string]any{
				"sessions_deleted": sessionsDeleted,
				"events_deleted":   eventsDeleted,
			}
			if err := json.NewEncoder(w).Encode(resp); err != nil {
				log.Printf("[handler] encode %T: %v", resp, err)
			}
			return
		}

		projects, err := svc.ListProjects()
		if err != nil {
			http.Error(w, "list projects", http.StatusInternalServerError)
			return
		}
		if projects == nil {
			projects = []domain.Project{}
		}

		w.Header().Set("Content-Type", "application/json")
		resp := map[string]any{"projects": projects}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			log.Printf("[handler] encode %T: %v", resp, err)
		}
	})
}
