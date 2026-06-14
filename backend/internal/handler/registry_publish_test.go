package handler_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"argus/internal/github"
	"argus/internal/handler"
)

func TestRegistryPublishRejectsBadName(t *testing.T) {
	svc := github.NewService("cid", t.TempDir())
	rr := httptest.NewRecorder()
	body := bytes.NewBufferString(`{"files":[{"name":"../evil.js","body":"x"}]}`)
	handler.RegistryPublish(svc).ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/registry/publish", body))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for path-separator name, got %d", rr.Code)
	}
}

func TestRegistryPublishRequiresAuth(t *testing.T) {
	svc := github.NewService("cid", t.TempDir())
	rr := httptest.NewRecorder()
	body := bytes.NewBufferString(`{"files":[{"name":"ok.js","body":"x"}]}`)
	handler.RegistryPublish(svc).ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/registry/publish", body))
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when logged out, got %d", rr.Code)
	}
}
