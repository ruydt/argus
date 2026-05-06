package config

import "os"

type Config struct {
	Addr   string
	DBPath string
}

func Load() Config {
	return Config{
		Addr:   envOr("ADDR", "127.0.0.1:8765"),
		DBPath: envOr("DB_PATH", "agent-monitor.db"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
