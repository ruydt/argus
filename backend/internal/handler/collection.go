package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"

	"argus/internal/domain"
	"argus/internal/github"
	"argus/internal/scriptcatalog"
)

// listLocalHooks returns the basenames of installed hook scripts in ~/.argus/hooks.
func listLocalHooks(argusDir string) []string {
	ents, err := os.ReadDir(hooksDir(argusDir))
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range ents {
		if e.IsDir() {
			continue
		}
		switch filepath.Ext(e.Name()) {
		case ".js", ".sh", ".py":
			out = append(out, e.Name())
		}
	}
	return out
}

func idFromFilename(filename string) string {
	if ext := filepath.Ext(filename); ext != "" {
		return filename[:len(filename)-len(ext)]
	}
	return filename
}

func runtimeFromExt(filename string) string {
	switch filepath.Ext(filename) {
	case ".js":
		return "node"
	case ".py":
		return "python3"
	default:
		return "sh"
	}
}

// Collection returns the unified collection view: every script installed locally
// or saved in the gist, with independent Local/Gist flags. Auth is OPTIONAL — a
// logged-out user still sees their local scripts (never a 401).
func Collection(svc *github.Service, src scriptcatalog.ScriptSource, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		view := domain.CollectionView{}

		gistByFile := map[string]domain.CollectionScript{}
		switch col, err := svc.Collection(r.Context()); {
		case errors.Is(err, github.ErrNotAuthenticated):
			view.Authenticated = false
		case err != nil:
			log.Printf("[collection] list err=%v", err)
			http.Error(w, "github error", http.StatusBadGateway)
			return
		default:
			view.Authenticated = true
			view.GistURL = col.GistURL
			for _, s := range col.Scripts {
				gistByFile[s.Filename] = s
			}
		}

		localSet := map[string]bool{}
		for _, f := range listLocalHooks(argusDir) {
			localSet[f] = true
		}

		metaByFile := map[string]domain.ScriptPackage{}
		if cat, err := src.Catalog(r.Context()); err == nil {
			for _, p := range cat.Packages {
				metaByFile[p.Filename] = p
			}
		}

		names := map[string]bool{}
		for f := range gistByFile {
			names[f] = true
		}
		for f := range localSet {
			names[f] = true
		}
		sorted := make([]string, 0, len(names))
		for f := range names {
			sorted = append(sorted, f)
		}
		sort.Strings(sorted)

		for _, f := range sorted {
			e := domain.CollectionEntry{Filename: f, Local: localSet[f], Gist: false}
			if gs, ok := gistByFile[f]; ok {
				e.Gist = true
				e.ID = gs.ID
				e.Title = gs.Title
				e.Event = gs.Event
				e.Runtime = gs.Runtime
			} else if p, ok := metaByFile[f]; ok {
				e.ID = idFromFilename(f)
				e.Title = p.Title
				e.Event = p.Event
				e.Runtime = p.Runtime
			} else {
				e.ID = idFromFilename(f)
				e.Title = f
				e.Runtime = runtimeFromExt(f)
			}
			if e.ID == "" {
				e.ID = idFromFilename(f)
			}
			view.Entries = append(view.Entries, e)
		}

		writeJSON(w, view)
	})
}

type addCollectionRequest struct {
	Origin   string `json:"origin"`   // "bundled" | "local"
	ID       string `json:"id"`       // for bundled
	Filename string `json:"filename"` // for local
}

// CollectionAdd adds a bundled or local script to the collection.
func CollectionAdd(svc *github.Service, src scriptcatalog.ScriptSource, argusDir string) http.Handler {
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
		script, err := buildCollectionScript(r, src, argusDir, req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		switch err := svc.AddScript(r.Context(), script); {
		case errors.Is(err, github.ErrNotAuthenticated):
			http.Error(w, "not authenticated", http.StatusUnauthorized)
		case errors.Is(err, github.ErrAlreadyInCollection):
			http.Error(w, "already in collection", http.StatusConflict)
		case err != nil:
			log.Printf("[collection] add err=%v", err)
			http.Error(w, "github error", http.StatusBadGateway)
		default:
			writeJSON(w, script)
		}
	})
}

func buildCollectionScript(r *http.Request, src scriptcatalog.ScriptSource, argusDir string, req addCollectionRequest) (domain.CollectionScript, error) {
	switch req.Origin {
	case "bundled":
		cat, err := src.Catalog(r.Context())
		if err != nil {
			return domain.CollectionScript{}, errors.New("catalog error")
		}
		p, ok := findPackage(cat, req.ID)
		if !ok {
			return domain.CollectionScript{}, errors.New("unknown script")
		}
		body, err := src.ReadScript(r.Context(), p.ID)
		if err != nil {
			return domain.CollectionScript{}, errors.New("read script error")
		}
		return domain.CollectionScript{
			ID: p.ID, Filename: p.Filename, Title: p.Title, Purpose: p.Purpose,
			Event: p.Event, Matcher: p.Matcher, Runtime: p.Runtime, Origin: "bundled", Body: string(body),
		}, nil
	case "local":
		target, err := hookTarget(argusDir, req.Filename)
		if err != nil {
			return domain.CollectionScript{}, errors.New("invalid filename")
		}
		body, err := os.ReadFile(target)
		if err != nil {
			return domain.CollectionScript{}, errors.New("local script not found")
		}
		id := req.Filename
		if ext := filepath.Ext(id); ext != "" {
			id = id[:len(id)-len(ext)]
		}
		return domain.CollectionScript{
			ID: id, Filename: req.Filename, Title: req.Filename, Origin: "local", Body: string(body),
		}, nil
	default:
		return domain.CollectionScript{}, errors.New("unknown origin")
	}
}

// CollectionRemove removes a script from the collection.
func CollectionRemove(svc *github.Service) http.Handler {
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
		switch err := svc.RemoveScript(r.Context(), id); {
		case errors.Is(err, github.ErrNotAuthenticated):
			http.Error(w, "not authenticated", http.StatusUnauthorized)
		case errors.Is(err, github.ErrNotInCollection):
			http.Error(w, "not in collection", http.StatusNotFound)
		case err != nil:
			log.Printf("[collection] remove err=%v", err)
			http.Error(w, "github error", http.StatusBadGateway)
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	})
}

// CollectionLocal serves a local hook script's body (GET) or removes it (DELETE).
// The filename is validated as a flat basename (no traversal).
func CollectionLocal(argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		filename := r.URL.Query().Get("filename")
		target, err := hookTarget(argusDir, filename)
		if err != nil {
			http.Error(w, "invalid filename", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodGet:
			body, err := os.ReadFile(target)
			if errors.Is(err, os.ErrNotExist) {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			if err != nil {
				log.Printf("[collection] local read %s err=%v", filename, err)
				http.Error(w, "read failed", http.StatusInternalServerError)
				return
			}
			writeJSON(w, map[string]string{"filename": filename, "body": string(body)})
		case http.MethodDelete:
			if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
				log.Printf("[collection] local delete %s err=%v", filename, err)
				http.Error(w, "delete failed", http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
}

// CollectionInstall writes a collection script into ~/.argus/hooks/.
func CollectionInstall(svc *github.Service, argusDir string) http.Handler {
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
		col, err := svc.Collection(r.Context())
		if errors.Is(err, github.ErrNotAuthenticated) {
			http.Error(w, "not authenticated", http.StatusUnauthorized)
			return
		}
		if err != nil {
			http.Error(w, "github error", http.StatusBadGateway)
			return
		}
		var found *domain.CollectionScript
		for i := range col.Scripts {
			if col.Scripts[i].ID == req.ID {
				found = &col.Scripts[i]
				break
			}
		}
		if found == nil {
			http.Error(w, "unknown script", http.StatusBadRequest)
			return
		}
		switch err := writeHookScript(argusDir, found.Filename, []byte(found.Body)); {
		case errors.Is(err, os.ErrExist):
			http.Error(w, "already installed", http.StatusConflict)
		case err != nil:
			log.Printf("[collection] install id=%s err=%v", req.ID, err)
			http.Error(w, "install failed", http.StatusInternalServerError)
		default:
			found.Installed = true
			writeJSON(w, found)
		}
	})
}
