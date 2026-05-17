package handler

import (
	"encoding/json"
	"net/http"

	"hooker/internal/version"
)

func Version() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(struct {
			Version string `json:"version"`
		}{
			Version: version.Version,
		})
	})
}
