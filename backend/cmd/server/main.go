package main

import (
	"log"
	"net/http"

	"agent-monitor/internal/config"
	"agent-monitor/internal/repository/sqlite"
	"agent-monitor/internal/server"
	"agent-monitor/internal/service"
)

func main() {
	// Load runtime settings such as the listen address and database path.
	cfg := config.Load()

	// Open the SQLite-backed event repository before wiring services.
	repo, err := sqlite.New(cfg.DBPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}

	// Compose the service and HTTP router dependencies.
	svc := service.New(repo)
	handler := server.NewRouter(svc)

	// Print the useful local endpoints on startup.
	log.Printf("hook endpoint -> POST http://%s/api/hook", cfg.Addr)
	log.Printf("events SSE -> GET http://%s/api/events/stream", cfg.Addr)
	log.Printf("db -> %s", cfg.DBPath)

	// Start serving until the process exits or the listener fails.
	if err := http.ListenAndServe(cfg.Addr, handler); err != nil {
		log.Fatalf("listen: %v", err)
	}
}
