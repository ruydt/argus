package handler

import (
	"encoding/json"
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
