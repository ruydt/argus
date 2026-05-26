package handler_test

import (
	"bufio"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"hooker/internal/domain"
	"hooker/internal/handler"
	"hooker/internal/repository/sqlite"
	"hooker/internal/server"
	"hooker/internal/service"
)

func newTestRepo(t *testing.T) *sqlite.DB {
	t.Helper()
	db, err := sqlite.New(":memory:")
	if err != nil {
		t.Fatalf("sqlite.New: %v", err)
	}
	return db
}

func TestExportEventsEmptyDBReturns200(t *testing.T) {
	repo := newTestRepo(t)
	h := handler.ExportEvents(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/export/events", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if rec.Body.Len() != 0 {
		t.Fatalf("body should be empty for empty DB, got %d bytes", rec.Body.Len())
	}
}

func TestExportEventsReturnsNDJSON(t *testing.T) {
	repo := newTestRepo(t)
	svc := service.New(repo)

	base := time.Now().UTC()
	for i := 0; i < 3; i++ {
		if err := svc.AddEvent(domain.NormalizedEvent{
			Time:          base.Add(time.Duration(i) * time.Second).Format(time.RFC3339),
			Agent:         "codex",
			Session:       "sess-export",
			HookEventName: "PreToolUse",
			Action:        "read",
			Path:          "/tmp/file.go",
			RawPayload:    []byte(`{}`),
		}); err != nil {
			t.Fatalf("AddEvent: %v", err)
		}
	}

	h := handler.ExportEvents(repo)
	req := httptest.NewRequest(http.MethodGet, "/api/export/events", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	// Count newline-delimited JSON lines
	scanner := bufio.NewScanner(bytes.NewReader(rec.Body.Bytes()))
	lineCount := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var e domain.NormalizedEvent
		if err := json.Unmarshal([]byte(line), &e); err != nil {
			t.Fatalf("line %d is not valid JSON: %v — %s", lineCount+1, err, line)
		}
		lineCount++
	}
	if lineCount != 3 {
		t.Fatalf("got %d NDJSON lines, want 3", lineCount)
	}
}

func TestExportEventsContentTypeIsNDJSON(t *testing.T) {
	repo := newTestRepo(t)
	h := handler.ExportEvents(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/export/events", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	ct := rec.Header().Get("Content-Type")
	if ct != "application/x-ndjson" {
		t.Fatalf("Content-Type = %q, want application/x-ndjson", ct)
	}
}

func TestExportSnapshotReturns200WithHeaders(t *testing.T) {
	repo := newTestRepo(t)
	h := handler.ExportSnapshot(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/export/snapshot", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	cd := rec.Header().Get("Content-Disposition")
	if !strings.Contains(cd, "hooker-snapshot-") {
		t.Fatalf("Content-Disposition %q missing hooker-snapshot-", cd)
	}
	if !strings.Contains(cd, ".db") {
		t.Fatalf("Content-Disposition %q missing .db extension", cd)
	}
}

func TestExportSnapshotContentLengthIsPositive(t *testing.T) {
	repo := newTestRepo(t)
	h := handler.ExportSnapshot(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/export/snapshot", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	cl := rec.Header().Get("Content-Length")
	if cl == "" || cl == "0" {
		t.Fatalf("Content-Length = %q, want positive integer", cl)
	}
}

func newRouterWithRepo(repo *sqlite.DB) http.Handler {
	svc := service.New(repo)
	return server.NewRouter(svc, repo, repo.Ready)
}

func TestSecFetchSiteBlocksCrossSiteOnExportEvents(t *testing.T) {
	repo := newTestRepo(t)
	h := newRouterWithRepo(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/export/events", nil)
	req.Host = "localhost"
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 for cross-site request", rec.Code)
	}
}

func TestSecFetchSiteBlocksCrossSiteOnExportSnapshot(t *testing.T) {
	repo := newTestRepo(t)
	h := newRouterWithRepo(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/export/snapshot", nil)
	req.Host = "localhost"
	req.Header.Set("Sec-Fetch-Site", "cross-site")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403 for cross-site request", rec.Code)
	}
}

func TestSecFetchSiteAllowsAbsentHeaderOnExportEvents(t *testing.T) {
	repo := newTestRepo(t)
	h := newRouterWithRepo(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/export/events", nil)
	req.Host = "localhost"
	// No Sec-Fetch-Site header — simulates curl/wget
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 when Sec-Fetch-Site absent", rec.Code)
	}
}
