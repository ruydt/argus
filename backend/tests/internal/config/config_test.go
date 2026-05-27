package config_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"hooker/internal/config"
)

// TestLoad_IgnorePath_Default verifies the default ignore path is ~/.config/hooker/ignore.
func TestLoad_IgnorePath_Default(t *testing.T) {
	if err := os.Unsetenv("HOOKER_IGNORE"); err != nil {
		t.Fatalf("Unsetenv HOOKER_IGNORE: %v", err)
	}
	cfg := config.Load()
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("UserHomeDir: %v", err)
	}
	want := filepath.Join(home, ".config", "hooker", "ignore")
	if cfg.IgnorePath != want {
		t.Errorf("IgnorePath = %q, want %q", cfg.IgnorePath, want)
	}
}

// TestLoad_IgnorePath_EnvOverride verifies HOOKER_IGNORE overrides the default path.
func TestLoad_IgnorePath_EnvOverride(t *testing.T) {
	t.Setenv("HOOKER_IGNORE", "/tmp/hooker-test.ignore")
	cfg := config.Load()
	if cfg.IgnorePath != "/tmp/hooker-test.ignore" {
		t.Errorf("IgnorePath = %q, want /tmp/hooker-test.ignore", cfg.IgnorePath)
	}
}

func TestLoad_defaults(t *testing.T) {
	if err := os.Unsetenv("ADDR"); err != nil {
		t.Fatalf("Unsetenv ADDR: %v", err)
	}
	if err := os.Unsetenv("DB_PATH"); err != nil {
		t.Fatalf("Unsetenv DB_PATH: %v", err)
	}
	cfg := config.Load()
	if cfg.Addr != "127.0.0.1:8765" {
		t.Errorf("Addr = %q, want 127.0.0.1:8765", cfg.Addr)
	}
	if !strings.HasSuffix(filepath.ToSlash(cfg.DBPath), "backend/hooker.db") {
		t.Errorf("DBPath = %q, want suffix backend/hooker.db", cfg.DBPath)
	}
}

func TestLoad_env(t *testing.T) {
	t.Setenv("ADDR", "0.0.0.0:9000")
	t.Setenv("DB_PATH", "/tmp/test.db")
	cfg := config.Load()
	if cfg.Addr != "0.0.0.0:9000" {
		t.Errorf("Addr = %q, want 0.0.0.0:9000", cfg.Addr)
	}
	if cfg.DBPath != "/tmp/test.db" {
		t.Errorf("DBPath = %q, want /tmp/test.db", cfg.DBPath)
	}
}

func TestLoad_CORSOrigins_DefaultFromAddr(t *testing.T) {
	t.Setenv("ADDR", "127.0.0.1:8765")
	if err := os.Unsetenv("HOOKER_CORS_ORIGINS"); err != nil {
		t.Fatalf("Unsetenv: %v", err)
	}
	cfg := config.Load()
	want := []string{
		"http://localhost:8765",
		"http://127.0.0.1:8765",
		"http://[::1]:8765",
	}
	if len(cfg.CORSOrigins) < len(want) {
		t.Fatalf("CORSOrigins len = %d, want >= %d; got %v", len(cfg.CORSOrigins), len(want), cfg.CORSOrigins)
	}
	for _, w := range want {
		found := false
		for _, o := range cfg.CORSOrigins {
			if o == w {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("CORSOrigins missing %q; got %v", w, cfg.CORSOrigins)
		}
	}
}

func TestLoad_CORSOrigins_ExtraFromEnv(t *testing.T) {
	t.Setenv("HOOKER_CORS_ORIGINS", "http://example.local:3000, http://other.local:4000")
	cfg := config.Load()
	found3000, found4000 := false, false
	for _, o := range cfg.CORSOrigins {
		if o == "http://example.local:3000" {
			found3000 = true
		}
		if o == "http://other.local:4000" {
			found4000 = true
		}
	}
	if !found3000 {
		t.Errorf("CORSOrigins missing example.local:3000; got %v", cfg.CORSOrigins)
	}
	if !found4000 {
		t.Errorf("CORSOrigins missing other.local:4000; got %v", cfg.CORSOrigins)
	}
}

func TestLoad_AllowRemote_Default(t *testing.T) {
	if err := os.Unsetenv("HOOKER_ALLOW_REMOTE"); err != nil {
		t.Fatalf("Unsetenv: %v", err)
	}
	cfg := config.Load()
	if cfg.AllowRemote {
		t.Error("AllowRemote = true, want false by default")
	}
}

func TestLoad_AllowRemote_Enabled(t *testing.T) {
	t.Setenv("HOOKER_ALLOW_REMOTE", "1")
	cfg := config.Load()
	if !cfg.AllowRemote {
		t.Error("AllowRemote = false, want true when HOOKER_ALLOW_REMOTE=1")
	}
}

func TestLoad_AllowRemote_NotEnabled(t *testing.T) {
	t.Setenv("HOOKER_ALLOW_REMOTE", "true") // only "1" counts
	cfg := config.Load()
	if cfg.AllowRemote {
		t.Error("AllowRemote = true, want false for HOOKER_ALLOW_REMOTE=true (only '1' enables)")
	}
}
