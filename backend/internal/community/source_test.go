package community_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"argus/internal/community"
)

const demoBody = "// @argus-meta\n// title: Demo\n// @end\nconsole.log('hi')\n"

func demoSHA() string {
	sum := sha256.Sum256([]byte(demoBody))
	return hex.EncodeToString(sum[:])
}

// fakeRegistry serves /index.json and the body file, counting index hits.
func fakeRegistry(t *testing.T, sha string, indexStatus *int32) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/index.json", func(w http.ResponseWriter, _ *http.Request) {
		if indexStatus != nil {
			if s := atomic.LoadInt32(indexStatus); s != 0 {
				w.WriteHeader(int(s))
				return
			}
		}
		_, _ = fmt.Fprintf(w, `{"schema_version":1,"scripts":[{"id":"demo","author":"alice","title":"Demo","runtime":"node","tier":"community","sha256":%q,"source":"scripts/alice/demo.js"}]}`, sha)
	})
	mux.HandleFunc("/scripts/alice/demo.js", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprint(w, demoBody)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestCatalogReturnsScripts(t *testing.T) {
	srv := fakeRegistry(t, demoSHA(), nil)
	src := community.NewSource(srv.URL, srv.Client())
	scripts, err := src.Catalog(context.Background())
	if err != nil {
		t.Fatalf("Catalog: %v", err)
	}
	if len(scripts) != 1 || scripts[0].ID != "demo" || scripts[0].Author != "alice" {
		t.Fatalf("unexpected scripts: %+v", scripts)
	}
}

func TestScriptBodyVerifiesChecksum(t *testing.T) {
	srv := fakeRegistry(t, demoSHA(), nil)
	src := community.NewSource(srv.URL, srv.Client())
	cs, body, err := src.ScriptBody(context.Background(), "demo")
	if err != nil {
		t.Fatalf("ScriptBody: %v", err)
	}
	if string(body) != demoBody || cs.Runtime != "node" {
		t.Fatalf("unexpected body/meta: %q %+v", body, cs)
	}
}

func TestScriptBodyRejectsTamper(t *testing.T) {
	srv := fakeRegistry(t, "deadbeef", nil) // index advertises wrong sha
	src := community.NewSource(srv.URL, srv.Client())
	if _, _, err := src.ScriptBody(context.Background(), "demo"); err == nil {
		t.Fatal("expected integrity error, got nil")
	}
}

func TestCatalogServesStaleOnError(t *testing.T) {
	var status int32
	srv := fakeRegistry(t, demoSHA(), &status)
	src := community.NewSource(srv.URL, srv.Client())
	if _, err := src.Catalog(context.Background()); err != nil {
		t.Fatalf("warm cache: %v", err)
	}
	atomic.StoreInt32(&status, http.StatusInternalServerError) // registry now down
	scripts, err := src.Catalog(context.Background())
	if err != nil {
		t.Fatalf("expected stale cache served, got err %v", err)
	}
	if len(scripts) != 1 {
		t.Fatalf("expected stale scripts, got %+v", scripts)
	}
}
