package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"hooker/internal/domain"
	"hooker/internal/handler"
	"hooker/internal/service"
)

func TestDiagnosticsHandlerReturnsGroupedShape(t *testing.T) {
	repo := newTestRepo(t)
	svc := service.New(repo)
	h := handler.Diagnostics(svc, repo.Ready, ":memory:")

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
	for _, key := range []string{"version", "health", "storage", "agents"} {
		if _, ok := payload[key]; !ok {
			t.Fatalf("payload missing %q: %#v", key, payload)
		}
	}
	for _, forbidden := range []string{"privacy"} {
		if _, ok := payload[forbidden]; ok {
			t.Fatalf("payload includes forbidden top-level key %q", forbidden)
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
}

func TestDiagnosticsHandlerReturns200WhenNotReady(t *testing.T) {
	repo := newTestRepo(t)
	svc := service.New(repo)
	h := handler.Diagnostics(svc, func() bool { return false }, ":memory:")

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
	h := handler.Diagnostics(svc, repo.Ready, ":memory:")

	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := rec.Body.String()
	for _, forbidden := range []string{
		"privacy",
		"raw_payload",
		"prompt",
		"tool_result_stdout",
		"tool_result_stderr",
		"secret prompt",
		"rm -rf",
		"tool_result_stdout secret",
		"tool_result_stderr secret",
	} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("diagnostics response contains forbidden content %q: %s", forbidden, body)
		}
	}
}

func TestDiagnosticsHandlerReturns500OnAggregateError(t *testing.T) {
	repo := newTestRepo(t)
	svc := service.New(repo)
	if err := repo.RawDB().Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	h := handler.Diagnostics(svc, repo.Ready, ":memory:")

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
	h := handler.Diagnostics(svc, repo.Ready, ":memory:", []domain.DiagnosticsHookConfig{
		{Agent: "claudecode", Status: "missing"},
		{Agent: "codex", Status: "unknown", Reason: "read_error"},
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
