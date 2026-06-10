package config_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"argus/internal/config"
)

// TestLoad_IgnorePath_Default verifies the default ignore path is ~/.config/argus/ignore.
func TestLoad_IgnorePath_Default(t *testing.T) {
	t.Setenv("ARGUS_IGNORE", "")
	cfg := config.Load()
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatalf("UserHomeDir: %v", err)
	}
	want := filepath.Join(home, ".config", "argus", "ignore")
	if cfg.IgnorePath != want {
		t.Errorf("IgnorePath = %q, want %q", cfg.IgnorePath, want)
	}
}

// TestLoad_IgnorePath_EnvOverride verifies ARGUS_IGNORE overrides the default path.
func TestLoad_IgnorePath_EnvOverride(t *testing.T) {
	t.Setenv("ARGUS_IGNORE", "/tmp/argus-test.ignore")
	cfg := config.Load()
	if cfg.IgnorePath != "/tmp/argus-test.ignore" {
		t.Errorf("IgnorePath = %q, want /tmp/argus-test.ignore", cfg.IgnorePath)
	}
}

func TestLoad_defaults(t *testing.T) {
	t.Setenv("ADDR", "")
	t.Setenv("DB_PATH", "")
	cfg := config.Load()
	if cfg.Addr != "127.0.0.1:10804" {
		t.Errorf("Addr = %q, want 127.0.0.1:10804", cfg.Addr)
	}
	if !strings.HasSuffix(filepath.ToSlash(cfg.DBPath), "backend/argus.db") {
		t.Errorf("DBPath = %q, want suffix backend/argus.db", cfg.DBPath)
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
	t.Setenv("ADDR", "127.0.0.1:10804")
	t.Setenv("ARGUS_CORS_ORIGINS", "")
	cfg := config.Load()
	want := []string{
		"http://localhost:10804",
		"http://127.0.0.1:10804",
		"http://[::1]:10804",
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
	t.Setenv("ARGUS_CORS_ORIGINS", "http://example.local:3000, http://other.local:4000")
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
	t.Setenv("ARGUS_ALLOW_REMOTE", "")
	cfg := config.Load()
	if cfg.AllowRemote {
		t.Error("AllowRemote = true, want false by default")
	}
}

func TestLoad_AllowRemote_Enabled(t *testing.T) {
	t.Setenv("ARGUS_ALLOW_REMOTE", "1")
	cfg := config.Load()
	if !cfg.AllowRemote {
		t.Error("AllowRemote = false, want true when ARGUS_ALLOW_REMOTE=1")
	}
}

func TestLoad_AllowRemote_NotEnabled(t *testing.T) {
	t.Setenv("ARGUS_ALLOW_REMOTE", "true") // only "1" counts
	cfg := config.Load()
	if cfg.AllowRemote {
		t.Error("AllowRemote = true, want false for ARGUS_ALLOW_REMOTE=true (only '1' enables)")
	}
}
