// Package agentstore persists the set of agents a user has enabled (the hooks
// tabs they've added). It is the shared source of truth for the enabled list,
// read by both the HTTP handlers (GET/POST/DELETE /api/agents/enabled) and the
// diagnostics hook-config detector. File access is mutex-guarded so concurrent
// request goroutines never interleave a read-modify-write.
package agentstore

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// DefaultEnabled are the agents whose hooks-config tabs are shown by default
// when no agents.json exists yet. Other registered agents (see agentspec) are
// enabled by the user; this is just the out-of-box pair, not a support limit.
var DefaultEnabled = []string{"claudecode", "codex"}

var mu sync.Mutex

type enabledFile struct {
	Enabled []string `json:"enabled"`
}

func path(argusDir string) string {
	return filepath.Join(argusDir, "agents.json")
}

// ReadEnabled returns the persisted enabled set, or the defaults when the file
// is absent. An empty argusDir also returns the defaults (used by tests and the
// no-config diagnostics path) rather than reading a relative path.
func ReadEnabled(argusDir string) ([]string, error) {
	mu.Lock()
	defer mu.Unlock()
	return readLocked(argusDir)
}

func readLocked(argusDir string) ([]string, error) {
	if argusDir == "" {
		return defaults(), nil
	}
	data, err := os.ReadFile(path(argusDir))
	if err != nil {
		if os.IsNotExist(err) {
			return defaults(), nil
		}
		return nil, err
	}
	var f enabledFile
	if err := json.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	if f.Enabled == nil {
		return defaults(), nil
	}
	return f.Enabled, nil
}

func writeLocked(argusDir string, ids []string) error {
	if err := os.MkdirAll(argusDir, 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(enabledFile{Enabled: ids}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path(argusDir), data, 0o600)
}

// Enable adds id to the enabled set (idempotent) and returns the new set.
func Enable(argusDir, id string) ([]string, error) {
	mu.Lock()
	defer mu.Unlock()
	enabled, err := readLocked(argusDir)
	if err != nil {
		return nil, err
	}
	if contains(enabled, id) {
		return enabled, nil
	}
	enabled = append(enabled, id)
	if err := writeLocked(argusDir, enabled); err != nil {
		return nil, err
	}
	return enabled, nil
}

// Disable removes id from the enabled set (idempotent) and returns the new set.
func Disable(argusDir, id string) ([]string, error) {
	mu.Lock()
	defer mu.Unlock()
	enabled, err := readLocked(argusDir)
	if err != nil {
		return nil, err
	}
	next := make([]string, 0, len(enabled))
	for _, e := range enabled {
		if e != id {
			next = append(next, e)
		}
	}
	if len(next) != len(enabled) {
		if err := writeLocked(argusDir, next); err != nil {
			return nil, err
		}
	}
	return next, nil
}

func defaults() []string {
	return append([]string{}, DefaultEnabled...)
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
