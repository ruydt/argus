package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"argus/internal/domain"
	"argus/internal/service"
)

func Projects(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
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
