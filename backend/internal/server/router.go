package server

import (
	"net/http"

	"hooker/internal/domain"
	"hooker/internal/handler"
	"hooker/internal/repository"
	"hooker/internal/service"
	"hooker/internal/ui"
)

// Options carries optional router configuration.
// Add new fields here rather than widening the NewRouter parameter list.
type Options struct {
	// Matcher is the privacy ignore matcher applied before hook ingestion.
	// If nil, an allow-none matcher is used (no events are ignored).
	Matcher handler.IgnoreMatcher

	// CORSOrigins is the explicit set of allowed CORS origins.
	// If empty, the default loopback origins for port 8765 are used.
	CORSOrigins []string
}

// allowNone is the default matcher used when Options.Matcher is nil.
// It never matches any event, so all events are ingested normally.
type allowNone struct{}

func (allowNone) MatchEvent(_ domain.NormalizedEvent) (bool, string) { return false, "" }

func NewRouter(svc *service.EventService, repo repository.EventRepository, ready func() bool, opts Options) http.Handler {
	m := handler.IgnoreMatcher(allowNone{})
	if opts.Matcher != nil {
		m = opts.Matcher
	}

	corsOrigins := opts.CORSOrigins
	if len(corsOrigins) == 0 {
		corsOrigins = []string{
			"http://localhost:8765",
			"http://127.0.0.1:8765",
			"http://[::1]:8765",
		}
	}

	mux := http.NewServeMux()

	mux.Handle("GET /healthz", handler.Healthz())
	mux.Handle("GET /readyz", handler.Readyz(ready))
	mux.Handle("POST /api/hook", handler.Hook(svc, m))
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

	return panicRecovery(hostHeader(corsAllowlist(corsOrigins)(logging(mux))))
}
