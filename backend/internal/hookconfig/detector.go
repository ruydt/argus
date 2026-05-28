package hookconfig

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"hooker/internal/domain"
)

const defaultEndpointSubstring = "8765/api/hook"

type Result = domain.DiagnosticsHookConfig

type Detector struct {
	HomeDir  string
	Endpoint string
	ReadFile func(string) ([]byte, error)
}

func (d Detector) Detect() []Result {
	home := d.HomeDir
	if home == "" {
		if userHome, err := os.UserHomeDir(); err == nil {
			home = userHome
		}
	}
	endpoint := d.Endpoint
	if endpoint == "" {
		endpoint = defaultEndpointSubstring
	}
	readFile := d.ReadFile
	if readFile == nil {
		readFile = os.ReadFile
	}

	targets := []struct {
		agent string
		path  string
	}{
		{agent: "claudecode", path: filepath.Join(home, ".claude", "settings.json")},
		{agent: "codex", path: filepath.Join(home, ".codex", "hooks.json")},
	}
	results := make([]Result, 0, len(targets))
	for _, target := range targets {
		results = append(results, detectFile(target.agent, target.path, endpoint, readFile))
	}
	return results
}

func detectFile(agent, path, endpoint string, readFile func(string) ([]byte, error)) Result {
	result := Result{
		Agent: agent,
		Path:  path,
	}
	content, err := readFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			result.Status = "missing"
			return result
		}
		result.Status = "unknown"
		result.Reason = "read_error"
		return result
	}
	if !json.Valid(content) {
		result.Status = "unknown"
		result.Reason = "invalid_json"
		return result
	}
	if strings.Contains(string(content), endpoint) {
		result.Status = "configured"
		return result
	}
	result.Status = "missing"
	return result
}
