package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"argus/internal/agentspec"
)

// enabledMu guards reads/writes of the enabled-agents file, which several
// request goroutines (GET /api/agents, POST/DELETE /api/agents/enabled) touch.
var enabledMu sync.Mutex

// defaultEnabledAgents are shown as hooks tabs out of the box, matching argus's
// original two-agent behavior. Detection only gates which agents can be ADDED.
var defaultEnabledAgents = []string{"claudecode", "codex"}

type enabledFile struct {
	Enabled []string `json:"enabled"`
}

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
		enabledMu.Lock()
		enabled, err := readEnabledAgents(argusDir)
		enabledMu.Unlock()
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
			removeEnabledAgent(w, r, h, argusDir)
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

	enabledMu.Lock()
	defer enabledMu.Unlock()
	enabled, err := readEnabledAgents(argusDir)
	if err != nil {
		http.Error(w, "failed to read enabled agents", http.StatusInternalServerError)
		return
	}
	if !contains(enabled, body.ID) {
		enabled = append(enabled, body.ID)
		if err := writeEnabledAgents(argusDir, enabled); err != nil {
			slog.Error("[agents] write enabled", "err", err)
			http.Error(w, "failed to persist enabled agents", http.StatusInternalServerError)
			return
		}
	}
	writeEnabledResponse(w, enabled)
}

func removeEnabledAgent(w http.ResponseWriter, r *http.Request, _, argusDir string) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "id query param required", http.StatusBadRequest)
		return
	}

	enabledMu.Lock()
	defer enabledMu.Unlock()
	enabled, err := readEnabledAgents(argusDir)
	if err != nil {
		http.Error(w, "failed to read enabled agents", http.StatusInternalServerError)
		return
	}
	next := make([]string, 0, len(enabled))
	for _, e := range enabled {
		if e != id {
			next = append(next, e)
		}
	}
	if len(next) != len(enabled) {
		if err := writeEnabledAgents(argusDir, next); err != nil {
			slog.Error("[agents] write enabled", "err", err)
			http.Error(w, "failed to persist enabled agents", http.StatusInternalServerError)
			return
		}
	}
	writeEnabledResponse(w, next)
}

func writeEnabledResponse(w http.ResponseWriter, enabled []string) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(enabledFile{Enabled: enabled}); err != nil {
		slog.Error("[agents] encode response", "err", err)
	}
}

func enabledAgentsPath(argusDir string) string {
	return filepath.Join(argusDir, "agents.json")
}

// readEnabledAgents returns the persisted enabled set, or the defaults when the
// file is absent. Caller holds enabledMu.
func readEnabledAgents(argusDir string) ([]string, error) {
	data, err := os.ReadFile(enabledAgentsPath(argusDir))
	if err != nil {
		if os.IsNotExist(err) {
			return append([]string{}, defaultEnabledAgents...), nil
		}
		return nil, err
	}
	var f enabledFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	if f.Enabled == nil {
		return append([]string{}, defaultEnabledAgents...), nil
	}
	return f.Enabled, nil
}

// writeEnabledAgents persists the enabled set. Caller holds enabledMu.
func writeEnabledAgents(argusDir string, ids []string) error {
	if err := os.MkdirAll(argusDir, 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(enabledFile{Enabled: ids}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(enabledAgentsPath(argusDir), data, 0o600)
}

func anyPathExists(paths []string) bool {
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return true
		}
	}
	return false
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
