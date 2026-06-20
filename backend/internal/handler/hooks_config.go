package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"

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
// whose config is an editable matcher-group JSON shape are served — others
// return 409 so the frontend falls back to guided setup. home defaults to the
// process home directory when empty.
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
	var hooks map[string][]hooksConfigGroup
	var err error
	switch spec.ConfigKind {
	case agentspec.KindJSONHooksBlock:
		hooks, err = readJSONHooksBlock(spec.HooksConfigPath)
	case agentspec.KindJSONHooksFile:
		hooks, err = readJSONHooksFile(spec.HooksConfigPath)
	default:
		http.Error(w, "unsupported config kind", http.StatusConflict)
		return
	}
	if err != nil {
		slog.Error("[hooks-config] read config", "agent", spec.ID, "err", err)
		http.Error(w, "failed to read config", http.StatusInternalServerError)
		return
	}
	if hooks == nil {
		hooks = map[string][]hooksConfigGroup{}
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(hooksConfigPayload{Hooks: hooks}); err != nil {
		slog.Error("[hooks-config] encode response", "err", err)
	}
}

func servePutHooksConfig(w http.ResponseWriter, r *http.Request, spec agentspec.Spec) {
	var body hooksConfigPayload
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	var err error
	switch spec.ConfigKind {
	case agentspec.KindJSONHooksBlock:
		err = writeJSONHooksBlock(spec.HooksConfigPath, body.Hooks)
	case agentspec.KindJSONHooksFile:
		err = writeJSONHooksFile(spec.HooksConfigPath, body.Hooks)
	default:
		http.Error(w, "unsupported config kind", http.StatusConflict)
		return
	}
	if err != nil {
		slog.Error("[hooks-config] write config", "agent", spec.ID, "err", err)
		http.Error(w, "failed to write config", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("[hooks-config] encode response", "err", err)
	}
}

// readJSONHooksBlock reads the "hooks" key out of a larger JSON settings file
// (Claude Code shape). It returns (nil, nil) when the file is absent or has no
// hooks block, but surfaces real read/parse errors so the editor never shows
// "no hooks" for a file it merely failed to read.
func readJSONHooksBlock(settingsPath string) (map[string][]hooksConfigGroup, error) {
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var settings map[string]json.RawMessage
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, fmt.Errorf("settings file is not valid JSON: %w", err)
	}
	hooksRaw, ok := settings["hooks"]
	if !ok {
		return nil, nil
	}
	var hooks map[string][]hooksConfigGroup
	if err := json.Unmarshal(hooksRaw, &hooks); err != nil {
		return nil, fmt.Errorf("settings hooks block is not valid JSON: %w", err)
	}
	return hooks, nil
}

// readJSONHooksFile reads a file whose entire body is the {"hooks": {...}}
// payload (Codex shape).
func readJSONHooksFile(hooksPath string) (map[string][]hooksConfigGroup, error) {
	data, err := os.ReadFile(hooksPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var payload hooksConfigPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, fmt.Errorf("hooks file is not valid JSON: %w", err)
	}
	return payload.Hooks, nil
}

// writeJSONHooksBlock writes the hooks block into a settings file, preserving
// all other top-level keys. A present-but-unparseable file is NOT overwritten —
// that would destroy the user's other settings.
func writeJSONHooksBlock(settingsPath string, hooks map[string][]hooksConfigGroup) error {
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o700); err != nil {
		return err
	}
	settings := map[string]json.RawMessage{}
	if data, err := os.ReadFile(settingsPath); err == nil {
		if err := json.Unmarshal(data, &settings); err != nil {
			return fmt.Errorf("existing settings file is not valid JSON, refusing to overwrite: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("read existing settings file: %w", err)
	}
	hooksJSON, err := json.Marshal(hooks)
	if err != nil {
		return err
	}
	settings["hooks"] = hooksJSON
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(settingsPath, data, 0o600)
}

// writeJSONHooksFile writes the whole file as a {"hooks": {...}} payload.
func writeJSONHooksFile(hooksPath string, hooks map[string][]hooksConfigGroup) error {
	if err := os.MkdirAll(filepath.Dir(hooksPath), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(hooksConfigPayload{Hooks: hooks}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(hooksPath, data, 0o600)
}
