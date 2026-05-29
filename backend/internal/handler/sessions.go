package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"hooker/internal/domain"
	"hooker/internal/service"
)

func Sessions(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		cwd := q.Get("cwd")
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

		if cwd != "" && pageStr != "" {
			page, size := parsePageSize(pageStr, sizeStr, 20, 200)

			sessions, total, err := svc.ListSessionsByCWDPage(cwd, since, page, size)
			if err != nil {
				http.Error(w, "list sessions", http.StatusInternalServerError)
				return
			}
			if sessions == nil {
				sessions = []domain.Session{}
			}
			// Use actual returned count rather than theoretical max to avoid
			// false hasMore=true on partial last pages (WR-03).
			hasMore := (page-1)*size+len(sessions) < total
			resp := map[string]any{
				"sessions": sessions,
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

		// non-paginated fallback (existing behavior)
		var (
			sessions []domain.Session
			err      error
		)
		if cwd != "" {
			sessions, err = svc.ListSessionsByCWD(cwd, since)
		} else {
			sessions, err = svc.ListSessions()
		}
		if err != nil {
			http.Error(w, "list sessions", http.StatusInternalServerError)
			return
		}
		if sessions == nil {
			sessions = []domain.Session{}
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(sessions); err != nil {
			log.Printf("[handler] encode %T: %v", sessions, err)
		}
	})
}
