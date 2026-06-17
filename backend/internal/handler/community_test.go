package handler_test

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"argus/internal/community"
	"argus/internal/handler"
)

const csBody = "#!/bin/sh\necho sandbox-ok\n"

func csSHA() string {
	sum := sha256.Sum256([]byte(csBody))
	return hex.EncodeToString(sum[:])
}

func communityFixture(t *testing.T) (*community.Source, string) {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/index.json", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprintf(w, `{"schema_version":1,"scripts":[{"id":"demo","author":"alice","title":"Demo","runtime":"sh","tier":"community","sha256":%q,"source":"scripts/alice/demo.sh"}]}`, csSHA())
	})
	mux.HandleFunc("/scripts/alice/demo.sh", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprint(w, csBody)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return community.NewSource(srv.URL, srv.Client()), t.TempDir()
}

func TestCommunityCatalogReportsInstallState(t *testing.T) {
	src, dir := communityFixture(t)
	rr := httptest.NewRecorder()
	handler.CommunityCatalog(src, dir).ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/community/catalog", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("status %d", rr.Code)
	}
	var scripts []map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &scripts); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(scripts) != 1 || scripts[0]["installed"] != false {
		t.Fatalf("unexpected catalog: %+v", scripts)
	}
}

func TestCommunityInstallWritesAndConflicts(t *testing.T) {
	src, dir := communityFixture(t)
	body := bytes.NewBufferString(`{"id":"demo"}`)
	rr := httptest.NewRecorder()
	handler.CommunityInstall(src, dir).ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/community/install", body))
	if rr.Code != http.StatusOK {
		t.Fatalf("install status %d", rr.Code)
	}
	if _, err := os.Stat(filepath.Join(dir, "hooks", "demo.sh")); err != nil {
		t.Fatalf("expected installed file: %v", err)
	}
	rr2 := httptest.NewRecorder()
	handler.CommunityInstall(src, dir).ServeHTTP(rr2, httptest.NewRequest(http.MethodPost, "/api/community/install", bytes.NewBufferString(`{"id":"demo"}`)))
	if rr2.Code != http.StatusConflict {
		t.Fatalf("expected 409 on re-install, got %d", rr2.Code)
	}
}

func TestCommunityInstallStampsAuthor(t *testing.T) {
	// A script whose @argus-meta declares no author — install should stamp the
	// registry author so attribution survives offline.
	metaBody := "#!/bin/sh\n// @argus-meta\n// title: Demo\n// @end\necho ok\n"
	sum := sha256.Sum256([]byte(metaBody))
	mux := http.NewServeMux()
	mux.HandleFunc("/index.json", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprintf(w, `{"schema_version":1,"scripts":[{"id":"demo","author":"alice","title":"Demo","runtime":"sh","tier":"community","sha256":%q,"source":"scripts/alice/demo.sh"}]}`, hex.EncodeToString(sum[:]))
	})
	mux.HandleFunc("/scripts/alice/demo.sh", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprint(w, metaBody)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	src := community.NewSource(srv.URL, srv.Client())
	dir := t.TempDir()

	rr := httptest.NewRecorder()
	handler.CommunityInstall(src, dir).ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/community/install", bytes.NewBufferString(`{"id":"demo"}`)))
	if rr.Code != http.StatusOK {
		t.Fatalf("install status %d", rr.Code)
	}
	got, err := os.ReadFile(filepath.Join(dir, "hooks", "demo.sh"))
	if err != nil {
		t.Fatalf("read installed: %v", err)
	}
	if !bytes.Contains(got, []byte("// author: alice")) {
		t.Fatalf("installed file missing stamped author:\n%s", got)
	}
}

func TestCommunitySimulateRunsSandboxed(t *testing.T) {
	src, _ := communityFixture(t)
	body := bytes.NewBufferString(`{"id":"demo","payload":{"hook_event_name":"PreToolUse"}}`)
	rr := httptest.NewRecorder()
	handler.CommunitySimulate(src).ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/community/simulate", body))
	if rr.Code != http.StatusOK {
		t.Fatalf("simulate status %d", rr.Code)
	}
	var resp struct {
		Stdout   string `json:"stdout"`
		ExitCode int    `json:"exit_code"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.ExitCode != 0 || resp.Stdout != "sandbox-ok\n" {
		t.Fatalf("unexpected sim result: %+v", resp)
	}
}

func TestCommunitySimulateRejectsUnsafeRuntime(t *testing.T) {
	body := "echo pwned\n"
	sum := sha256.Sum256([]byte(body))
	sha := hex.EncodeToString(sum[:])
	mux := http.NewServeMux()
	mux.HandleFunc("/index.json", func(w http.ResponseWriter, _ *http.Request) {
		// A crafted registry entry tries to smuggle a shell payload via runtime.
		_, _ = fmt.Fprintf(w, `{"schema_version":1,"scripts":[{"id":"evil","author":"mallory","title":"Evil","runtime":"sh; touch /tmp/argus-pwn #","tier":"community","sha256":%q,"source":"scripts/mallory/evil.sh"}]}`, sha)
	})
	mux.HandleFunc("/scripts/mallory/evil.sh", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprint(w, body)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	src := community.NewSource(srv.URL, srv.Client())

	rr := httptest.NewRecorder()
	req := bytes.NewBufferString(`{"id":"evil","payload":{"hook_event_name":"PreToolUse"}}`)
	handler.CommunitySimulate(src).ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/community/simulate", req))
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for non-allowlisted runtime, got %d", rr.Code)
	}
}

// TestCommunitySimulateIgnoresSourceExtension proves the sandbox does not derive
// the temp filename (and thus the exec path) from the untrusted source field: a
// quote-laden extension must not break out of execution. The script just runs.
func TestCommunitySimulateIgnoresSourceExtension(t *testing.T) {
	body := "echo ran\n"
	sum := sha256.Sum256([]byte(body))
	sha := hex.EncodeToString(sum[:])
	mux := http.NewServeMux()
	mux.HandleFunc("/index.json", func(w http.ResponseWriter, _ *http.Request) {
		// source carries a single quote in its "extension"; runtime is allowlisted.
		_, _ = fmt.Fprintf(w, `{"schema_version":1,"scripts":[{"id":"q","author":"a","title":"Q","runtime":"sh","tier":"community","sha256":%q,"source":"scripts/a/q.j'sh"}]}`, sha)
	})
	mux.HandleFunc("/scripts/a/q.j'sh", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprint(w, body)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	src := community.NewSource(srv.URL, srv.Client())

	rr := httptest.NewRecorder()
	req := bytes.NewBufferString(`{"id":"q","payload":{"hook_event_name":"PreToolUse"}}`)
	handler.CommunitySimulate(src).ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/community/simulate", req))
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var resp struct {
		Stdout   string `json:"stdout"`
		ExitCode int    `json:"exit_code"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.ExitCode != 0 || resp.Stdout != "ran\n" {
		t.Fatalf("unexpected result: %+v", resp)
	}
}
