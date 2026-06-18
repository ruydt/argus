package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"

	"argus/internal/community"
	"argus/internal/domain"
	"argus/internal/github"
	"argus/internal/scriptmeta"
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

// Collection returns the unified collection view: every script installed locally
// or saved in the gist, with independent Local/Gist flags. Auth is OPTIONAL — a
// logged-out user still sees their local scripts (never a 401).
func Collection(svc *github.Service, registrySrc *community.Source, argusDir string) http.Handler {
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
			view.Login = svc.Status(r.Context()).Login
			view.GistURL = col.GistURL
			for _, s := range col.Scripts {
				gistByFile[s.Filename] = s
			}
		}

		// Parse each local file's own @argus-meta — it is the authoritative
		// source for that script's event/author/runtime.
		localSet := map[string]bool{}
		localMeta := map[string]scriptmeta.Meta{}
		for _, f := range listLocalHooks(argusDir) {
			localSet[f] = true
			if target, err := hookTarget(argusDir, f); err == nil {
				if body, err := os.ReadFile(target); err == nil {
					localMeta[f] = scriptmeta.Parse(string(body))
				}
			}
		}

		metaByFile := map[string]domain.CommunityScript{}
		if scripts, err := registrySrc.Catalog(r.Context()); err == nil {
			for _, p := range scripts {
				metaByFile[path.Base(p.Source)] = p
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

		// firstNonEmpty resolves a field by precedence: local file → gist → registry.
		firstNonEmpty := func(vals ...string) string {
			for _, v := range vals {
				if v != "" {
					return v
				}
			}
			return ""
		}

		for _, f := range sorted {
			lm := localMeta[f]
			gs, inGist := gistByFile[f]
			reg := metaByFile[f]

			e := domain.CollectionEntry{Filename: f, Local: localSet[f], Gist: inGist}
			e.ID = firstNonEmpty(gs.ID, idFromFilename(f))
			e.Title = firstNonEmpty(lm.Title, gs.Title, reg.Title, f)
			// Author comes only from the script's own @argus-meta (local file or
			// gist copy), never the registry folder — installs now stamp it in, so
			// attribution survives offline.
			e.Author = firstNonEmpty(lm.Author, gs.Author)
			e.Event = firstNonEmpty(lm.Event, gs.Event, reg.Event)
			e.Runtime = firstNonEmpty(lm.Runtime, gs.Runtime, reg.Runtime, runtimeFromExt(f))
			e.OS = firstNonEmpty(lm.OS, gs.OS, reg.OS)
			if e.ID == "" {
				e.ID = idFromFilename(f)
			}
			view.Entries = append(view.Entries, e)
		}

		writeJSON(w, view)
	})
}

// CollectionAdd adds a local script (from ~/.argus/hooks) to the gist collection.
func CollectionAdd(svc *github.Service, argusDir string) http.Handler {
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
		body, err := os.ReadFile(target)
		if err != nil {
			http.Error(w, "local script not found", http.StatusBadRequest)
			return
		}
		// Preserve the script's own metadata so the gist copy keeps its event,
		// runtime, etc. Title intentionally stays the filename — the collection
		// lists scripts by their file name, not the human description.
		stamped := scriptmeta.EnsureAuthor(string(body), svc.Status(r.Context()).Login)
		meta := scriptmeta.Parse(stamped)
		runtime := meta.Runtime
		if runtime == "" {
			runtime = runtimeFromExt(req.Filename)
		}
		script := domain.CollectionScript{
			ID: idFromFilename(req.Filename), Filename: req.Filename,
			Title: req.Filename, Author: meta.Author, Purpose: meta.Purpose, Event: meta.Event,
			Matcher: meta.Matcher, Runtime: runtime, OS: meta.OS, Origin: "local", Body: stamped,
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

type addCollectionRequest struct {
	Filename string `json:"filename"`
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

// CollectionGistBody returns the body of a single gist script by ID.
func CollectionGistBody(svc *github.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "id is required", http.StatusBadRequest)
			return
		}
		col, err := svc.Collection(r.Context())
		if errors.Is(err, github.ErrNotAuthenticated) {
			http.Error(w, "not authenticated", http.StatusUnauthorized)
			return
		}
		if err != nil {
			log.Printf("[collection] gist body id=%s err=%v", id, err)
			http.Error(w, "github error", http.StatusBadGateway)
			return
		}
		for _, s := range col.Scripts {
			if s.ID == id {
				writeJSON(w, map[string]string{"id": id, "body": s.Body})
				return
			}
		}
		http.Error(w, "not found", http.StatusNotFound)
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
		body := []byte(scriptmeta.EnsureAuthor(found.Body, found.Author))
		switch err := writeHookScript(argusDir, found.Filename, body); {
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
