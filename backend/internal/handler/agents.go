package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"

	"argus/internal/agentspec"
	"argus/internal/agentstore"
)

type agentsResponse struct {
	Agents  []agentspec.Status `json:"agents"`
	Enabled []string           `json:"enabled"`
}

// Agents handles GET /api/agents: every known agent with install/config status,
// plus the user's enabled set (the agents that get a hooks tab).
func Agents(home, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		h := home
		if h == "" {
			h, _ = os.UserHomeDir()
		}
		enabled, err := agentstore.ReadEnabled(argusDir)
		if err != nil {
			slog.Error("[agents] read enabled", "err", err)
			http.Error(w, "failed to read enabled agents", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(agentsResponse{
			Agents:  agentspec.Detect(h, nil),
			Enabled: enabled,
		}); err != nil {
			slog.Error("[agents] encode response", "err", err)
		}
	})
}

// AgentsEnabled handles POST (add) and DELETE (remove) /api/agents/enabled.
// Adding requires the agent be detected on this machine; removing is idempotent
// and permitted for any agent, including the defaults.
func AgentsEnabled(home, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := home
		if h == "" {
			h, _ = os.UserHomeDir()
		}
		switch r.Method {
		case http.MethodPost:
			addEnabledAgent(w, r, h, argusDir)
		case http.MethodDelete:
			removeEnabledAgent(w, r, argusDir)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
}

func addEnabledAgent(w http.ResponseWriter, r *http.Request, home, argusDir string) {
	var body struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	spec, ok := agentspec.ByID(home, body.ID)
	if !ok {
		http.Error(w, "unknown agent", http.StatusBadRequest)
		return
	}
	if !anyPathExists(spec.InstallPaths) {
		http.Error(w, "agent is not installed on this machine", http.StatusConflict)
		return
	}

	enabled, err := agentstore.Enable(argusDir, body.ID)
	if err != nil {
		slog.Error("[agents] enable", "err", err)
		http.Error(w, "failed to persist enabled agents", http.StatusInternalServerError)
		return
	}
	writeEnabledResponse(w, enabled)
}

func removeEnabledAgent(w http.ResponseWriter, r *http.Request, argusDir string) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "id query param required", http.StatusBadRequest)
		return
	}
	enabled, err := agentstore.Disable(argusDir, id)
	if err != nil {
		slog.Error("[agents] disable", "err", err)
		http.Error(w, "failed to persist enabled agents", http.StatusInternalServerError)
		return
	}
	writeEnabledResponse(w, enabled)
}

func writeEnabledResponse(w http.ResponseWriter, enabled []string) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(struct {
		Enabled []string `json:"enabled"`
	}{Enabled: enabled}); err != nil {
		slog.Error("[agents] encode response", "err", err)
	}
}

func anyPathExists(paths []string) bool {
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return true
		}
	}
	return false
}
