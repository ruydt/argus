package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"argus/internal/service"
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
		resp := map[string]any{"sessions": tree}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			log.Printf("[handler] encode %T: %v", resp, err)
		}
	})
}
