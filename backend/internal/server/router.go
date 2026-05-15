package server

import (
	"net/http"

	"hooker/internal/handler"
	"hooker/internal/service"
	"hooker/internal/ui"
)

func NewRouter(svc *service.EventService) http.Handler {
	mux := http.NewServeMux()

	mux.Handle("POST /api/hook", handler.Hook(svc))
	mux.Handle("GET /api/events", handler.Events(svc))
	mux.Handle("GET /api/events/stream", handler.EventsStream(svc))
	mux.Handle("GET /api/session-usage", handler.Usage())
	mux.Handle("GET /api/projects", handler.Projects(svc))
	mux.Handle("GET /api/sessions", handler.Sessions(svc))
	mux.Handle("GET /api/sessions/tree", handler.SessionsTree(svc))
	mux.Handle("GET /api/traces", handler.Traces(svc))
	mux.Handle("GET /api/dashboard/stats", handler.DashboardStats(svc))
	mux.Handle("GET /api/openai/", handler.OpenAIProxy())
	mux.Handle("GET /api/anthropic/", handler.AnthropicProxy())
	mux.Handle("GET /", ui.Handler())

	return cors(logging(mux))
}
