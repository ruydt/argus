package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"hooker/internal/domain"
	"hooker/internal/service"
)

func Traces(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		sessionID := q.Get("session_id")
		since := q.Get("since")
		pageStr := q.Get("page")
		sizeStr := q.Get("size")

		// Validate since param format if provided (WR-02).
		if since != "" {
			if _, err := time.Parse(time.RFC3339, since); err != nil {
				http.Error(w, "invalid since: must be RFC3339", http.StatusBadRequest)
				return
			}
		}

		if pageStr != "" {
			page, size := parsePageSize(pageStr, sizeStr, 50, 500)

			traces, total, err := svc.GetTracesPage(sessionID, since, page, size)
			if err != nil {
				http.Error(w, "get traces", http.StatusInternalServerError)
				return
			}
			if traces == nil {
				traces = []domain.NormalizedEvent{}
			}
			// Use actual returned count rather than theoretical max to avoid
			// false hasMore=true on partial last pages (WR-03).
			hasMore := (page-1)*size+len(traces) < total
			resp := map[string]any{
				"traces":   traces,
				"total":    total,
				"page":     page,
				"size":     size,
				"has_more": hasMore,
			}
			w.Header().Set("Content-Type", "application/json")
			if err := json.NewEncoder(w).Encode(resp); err != nil {
				log.Printf("[handler] encode %T: %v", resp, err)
			}
			return
		}

		traces, err := svc.GetTraces(sessionID, since)
		if err != nil {
			http.Error(w, "get traces", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		resp := map[string]any{"traces": traces}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			log.Printf("[handler] encode %T: %v", resp, err)
		}
	})
}
