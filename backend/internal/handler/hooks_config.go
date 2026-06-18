package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
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

// HooksConfig handles GET and PUT /api/hooks-config?agent=claudecode|codex.
// claudeSettingsPath is the full path to ~/.claude/settings.json.
// codexHooksPath is the full path to ~/.codex/hooks.json.
func HooksConfig(claudeSettingsPath, codexHooksPath string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		agent := r.URL.Query().Get("agent")
		if agent != "claudecode" && agent != "codex" {
			http.Error(w, "agent must be claudecode or codex", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodGet:
			serveGetHooksConfig(w, agent, claudeSettingsPath, codexHooksPath)
		case http.MethodPut:
			servePutHooksConfig(w, r, agent, claudeSettingsPath, codexHooksPath)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
}

func serveGetHooksConfig(w http.ResponseWriter, agent, claudeSettingsPath, codexHooksPath string) {
	var hooks map[string][]hooksConfigGroup
	var err error
	if agent == "claudecode" {
		hooks, err = readClaudeHooks(claudeSettingsPath)
	} else {
		hooks, err = readCodexHooks(codexHooksPath)
	}
	if err != nil {
		slog.Error("[hooks-config] read config", "agent", agent, "err", err)
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

// readClaudeHooks returns (nil, nil) when the file does not exist or has no hooks block,
// but surfaces a real read/parse error so the editor never shows "no hooks" for a file
// it simply failed to read.
func readClaudeHooks(settingsPath string) (map[string][]hooksConfigGroup, error) {
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var settings map[string]json.RawMessage
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, fmt.Errorf("settings.json is not valid JSON: %w", err)
	}
	hooksRaw, ok := settings["hooks"]
	if !ok {
		return nil, nil
	}
	var hooks map[string][]hooksConfigGroup
	if err := json.Unmarshal(hooksRaw, &hooks); err != nil {
		return nil, fmt.Errorf("settings.json hooks block is not valid JSON: %w", err)
	}
	return hooks, nil
}

func readCodexHooks(hooksPath string) (map[string][]hooksConfigGroup, error) {
	data, err := os.ReadFile(hooksPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var payload hooksConfigPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil, fmt.Errorf("hooks.json is not valid JSON: %w", err)
	}
	return payload.Hooks, nil
}

func servePutHooksConfig(w http.ResponseWriter, r *http.Request, agent, claudeSettingsPath, codexHooksPath string) {
	var body hooksConfigPayload
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	var err error
	if agent == "claudecode" {
		err = writeClaudeHooks(claudeSettingsPath, body.Hooks)
	} else {
		err = writeCodexHooks(codexHooksPath, body.Hooks)
	}
	if err != nil {
		slog.Error("[hooks-config] write config", "agent", agent, "err", err)
		http.Error(w, "failed to write config", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("[hooks-config] encode response", "err", err)
	}
}

func writeClaudeHooks(settingsPath string, hooks map[string][]hooksConfigGroup) error {
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o700); err != nil {
		return err
	}
	// Read existing settings to preserve all non-hooks keys. A present-but-unparseable
	// file must NOT be silently overwritten — that would destroy the user's other settings.
	settings := map[string]json.RawMessage{}
	if data, err := os.ReadFile(settingsPath); err == nil {
		if err := json.Unmarshal(data, &settings); err != nil {
			return fmt.Errorf("existing settings.json is not valid JSON, refusing to overwrite: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("read existing settings.json: %w", err)
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

func writeCodexHooks(hooksPath string, hooks map[string][]hooksConfigGroup) error {
	if err := os.MkdirAll(filepath.Dir(hooksPath), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(hooksConfigPayload{Hooks: hooks}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(hooksPath, data, 0o600)
}
