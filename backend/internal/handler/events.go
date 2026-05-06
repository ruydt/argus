package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"agent-monitor/internal/service"
)

func Events(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		events, err := svc.ListEvents(1000)
		if err != nil {
			http.Error(w, "list events", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"events": events})
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

		if existing, err := svc.ListEvents(1000); err == nil {
			for _, e := range existing {
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
				sendSSE(w, e)
				flusher.Flush()
			case <-r.Context().Done():
				return
			}
		}
	})
}

func sendSSE(w http.ResponseWriter, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		return
	}
	_, _ = fmt.Fprintf(w, "data: %s\n\n", b)
}
