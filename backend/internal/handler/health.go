package handler

import "net/http"

// Healthz handles GET /healthz. Returns 200 whenever the process is running.
// No dependencies — liveness only.
func Healthz() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

// Readyz handles GET /readyz. Returns 200 only after the DB is open and
// migrations are complete. ready is typically repo.Ready from the sqlite adapter.
func Readyz(ready func() bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !ready() {
			http.Error(w, "not ready", http.StatusServiceUnavailable)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
}
