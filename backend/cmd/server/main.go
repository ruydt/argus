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
	cfg := config.Load()

	repo, err := sqlite.New(cfg.DBPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}

	svc := service.New(repo)
	handler := server.NewRouter(svc)

	log.Printf("hook endpoint -> POST http://%s/api/hook", cfg.Addr)
	log.Printf("events SSE -> GET http://%s/api/events/stream", cfg.Addr)
	log.Printf("db -> %s", cfg.DBPath)

	if err := http.ListenAndServe(cfg.Addr, handler); err != nil {
		log.Fatalf("listen: %v", err)
	}
}
