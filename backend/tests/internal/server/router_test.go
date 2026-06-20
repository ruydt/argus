package server_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"argus/internal/domain"
	"argus/internal/server"
	"argus/internal/service"
)

type noopRepo struct{}

func (noopRepo) Add(domain.NormalizedEvent) error { return nil }

func (noopRepo) List(int) ([]domain.NormalizedEvent, error) { return nil, nil }

func (noopRepo) ListBySession(string, int) ([]domain.NormalizedEvent, error) { return nil, nil }

func (noopRepo) SessionModel(string) (string, error) { return "", nil }

func (noopRepo) DiagnosticsStorageStats() (domain.DiagnosticsStorageStats, error) {
	return domain.DiagnosticsStorageStats{}, nil
}

func (noopRepo) DiagnosticsAgentStats() ([]domain.DiagnosticsAgentStats, error) {
	return nil, nil
}

func (noopRepo) UpsertSession(string, string, string, string, string, string, string, string) error {
	return nil
}

func (noopRepo) ExportEvents(_ context.Context, _ io.Writer) error { return nil }

func (noopRepo) ExportSnapshot(_ context.Context, _ string) error { return nil }

func (noopRepo) GetRawPayload(_ string) ([]byte, error) { return nil, nil }

func (noopRepo) ListByTimeRange(_, _, _ string, _ int64, _ int) ([]domain.NormalizedEvent, int64, bool, error) {
	return nil, 0, false, nil
}

func (noopRepo) ListBySessionsTimeRange(_, _, _ string, _ int64, _ int) ([]domain.NormalizedEvent, int64, bool, error) {
	return nil, 0, false, nil
}

func (noopRepo) MarkStaleSessions(_ time.Time) (int64, error) { return 0, nil }
func (noopRepo) Compact(_ context.Context) (domain.CompactResult, error) {
	return domain.CompactResult{}, nil
}
func (noopRepo) PruneEvents(_ context.Context, _ string, _ int) (int64, error) { return 0, nil }
func (noopRepo) DeleteSessions(_ context.Context, _ []string) (int64, error)   { return 0, nil }

func (noopRepo) Ready() bool { return true }

func (noopRepo) DBHealth() (domain.DiagnosticsDBHealth, error) {
	return domain.DiagnosticsDBHealth{JournalMode: "wal", PageCount: 10, PageSizeBytes: 4096, MigrationVersion: 13}, nil
}

var testCORSOrigins = []string{
	"http://localhost:10804",
	"http://127.0.0.1:10804",
	"http://[::1]:10804",
}

func newTestRouter() http.Handler {
	repo := noopRepo{}
	return server.NewRouter(service.New(repo), repo, repo.Ready, server.Options{
		CORSOrigins: testCORSOrigins,
		DBPath:      ":memory:",
		IgnoreFile: domain.DiagnosticsIgnoreFile{
			Path:               "/tmp/argus-ignore",
			Status:             "missing_ok",
			ActivePatternCount: 0,
		},
		Addr:        "127.0.0.1:10804",
		AllowRemote: false,
		HookConfigDetector: func() []domain.DiagnosticsHookConfig {
			return []domain.DiagnosticsHookConfig{
				{Agent: "claudecode", Status: "configured"},
				{Agent: "codex", Status: "missing"},
			}
		},
	})
}

func localRequest(method, target string) *http.Request {
	req := httptest.NewRequest(method, target, nil)
	req.Host = "127.0.0.1:10804"
	return req
}

func TestNewRouterCORSAllowsLocalhost(t *testing.T) {
	req := localRequest(http.MethodOptions, "/api/hook")
	req.Header.Set("Origin", "http://localhost:10804")
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:10804" {
		t.Fatalf("allow-origin = %q, want http://localhost:10804", got)
	}
	if rec.Header().Get("Vary") != "Origin" {
		t.Fatalf("Vary = %q, want Origin", rec.Header().Get("Vary"))
	}
}

func TestNewRouterCORSAllows127(t *testing.T) {
	req := localRequest(http.MethodOptions, "/api/hook")
	req.Header.Set("Origin", "http://127.0.0.1:10804")
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:10804" {
		t.Fatalf("allow-origin = %q, want http://127.0.0.1:10804", got)
	}
}

func TestNewRouterCORSDeniesExternalOrigin(t *testing.T) {
	req := localRequest(http.MethodOptions, "/api/hook")
	req.Header.Set("Origin", "https://example.test")
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got == "*" || got == "https://example.test" {
		t.Fatalf("allow-origin = %q, must not be wildcard or reflected", got)
	}
}

func TestNewRouterCORSDeniesNullOrigin(t *testing.T) {
	req := localRequest(http.MethodOptions, "/api/hook")
	req.Header.Set("Origin", "null")
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("allow-origin = %q, want empty for null origin", got)
	}
}

func TestNewRouterCORSNoOriginNonCORSRequest(t *testing.T) {
	req := localRequest(http.MethodGet, "/api/version")
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got == "*" {
		t.Fatalf("allow-origin = %q, must not be wildcard for non-CORS request", got)
	}
}

func TestNewRouterDiagnosticsIncludesHookConfig(t *testing.T) {
	req := localRequest(http.MethodGet, "/api/diagnostics")
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload domain.Diagnostics
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode diagnostics: %v", err)
	}
	if len(payload.Agents) != 2 {
		t.Fatalf("len agents = %d, want 2", len(payload.Agents))
	}
	if payload.Agents[0].HookConfigStatus != "configured" {
		t.Fatalf("Claude hook status = %q, want configured", payload.Agents[0].HookConfigStatus)
	}
	if payload.Agents[1].HookConfigStatus != "missing" {
		t.Fatalf("Codex hook status = %q, want missing", payload.Agents[1].HookConfigStatus)
	}
}

func TestNewRouterVersionReturnsAppVersion(t *testing.T) {
	req := localRequest(http.MethodGet, "/api/version")
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var payload struct {
		Version   string `json:"version"`
		Commit    string `json:"commit"`
		BuildDate string `json:"buildDate"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode version response: %v", err)
	}
	if payload.Version != "0.0.0-dev" {
		t.Fatalf("version = %q, want 0.0.0-dev", payload.Version)
	}
	if payload.Commit != "none" {
		t.Fatalf("commit = %q, want none", payload.Commit)
	}
	if payload.BuildDate != "unknown" {
		t.Fatalf("buildDate = %q, want unknown", payload.BuildDate)
	}
}

func TestNewRouterDiagnosticsReturnsJSON(t *testing.T) {
	req := localRequest(http.MethodGet, "/api/diagnostics")
	rec := httptest.NewRecorder()

	newTestRouter().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var payload domain.Diagnostics
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode diagnostics response: %v", err)
	}
	if payload.Version.BuildDate != "unknown" {
		t.Fatalf("buildDate = %q, want unknown", payload.Version.BuildDate)
	}
	if !payload.Health.Live || !payload.Health.Ready {
		t.Fatalf("health = %+v, want live and ready", payload.Health)
	}
	if payload.Storage.DBPath != ":memory:" {
		t.Fatalf("storage.dbPath = %q, want :memory:", payload.Storage.DBPath)
	}
	if payload.Storage.DBSizeBytes != nil {
		t.Fatalf("storage.dbSizeBytes = %d, want nil", *payload.Storage.DBSizeBytes)
	}
	if payload.Storage.DBSizeReason != "unavailable" {
		t.Fatalf("storage.dbSizeReason = %q, want unavailable", payload.Storage.DBSizeReason)
	}
	if payload.Storage.LatestEventAt != nil {
		t.Fatalf("storage.latestEventAt = %q, want nil", *payload.Storage.LatestEventAt)
	}
	if payload.Privacy.IgnoreFile.Path != "/tmp/argus-ignore" {
		t.Fatalf("privacy.ignoreFile.path = %q, want /tmp/argus-ignore", payload.Privacy.IgnoreFile.Path)
	}
	if payload.Privacy.IgnoreFile.Status != "missing_ok" {
		t.Fatalf("privacy.ignoreFile.status = %q, want missing_ok", payload.Privacy.IgnoreFile.Status)
	}
	if payload.Privacy.ExportWarning == "" {
		t.Fatal("privacy.exportWarning is empty")
	}
	if payload.Security.RemoteBind.Status != "loopback" {
		t.Fatalf("security.remoteBind.status = %q, want loopback", payload.Security.RemoteBind.Status)
	}
	if payload.Security.CORS.TotalOrigins != 3 || payload.Security.CORS.LocalOrigins != 3 || payload.Security.CORS.ExtraOrigins != 0 {
		t.Fatalf("security.cors = %+v, want total=3 local=3 extra=0", payload.Security.CORS)
	}
}

func TestHostHeaderAllowsIPv6Loopback(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	req.Host = "[::1]:10804"
	rec := httptest.NewRecorder()
	newTestRouter().ServeHTTP(rec, req)
	if rec.Code == http.StatusForbidden {
		t.Fatalf("status = %d, want 200 for [::1]:10804", rec.Code)
	}
}
