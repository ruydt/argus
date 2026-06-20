package agentspec_test

import (
	"os"
	"path/filepath"
	"testing"

	"argus/internal/agentspec"
)

func TestAllResolvesAbsolutePaths(t *testing.T) {
	specs := agentspec.All("/home/x")
	if len(specs) < 11 {
		t.Fatalf("len = %d, want >= 11", len(specs))
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

func TestEditableSet(t *testing.T) {
	// Every agent in the registry is editable via its adapter. Plugin-code and
	// script-directory (guided-only) agents are omitted for now.
	editable := map[string]bool{}
	for _, s := range agentspec.All("/home/x") {
		editable[s.ID] = s.EditingSupported
	}
	for _, id := range []string{
		"claudecode", "codex", "cursor", "antigravity", "copilot", "qwen",
		"continue", "augment", "windsurf", "crush", "goose",
	} {
		if !editable[id] {
			t.Errorf("agent %s must be editable", id)
		}
	}
	for _, id := range []string{"cline", "opencode", "kilocode", "amp"} {
		if _, present := editable[id]; present {
			t.Errorf("guided-only agent %s must not be in the registry", id)
		}
	}
}

func TestEditableAgentsCarryTimeoutUnit(t *testing.T) {
	// Editable agents with a per-hook timeout must declare its unit so the UI
	// labels seconds vs milliseconds correctly. Windsurf has no timeout field.
	for _, s := range agentspec.All("/home/x") {
		if !s.EditingSupported || s.ID == "windsurf" {
			continue
		}
		if s.TimeoutUnit != "seconds" && s.TimeoutUnit != "milliseconds" {
			t.Errorf("agent %s: TimeoutUnit = %q, want seconds or milliseconds", s.ID, s.TimeoutUnit)
		}
	}
	if w, _ := agentspec.ByID("/home/x", "windsurf"); w.SupportsMatcher {
		t.Error("windsurf must report SupportsMatcher=false")
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
