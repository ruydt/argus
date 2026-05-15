package handler

import (
	"encoding/json"
	"net/http"

	"hooker/internal/domain"
	"hooker/internal/service"
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
		_ = json.NewEncoder(w).Encode(map[string]any{"projects": projects})
	})
}
