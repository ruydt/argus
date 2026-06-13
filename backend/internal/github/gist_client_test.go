package github

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"argus/internal/domain"
)

// fakeGist is a minimal in-memory gist API for tests.
type fakeGist struct {
	id    string
	desc  string
	files map[string]string
}

func newFakeServer(t *testing.T, state *fakeGist) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		write := func(v any) { _ = json.NewEncoder(w).Encode(v) }
		render := func() map[string]any {
			files := map[string]any{}
			for n, c := range state.files {
				files[n] = map[string]any{"filename": n, "content": c}
			}
			return map[string]any{"id": state.id, "description": state.desc, "files": files}
		}
		switch {
		case r.URL.Path == "/user":
			write(map[string]string{"login": "ruy"})
		case r.URL.Path == "/gists" && r.Method == http.MethodGet:
			if state.id == "" {
				write([]any{})
				return
			}
			write([]any{render()})
		case r.URL.Path == "/gists" && r.Method == http.MethodPost:
			var in gistIn
			_ = json.NewDecoder(r.Body).Decode(&in)
			state.id = "gist1"
			state.desc = in.Description
			state.files = map[string]string{}
			for n, f := range in.Files {
				if f != nil {
					state.files[n] = f.Content
				}
			}
			write(render())
		case strings.HasPrefix(r.URL.Path, "/gists/") && r.Method == http.MethodGet:
			write(render())
		case strings.HasPrefix(r.URL.Path, "/gists/") && r.Method == http.MethodPatch:
			// Decode into a raw map so we can mimic GitHub: a present
			// "description" key is applied even when empty (which would wipe the
			// marker); an absent key leaves the description untouched.
			var raw map[string]json.RawMessage
			_ = json.NewDecoder(r.Body).Decode(&raw)
			if d, ok := raw["description"]; ok {
				var desc string
				_ = json.Unmarshal(d, &desc)
				state.desc = desc
			}
			if fr, ok := raw["files"]; ok {
				var files map[string]*gistFileIn
				_ = json.Unmarshal(fr, &files)
				for n, f := range files {
					if f == nil {
						delete(state.files, n)
					} else {
						state.files[n] = f.Content
					}
				}
			}
			write(render())
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
}

func newClient(_ *testing.T, srv *httptest.Server) *GistClient {
	c := NewGistClient("tok", srv.Client())
	c.baseURL = srv.URL
	return c
}

func TestGistFindOrCreateAndLogin(t *testing.T) {
	state := &fakeGist{}
	srv := newFakeServer(t, state)
	defer srv.Close()
	c := newClient(t, srv)

	login, err := c.Login(context.Background())
	if err != nil || login != "ruy" {
		t.Fatalf("Login = %q %v", login, err)
	}
	id, err := c.FindOrCreateCollection(context.Background())
	if err != nil || id != "gist1" {
		t.Fatalf("FindOrCreate = %q %v", id, err)
	}
	if !strings.HasPrefix(state.desc, collectionMarker) {
		t.Errorf("description %q missing marker", state.desc)
	}
	id2, _ := c.FindOrCreateCollection(context.Background())
	if id2 != "gist1" {
		t.Errorf("second FindOrCreate = %q, want gist1", id2)
	}
}

func TestGistAddReadRemove(t *testing.T) {
	state := &fakeGist{id: "gist1", desc: collectionMarker + " x", files: map[string]string{
		"manifest.json": `{"version":1,"scripts":[]}`,
	}}
	srv := newFakeServer(t, state)
	defer srv.Close()
	c := newClient(t, srv)

	s := domain.CollectionScript{ID: "my-guard", Filename: "my-guard.js", Title: "My guard", Origin: "local", Body: "console.log(1)"}
	if err := c.AddScript(context.Background(), "gist1", s); err != nil {
		t.Fatalf("AddScript: %v", err)
	}
	if err := c.AddScript(context.Background(), "gist1", s); err != ErrAlreadyInCollection {
		t.Fatalf("duplicate AddScript err = %v, want ErrAlreadyInCollection", err)
	}

	col, err := c.ReadCollection(context.Background(), "gist1")
	if err != nil || len(col.Scripts) != 1 || col.Scripts[0].Body != "console.log(1)" {
		t.Fatalf("ReadCollection = %+v %v", col, err)
	}

	if err := c.RemoveScript(context.Background(), "gist1", "my-guard"); err != nil {
		t.Fatalf("RemoveScript: %v", err)
	}
	if err := c.RemoveScript(context.Background(), "gist1", "my-guard"); err != ErrNotInCollection {
		t.Fatalf("RemoveScript missing err = %v, want ErrNotInCollection", err)
	}
	col, _ = c.ReadCollection(context.Background(), "gist1")
	if len(col.Scripts) != 0 {
		t.Errorf("after remove, scripts = %d, want 0", len(col.Scripts))
	}
}

func TestGistAddPreservesDescription(t *testing.T) {
	state := &fakeGist{id: "gist1", desc: collectionMarker + " argus hook script collection", files: map[string]string{
		"manifest.json": `{"version":1,"scripts":[]}`,
	}}
	srv := newFakeServer(t, state)
	defer srv.Close()
	c := newClient(t, srv)

	// Adding a script must not wipe the [argus-collection] marker — the
	// collection is discovered by that description on other machines.
	s := domain.CollectionScript{ID: "g", Filename: "g.js", Origin: "local", Body: "x"}
	if err := c.AddScript(context.Background(), "gist1", s); err != nil {
		t.Fatalf("AddScript: %v", err)
	}
	if !strings.HasPrefix(state.desc, collectionMarker) {
		t.Fatalf("description wiped after AddScript: %q", state.desc)
	}
	if err := c.RemoveScript(context.Background(), "gist1", "g"); err != nil {
		t.Fatalf("RemoveScript: %v", err)
	}
	if !strings.HasPrefix(state.desc, collectionMarker) {
		t.Fatalf("description wiped after RemoveScript: %q", state.desc)
	}
}

func TestGistCorruptManifestErrors(t *testing.T) {
	state := &fakeGist{id: "gist1", desc: collectionMarker + " x", files: map[string]string{
		"manifest.json": `{ this is not valid json`,
	}}
	srv := newFakeServer(t, state)
	defer srv.Close()
	c := newClient(t, srv)

	// Reading a corrupt manifest must error, not silently return an empty
	// collection (which a later write would then persist, losing all entries).
	if _, err := c.ReadCollection(context.Background(), "gist1"); err == nil {
		t.Fatal("ReadCollection on corrupt manifest err = nil, want error")
	}
	if err := c.AddScript(context.Background(), "gist1", domain.CollectionScript{ID: "x", Filename: "x.js"}); err == nil {
		t.Fatal("AddScript on corrupt manifest err = nil, want error")
	}
}
