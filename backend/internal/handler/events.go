package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"argus/internal/domain"
	"argus/internal/service"
)

const (
	defaultEventsLimit    = 1000
	sessionEventsLimit    = 5000
	sseBackfillLimit      = 100
	maxEventsPageLimit    = 500
	defaultEventsPage     = 200
	defaultSessionPage    = 20
	maxSessionPageLimit   = 50
)

func Events(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		since := q.Get("since")
		until := q.Get("until")
		sessionID := q.Get("session")

		sessionLimit := defaultSessionPage
		if s := q.Get("session_limit"); s != "" {
			if v, err := strconv.Atoi(s); err == nil && v > 0 {
				sessionLimit = v
			}
		}
		if sessionLimit > maxSessionPageLimit {
			sessionLimit = maxSessionPageLimit
		}

		beforeID := int64(0)
		if s := q.Get("before_id"); s != "" {
			if v, err := strconv.ParseInt(s, 10, 64); err == nil {
				beforeID = v
			}
		}

		limit := defaultEventsPage
		if s := q.Get("limit"); s != "" {
			if v, err := strconv.Atoi(s); err == nil {
				limit = v
			}
		}
		if limit < 1 {
			limit = 1
		}
		if limit > maxEventsPageLimit {
			limit = maxEventsPageLimit
		}

		// No time params and no session cursor = backward-compat path.
		if since == "" && until == "" && beforeID == 0 && q.Get("before_session_cursor") == "" && q.Get("session_limit") == "" {
			events, err := listEvents(svc, sessionID)
			if err != nil {
				http.Error(w, "list events", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			resp := map[string]any{"events": events, "has_more": false, "next_cursor": int64(0)}
			if err := json.NewEncoder(w).Encode(resp); err != nil {
				log.Printf("[handler] encode events: %v", err)
			}
			return
		}

		// Session-paginated path: group results by session, N sessions per page.
		if sessionID == "" {
			beforeCursor := int64(0)
			if s := q.Get("before_session_cursor"); s != "" {
				if v, err := strconv.ParseInt(s, 10, 64); err == nil {
					beforeCursor = v
				}
			}
			events, cursor, hasMore, err := svc.ListEventsBySessionsTimeRange(since, until, beforeCursor, sessionLimit)
			if err != nil {
				http.Error(w, "list events", http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			resp := map[string]any{"events": events, "has_more": hasMore, "next_cursor": cursor}
			if err := json.NewEncoder(w).Encode(resp); err != nil {
				log.Printf("[handler] encode events: %v", err)
			}
			return
		}

		// Event-paginated path: single session, cursor by event id.
		events, minID, hasMore, err := svc.ListEventsByTimeRange(since, until, sessionID, beforeID, limit)
		if err != nil {
			http.Error(w, "list events", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		resp := map[string]any{"events": events, "has_more": hasMore, "next_cursor": minID}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			log.Printf("[handler] encode events: %v", err)
		}
	})
}

func EventsStream(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		// Subscribe before listing so no events are dropped between the two ops.
		ch := svc.Subscribe()
		defer svc.Unsubscribe(ch)

		q := r.URL.Query()
		sessionID := q.Get("session")
		since := q.Get("since")
		if backfill, _, _, err := svc.ListEventsByTimeRange(since, "", sessionID, 0, sseBackfillLimit); err == nil {
			for _, e := range backfill {
				sendSSE(w, e)
			}
			flusher.Flush()
		}

		for {
			select {
			case e, ok := <-ch:
				if !ok {
					return
				}
				if sessionID != "" && e.Session != sessionID {
					continue
				}
				sendSSE(w, e)
				flusher.Flush()
			case <-r.Context().Done():
				return
			}
		}
	})
}

func listEvents(svc *service.EventService, sessionID string) ([]domain.NormalizedEvent, error) {
	if sessionID != "" {
		return svc.ListEventsBySession(sessionID, sessionEventsLimit)
	}
	return svc.ListEvents(defaultEventsLimit)
}

func sendSSE(w http.ResponseWriter, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	_, _ = fmt.Fprintf(w, "data: %s\n\n", b)
}

func EventRawPayload(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := r.URL.Query().Get("key")
		if key == "" {
			http.Error(w, "missing key", http.StatusBadRequest)
			return
		}
		raw, err := svc.GetRawPayload(key)
		if err != nil {
			log.Printf("[handler] GetRawPayload: %v", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if raw == nil {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		resp := struct {
			RawPayload json.RawMessage `json:"raw_payload"`
		}{RawPayload: json.RawMessage(raw)}
		if err := json.NewEncoder(w).Encode(resp); err != nil {
			log.Printf("[handler] encode raw payload: %v", err)
		}
	})
}
