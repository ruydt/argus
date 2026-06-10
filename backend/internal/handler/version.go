package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"argus/internal/version"
)

func Version() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		v := struct {
			Version   string `json:"version"`
			Commit    string `json:"commit"`
			BuildDate string `json:"buildDate"`
		}{
			Version:   version.Version,
			Commit:    version.Commit,
			BuildDate: version.BuildDate,
		}
		if err := json.NewEncoder(w).Encode(v); err != nil {
			log.Printf("[handler] encode %T: %v", v, err)
		}
	})
}
