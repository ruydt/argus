package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"argus/internal/domain"
	"argus/internal/handler"
	"argus/internal/service"
)

func TestDiagnosticsHandlerReturnsGroupedShape(t *testing.T) {
	repo := newTestRepo(t)
	svc := service.New(repo)
	h := handler.Diagnostics(svc, repo.Ready, service.DiagnosticsOptions{DBPath: ":memory:"})

	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode diagnostics: %v", err)
	}
	for _, key := range []string{"version", "health", "storage", "agents", "privacy", "security", "fileSystem"} {
		if _, ok := payload[key]; !ok {
			t.Fatalf("payload missing %q: %#v", key, payload)
		}
	}
	agents, ok := payload["agents"].([]any)
	if !ok {
		t.Fatalf("agents = %#v, want array", payload["agents"])
	}
	if len(agents) != 2 {
		t.Fatalf("len(agents) = %d, want 2", len(agents))
	}

	storage, ok := payload["storage"].(map[string]any)
	if !ok {
		t.Fatalf("storage = %#v, want object", payload["storage"])
	}
	if storage["dbPath"] != ":memory:" {
		t.Fatalf("storage.dbPath = %#v, want :memory:", storage["dbPath"])
	}
	if storage["dbSizeBytes"] != nil {
		t.Fatalf("storage.dbSizeBytes = %#v, want nil", storage["dbSizeBytes"])
	}
	if storage["dbSizeReason"] != "unavailable" {
		t.Fatalf("storage.dbSizeReason = %#v, want unavailable", storage["dbSizeReason"])
	}
	if storage["latestEventAt"] != nil {
		t.Fatalf("storage.latestEventAt = %#v, want nil", storage["latestEventAt"])
	}
	fileSystem, ok := payload["fileSystem"].(map[string]any)
	if !ok {
		t.Fatalf("fileSystem = %#v, want object", payload["fileSystem"])
	}
	for _, key := range []string{"argusDir", "binary", "logs", "hooks"} {
		if _, ok := fileSystem[key]; !ok {
			t.Fatalf("fileSystem missing %q: %#v", key, fileSystem)
		}
	}
	logs, ok := fileSystem["logs"].([]any)
	if !ok {
		t.Fatalf("fileSystem.logs = %#v, want array", fileSystem["logs"])
	}
	if len(logs) != 3 {
		t.Fatalf("len(fileSystem.logs) = %d, want 3", len(logs))
	}
	privacy, ok := payload["privacy"].(map[string]any)
	if !ok {
		t.Fatalf("privacy = %#v, want object", payload["privacy"])
	}
	if _, ok := privacy["ignoreFile"].(map[string]any); !ok {
		t.Fatalf("privacy.ignoreFile = %#v, want object", privacy["ignoreFile"])
	}
	if privacy["exportWarning"] == "" {
		t.Fatalf("privacy.exportWarning = %#v, want non-empty", privacy["exportWarning"])
	}
	if _, ok := payload["security"].(map[string]any); !ok {
		t.Fatalf("security = %#v, want object", payload["security"])
	}
}

func TestDiagnosticsHandlerReturns200WhenNotReady(t *testing.T) {
	repo := newTestRepo(t)
	svc := service.New(repo)
	h := handler.Diagnostics(svc, func() bool { return false }, service.DiagnosticsOptions{DBPath: ":memory:"})

	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload domain.Diagnostics
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode diagnostics: %v", err)
	}
	if payload.Health.Ready {
		t.Fatal("health.ready = true, want false")
	}
	if payload.Health.Reason != "database not ready" {
		t.Fatalf("health.reason = %q, want database not ready", payload.Health.Reason)
	}
}

func TestDiagnosticsHandlerDoesNotExposeCapturedContent(t *testing.T) {
	repo := newTestRepo(t)
	svc := service.New(repo)
	if err := svc.AddEvent(domain.NormalizedEvent{
		Time:             time.Date(2026, 5, 27, 10, 0, 0, 0, time.UTC).Format(time.RFC3339),
		Agent:            "codex",
		Session:          "diagnostics-sensitive",
		HookEventName:    "PostToolUse",
		ToolUseID:        "tu-sensitive",
		Tool:             "Bash",
		Command:          "rm -rf",
		Prompt:           "secret prompt",
		ToolResultStdout: "tool_result_stdout secret",
		ToolResultStderr: "tool_result_stderr secret",
		RawPayload:       []byte(`{"raw_payload":"secret"}`),
	}); err != nil {
		t.Fatalf("AddEvent: %v", err)
	}
	h := handler.Diagnostics(svc, repo.Ready, service.DiagnosticsOptions{
		DBPath: ":memory:",
		IgnoreFile: domain.DiagnosticsIgnoreFile{
			Path:               "/tmp/private-ignore",
			Status:             "loaded",
			ActivePatternCount: 1,
		},
		CORSOrigins: []string{"http://localhost:10804", "https://sensitive-origin.example"},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := rec.Body.String()
	for _, forbidden := range []string{
		"raw_payload",
		"tool_result_stdout",
		"tool_result_stderr",
		"secret prompt",
		"rm -rf",
		"tool_result_stdout secret",
		"tool_result_stderr secret",
		"*.pem",
		"https://sensitive-origin.example",
	} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("diagnostics response contains forbidden content %q: %s", forbidden, body)
		}
	}
	for _, want := range []string{"prompts", "diffs", "file paths", "tool outputs", "raw payloads", "exports"} {
		if !strings.Contains(body, want) {
			t.Fatalf("diagnostics response missing export warning term %q: %s", want, body)
		}
	}
}

func TestDiagnosticsHandlerReturns500OnAggregateError(t *testing.T) {
	repo := newTestRepo(t)
	svc := service.New(repo)
	if err := repo.RawDB().Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	h := handler.Diagnostics(svc, repo.Ready, service.DiagnosticsOptions{DBPath: ":memory:"})

	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
}

func TestDiagnosticsHandlerSerializesHookConfigStatus(t *testing.T) {
	repo := newTestRepo(t)
	svc := service.New(repo)
	h := handler.Diagnostics(svc, repo.Ready, service.DiagnosticsOptions{
		DBPath: ":memory:",
		HookConfigDetector: func() []domain.DiagnosticsHookConfig {
			return []domain.DiagnosticsHookConfig{
				{Agent: "claudecode", Status: "missing"},
				{Agent: "codex", Status: "unknown", Reason: "read_error"},
			}
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := rec.Body.String()
	for _, want := range []string{`"hookConfigStatus":"missing"`, `"hookConfigStatus":"unknown"`, `"hookConfigReason":"read_error"`} {
		if !strings.Contains(body, want) {
			t.Fatalf("diagnostics response missing %s: %s", want, body)
		}
	}
	if strings.Contains(body, "permission denied") {
		t.Fatalf("diagnostics response leaked raw read error: %s", body)
	}
}
