package server

import (
	"net/http"
	"os"

	"argus/internal/community"
	"argus/internal/domain"
	"argus/internal/github"
	"argus/internal/handler"
	"argus/internal/hookconfig"
	"argus/internal/repository"
	"argus/internal/service"
	"argus/internal/ui"
)

// Options carries optional router configuration.
// Add new fields here rather than widening the NewRouter parameter list.
type Options struct {
	// Matcher is the privacy ignore matcher applied before hook ingestion.
	// If nil, an allow-none matcher is used (no events are ignored).
	Matcher handler.IgnoreMatcher

	// CORSOrigins is the explicit set of allowed CORS origins.
	// If empty, the default loopback origins for port 10804 are used.
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

	// Home is the user's home directory. All agent hook-config paths are
	// resolved against it via the agentspec registry. Defaults to
	// os.UserHomeDir() at request time if empty.
	Home string

	// ArgusDir is the path to the argus home directory (typically ~/.argus).
	// Used by diagnostics, log-tail, and the enabled-agents store.
	ArgusDir string
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
			"http://localhost:10804",
			"http://127.0.0.1:10804",
			"http://[::1]:10804",
		}
	}

	mux := http.NewServeMux()

	mux.Handle("GET /healthz", handler.Healthz())
	mux.Handle("GET /readyz", handler.Readyz(ready))
	mux.Handle("POST /api/hook", handler.Hook(svc, m))
	mux.Handle("GET /api/events", handler.Events(svc))
	mux.Handle("GET /api/events/stream", handler.EventsStream(svc))
	mux.Handle("GET /api/events/raw", secFetchSite(handler.EventRawPayload(svc)))
	mux.Handle("DELETE /api/sessions", secFetchSite(handler.DeleteSessions(svc)))
	mux.Handle("GET /api/version", handler.Version())
	hookDetector := opts.HookConfigDetector
	if hookDetector == nil {
		hookDetector = hookconfig.Detector{HomeDir: opts.Home, ArgusDir: opts.ArgusDir}.Detect
	}
	mux.Handle("GET /api/diagnostics", handler.Diagnostics(svc, ready, service.DiagnosticsOptions{
		DBPath:             opts.DBPath,
		HookConfigDetector: hookDetector,
		IgnoreFile:         opts.IgnoreFile,
		Addr:               opts.Addr,
		AllowRemote:        opts.AllowRemote,
		CORSOrigins:        corsOrigins,
		ArgusDir:           opts.ArgusDir,
	}))
	mux.Handle("GET /api/diagnostics/log-tail", handler.LogTail(handler.LogTailOptions{
		ArgusDir: opts.ArgusDir,
	}))
	mux.Handle("POST /api/diagnostics/log-clear", secFetchSite(handler.LogClear(handler.LogTailOptions{
		ArgusDir: opts.ArgusDir,
	})))
	mux.Handle("POST /api/diagnostics/compact", secFetchSite(handler.CompactDatabase(svc)))
	mux.Handle("GET /api/export/events", secFetchSite(handler.ExportEvents(repo)))
	mux.Handle("GET /api/export/snapshot", secFetchSite(handler.ExportSnapshot(repo)))
	mux.Handle("GET /api/hooks-config", handler.HooksConfig(opts.Home))
	mux.Handle("PUT /api/hooks-config", secFetchSite(handler.HooksConfig(opts.Home)))
	mux.Handle("GET /api/agents", handler.Agents(opts.Home, opts.ArgusDir))
	mux.Handle("POST /api/agents/enabled", secFetchSite(handler.AgentsEnabled(opts.Home, opts.ArgusDir)))
	mux.Handle("DELETE /api/agents/enabled", secFetchSite(handler.AgentsEnabled(opts.Home, opts.ArgusDir)))
	mux.Handle("POST /api/hooks/simulate", secFetchSite(handler.HooksSimulate()))
	registryURL := os.Getenv("ARGUS_REGISTRY_RAW_URL")
	if registryURL == "" {
		registryURL = defaultRegistryRawURL
	}
	communitySrc := community.NewSource(registryURL, nil)
	githubClientID := os.Getenv("ARGUS_GITHUB_CLIENT_ID")
	if githubClientID == "" {
		githubClientID = defaultGitHubClientID
	}
	ghSvc := github.NewService(githubClientID, opts.ArgusDir)
	mux.Handle("POST /api/github/device", secFetchSite(handler.GitHubDevice(ghSvc)))
	mux.Handle("GET /api/github/status", handler.GitHubStatus(ghSvc))
	mux.Handle("POST /api/github/logout", secFetchSite(handler.GitHubLogout(ghSvc)))
	mux.Handle("POST /api/registry/publish", secFetchSite(handler.RegistryPublish(ghSvc)))
	mux.Handle("GET /api/collection", secFetchSite(handler.Collection(ghSvc, communitySrc, opts.ArgusDir)))
	mux.Handle("POST /api/collection", secFetchSite(handler.CollectionAdd(ghSvc, opts.ArgusDir)))
	mux.Handle("DELETE /api/collection", secFetchSite(handler.CollectionRemove(ghSvc)))
	mux.Handle("POST /api/collection/install", secFetchSite(handler.CollectionInstall(ghSvc, opts.ArgusDir)))
	mux.Handle("GET /api/collection/local", secFetchSite(handler.CollectionLocal(opts.ArgusDir)))
	mux.Handle("DELETE /api/collection/local", secFetchSite(handler.CollectionLocal(opts.ArgusDir)))
	mux.Handle("POST /api/collection/reveal", secFetchSite(handler.CollectionReveal(opts.ArgusDir)))
	mux.Handle("GET /api/collection/gist", secFetchSite(handler.CollectionGistBody(ghSvc)))
	mux.Handle("GET /api/community/catalog", handler.CommunityCatalog(communitySrc, opts.ArgusDir))
	mux.Handle("GET /api/community/script", handler.CommunityScriptBody(communitySrc))
	mux.Handle("POST /api/community/install", secFetchSite(handler.CommunityInstall(communitySrc, opts.ArgusDir)))
	mux.Handle("POST /api/community/simulate", secFetchSite(handler.CommunitySimulate(communitySrc)))
	mux.Handle("GET /", ui.Handler())

	return panicRecovery(hostHeader(corsAllowlist(corsOrigins)(logging(mux))))
}

// defaultGitHubClientID is argus's public OAuth App client id (device flow needs
// no secret). Override at runtime with ARGUS_GITHUB_CLIENT_ID.
const defaultGitHubClientID = "Ov23liZl7euqQmfnmBPW"

// defaultRegistryRawURL is where argus reads the public community script index.
// Override at runtime with ARGUS_REGISTRY_RAW_URL (forks/tests).
const defaultRegistryRawURL = "https://raw.githubusercontent.com/ruydt/argus/main/registry"
