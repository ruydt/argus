package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"path/filepath"

	"argus/internal/github"
	"argus/internal/scriptmeta"
)

type publishRequest struct {
	Files []struct {
		Name string `json:"name"`
		Body string `json:"body"`
	} `json:"files"`
	Description string `json:"description"`
}

// RegistryPublish uploads local files to argus-hooks/registry via a PR.
func RegistryPublish(svc *github.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req publishRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Files) == 0 {
			http.Error(w, "files required", http.StatusBadRequest)
			return
		}
		// Stamp the publisher's GitHub login as author when the script didn't
		// declare one, so every shared script carries attribution.
		login := svc.Status(r.Context()).Login
		files := make([]github.PublishFile, 0, len(req.Files))
		for _, f := range req.Files {
			if f.Name == "" || filepath.Base(f.Name) != f.Name {
				http.Error(w, "invalid file name", http.StatusBadRequest)
				return
			}
			files = append(files, github.PublishFile{Name: f.Name, Body: scriptmeta.EnsureAuthor(f.Body, login)})
		}
		url, err := svc.PublishToRegistry(r.Context(), files, req.Description)
		switch {
		case errors.Is(err, github.ErrNotAuthenticated):
			http.Error(w, "not authenticated", http.StatusUnauthorized)
		case errors.Is(err, github.ErrNeedsRepoScope):
			http.Error(w, "re-login to enable sharing", http.StatusForbidden)
		case err != nil:
			log.Printf("[registry] publish err=%v", err)
			http.Error(w, "github error", http.StatusBadGateway)
		default:
			writeJSON(w, map[string]string{"pull_request_url": url})
		}
	})
}
