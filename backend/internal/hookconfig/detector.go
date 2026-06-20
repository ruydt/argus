// Package hookconfig detects, for each agent the user has enabled, whether that
// agent's hook configuration points at argus's ingest endpoint. It feeds the
// diagnostics "Agent Connectivity" board, so adding an agent on the Hooks page
// makes it appear here on the next refresh.
package hookconfig

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"argus/internal/agentspec"
	"argus/internal/agentstore"
	"argus/internal/domain"
)

const defaultEndpointSubstring = "10804/api/hook"

// dirScanLimit caps how many files the detector reads when probing a directory-
// based hook config (Copilot, Cline, plugin agents).
const dirScanLimit = 50

type Result = domain.DiagnosticsHookConfig

type Detector struct {
	HomeDir  string
	ArgusDir string
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

	enabled, err := agentstore.ReadEnabled(d.ArgusDir)
	if err != nil {
		enabled = agentstore.DefaultEnabled
	}

	results := make([]Result, 0, len(enabled))
	for _, id := range enabled {
		spec, ok := agentspec.ByID(home, id)
		if !ok {
			continue
		}
		results = append(results, detectAgent(spec, endpoint, readFile))
	}
	return results
}

func detectAgent(spec agentspec.Spec, endpoint string, readFile func(string) ([]byte, error)) Result {
	result := Result{
		Agent: spec.ID,
		Label: spec.DisplayName,
		Path:  spec.HooksConfigPath,
	}

	switch spec.ConfigKind {
	case agentspec.KindClineScripts, agentspec.KindPlugin:
		detectDir(&result, spec.HooksConfigPath, endpoint, readFile)
	default:
		detectFile(&result, spec.HooksConfigPath, endpoint, strictJSONKind(spec.ConfigKind), readFile)
	}
	return result
}

// strictJSONKind reports whether the file is strict JSON we can validate. JSONC
// kinds (comment-bearing settings files) are read as plain text for the endpoint
// substring check so a comment doesn't get flagged as invalid_json.
func strictJSONKind(kind agentspec.ConfigKind) bool {
	switch kind {
	case agentspec.KindJSONHooksBlock, agentspec.KindJSONHooksFile,
		agentspec.KindCursorHooks, agentspec.KindCopilotHooks,
		agentspec.KindWindsurfHooks, agentspec.KindCrushHooks:
		return true
	default:
		return false
	}
}

// detectFile reads a single config file. JSON kinds that fail to parse are
// reported as unknown/invalid_json so a corrupt settings file is diagnosable
// rather than silently "missing".
func detectFile(result *Result, path, endpoint string, jsonKind bool, readFile func(string) ([]byte, error)) {
	content, err := readFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			result.Status = "missing"
			return
		}
		result.Status = "unknown"
		result.Reason = "read_error"
		return
	}
	if jsonKind && !json.Valid(content) {
		result.Status = "unknown"
		result.Reason = "invalid_json"
		return
	}
	if strings.Contains(string(content), endpoint) {
		result.Status = "configured"
		return
	}
	result.Status = "missing"
}

// detectDir scans a directory-based hook config (the agent wires scripts/files
// that reference the argus endpoint). Configured if any file in the directory
// contains the endpoint, up to dirScanLimit files.
func detectDir(result *Result, dir, endpoint string, readFile func(string) ([]byte, error)) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			result.Status = "missing"
			return
		}
		result.Status = "unknown"
		result.Reason = "read_error"
		return
	}
	scanned := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if scanned >= dirScanLimit {
			break
		}
		scanned++
		data, err := readFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		if strings.Contains(string(data), endpoint) {
			result.Status = "configured"
			return
		}
	}
	result.Status = "missing"
}
