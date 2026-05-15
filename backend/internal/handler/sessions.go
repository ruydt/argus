package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"hooker/internal/domain"
	"hooker/internal/service"
)

func Sessions(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		q := r.URL.Query()
		cwd := q.Get("cwd")
		since := q.Get("since")
		pageStr := q.Get("page")
		sizeStr := q.Get("size")

		if cwd != "" && pageStr != "" {
			page, _ := strconv.Atoi(pageStr)
			size, _ := strconv.Atoi(sizeStr)
			if page < 1 {
				page = 1
			}
			if size < 1 || size > 200 {
				size = 20
			}

			sessions, total, err := svc.ListSessionsByCWDPage(cwd, since, page, size)
			if err != nil {
				http.Error(w, "list sessions", http.StatusInternalServerError)
				return
			}
			if sessions == nil {
				sessions = []domain.Session{}
			}
			hasMore := (page * size) < total
			_ = json.NewEncoder(w).Encode(map[string]any{
				"sessions": sessions,
				"total":    total,
				"page":     page,
				"size":     size,
				"has_more": hasMore,
			})
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
			sessions = make([]domain.Session, 0)
		}
		_ = json.NewEncoder(w).Encode(sessions)
	})
}
