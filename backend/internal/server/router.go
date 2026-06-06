package server

import (
	"net/http"

	"hooker/internal/domain"
	"hooker/internal/handler"
	"hooker/internal/hookconfig"
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

	// DBPath is reported by the read-only diagnostics endpoint.
	DBPath string

	// HookConfigDetector is called on each diagnostics TTL refresh to re-read hook config files.
	// If nil, a default Detector with auto-detected home directory is used.
	HookConfigDetector func() []domain.DiagnosticsHookConfig

	// IgnoreFile carries safe ignore-file diagnostics: path, status, and count only.
	IgnoreFile domain.DiagnosticsIgnoreFile

	// Addr and AllowRemote describe bind posture for diagnostics display.
	Addr        string
	AllowRemote bool

	// ClaudeSettingsPath is the full path to the Claude Code settings file.
	// Defaults to ~/.claude/settings.json if empty.
	ClaudeSettingsPath string

	// CodexHooksPath is the full path to the Codex hooks config file.
	// Defaults to ~/.codex/hooks.json if empty.
	CodexHooksPath string
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
	mux.Handle("POST /api/hook", handler.Hook(svc, m, nil))
	mux.Handle("GET /api/events", handler.Events(svc))
	mux.Handle("GET /api/events/stream", handler.EventsStream(svc))
	mux.Handle("GET /api/events/raw", handler.EventRawPayload(svc))
	mux.Handle("GET /api/version", handler.Version())
	hookDetector := opts.HookConfigDetector
	if hookDetector == nil {
		hookDetector = hookconfig.Detector{}.Detect
	}
	mux.Handle("GET /api/diagnostics", handler.Diagnostics(svc, ready, service.DiagnosticsOptions{
		DBPath:             opts.DBPath,
		HookConfigDetector: hookDetector,
		IgnoreFile:         opts.IgnoreFile,
		Addr:               opts.Addr,
		AllowRemote:        opts.AllowRemote,
		CORSOrigins:        corsOrigins,
	}))
	mux.Handle("GET /api/session-usage", handler.Usage())
	mux.Handle("GET /api/projects", handler.Projects(svc))
	mux.Handle("GET /api/sessions", handler.Sessions(svc))
	mux.Handle("GET /api/sessions/tree", handler.SessionsTree(svc))
	mux.Handle("GET /api/file-changes", handler.FileChanges(svc))
	mux.Handle("GET /api/dashboard/stats", handler.DashboardStats(svc))
	mux.Handle("GET /api/openai/", handler.OpenAIProxy())
	mux.Handle("GET /api/anthropic/", handler.AnthropicProxy())
	mux.Handle("GET /api/export/events", secFetchSite(handler.ExportEvents(repo)))
	mux.Handle("GET /api/export/snapshot", secFetchSite(handler.ExportSnapshot(repo)))
	mux.Handle("GET /api/hooks-config", handler.HooksConfig(opts.ClaudeSettingsPath, opts.CodexHooksPath))
	mux.Handle("PUT /api/hooks-config", handler.HooksConfig(opts.ClaudeSettingsPath, opts.CodexHooksPath))
	mux.Handle("GET /", ui.Handler())

	return panicRecovery(hostHeader(corsAllowlist(corsOrigins)(logging(mux))))
}
