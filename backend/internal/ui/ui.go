package ui

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed all:dist
var dist embed.FS

// Handler serves the embedded React SPA. Any path that doesn't match a real
// file falls back to index.html so client-side routing works.
func Handler() http.Handler {
	sub, _ := fs.Sub(dist, "dist")
	fileServer := http.FileServerFS(sub)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path != "" {
			if _, err := sub.Open(path); err != nil {
				http.ServeFileFS(w, r, sub, "index.html")
				return
			}
		}
		fileServer.ServeHTTP(w, r)
	})
}
