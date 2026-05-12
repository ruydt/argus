package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"hooker/internal/service"
)

func SessionsTree(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		since := r.URL.Query().Get("since")
		if since == "" {
			since = time.Now().AddDate(0, 0, -7).Format(time.RFC3339)
		}

		tree, err := svc.GetSessionTree(since)
		if err != nil {
			http.Error(w, "get session tree", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"sessions": tree})
	})
}
