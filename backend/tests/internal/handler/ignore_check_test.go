package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"argus/internal/domain"
	"argus/internal/handler"
)

// recordingMatcher implements handler.IgnoreMatcher, records the path it was asked
// about, and returns a canned verdict.
type recordingMatcher struct {
	ignored bool
	reason  string
	gotPath string
}

func (m *recordingMatcher) MatchEvent(e domain.NormalizedEvent) (bool, string) {
	m.gotPath = e.Path
	return m.ignored, m.reason
}

func TestIgnoreCheck_Ignored(t *testing.T) {
	stub := &recordingMatcher{ignored: true, reason: `pattern "*.env" (line 2)`}
	h := handler.IgnoreCheck(stub)

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/diagnostics/ignore-test",
		strings.NewReader(`{"path":"/home/me/.env"}`),
	)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %q)", rec.Code, rec.Body.String())
	}
	var resp struct {
		Ignored bool   `json:"ignored"`
		Reason  string `json:"reason"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !resp.Ignored || resp.Reason != `pattern "*.env" (line 2)` {
		t.Errorf("resp = %+v, want ignored=true with pattern reason", resp)
	}
	if stub.gotPath != "/home/me/.env" {
		t.Errorf("matcher saw path %q, want /home/me/.env", stub.gotPath)
	}
}

func TestIgnoreCheck_NotIgnored(t *testing.T) {
	h := handler.IgnoreCheck(&recordingMatcher{ignored: false})

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/diagnostics/ignore-test",
		strings.NewReader(`{"path":"/home/me/main.go"}`),
	)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var resp struct {
		Ignored bool `json:"ignored"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Ignored {
		t.Errorf("ignored = true, want false")
	}
}

func TestIgnoreCheck_EmptyPath(t *testing.T) {
	h := handler.IgnoreCheck(&recordingMatcher{})

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/diagnostics/ignore-test",
		strings.NewReader(`{"path":"   "}`),
	)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestIgnoreCheck_InvalidJSON(t *testing.T) {
	h := handler.IgnoreCheck(&recordingMatcher{})

	req := httptest.NewRequest(
		http.MethodPost,
		"/api/diagnostics/ignore-test",
		strings.NewReader(`not json`),
	)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}
