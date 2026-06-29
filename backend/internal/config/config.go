package config

import (
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	Addr        string
	DBPath      string
	IgnorePath  string
	CORSOrigins []string
	AllowRemote bool

	// RetentionDays prunes hook events older than this many days. 0 = disabled
	// (default) — no events are ever deleted automatically.
	RetentionDays int
	// MaxEvents caps the hook_events table to this many newest rows. 0 = disabled.
	MaxEvents int
}

func Load() Config {
	addr := envOr("ADDR", "127.0.0.1:10804")
	origins := defaultCORSOrigins(addr)
	if extra := parseCORSOrigins(os.Getenv("ARGUS_CORS_ORIGINS")); len(extra) > 0 {
		origins = append(origins, extra...)
	}
	return Config{
		Addr:          addr,
		DBPath:        envOr("DB_PATH", defaultDBPath()),
		IgnorePath:    envOr("ARGUS_IGNORE", defaultIgnorePath()),
		CORSOrigins:   origins,
		AllowRemote:   os.Getenv("ARGUS_ALLOW_REMOTE") == "1",
		RetentionDays: envInt("ARGUS_RETENTION_DAYS", 0),
		MaxEvents:     envInt("ARGUS_MAX_EVENTS", 0),
	}
}

// envInt reads a non-negative integer env var, returning fallback when unset,
// empty, or invalid.
func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return fallback
	}
	return n
}

// defaultCORSOrigins derives the three canonical loopback CORS origins from the configured addr.
func defaultCORSOrigins(addr string) []string {
	_, port, err := net.SplitHostPort(addr)
	if err != nil || port == "" {
		port = "10804"
	}
	return []string{
		"http://localhost:" + port,
		"http://127.0.0.1:" + port,
		"http://[::1]:" + port,
	}
}

// parseCORSOrigins splits a comma-separated list of origins, trimming whitespace and empty values.
func parseCORSOrigins(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// defaultIgnorePath returns the canonical default ignore file path:
// ~/.config/argus/ignore (D-01).
func defaultIgnorePath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return filepath.Join(".config", "argus", "ignore")
	}
	return filepath.Join(home, ".config", "argus", "ignore")
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func defaultDBPath() string {
	cwd, err := os.Getwd()
	if err != nil {
		return defaultFromExecutable()
	}

	// Case 1: started somewhere under backend/ (e.g. backend or backend/cmd/server).
	if backendRoot, ok := findBackendRoot(cwd); ok {
		return filepath.Join(backendRoot, "argus.db")
	}

	// Case 2: started from repository root that contains a backend/ folder.
	backendDir := filepath.Join(cwd, "backend")
	if isBackendRoot(backendDir) {
		return filepath.Join(backendDir, "argus.db")
	}

	// Case 3: launched from an unrelated cwd; infer from executable location.
	return defaultFromExecutable()
}

func findBackendRoot(start string) (string, bool) {
	dir := start
	for {
		if isBackendRoot(dir) {
			return dir, true
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", false
		}
		dir = parent
	}
}

func isBackendRoot(dir string) bool {
	if _, err := os.Stat(filepath.Join(dir, "go.mod")); err != nil {
		return false
	}
	if _, err := os.Stat(filepath.Join(dir, "cmd", "server", "main.go")); err != nil {
		return false
	}
	return true
}

func defaultFromExecutable() string {
	exePath, err := os.Executable()
	if err == nil {
		if backendRoot, ok := findBackendRoot(filepath.Dir(exePath)); ok {
			return filepath.Join(backendRoot, "argus.db")
		}
	}
	return homeFallbackDBPath()
}

// homeFallbackDBPath returns ~/.argus/argus.db — used when neither the cwd nor
// the executable location resolve to a backend root (e.g. the binary launched
// from an unrelated directory). Keeps the DB out of whatever cwd happened to be
// active instead of littering it with a bare ./argus.db.
func homeFallbackDBPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "argus.db"
	}
	return filepath.Join(home, ".argus", "argus.db")
}
