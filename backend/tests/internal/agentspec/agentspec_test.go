package agentspec_test

import (
	"os"
	"path/filepath"
	"testing"

	"argus/internal/agentspec"
)

func TestAllResolvesAbsolutePaths(t *testing.T) {
	specs := agentspec.All("/home/x")
	if len(specs) < 15 {
		t.Fatalf("len = %d, want >= 15", len(specs))
	}
	for _, s := range specs {
		if !filepath.IsAbs(s.HooksConfigPath) {
			t.Errorf("agent %s: HooksConfigPath %q not absolute", s.ID, s.HooksConfigPath)
		}
		if len(s.InstallPaths) == 0 {
			t.Errorf("agent %s: no install paths", s.ID)
		}
	}
}

func TestByID(t *testing.T) {
	home := "/home/x"
	s, ok := agentspec.ByID(home, "claudecode")
	if !ok {
		t.Fatal("claudecode not found")
	}
	if !s.EditingSupported {
		t.Error("claudecode should be editable")
	}
	if want := filepath.Join(home, ".claude", "settings.json"); s.HooksConfigPath != want {
		t.Errorf("HooksConfigPath = %q, want %q", s.HooksConfigPath, want)
	}
	if _, ok := agentspec.ByID(home, "does-not-exist"); ok {
		t.Error("unknown id returned ok=true")
	}
}

func TestEditableSetIsConservative(t *testing.T) {
	// Only matcher-group-JSON agents are editable in v1; everything else is
	// guided-setup so argus never reshapes a config schema it has not verified.
	editable := map[string]bool{}
	for _, s := range agentspec.All("/home/x") {
		editable[s.ID] = s.EditingSupported
	}
	if !editable["claudecode"] || !editable["codex"] {
		t.Error("claudecode and codex must be editable")
	}
	if editable["cursor"] || editable["opencode"] || editable["cline"] {
		t.Error("divergent/plugin agents must not be editable in v1")
	}
}

func TestDetect(t *testing.T) {
	home := t.TempDir()
	cursorDir := filepath.Join(home, ".cursor")
	if err := os.MkdirAll(cursorDir, 0o700); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cursorDir, "hooks.json"), []byte("{}"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}

	byID := map[string]agentspec.Status{}
	for _, s := range agentspec.Detect(home, nil) {
		byID[s.ID] = s
	}

	if !byID["cursor"].Installed {
		t.Error("cursor should be installed")
	}
	if !byID["cursor"].HooksConfigured {
		t.Error("cursor hooks.json exists, should be hooks-configured")
	}
	if byID["claudecode"].Installed {
		t.Error("claudecode should not be installed in a fresh temp home")
	}
}
