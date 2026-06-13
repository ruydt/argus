package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"

	"argus/internal/community"
	"argus/internal/domain"
)

// allowedRuntimes are the only interpreters a community script may declare.
// The registry index.json is fetched over HTTPS but its metadata is not
// checksum-verified, so the runtime field is untrusted: gating it here prevents
// an arbitrary string from ever reaching exec.LookPath or the sandbox command.
var allowedRuntimes = map[string]bool{"sh": true, "node": true, "python3": true}

// runtimeExt maps an allowlisted runtime to the temp-file extension used for the
// sandbox. Derived from the runtime, never from the untrusted source path.
func runtimeExt(runtime string) string {
	switch runtime {
	case "node":
		return ".js"
	case "python3":
		return ".py"
	default:
		return ".sh"
	}
}

// communityState fills Installed + RuntimeAvailable for each script. The install
// filename is the basename of the registry source path (e.g. demo.sh).
func communityState(scripts []domain.CommunityScript, argusDir string) []domain.CommunityScript {
	dir := hooksDir(argusDir)
	runtimeCache := map[string]bool{}
	out := make([]domain.CommunityScript, len(scripts))
	for i, c := range scripts {
		_, statErr := os.Stat(filepath.Join(dir, path.Base(c.Source)))
		c.Installed = statErr == nil
		avail := false
		if allowedRuntimes[c.Runtime] {
			cached, ok := runtimeCache[c.Runtime]
			if !ok {
				_, lookErr := exec.LookPath(c.Runtime)
				cached = lookErr == nil
				runtimeCache[c.Runtime] = cached
			}
			avail = cached
		}
		c.RuntimeAvailable = avail
		out[i] = c
	}
	return out
}

// CommunityCatalog returns the registry scripts with per-machine install state.
func CommunityCatalog(src *community.Source, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		scripts, err := src.Catalog(r.Context())
		if err != nil {
			log.Printf("[community] catalog err=%v", err)
			http.Error(w, "failed to load community catalog", http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(communityState(scripts, argusDir)); err != nil {
			log.Printf("[community] encode catalog: %v", err)
		}
	})
}

// CommunityScriptBody returns one script's verified body for source-view.
func CommunityScriptBody(src *community.Source) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "id is required", http.StatusBadRequest)
			return
		}
		_, body, err := src.ScriptBody(r.Context(), id)
		if err != nil {
			log.Printf("[community] body id=%s err=%v", id, err)
			http.Error(w, "failed to load script", http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]string{"id": id, "body": string(body)}); err != nil {
			log.Printf("[community] encode body: %v", err)
		}
	})
}

// CommunityInstall fetches + verifies a community script and writes it into
// ~/.argus/hooks/<basename>. Never overwrites (409 on conflict).
func CommunityInstall(src *community.Source, argusDir string) http.Handler {
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
		cs, body, err := src.ScriptBody(r.Context(), req.ID)
		if err != nil {
			log.Printf("[community] install fetch id=%s err=%v", req.ID, err)
			http.Error(w, "install failed", http.StatusBadGateway)
			return
		}
		switch err := writeHookScript(argusDir, path.Base(cs.Source), body); {
		case errors.Is(err, os.ErrExist):
			http.Error(w, "script already installed", http.StatusConflict)
			return
		case err != nil:
			log.Printf("[community] install id=%s err=%v", req.ID, err)
			http.Error(w, "install failed", http.StatusInternalServerError)
			return
		}
		cs.Installed = true
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(cs); err != nil {
			log.Printf("[community] encode install: %v", err)
		}
	})
}

type communitySimulateRequest struct {
	ID      string          `json:"id"`
	Payload json.RawMessage `json:"payload"`
}

// CommunitySimulate runs a community script against a synthetic payload in a
// temp file (0700, removed after) before it ever touches ~/.argus/hooks.
func CommunitySimulate(src *community.Source) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req communitySimulateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == "" {
			http.Error(w, "id is required", http.StatusBadRequest)
			return
		}
		if len(req.Payload) == 0 || !json.Valid(req.Payload) {
			http.Error(w, "payload must be valid JSON", http.StatusBadRequest)
			return
		}
		cs, body, err := src.ScriptBody(r.Context(), req.ID)
		if err != nil {
			log.Printf("[community] simulate fetch id=%s err=%v", req.ID, err)
			http.Error(w, "failed to load script", http.StatusBadGateway)
			return
		}
		if !allowedRuntimes[cs.Runtime] {
			http.Error(w, "unsupported runtime", http.StatusBadRequest)
			return
		}
		// Derive the temp suffix from the (allowlisted) runtime, never from the
		// unverified registry source path.
		tmp, err := os.CreateTemp("", "argus-community-*"+runtimeExt(cs.Runtime))
		if err != nil {
			http.Error(w, "sandbox error", http.StatusInternalServerError)
			return
		}
		tmpName := tmp.Name()
		defer func() { _ = os.Remove(tmpName) }()
		if _, err := tmp.Write(body); err != nil {
			_ = tmp.Close()
			http.Error(w, "sandbox error", http.StatusInternalServerError)
			return
		}
		if err := tmp.Close(); err != nil {
			http.Error(w, "sandbox error", http.StatusInternalServerError)
			return
		}
		if err := os.Chmod(tmpName, 0o700); err != nil {
			http.Error(w, "sandbox error", http.StatusInternalServerError)
			return
		}
		// Run the interpreter directly with no shell, so the temp path (even if it
		// somehow contained shell metacharacters) is passed as a literal argument.
		resp := runHookExec(r.Context(), cs.Runtime, []string{tmpName}, req.Payload, 10)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})
}
