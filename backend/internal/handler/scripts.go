package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"argus/internal/domain"
	"argus/internal/scriptcatalog"
)

// hooksDir returns ~/.argus/hooks for the given argus home dir.
func hooksDir(argusDir string) string { return filepath.Join(argusDir, "hooks") }

// hookTarget resolves the on-disk path for a script filename, rejecting any
// filename that is not a flat basename. The filename comes from the embedded
// catalog (never the request), so this is defense-in-depth against a corrupted
// or malicious manifest ever introducing a path-traversal segment.
func hookTarget(argusDir, filename string) (string, error) {
	if filename == "" || filepath.Base(filename) != filename {
		return "", fmt.Errorf("invalid script filename %q", filename)
	}
	return filepath.Join(hooksDir(argusDir), filename), nil
}

// loadCatalogWithState returns the catalog with Installed + RuntimeAvailable filled in.
func loadCatalogWithState(src scriptcatalog.ScriptSource, argusDir string) (domain.ScriptCatalog, error) {
	cat, err := src.Catalog(nil)
	if err != nil {
		return domain.ScriptCatalog{}, err
	}
	dir := hooksDir(argusDir)
	runtimeCache := map[string]bool{}
	for i := range cat.Packages {
		p := &cat.Packages[i]
		_, statErr := os.Stat(filepath.Join(dir, p.Filename))
		p.Installed = statErr == nil
		avail, ok := runtimeCache[p.Runtime]
		if !ok {
			_, lookErr := exec.LookPath(p.Runtime)
			avail = lookErr == nil
			runtimeCache[p.Runtime] = avail
		}
		p.RuntimeAvailable = avail
	}
	return cat, nil
}

func findPackage(cat domain.ScriptCatalog, id string) (domain.ScriptPackage, bool) {
	for _, p := range cat.Packages {
		if p.ID == id {
			return p, true
		}
	}
	return domain.ScriptPackage{}, false
}

func findBundle(cat domain.ScriptCatalog, id string) (domain.ScriptBundle, bool) {
	for _, b := range cat.Bundles {
		if b.ID == id {
			return b, true
		}
	}
	return domain.ScriptBundle{}, false
}

// installOne writes a package's embedded bytes to ~/.argus/hooks/<filename>.
// Never overwrites: O_EXCL makes the create atomic, so a concurrent install of
// the same id can't race past the check — returns os.ErrExist when present.
func installOne(src scriptcatalog.ScriptSource, argusDir string, p domain.ScriptPackage) error {
	target, err := hookTarget(argusDir, p.Filename)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(hooksDir(argusDir), 0o755); err != nil {
		return err
	}
	body, err := src.ReadScript(nil, p.ID)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o755)
	if err != nil {
		return err // os.ErrExist when the file already exists
	}
	_, writeErr := f.Write(body)
	closeErr := f.Close()
	if writeErr != nil {
		return writeErr
	}
	return closeErr
}

// ScriptsCatalog returns the full catalog with install + runtime state.
func ScriptsCatalog(src scriptcatalog.ScriptSource, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		cat, err := loadCatalogWithState(src, argusDir)
		if err != nil {
			log.Printf("[scripts] catalog err=%v", err)
			http.Error(w, "failed to load catalog", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(cat); err != nil {
			log.Printf("[scripts] encode catalog: %v", err)
		}
	})
}

type scriptIDRequest struct {
	ID string `json:"id"`
}

// ScriptsInstall writes one bundled script into ~/.argus/hooks/.
func ScriptsInstall(src scriptcatalog.ScriptSource, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req scriptIDRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == "" {
			http.Error(w, "id is required", http.StatusBadRequest)
			return
		}
		cat, err := loadCatalogWithState(src, argusDir)
		if err != nil {
			http.Error(w, "failed to load catalog", http.StatusInternalServerError)
			return
		}
		p, ok := findPackage(cat, req.ID)
		if !ok {
			http.Error(w, "unknown script", http.StatusBadRequest)
			return
		}
		switch err := installOne(src, argusDir, p); {
		case errors.Is(err, os.ErrExist):
			http.Error(w, "script already installed", http.StatusConflict)
			return
		case err != nil:
			log.Printf("[scripts] install id=%s err=%v", p.ID, err)
			http.Error(w, "install failed", http.StatusInternalServerError)
			return
		}
		p.Installed = true
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(p); err != nil {
			log.Printf("[scripts] encode install: %v", err)
		}
	})
}

type bundleInstallResult struct {
	ID     string `json:"id"`
	Status string `json:"status"` // installed | skipped | error
}

// ScriptsInstallBundle installs every missing member of a bundle.
func ScriptsInstallBundle(src scriptcatalog.ScriptSource, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req scriptIDRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == "" {
			http.Error(w, "id is required", http.StatusBadRequest)
			return
		}
		cat, err := loadCatalogWithState(src, argusDir)
		if err != nil {
			http.Error(w, "failed to load catalog", http.StatusInternalServerError)
			return
		}
		b, ok := findBundle(cat, req.ID)
		if !ok {
			http.Error(w, "unknown bundle", http.StatusBadRequest)
			return
		}
		results := make([]bundleInstallResult, 0, len(b.Packages))
		for _, pid := range b.Packages {
			p, found := findPackage(cat, pid)
			if !found {
				results = append(results, bundleInstallResult{ID: pid, Status: "error"})
				continue
			}
			switch err := installOne(src, argusDir, p); {
			case errors.Is(err, os.ErrExist):
				results = append(results, bundleInstallResult{ID: pid, Status: "skipped"})
			case err != nil:
				log.Printf("[scripts] bundle install id=%s err=%v", pid, err)
				results = append(results, bundleInstallResult{ID: pid, Status: "error"})
			default:
				results = append(results, bundleInstallResult{ID: pid, Status: "installed"})
			}
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(results); err != nil {
			log.Printf("[scripts] encode bundle: %v", err)
		}
	})
}

// ScriptsDelete removes an installed script from ~/.argus/hooks/.
func ScriptsDelete(src scriptcatalog.ScriptSource, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "id is required", http.StatusBadRequest)
			return
		}
		cat, err := loadCatalogWithState(src, argusDir)
		if err != nil {
			http.Error(w, "failed to load catalog", http.StatusInternalServerError)
			return
		}
		p, ok := findPackage(cat, id)
		if !ok {
			http.Error(w, "unknown script", http.StatusBadRequest)
			return
		}
		target, err := hookTarget(argusDir, p.Filename)
		if err != nil {
			http.Error(w, "unknown script", http.StatusBadRequest)
			return
		}
		if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Printf("[scripts] delete id=%s err=%v", id, err)
			http.Error(w, "delete failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}
