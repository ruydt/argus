package server

import (
	"net/http"

	"agent-monitor/internal/handler"
	"agent-monitor/internal/service"
)

func NewRouter(svc *service.EventService) http.Handler {
	mux := http.NewServeMux()

	mux.Handle("POST /api/hook", handler.Hook(svc))
	mux.Handle("GET /api/events", handler.Events(svc))
	mux.Handle("GET /api/events/stream", handler.EventsStream(svc))
	mux.Handle("GET /api/session-usage", handler.Usage())
	mux.Handle("GET /api/sessions", handler.Sessions(svc))
	mux.Handle("GET /api/dashboard/stats", handler.DashboardStats(svc))
	mux.Handle("GET /api/openai/", handler.OpenAIProxy())

	return cors(logging(mux))
}
