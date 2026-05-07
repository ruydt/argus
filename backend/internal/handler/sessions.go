package handler

import (
	"encoding/json"
	"net/http"

	"agent-monitor/internal/domain"
	"agent-monitor/internal/service"
)

func Sessions(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		sessions, err := svc.ListSessions()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if sessions == nil {
			sessions = make([]domain.Session, 0)
		}
		_ = json.NewEncoder(w).Encode(sessions)
	})
}
