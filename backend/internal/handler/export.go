package handler

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"

	"hooker/internal/repository"
)

// ExportEvents streams all events as NDJSON (DATA-04, D-06).
// Full dump only — no filter params in this phase.
func ExportEvents(repo repository.EventRepository) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/x-ndjson")
		w.Header().Set("Content-Disposition", `attachment; filename="hooker-events.ndjson"`)
		if err := repo.ExportEvents(r.Context(), w); err != nil {
			// Headers already sent — can't change status. Log only.
			slog.Error("export events stream error", "err", err)
		}
	})
}

// ExportSnapshot downloads a full-fidelity SQLite snapshot via VACUUM INTO (DATA-05, D-08).
// Response headers: Content-Disposition with timestamp filename + Content-Length.
func ExportSnapshot(repo repository.EventRepository) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tmp, err := os.CreateTemp("", "hooker-snapshot-*.db")
		if err != nil {
			http.Error(w, "create temp file", http.StatusInternalServerError)
			return
		}
		tmpPath := tmp.Name()
		_ = tmp.Close()
		defer func() { _ = os.Remove(tmpPath) }() // always clean up temp file

		if err := repo.ExportSnapshot(r.Context(), tmpPath); err != nil {
			http.Error(w, "snapshot failed", http.StatusInternalServerError)
			slog.Error("export snapshot", "err", err)
			return
		}

		fi, err := os.Stat(tmpPath)
		if err != nil {
			http.Error(w, "stat snapshot", http.StatusInternalServerError)
			return
		}

		f, err := os.Open(tmpPath)
		if err != nil {
			http.Error(w, "open snapshot", http.StatusInternalServerError)
			return
		}
		defer f.Close() //nolint:errcheck

		ts := time.Now().UTC().Format("20060102-150405")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="hooker-snapshot-%s.db"`, ts))
		w.Header().Set("Content-Length", fmt.Sprintf("%d", fi.Size()))
		w.Header().Set("Content-Type", "application/octet-stream")
		if _, err := io.Copy(w, f); err != nil {
			slog.Error("export snapshot copy", "err", err)
		}
	})
}
