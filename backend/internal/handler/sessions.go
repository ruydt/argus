package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"argus/internal/service"
)

// maxDeleteSessions caps a single bulk-delete request. Generous, but bounds the
// IN clause and guards against a pathological payload.
const maxDeleteSessions = 1000

type deleteSessionsRequest struct {
	Sessions []string `json:"sessions"`
}

type deleteSessionsResponse struct {
	Deleted int64 `json:"deleted"`
}

// DeleteSessions handles DELETE /api/sessions. The body is a JSON object with a
// "sessions" array of session ids; every event for those sessions is removed
// permanently. Blank ids are dropped; an empty resulting set is a 400.
func DeleteSessions(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req deleteSessionsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		ids := make([]string, 0, len(req.Sessions))
		seen := make(map[string]struct{}, len(req.Sessions))
		for _, id := range req.Sessions {
			id = strings.TrimSpace(id)
			if id == "" {
				continue
			}
			if _, dup := seen[id]; dup {
				continue
			}
			seen[id] = struct{}{}
			ids = append(ids, id)
		}

		if len(ids) == 0 {
			http.Error(w, "no session ids provided", http.StatusBadRequest)
			return
		}
		if len(ids) > maxDeleteSessions {
			http.Error(w, "too many sessions in one request", http.StatusRequestEntityTooLarge)
			return
		}

		deleted, err := svc.DeleteSessions(r.Context(), ids)
		if err != nil {
			log.Printf("[handler] DeleteSessions count=%d err=%v", len(ids), err)
			http.Error(w, "delete failed", http.StatusInternalServerError)
			return
		}

		log.Printf("[handler] DeleteSessions sessions=%d events=%d", len(ids), deleted)
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(deleteSessionsResponse{Deleted: deleted}); err != nil {
			log.Printf("[handler] encode delete result: %v", err)
		}
	})
}
