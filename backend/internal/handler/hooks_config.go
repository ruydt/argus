package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"

	"argus/internal/agentspec"
)

type hooksConfigPayload struct {
	Hooks map[string][]hooksConfigGroup `json:"hooks"`
}

type hooksConfigGroup struct {
	Matcher string             `json:"matcher,omitempty"`
	Hooks   []hooksConfigEntry `json:"hooks"`
}

type hooksConfigEntry struct {
	Type          string `json:"type"`
	Command       string `json:"command"`
	Timeout       *int   `json:"timeout,omitempty"`
	StatusMessage string `json:"statusMessage,omitempty"`
}

// HooksConfig handles GET and PUT /api/hooks-config?agent=<id>. The agent is
// resolved against the agentspec registry (home anchors all paths); only agents
// whose hook format argus can losslessly edit in-app are served — others return
// 409 so the frontend falls back to guided setup. Per-agent on-disk translation
// (and preservation of everything argus does not model) lives in
// hooks_config_adapters.go. home defaults to the process home when empty.
func HooksConfig(home string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := home
		if h == "" {
			h, _ = os.UserHomeDir()
		}
		id := r.URL.Query().Get("agent")
		spec, ok := agentspec.ByID(h, id)
		if !ok {
			http.Error(w, "unknown agent", http.StatusBadRequest)
			return
		}
		if !spec.EditingSupported {
			http.Error(w, "in-app hook editing is not supported for this agent; use guided setup", http.StatusConflict)
			return
		}
		switch r.Method {
		case http.MethodGet:
			serveGetHooksConfig(w, spec)
		case http.MethodPut:
			servePutHooksConfig(w, r, spec)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
}

func serveGetHooksConfig(w http.ResponseWriter, spec agentspec.Spec) {
	hooks, err := readConfig(spec)
	if err != nil {
		slog.Error("[hooks-config] read config", "agent", spec.ID, "err", err)
		http.Error(w, "failed to read config", http.StatusInternalServerError)
		return
	}
	writeHooksConfigJSON(w, hooks)
}

func servePutHooksConfig(w http.ResponseWriter, r *http.Request, spec agentspec.Spec) {
	var body hooksConfigPayload
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	if err := writeConfig(spec, body.Hooks); err != nil {
		slog.Error("[hooks-config] write config", "agent", spec.ID, "err", err)
		http.Error(w, "failed to write config", http.StatusInternalServerError)
		return
	}
	// Echo the re-read state, not the request body: the merge writer may have
	// folded in preserved foreign hooks, so the frontend must see ground truth.
	hooks, err := readConfig(spec)
	if err != nil {
		slog.Error("[hooks-config] reread after write", "agent", spec.ID, "err", err)
		writeHooksConfigJSON(w, body.Hooks)
		return
	}
	writeHooksConfigJSON(w, hooks)
}

func writeHooksConfigJSON(w http.ResponseWriter, hooks map[string][]hooksConfigGroup) {
	if hooks == nil {
		hooks = map[string][]hooksConfigGroup{}
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(hooksConfigPayload{Hooks: hooks}); err != nil {
		slog.Error("[hooks-config] encode response", "err", err)
	}
}
