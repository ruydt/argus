package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"argus/internal/service"
)

func Diagnostics(svc *service.EventService, ready func() bool, opts service.DiagnosticsOptions) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		diagnostics, err := svc.DiagnosticsWithOptions(opts, ready())
		if err != nil {
			http.Error(w, "diagnostics", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(diagnostics); err != nil {
			log.Printf("[handler] encode %T: %v", diagnostics, err)
		}
	})
}

// CompactDatabase compresses legacy raw_payload rows and VACUUMs to reclaim disk
// space. Synchronous: a VACUUM rewrites the whole file, so the response only
// returns once compaction completes.
func CompactDatabase(svc *service.EventService) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		result, err := svc.CompactDatabase(r.Context())
		if errors.Is(err, service.ErrCompactionInProgress) {
			http.Error(w, "compaction already in progress", http.StatusConflict)
			return
		}
		if err != nil {
			log.Printf("[handler] CompactDatabase: %v", err)
			http.Error(w, "compact failed", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(result); err != nil {
			log.Printf("[handler] encode compact result: %v", err)
		}
	})
}
