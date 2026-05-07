package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"agent-monitor/internal/service"
)

func DashboardStats(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var since string
		switch r.URL.Query().Get("range") {
		case "1h":
			since = time.Now().Add(-1 * time.Hour).Format(time.RFC3339)
		case "6h":
			since = time.Now().Add(-6 * time.Hour).Format(time.RFC3339)
		case "24h":
			since = time.Now().Add(-24 * time.Hour).Format(time.RFC3339)
		case "7d":
			since = time.Now().Add(-7 * 24 * time.Hour).Format(time.RFC3339)
		case "30d":
			since = time.Now().Add(-30 * 24 * time.Hour).Format(time.RFC3339)
		default:
			since = "" // all time
		}

		stats, err := svc.GetDashboardStats(since)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(stats)
	})
}
