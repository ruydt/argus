package agentstore_test

import (
	"os"
	"path/filepath"
	"testing"

	"argus/internal/agentstore"
)

func has(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func TestReadEnabledDefaults(t *testing.T) {
	// Empty argusDir → defaults, without touching the filesystem.
	got, err := agentstore.ReadEnabled("")
	if err != nil {
		t.Fatalf("ReadEnabled(\"\"): %v", err)
	}
	if len(got) != 2 || got[0] != "claudecode" || got[1] != "codex" {
		t.Fatalf("defaults = %v, want [claudecode codex]", got)
	}

	// Missing file → defaults.
	got2, err := agentstore.ReadEnabled(t.TempDir())
	if err != nil {
		t.Fatalf("ReadEnabled(tmp): %v", err)
	}
	if !has(got2, "claudecode") || !has(got2, "codex") {
		t.Fatalf("missing-file = %v, want defaults", got2)
	}
}

func TestEnableDisableRoundtrip(t *testing.T) {
	dir := t.TempDir()

	enabled, err := agentstore.Enable(dir, "cursor")
	if err != nil {
		t.Fatalf("Enable: %v", err)
	}
	if !has(enabled, "cursor") {
		t.Fatalf("after enable = %v, want cursor", enabled)
	}
	if _, err := os.Stat(filepath.Join(dir, "agents.json")); err != nil {
		t.Fatalf("agents.json not written: %v", err)
	}

	// Idempotent.
	again, _ := agentstore.Enable(dir, "cursor")
	if len(again) != len(enabled) {
		t.Fatalf("enable not idempotent: %v then %v", enabled, again)
	}

	// Persisted across reads.
	reread, _ := agentstore.ReadEnabled(dir)
	if !has(reread, "cursor") {
		t.Fatalf("reread = %v, want cursor", reread)
	}

	after, err := agentstore.Disable(dir, "cursor")
	if err != nil {
		t.Fatalf("Disable: %v", err)
	}
	if has(after, "cursor") {
		t.Fatalf("after disable = %v, want cursor removed", after)
	}
}
