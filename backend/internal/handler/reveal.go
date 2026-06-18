package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

type revealRequest struct {
	Path string `json:"path"`
}

// revealExec launches the OS file manager. Swapped out in tests so handler
// tests don't open real Finder windows.
var revealExec = func(name string, args ...string) error {
	return exec.Command(name, args...).Start()
}

// Reveal shows a local file in the OS file manager (Finder on macOS).
// argusDir is the argus home directory (typically ~/.argus); paths are confined
// to argusDir, ~/.claude, and ~/.codex before any filesystem access.
func Reveal(argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req revealRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Path == "" {
			http.Error(w, "path is required", http.StatusBadRequest)
			return
		}
		if !pathWithinArgusRoots(argusDir, req.Path) {
			http.Error(w, "invalid path", http.StatusBadRequest) // before Stat: no existence oracle
			return
		}
		if _, err := os.Stat(req.Path); err != nil {
			http.Error(w, "file not found", http.StatusNotFound)
			return
		}

		var err error
		switch runtime.GOOS {
		case "darwin":
			err = revealExec("open", "-R", req.Path)
		case "linux":
			err = revealExec("xdg-open", filepath.Dir(req.Path))
		default:
			http.Error(w, "reveal not supported on this platform", http.StatusNotImplemented)
			return
		}
		if err != nil {
			http.Error(w, "reveal failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

// pathWithinArgusRoots reports whether p resolves to a location inside one of the
// argus-owned roots that the diagnostics file-system view legitimately exposes:
// ~/.argus (argusDir), ~/.claude, and ~/.codex. Symlinks are resolved best-effort
// so a symlink inside a root cannot redirect the reveal outside it.
func pathWithinArgusRoots(argusDir, p string) bool {
	roots := []string{argusDir}
	if home, err := os.UserHomeDir(); err == nil {
		roots = append(roots, filepath.Join(home, ".claude"), filepath.Join(home, ".codex"))
	}
	clean := filepath.Clean(p)
	if resolved, err := filepath.EvalSymlinks(clean); err == nil {
		clean = resolved
	} else if resolved, err := filepath.EvalSymlinks(filepath.Dir(clean)); err == nil {
		// Path itself doesn't exist yet; resolve the parent so symlink roots compare correctly.
		clean = filepath.Join(resolved, filepath.Base(clean))
	}
	for _, root := range roots {
		rc := filepath.Clean(root)
		if resolved, err := filepath.EvalSymlinks(rc); err == nil {
			rc = resolved
		}
		if clean == rc || strings.HasPrefix(clean, rc+string(os.PathSeparator)) {
			return true
		}
	}
	return false
}
