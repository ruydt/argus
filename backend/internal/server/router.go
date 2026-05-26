package server

import (
	"net/http"

	"hooker/internal/handler"
	"hooker/internal/repository"
	"hooker/internal/service"
	"hooker/internal/ui"
)

func NewRouter(svc *service.EventService, repo repository.EventRepository, ready func() bool) http.Handler {
	mux := http.NewServeMux()

	mux.Handle("GET /healthz", handler.Healthz())
	mux.Handle("GET /readyz", handler.Readyz(ready))
	mux.Handle("POST /api/hook", handler.Hook(svc))
	mux.Handle("GET /api/events", handler.Events(svc))
	mux.Handle("GET /api/events/stream", handler.EventsStream(svc))
	mux.Handle("GET /api/version", handler.Version())
	mux.Handle("GET /api/session-usage", handler.Usage())
	mux.Handle("GET /api/projects", handler.Projects(svc))
	mux.Handle("GET /api/sessions", handler.Sessions(svc))
	mux.Handle("GET /api/sessions/tree", handler.SessionsTree(svc))
	mux.Handle("GET /api/traces", handler.Traces(svc))
	mux.Handle("GET /api/file-changes", handler.FileChanges(svc))
	mux.Handle("GET /api/dashboard/stats", handler.DashboardStats(svc))
	mux.Handle("GET /api/openai/", handler.OpenAIProxy())
	mux.Handle("GET /api/anthropic/", handler.AnthropicProxy())
	mux.Handle("GET /api/export/events", secFetchSite(handler.ExportEvents(repo)))
	mux.Handle("GET /api/export/snapshot", secFetchSite(handler.ExportSnapshot(repo)))
	mux.Handle("GET /", ui.Handler())

	return panicRecovery(hostHeader(cors(logging(mux))))
}
