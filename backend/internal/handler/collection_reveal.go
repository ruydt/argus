package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// revealCommand builds the OS-native "reveal this file in the file manager"
// command for an absolute path. The path is always a resolved ~/.argus/hooks
// target (flat basename, traversal-checked by hookTarget), and is passed as a
// literal argument — never through a shell.
func revealCommand(path string) *exec.Cmd {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", "-R", path)
	case "windows":
		// explorer's /select, takes the path as part of the same token.
		return exec.Command("explorer", "/select,"+path)
	default:
		// Linux/BSD: no portable "select file" verb — open the containing folder.
		return exec.Command("xdg-open", filepath.Dir(path))
	}
}

// CollectionReveal opens the OS file manager with the installed script selected
// (macOS Finder / Windows Explorer / Linux folder). Local-first convenience: the
// browser can't open native paths, so the backend does it.
func CollectionReveal(argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req addCollectionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		target, err := hookTarget(argusDir, req.Filename)
		if err != nil {
			http.Error(w, "invalid filename", http.StatusBadRequest)
			return
		}
		if _, err := os.Stat(target); errors.Is(err, os.ErrNotExist) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		if err := revealCommand(target).Start(); err != nil {
			log.Printf("[collection] reveal %s err=%v", req.Filename, err)
			http.Error(w, "reveal failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}
