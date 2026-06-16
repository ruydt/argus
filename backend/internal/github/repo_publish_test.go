package github_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"argus/internal/github"
)

func fakeGitHub(t *testing.T, scopes string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-OAuth-Scopes", scopes)
		_, _ = w.Write([]byte(`{"login":"alice"}`))
	})
	mux.HandleFunc("/repos/ruydt/argus/forks", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"full_name":"alice/argus"}`))
	})
	mux.HandleFunc("/repos/alice/argus", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"full_name":"alice/argus"}`))
	})
	mux.HandleFunc("/repos/alice/argus/git/ref/heads/main", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"object":{"sha":"basecommit"}}`))
	})
	mux.HandleFunc("/repos/alice/argus/git/commits/basecommit", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"tree":{"sha":"basetree"}}`))
	})
	mux.HandleFunc("/repos/alice/argus/git/blobs", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"sha":"blob1"}`))
	})
	mux.HandleFunc("/repos/alice/argus/git/trees", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			BaseTree string `json:"base_tree"`
			Tree     []struct {
				Path string `json:"path"`
			} `json:"tree"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if len(body.Tree) == 0 || !strings.HasPrefix(body.Tree[0].Path, "registry/scripts/alice/") {
			t.Errorf("tree path not under registry/scripts/alice/: %+v", body.Tree)
		}
		_, _ = w.Write([]byte(`{"sha":"newtree"}`))
	})
	mux.HandleFunc("/repos/alice/argus/git/commits", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"sha":"newcommit"}`))
	})
	mux.HandleFunc("/repos/alice/argus/git/refs", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"ref":"refs/heads/x"}`))
	})
	mux.HandleFunc("/repos/ruydt/argus/pulls", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Body string `json:"body"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Body != "my description" {
			t.Errorf("PR body = %q, want %q", body.Body, "my description")
		}
		_, _ = w.Write([]byte(`{"html_url":"https://github.com/ruydt/argus/pull/1"}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestPublishRegistryHappyPath(t *testing.T) {
	srv := fakeGitHub(t, "gist, public_repo")
	gc := github.NewGistClient("tok", srv.Client())
	gc.SetBaseURL(srv.URL)
	url, err := gc.PublishRegistry(context.Background(),
		[]github.PublishFile{{Name: "foo.js", Body: "console.log(1)\n"}}, "my description")
	if err != nil {
		t.Fatalf("PublishRegistry: %v", err)
	}
	if url != "https://github.com/ruydt/argus/pull/1" {
		t.Fatalf("unexpected PR url: %q", url)
	}
}

func TestPublishRegistryNeedsRepoScope(t *testing.T) {
	srv := fakeGitHub(t, "gist")
	gc := github.NewGistClient("tok", srv.Client())
	gc.SetBaseURL(srv.URL)
	_, err := gc.PublishRegistry(context.Background(),
		[]github.PublishFile{{Name: "foo.js", Body: "x"}}, "")
	if err != github.ErrNeedsRepoScope {
		t.Fatalf("expected ErrNeedsRepoScope, got %v", err)
	}
}
