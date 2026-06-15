# Scripts Collection — GitHub Portability (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user log in with GitHub (device flow) and keep a portable personal collection of hook scripts in their own private gist, installable into `~/.argus/hooks/` on any machine.

**Architecture:** A new `internal/github` package holds three focused units (token store, device-flow client, gist client) plus a stateful `Service` orchestrator. Thin handlers expose auth + collection endpoints; the token never reaches the browser. Local file writes reuse a `writeHookScript` helper extracted from Phase 1. A new "My Collection" tab on `/scripts` drives login + list/install/remove.

> **Current note:** Later scripts-page-redesign/scripts-v2 work supersedes this plan's All/Installed
> tab wiring. Current collection behavior is local ∪ gist, auth-optional, with save/install/remove
> actions under **My Collection**.

**Tech Stack:** Go 1.25 (`net/http`, `encoding/json`, `crypto`), GitHub OAuth Device Flow + Gist API, React 19 + TypeScript, Vitest.

**Manual prerequisite (do first, once):** Register a GitHub **OAuth App** (Settings → Developer settings → OAuth Apps → New). Enable **Device Flow**. Copy the **Client ID** (public; no secret needed). It is wired in Task 9 as `defaultGitHubClientID` and overridable via `ARGUS_GITHUB_CLIENT_ID`. Until a real client id is set, device-flow calls hit GitHub and fail — backend unit tests use a fake server and do not need it.

---

## File Structure

**New (backend):**
- `backend/internal/domain/collection.go` — `CollectionScript`, `Collection`, `GitHubAuthStatus`, `DeviceCodeResponse`
- `backend/internal/github/token_store.go` (+ `_test.go`) — local token file, `0600`
- `backend/internal/github/device_flow.go` (+ `_test.go`) — `Start`/`Poll`
- `backend/internal/github/gist_client.go` (+ `_test.go`) — gist collection CRUD + `Login`
- `backend/internal/github/service.go` (+ `_test.go`) — orchestrator: device state, token, collection ops
- `backend/internal/handler/github_auth.go` (+ `_test.go`) — `device`/`status`/`logout`
- `backend/internal/handler/collection.go` (+ `_test.go`) — list/add/remove/install

**New (frontend):**
- `frontend/src/types/collection.ts` (+ barrel)
- `frontend/src/features/scripts/collection/useCollection.ts`
- `frontend/src/features/scripts/collection/DeviceFlowModal.tsx`
- `frontend/src/features/scripts/collection/GitHubLoginPanel.tsx`
- `frontend/src/features/scripts/collection/CollectionRow.tsx`
- `frontend/src/features/scripts/collection/CollectionTab.tsx`
- `frontend/tests/features/scripts/collection/*`

**Modified:**
- `backend/internal/handler/scripts.go` — extract `writeHookScript`; `installOne` wraps it
- `backend/internal/server/router.go` — register 7 routes + construct `github.Service`
- `frontend/src/features/scripts/ScriptsPage.tsx` — My Collection tab + add-to-collection actions
- `CLAUDE.md` — document the optional GitHub integration

---

## Task 1: Extract `writeHookScript` (Phase-1 refactor)

**Files:**
- Modify: `backend/internal/handler/scripts.go`

- [ ] **Step 1: Add the shared helper + rewrite `installOne` to use it**

In `backend/internal/handler/scripts.go`, add `writeHookScript` directly after the `hookTarget` function:

```go
// writeHookScript writes body to <argusDir>/hooks/<filename> atomically.
// O_EXCL makes the create atomic (never overwrites → os.ErrExist if present);
// the filename must be a flat basename (defense-in-depth against traversal).
func writeHookScript(argusDir, filename string, body []byte) error {
	target, err := hookTarget(argusDir, filename)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(hooksDir(argusDir), 0o755); err != nil {
		return err
	}
	f, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o755)
	if err != nil {
		return err // os.ErrExist when the file already exists
	}
	_, writeErr := f.Write(body)
	closeErr := f.Close()
	if writeErr != nil {
		return writeErr
	}
	return closeErr
}
```

Then replace the body of `installOne` so it delegates the write:

```go
// installOne writes a package's embedded bytes to ~/.argus/hooks/<filename>.
// Never overwrites: returns os.ErrExist when the file is already present.
func installOne(ctx context.Context, src scriptcatalog.ScriptSource, argusDir string, p domain.ScriptPackage) error {
	body, err := src.ReadScript(ctx, p.ID)
	if err != nil {
		return err
	}
	return writeHookScript(argusDir, p.Filename, body)
}
```

- [ ] **Step 2: Verify Phase-1 tests still pass + build**

Run: `cd backend && go build ./... && go test ./internal/handler/ -run TestScripts`
Expected: build clean; all six `TestScripts*` tests still PASS (the refactor is behavior-preserving).

- [ ] **Step 3: Commit**

```bash
git add backend/internal/handler/scripts.go
git commit -m "refactor(scripts): extract writeHookScript shared by install paths"
```

---

## Task 2: Domain types

**Files:**
- Create: `backend/internal/domain/collection.go`

- [ ] **Step 1: Write the types**

Create `backend/internal/domain/collection.go`:

```go
package domain

// CollectionScript is one script in the user's GitHub-backed collection,
// plus its local install state.
type CollectionScript struct {
	ID        string `json:"id"`       // stable key (filename without extension)
	Filename  string `json:"filename"`
	Title     string `json:"title"`
	Purpose   string `json:"purpose,omitempty"`
	Event     string `json:"event,omitempty"`
	Matcher   string `json:"matcher,omitempty"`
	Runtime   string `json:"runtime,omitempty"`
	Origin    string `json:"origin"` // "bundled" | "local"
	Body      string `json:"body"`
	Installed bool   `json:"installed"`
}

// Collection is the user's full collection.
type Collection struct {
	Scripts []CollectionScript `json:"scripts"`
}

// GitHubAuthStatus is what the SPA learns about the session (never the token).
type GitHubAuthStatus struct {
	Authenticated bool   `json:"authenticated"`
	Login         string `json:"login,omitempty"`
}

// DeviceCodeResponse drives the SPA device-flow modal.
type DeviceCodeResponse struct {
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}
```

- [ ] **Step 2: Build**

Run: `cd backend && go build ./...`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add backend/internal/domain/collection.go
git commit -m "feat(collection): add domain types"
```

---

## Task 3: Token store

**Files:**
- Create: `backend/internal/github/token_store.go`
- Test: `backend/internal/github/token_store_test.go`

- [ ] **Step 1: Write the token store**

Create `backend/internal/github/token_store.go`:

```go
package github

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

// TokenStore persists the GitHub access token to ~/.argus/github-token.json (0600).
type TokenStore struct {
	path string
}

func NewTokenStore(argusDir string) *TokenStore {
	return &TokenStore{path: filepath.Join(argusDir, "github-token.json")}
}

type storedToken struct {
	AccessToken string `json:"access_token"`
	Login       string `json:"login,omitempty"`
}

func (s *TokenStore) Save(token, login string) error {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	b, err := json.Marshal(storedToken{AccessToken: token, Login: login})
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, b, 0o600)
}

// Load returns the token + cached login. ok is false if no usable token exists.
func (s *TokenStore) Load() (token, login string, ok bool) {
	b, err := os.ReadFile(s.path)
	if err != nil {
		return "", "", false
	}
	var t storedToken
	if err := json.Unmarshal(b, &t); err != nil || t.AccessToken == "" {
		return "", "", false
	}
	return t.AccessToken, t.Login, true
}

func (s *TokenStore) Delete() error {
	if err := os.Remove(s.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}
```

- [ ] **Step 2: Write the failing test**

Create `backend/internal/github/token_store_test.go`:

```go
package github

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTokenStoreRoundTripAndMode(t *testing.T) {
	dir := t.TempDir()
	s := NewTokenStore(dir)

	if _, _, ok := s.Load(); ok {
		t.Fatal("Load on empty store returned ok=true")
	}

	if err := s.Save("tok123", "ruy"); err != nil {
		t.Fatalf("Save: %v", err)
	}
	tok, login, ok := s.Load()
	if !ok || tok != "tok123" || login != "ruy" {
		t.Fatalf("Load = %q %q %v, want tok123 ruy true", tok, login, ok)
	}

	info, err := os.Stat(filepath.Join(dir, "github-token.json"))
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("perm = %v, want 0600", info.Mode().Perm())
	}

	if err := s.Delete(); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, _, ok := s.Load(); ok {
		t.Fatal("Load after Delete returned ok=true")
	}
	if err := s.Delete(); err != nil {
		t.Fatalf("Delete (idempotent): %v", err)
	}
}
```

- [ ] **Step 3: Run the test**

Run: `cd backend && go test ./internal/github/ -run TestTokenStore`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/github/token_store.go backend/internal/github/token_store_test.go
git commit -m "feat(github): add token store (0600)"
```

---

## Task 4: Device-flow client

**Files:**
- Create: `backend/internal/github/device_flow.go`
- Test: `backend/internal/github/device_flow_test.go`

- [ ] **Step 1: Write the device-flow client**

Create `backend/internal/github/device_flow.go`:

```go
package github

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// DeviceFlow runs GitHub's OAuth device flow (no client secret).
type DeviceFlow struct {
	clientID   string
	httpClient *http.Client
	baseURL    string // https://github.com; overridden in tests
}

func NewDeviceFlow(clientID string, httpClient *http.Client) *DeviceFlow {
	return &DeviceFlow{clientID: clientID, httpClient: httpClient, baseURL: "https://github.com"}
}

// DeviceCode is the response from Start.
type DeviceCode struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	ExpiresIn       int    `json:"expires_in"`
	Interval        int    `json:"interval"`
}

func (d *DeviceFlow) post(ctx context.Context, path string, form url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.baseURL+path, strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := d.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("github %s: status %d", path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// Start requests a device + user code.
func (d *DeviceFlow) Start(ctx context.Context) (DeviceCode, error) {
	var dc DeviceCode
	form := url.Values{"client_id": {d.clientID}, "scope": {"gist"}}
	if err := d.post(ctx, "/login/device/code", form, &dc); err != nil {
		return DeviceCode{}, err
	}
	if dc.Interval == 0 {
		dc.Interval = 5
	}
	return dc, nil
}

// Poll exchanges the device code for a token. Returns (token, pending, error):
// pending=true means the user has not authorized yet (keep polling).
func (d *DeviceFlow) Poll(ctx context.Context, deviceCode string) (string, bool, error) {
	var body struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	form := url.Values{
		"client_id":   {d.clientID},
		"device_code": {deviceCode},
		"grant_type":  {"urn:ietf:params:oauth:grant-type:device_code"},
	}
	if err := d.post(ctx, "/login/oauth/access_token", form, &body); err != nil {
		return "", false, err
	}
	if body.AccessToken != "" {
		return body.AccessToken, false, nil
	}
	switch body.Error {
	case "authorization_pending", "slow_down":
		return "", true, nil
	default:
		return "", false, fmt.Errorf("device flow: %s", body.Error)
	}
}
```

- [ ] **Step 2: Write the failing test**

Create `backend/internal/github/device_flow_test.go`:

```go
package github

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDeviceFlowStartAndPoll(t *testing.T) {
	poll := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/login/device/code":
			_, _ = w.Write([]byte(`{"device_code":"dev","user_code":"WDJB-MJHT","verification_uri":"https://github.com/login/device","expires_in":900,"interval":5}`))
		case "/login/oauth/access_token":
			poll++
			if poll == 1 {
				_, _ = w.Write([]byte(`{"error":"authorization_pending"}`))
			} else {
				_, _ = w.Write([]byte(`{"access_token":"gho_abc"}`))
			}
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	d := NewDeviceFlow("client123", srv.Client())
	d.baseURL = srv.URL

	dc, err := d.Start(context.Background())
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	if dc.UserCode != "WDJB-MJHT" || dc.DeviceCode != "dev" {
		t.Fatalf("unexpected device code %+v", dc)
	}

	tok, pending, err := d.Poll(context.Background(), dc.DeviceCode)
	if err != nil || !pending || tok != "" {
		t.Fatalf("first Poll = %q %v %v, want pending", tok, pending, err)
	}
	tok, pending, err = d.Poll(context.Background(), dc.DeviceCode)
	if err != nil || pending || tok != "gho_abc" {
		t.Fatalf("second Poll = %q %v %v, want token", tok, pending, err)
	}
}

func TestDeviceFlowPollError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"error":"expired_token"}`))
	}))
	defer srv.Close()
	d := NewDeviceFlow("c", srv.Client())
	d.baseURL = srv.URL
	if _, pending, err := d.Poll(context.Background(), "dev"); err == nil || pending {
		t.Fatalf("expected hard error, got pending=%v err=%v", pending, err)
	}
}
```

- [ ] **Step 3: Run the test**

Run: `cd backend && go test ./internal/github/ -run TestDeviceFlow`
Expected: PASS (both).

- [ ] **Step 4: Commit**

```bash
git add backend/internal/github/device_flow.go backend/internal/github/device_flow_test.go
git commit -m "feat(github): add OAuth device-flow client"
```

---

## Task 5: Gist client

**Files:**
- Create: `backend/internal/github/gist_client.go`
- Test: `backend/internal/github/gist_client_test.go`

- [ ] **Step 1: Write the gist client**

Create `backend/internal/github/gist_client.go`:

```go
package github

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"argus/internal/domain"
)

const collectionMarker = "[argus-collection]"
const manifestFile = "manifest.json"

// GistClient talks to the GitHub Gist API on behalf of one authenticated user.
type GistClient struct {
	token      string
	httpClient *http.Client
	baseURL    string // https://api.github.com; overridden in tests
}

func NewGistClient(token string, httpClient *http.Client) *GistClient {
	return &GistClient{token: token, httpClient: httpClient, baseURL: "https://api.github.com"}
}

func (g *GistClient) do(ctx context.Context, method, path string, payload any) (*http.Response, error) {
	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, g.baseURL+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+g.token)
	req.Header.Set("Accept", "application/vnd.github+json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return g.httpClient.Do(req)
}

// Login returns the authenticated user's login.
func (g *GistClient) Login(ctx context.Context) (string, error) {
	resp, err := g.do(ctx, http.MethodGet, "/user", nil)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("github /user: status %d", resp.StatusCode)
	}
	var u struct {
		Login string `json:"login"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return "", err
	}
	return u.Login, nil
}

type gistFileIn struct {
	Content string `json:"content"`
}
type gistFileOut struct {
	Filename string `json:"filename"`
	Content  string `json:"content"`
}
type gistIn struct {
	Description string                 `json:"description"`
	Public     bool                    `json:"public"`
	Files      map[string]*gistFileIn  `json:"files"`
}
type gistOut struct {
	ID          string                 `json:"id"`
	Description string                 `json:"description"`
	Files       map[string]gistFileOut `json:"files"`
}

// manifestEntry is one script's metadata stored in manifest.json.
type manifestEntry struct {
	ID       string `json:"id"`
	Filename string `json:"filename"`
	Title    string `json:"title"`
	Purpose  string `json:"purpose,omitempty"`
	Event    string `json:"event,omitempty"`
	Matcher  string `json:"matcher,omitempty"`
	Runtime  string `json:"runtime,omitempty"`
	Origin   string `json:"origin"`
}
type manifest struct {
	Version int             `json:"version"`
	Scripts []manifestEntry `json:"scripts"`
}

// FindOrCreateCollection returns the id of the user's collection gist, creating it if absent.
func (g *GistClient) FindOrCreateCollection(ctx context.Context) (string, error) {
	resp, err := g.do(ctx, http.MethodGet, "/gists?per_page=100", nil)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("github list gists: status %d", resp.StatusCode)
	}
	var gists []gistOut
	if err := json.NewDecoder(resp.Body).Decode(&gists); err != nil {
		return "", err
	}
	for _, gi := range gists {
		if len(gi.Description) >= len(collectionMarker) && gi.Description[:len(collectionMarker)] == collectionMarker {
			return gi.ID, nil
		}
	}
	// Create it.
	emptyManifest, _ := json.Marshal(manifest{Version: 1, Scripts: []manifestEntry{}})
	created, err := g.patchOrCreate(ctx, "", gistIn{
		Description: collectionMarker + " argus hook script collection",
		Public:      false,
		Files:       map[string]*gistFileIn{manifestFile: {Content: string(emptyManifest)}},
	})
	if err != nil {
		return "", err
	}
	return created.ID, nil
}

func (g *GistClient) patchOrCreate(ctx context.Context, gistID string, in gistIn) (gistOut, error) {
	method, path := http.MethodPost, "/gists"
	if gistID != "" {
		method, path = http.MethodPatch, "/gists/"+gistID
	}
	resp, err := g.do(ctx, method, path, in)
	if err != nil {
		return gistOut{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return gistOut{}, fmt.Errorf("github write gist: status %d", resp.StatusCode)
	}
	var out gistOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return gistOut{}, err
	}
	return out, nil
}

func (g *GistClient) readRaw(ctx context.Context, gistID string) (gistOut, manifest, error) {
	resp, err := g.do(ctx, http.MethodGet, "/gists/"+gistID, nil)
	if err != nil {
		return gistOut{}, manifest{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return gistOut{}, manifest{}, fmt.Errorf("github read gist: status %d", resp.StatusCode)
	}
	var out gistOut
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return gistOut{}, manifest{}, err
	}
	var m manifest
	if mf, ok := out.Files[manifestFile]; ok && mf.Content != "" {
		_ = json.Unmarshal([]byte(mf.Content), &m)
	}
	return out, m, nil
}

// ReadCollection returns the collection scripts (metadata from manifest, body from files).
func (g *GistClient) ReadCollection(ctx context.Context, gistID string) (domain.Collection, error) {
	out, m, err := g.readRaw(ctx, gistID)
	if err != nil {
		return domain.Collection{}, err
	}
	scripts := make([]domain.CollectionScript, 0, len(m.Scripts))
	for _, e := range m.Scripts {
		f, ok := out.Files[e.Filename]
		if !ok {
			continue // manifest references a file the user deleted; skip
		}
		scripts = append(scripts, domain.CollectionScript{
			ID: e.ID, Filename: e.Filename, Title: e.Title, Purpose: e.Purpose,
			Event: e.Event, Matcher: e.Matcher, Runtime: e.Runtime, Origin: e.Origin,
			Body: f.Content,
		})
	}
	return domain.Collection{Scripts: scripts}, nil
}

// AddScript writes a script file + updates the manifest. Returns os.ErrExist-like
// error if the id already exists (caller maps to 409).
func (g *GistClient) AddScript(ctx context.Context, gistID string, s domain.CollectionScript) error {
	_, m, err := g.readRaw(ctx, gistID)
	if err != nil {
		return err
	}
	for _, e := range m.Scripts {
		if e.ID == s.ID {
			return ErrAlreadyInCollection
		}
	}
	m.Scripts = append(m.Scripts, manifestEntry{
		ID: s.ID, Filename: s.Filename, Title: s.Title, Purpose: s.Purpose,
		Event: s.Event, Matcher: s.Matcher, Runtime: s.Runtime, Origin: s.Origin,
	})
	mb, _ := json.Marshal(m)
	_, err = g.patchOrCreate(ctx, gistID, gistIn{Files: map[string]*gistFileIn{
		s.Filename:   {Content: s.Body},
		manifestFile: {Content: string(mb)},
	}})
	return err
}

// RemoveScript deletes a script file + manifest entry by id.
func (g *GistClient) RemoveScript(ctx context.Context, gistID, id string) error {
	_, m, err := g.readRaw(ctx, gistID)
	if err != nil {
		return err
	}
	var filename string
	kept := m.Scripts[:0]
	for _, e := range m.Scripts {
		if e.ID == id {
			filename = e.Filename
			continue
		}
		kept = append(kept, e)
	}
	if filename == "" {
		return ErrNotInCollection
	}
	m.Scripts = kept
	mb, _ := json.Marshal(m)
	// A nil file entry in the PATCH payload deletes that file.
	files := map[string]*gistFileIn{manifestFile: {Content: string(mb)}}
	files[filename] = nil
	_, err = g.patchOrCreate(ctx, gistID, gistIn{Files: files})
	return err
}
```

Add the sentinel errors to a new line near the top of the file (after the imports, before `GistClient`):

```go
var (
	ErrAlreadyInCollection = fmt.Errorf("script already in collection")
	ErrNotInCollection     = fmt.Errorf("script not in collection")
)
```

> Note: a `nil` value in the gist `files` map serializes to JSON `null`, which the GitHub API treats as "delete this file" — that's why `gistIn.Files` uses `*gistFileIn`.

- [ ] **Step 2: Write the failing test**

Create `backend/internal/github/gist_client_test.go`:

```go
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
			var in gistIn
			_ = json.NewDecoder(r.Body).Decode(&in)
			for n, f := range in.Files {
				if f == nil {
					delete(state.files, n)
				} else {
					state.files[n] = f.Content
				}
			}
			write(render())
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
}

func newClient(t *testing.T, srv *httptest.Server) *GistClient {
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
	// Second call finds the existing one.
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
```

- [ ] **Step 3: Run the test**

Run: `cd backend && go test ./internal/github/ -run TestGist`
Expected: PASS (both).

- [ ] **Step 4: Commit**

```bash
git add backend/internal/github/gist_client.go backend/internal/github/gist_client_test.go
git commit -m "feat(github): add gist collection client"
```

---

## Task 6: Service orchestrator

**Files:**
- Create: `backend/internal/github/service.go`
- Test: `backend/internal/github/service_test.go`

- [ ] **Step 1: Write the service**

Create `backend/internal/github/service.go`:

```go
package github

import (
	"context"
	"net/http"
	"sync"

	"argus/internal/domain"
)

// Service orchestrates auth + collection access. It holds the transient
// device-flow state and the cached gist id. Safe for concurrent use.
type Service struct {
	clientID   string
	httpClient *http.Client
	tokens     *TokenStore

	mu         sync.Mutex
	deviceCode string // pending device flow, "" when none
	gistID     string // cached after first resolve
}

func NewService(clientID, argusDir string) *Service {
	return &Service{
		clientID:   clientID,
		httpClient: &http.Client{},
		tokens:     NewTokenStore(argusDir),
	}
}

func (s *Service) deviceFlow() *DeviceFlow { return NewDeviceFlow(s.clientID, s.httpClient) }

func (s *Service) gist() (*GistClient, bool) {
	tok, _, ok := s.tokens.Load()
	if !ok {
		return nil, false
	}
	return NewGistClient(tok, s.httpClient), true
}

// StartDevice begins a device flow and stores the pending device code.
func (s *Service) StartDevice(ctx context.Context) (domain.DeviceCodeResponse, error) {
	dc, err := s.deviceFlow().Start(ctx)
	if err != nil {
		return domain.DeviceCodeResponse{}, err
	}
	s.mu.Lock()
	s.deviceCode = dc.DeviceCode
	s.mu.Unlock()
	return domain.DeviceCodeResponse{
		UserCode: dc.UserCode, VerificationURI: dc.VerificationURI,
		ExpiresIn: dc.ExpiresIn, Interval: dc.Interval,
	}, nil
}

// Status advances a pending device flow one step and reports auth state.
func (s *Service) Status(ctx context.Context) domain.GitHubAuthStatus {
	if _, login, ok := s.tokens.Load(); ok {
		return domain.GitHubAuthStatus{Authenticated: true, Login: login}
	}
	s.mu.Lock()
	dc := s.deviceCode
	s.mu.Unlock()
	if dc == "" {
		return domain.GitHubAuthStatus{}
	}
	tok, pending, err := s.deviceFlow().Poll(ctx, dc)
	if err != nil || pending || tok == "" {
		if err != nil {
			s.mu.Lock()
			s.deviceCode = ""
			s.mu.Unlock()
		}
		return domain.GitHubAuthStatus{}
	}
	login, _ := NewGistClient(tok, s.httpClient).Login(ctx)
	_ = s.tokens.Save(tok, login)
	s.mu.Lock()
	s.deviceCode = ""
	s.mu.Unlock()
	return domain.GitHubAuthStatus{Authenticated: true, Login: login}
}

// Logout clears the token + cached state.
func (s *Service) Logout() error {
	s.mu.Lock()
	s.gistID = ""
	s.deviceCode = ""
	s.mu.Unlock()
	return s.tokens.Delete()
}

func (s *Service) collectionGist(ctx context.Context, gc *GistClient) (string, error) {
	s.mu.Lock()
	id := s.gistID
	s.mu.Unlock()
	if id != "" {
		return id, nil
	}
	id, err := gc.FindOrCreateCollection(ctx)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	s.gistID = id
	s.mu.Unlock()
	return id, nil
}

// ErrNotAuthenticated is returned when no token is present.
var ErrNotAuthenticated = errString("not authenticated")

type errString string

func (e errString) Error() string { return string(e) }

// Collection returns the user's collection (caller fills Installed).
func (s *Service) Collection(ctx context.Context) (domain.Collection, error) {
	gc, ok := s.gist()
	if !ok {
		return domain.Collection{}, ErrNotAuthenticated
	}
	id, err := s.collectionGist(ctx, gc)
	if err != nil {
		return domain.Collection{}, err
	}
	return gc.ReadCollection(ctx, id)
}

// AddScript adds a script to the collection gist.
func (s *Service) AddScript(ctx context.Context, script domain.CollectionScript) error {
	gc, ok := s.gist()
	if !ok {
		return ErrNotAuthenticated
	}
	id, err := s.collectionGist(ctx, gc)
	if err != nil {
		return err
	}
	return gc.AddScript(ctx, id, script)
}

// RemoveScript removes a script from the collection gist.
func (s *Service) RemoveScript(ctx context.Context, scriptID string) error {
	gc, ok := s.gist()
	if !ok {
		return ErrNotAuthenticated
	}
	id, err := s.collectionGist(ctx, gc)
	if err != nil {
		return err
	}
	return gc.RemoveScript(ctx, id, scriptID)
}
```

- [ ] **Step 2: Write the failing test**

Create `backend/internal/github/service_test.go`:

```go
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

func TestServiceStatusUnauthenticated(t *testing.T) {
	s := NewService("c", t.TempDir())
	if st := s.Status(context.Background()); st.Authenticated {
		t.Fatal("unauthenticated Status returned Authenticated=true")
	}
	if _, err := s.Collection(context.Background()); err != ErrNotAuthenticated {
		t.Fatalf("Collection err = %v, want ErrNotAuthenticated", err)
	}
}

func TestServiceDeviceFlowToAuthenticated(t *testing.T) {
	state := &fakeGist{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.URL.Path == "/login/device/code":
			_, _ = w.Write([]byte(`{"device_code":"dev","user_code":"AAAA-BBBB","verification_uri":"u","interval":5}`))
		case r.URL.Path == "/login/oauth/access_token":
			_, _ = w.Write([]byte(`{"access_token":"gho_x"}`))
		case r.URL.Path == "/user":
			_, _ = w.Write([]byte(`{"login":"ruy"}`))
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{"id": "g", "files": map[string]any{}})
			_ = state
			_ = strings.TrimSpace("")
		}
	}))
	defer srv.Close()

	s := NewService("c", t.TempDir())
	s.httpClient = srv.Client()
	// Point both github.com and api.github.com at the fake server.
	s.deviceCodeBase = srv.URL
	s.apiBase = srv.URL

	if _, err := s.StartDevice(context.Background()); err != nil {
		t.Fatalf("StartDevice: %v", err)
	}
	st := s.Status(context.Background())
	if !st.Authenticated || st.Login != "ruy" {
		t.Fatalf("Status after auth = %+v, want authenticated ruy", st)
	}
}

var _ = domain.GitHubAuthStatus{}
```

> The test references `s.deviceCodeBase` and `s.apiBase`. Add those override fields in Step 3 so the service's `DeviceFlow`/`GistClient` can be pointed at a fake server in tests (production defaults to the real GitHub URLs).

- [ ] **Step 3: Add test-only base-URL overrides to the service**

In `backend/internal/github/service.go`, add two fields to `Service` (default empty = real URLs) and use them in `deviceFlow()`/`gist()`:

```go
// add to the Service struct:
	deviceCodeBase string // test override for github.com
	apiBase        string // test override for api.github.com
```

Update the constructors used inside the service:

```go
func (s *Service) deviceFlow() *DeviceFlow {
	d := NewDeviceFlow(s.clientID, s.httpClient)
	if s.deviceCodeBase != "" {
		d.baseURL = s.deviceCodeBase
	}
	return d
}

func (s *Service) gist() (*GistClient, bool) {
	tok, _, ok := s.tokens.Load()
	if !ok {
		return nil, false
	}
	c := NewGistClient(tok, s.httpClient)
	if s.apiBase != "" {
		c.baseURL = s.apiBase
	}
	return c, true
}
```

Also update the inline `NewGistClient(tok, s.httpClient)` call inside `Status` (used for `Login`) to honor `apiBase`:

```go
	loginClient := NewGistClient(tok, s.httpClient)
	if s.apiBase != "" {
		loginClient.baseURL = s.apiBase
	}
	login, _ := loginClient.Login(ctx)
```

- [ ] **Step 4: Run the test**

Run: `cd backend && go test ./internal/github/...`
Expected: all `github` package tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/github/service.go backend/internal/github/service_test.go
git commit -m "feat(github): add auth+collection service orchestrator"
```

---

## Task 7: Auth handlers

**Files:**
- Create: `backend/internal/handler/github_auth.go`
- Test: `backend/internal/handler/github_auth_test.go`

- [ ] **Step 1: Write the handlers**

Create `backend/internal/handler/github_auth.go`:

```go
package handler

import (
	"encoding/json"
	"log"
	"net/http"

	"argus/internal/github"
)

// GitHubDevice starts a device flow.
func GitHubDevice(svc *github.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		dc, err := svc.StartDevice(r.Context())
		if err != nil {
			log.Printf("[github] device err=%v", err)
			http.Error(w, "github unreachable", http.StatusBadGateway)
			return
		}
		writeJSON(w, dc)
	})
}

// GitHubStatus reports auth state (and advances a pending device flow).
func GitHubStatus(svc *github.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, svc.Status(r.Context()))
	})
}

// GitHubLogout deletes the stored token.
func GitHubLogout(svc *github.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if err := svc.Logout(); err != nil {
			http.Error(w, "logout failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("[github] encode %T: %v", v, err)
	}
}
```

> If a `writeJSON` helper already exists in the `handler` package, drop this one and reuse the existing helper. Check with `grep -rn "func writeJSON" backend/internal/handler/` before adding.

- [ ] **Step 2: Write the failing test**

Create `backend/internal/handler/github_auth_test.go`:

```go
package handler_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"argus/internal/github"
	"argus/internal/handler"
)

func TestGitHubStatusUnauthenticated(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	rec := httptest.NewRecorder()
	handler.GitHubStatus(svc).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/github/status", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Body.String(); got == "" || !contains(got, `"authenticated":false`) {
		t.Fatalf("body = %q, want authenticated:false", got)
	}
}

func TestGitHubLogoutRejectsGET(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	rec := httptest.NewRecorder()
	handler.GitHubLogout(svc).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/github/logout", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func contains(s, sub string) bool { return len(s) >= len(sub) && (indexOf(s, sub) >= 0) }
func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
```

- [ ] **Step 3: Run the test**

Run: `cd backend && go test ./internal/handler/ -run TestGitHub`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handler/github_auth.go backend/internal/handler/github_auth_test.go
git commit -m "feat(github): add device/status/logout handlers"
```

---

## Task 8: Collection handlers

**Files:**
- Create: `backend/internal/handler/collection.go`
- Test: `backend/internal/handler/collection_test.go`

- [ ] **Step 1: Write the handlers**

Create `backend/internal/handler/collection.go`:

```go
package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"argus/internal/domain"
	"argus/internal/github"
	"argus/internal/scriptcatalog"
)

// markInstalled fills Installed for each collection script by stat'ing ~/.argus/hooks/.
func markInstalled(col *domain.Collection, argusDir string) {
	for i := range col.Scripts {
		_, err := os.Stat(filepath.Join(hooksDir(argusDir), col.Scripts[i].Filename))
		col.Scripts[i].Installed = err == nil
	}
}

// Collection lists the user's collection with install state.
func Collection(svc *github.Service, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		col, err := svc.Collection(r.Context())
		if errors.Is(err, github.ErrNotAuthenticated) {
			http.Error(w, "not authenticated", http.StatusUnauthorized)
			return
		}
		if err != nil {
			log.Printf("[collection] list err=%v", err)
			http.Error(w, "github error", http.StatusBadGateway)
			return
		}
		markInstalled(&col, argusDir)
		writeJSON(w, col)
	})
}

type addCollectionRequest struct {
	Origin   string `json:"origin"`   // "bundled" | "local"
	ID       string `json:"id"`       // for bundled
	Filename string `json:"filename"` // for local
}

// CollectionAdd adds a bundled or local script to the collection.
func CollectionAdd(svc *github.Service, src scriptcatalog.ScriptSource, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req addCollectionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		script, err := buildCollectionScript(r, src, argusDir, req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		switch err := svc.AddScript(r.Context(), script); {
		case errors.Is(err, github.ErrNotAuthenticated):
			http.Error(w, "not authenticated", http.StatusUnauthorized)
		case errors.Is(err, github.ErrAlreadyInCollection):
			http.Error(w, "already in collection", http.StatusConflict)
		case err != nil:
			log.Printf("[collection] add err=%v", err)
			http.Error(w, "github error", http.StatusBadGateway)
		default:
			writeJSON(w, script)
		}
	})
}

func buildCollectionScript(r *http.Request, src scriptcatalog.ScriptSource, argusDir string, req addCollectionRequest) (domain.CollectionScript, error) {
	switch req.Origin {
	case "bundled":
		cat, err := src.Catalog(r.Context())
		if err != nil {
			return domain.CollectionScript{}, errors.New("catalog error")
		}
		p, ok := findPackage(cat, req.ID)
		if !ok {
			return domain.CollectionScript{}, errors.New("unknown script")
		}
		body, err := src.ReadScript(r.Context(), p.ID)
		if err != nil {
			return domain.CollectionScript{}, errors.New("read script error")
		}
		return domain.CollectionScript{
			ID: p.ID, Filename: p.Filename, Title: p.Title, Purpose: p.Purpose,
			Event: p.Event, Matcher: p.Matcher, Runtime: p.Runtime, Origin: "bundled", Body: string(body),
		}, nil
	case "local":
		target, err := hookTarget(argusDir, req.Filename)
		if err != nil {
			return domain.CollectionScript{}, errors.New("invalid filename")
		}
		body, err := os.ReadFile(target)
		if err != nil {
			return domain.CollectionScript{}, errors.New("local script not found")
		}
		id := req.Filename
		if ext := filepath.Ext(id); ext != "" {
			id = id[:len(id)-len(ext)]
		}
		return domain.CollectionScript{
			ID: id, Filename: req.Filename, Title: req.Filename, Origin: "local", Body: string(body),
		}, nil
	default:
		return domain.CollectionScript{}, errors.New("unknown origin")
	}
}

// CollectionRemove removes a script from the collection.
func CollectionRemove(svc *github.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "id is required", http.StatusBadRequest)
			return
		}
		switch err := svc.RemoveScript(r.Context(), id); {
		case errors.Is(err, github.ErrNotAuthenticated):
			http.Error(w, "not authenticated", http.StatusUnauthorized)
		case errors.Is(err, github.ErrNotInCollection):
			http.Error(w, "not in collection", http.StatusNotFound)
		case err != nil:
			log.Printf("[collection] remove err=%v", err)
			http.Error(w, "github error", http.StatusBadGateway)
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	})
}

// CollectionInstall writes a collection script into ~/.argus/hooks/.
func CollectionInstall(svc *github.Service, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req scriptIDRequest // reuses {id} from scripts.go
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == "" {
			http.Error(w, "id is required", http.StatusBadRequest)
			return
		}
		col, err := svc.Collection(r.Context())
		if errors.Is(err, github.ErrNotAuthenticated) {
			http.Error(w, "not authenticated", http.StatusUnauthorized)
			return
		}
		if err != nil {
			http.Error(w, "github error", http.StatusBadGateway)
			return
		}
		var found *domain.CollectionScript
		for i := range col.Scripts {
			if col.Scripts[i].ID == req.ID {
				found = &col.Scripts[i]
				break
			}
		}
		if found == nil {
			http.Error(w, "unknown script", http.StatusBadRequest)
			return
		}
		switch err := writeHookScript(argusDir, found.Filename, []byte(found.Body)); {
		case errors.Is(err, os.ErrExist):
			http.Error(w, "already installed", http.StatusConflict)
		case err != nil:
			log.Printf("[collection] install id=%s err=%v", req.ID, err)
			http.Error(w, "install failed", http.StatusInternalServerError)
		default:
			found.Installed = true
			writeJSON(w, found)
		}
	})
}
```

- [ ] **Step 2: Write the failing test**

Create `backend/internal/handler/collection_test.go`:

```go
package handler_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"argus/internal/github"
	"argus/internal/handler"
	"argus/internal/scriptcatalog"
)

func TestCollectionRequiresAuth(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	handler.Collection(svc, dir).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/collection", nil))
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestCollectionAddRequiresAuth(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/collection", strings.NewReader(`{"origin":"bundled","id":"stop"}`))
	handler.CollectionAdd(svc, scriptcatalog.NewBundledSource(), dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestCollectionAddUnknownOrigin(t *testing.T) {
	svc := github.NewService("c", t.TempDir())
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/collection", strings.NewReader(`{"origin":"bogus"}`))
	handler.CollectionAdd(svc, scriptcatalog.NewBundledSource(), dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}
```

> Full authenticated-path handler coverage (add→install→remove with a real token) is exercised by the `github` package's service tests against the fake server; the handler tests focus on the HTTP contract (auth gate, method guards, validation). This avoids re-mocking the whole GitHub API at the handler layer.

- [ ] **Step 3: Run the test**

Run: `cd backend && go test ./internal/handler/ -run TestCollection`
Expected: PASS (three).

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handler/collection.go backend/internal/handler/collection_test.go
git commit -m "feat(collection): add list/add/remove/install handlers"
```

---

## Task 9: Router wiring + client id + backend gate

**Files:**
- Modify: `backend/internal/server/router.go`

- [ ] **Step 1: Add imports + construct the service + register routes**

In `backend/internal/server/router.go`, add to the import block:

```go
	"os"

	"argus/internal/github"
```

Immediately before `mux.Handle("GET /", ui.Handler())`, add:

```go
	githubClientID := os.Getenv("ARGUS_GITHUB_CLIENT_ID")
	if githubClientID == "" {
		githubClientID = defaultGitHubClientID
	}
	ghSvc := github.NewService(githubClientID, opts.ArgusDir)
	mux.Handle("POST /api/github/device", handler.GitHubDevice(ghSvc))
	mux.Handle("GET /api/github/status", handler.GitHubStatus(ghSvc))
	mux.Handle("POST /api/github/logout", handler.GitHubLogout(ghSvc))
	mux.Handle("GET /api/collection", handler.Collection(ghSvc, opts.ArgusDir))
	mux.Handle("POST /api/collection", handler.CollectionAdd(ghSvc, scriptSrc, opts.ArgusDir))
	mux.Handle("DELETE /api/collection", handler.CollectionRemove(ghSvc))
	mux.Handle("POST /api/collection/install", handler.CollectionInstall(ghSvc, opts.ArgusDir))
```

(`scriptSrc` is the `scriptcatalog.NewBundledSource()` already constructed in Phase 1 just above the scripts routes — reuse it.)

At the bottom of the file (package scope), add the constant with the OAuth App client id from the manual prerequisite:

```go
// defaultGitHubClientID is argus's public OAuth App client id (device flow needs
// no secret). Override at runtime with ARGUS_GITHUB_CLIENT_ID.
const defaultGitHubClientID = "REPLACE_WITH_OAUTH_APP_CLIENT_ID"
```

> Replace the placeholder with the real client id from the registered OAuth App. It is public by design (device flow), so committing it is fine.

- [ ] **Step 2: Run the full backend gate**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`

If `golangci-lint` reports it's not installed or a v1/v2 config mismatch, install v2: `GOBIN=/tmp/glci go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@v2.1.6` and run `/tmp/glci/golangci-lint run ./...`.

Expected: build clean, all tests pass, no lint errors. Fix any `errcheck`/`staticcheck` findings (e.g. unchecked `resp.Body.Close()` — the code uses `defer func(){ _ = resp.Body.Close() }()` to satisfy this).

- [ ] **Step 3: Commit**

```bash
git add backend/internal/server/router.go
git commit -m "feat(github): wire auth + collection endpoints into router"
```

---

## Task 10: Frontend types

**Files:**
- Create: `frontend/src/types/collection.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Write the types**

Create `frontend/src/types/collection.ts`:

```ts
export type CollectionScript = {
  id: string
  filename: string
  title: string
  purpose?: string
  event?: string
  matcher?: string
  runtime?: string
  origin: 'bundled' | 'local'
  body: string
  installed: boolean
}

export type Collection = {
  scripts: CollectionScript[]
}

export type GitHubAuthStatus = {
  authenticated: boolean
  login?: string
}

export type DeviceCodeResponse = {
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}
```

- [ ] **Step 2: Export from the barrel**

Append to `frontend/src/types/index.ts`:

```ts
export type {
  CollectionScript,
  Collection,
  GitHubAuthStatus,
  DeviceCodeResponse,
} from './collection'
```

- [ ] **Step 3: Verify + commit**

Run: `cd frontend && pnpm exec tsc --noEmit`
Expected: no errors.

```bash
git add frontend/src/types/collection.ts frontend/src/types/index.ts
git commit -m "feat(collection): add frontend types"
```

---

## Task 11: useCollection hook

**Files:**
- Create: `frontend/src/features/scripts/collection/useCollection.ts`
- Test: `frontend/tests/features/scripts/collection/useCollection.test.tsx`

- [ ] **Step 1: Write the hook**

Create `frontend/src/features/scripts/collection/useCollection.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Collection, DeviceCodeResponse, GitHubAuthStatus } from '@/types'

type State = {
  status: GitHubAuthStatus | null
  collection: Collection | null
  loading: boolean
  error: string | null
}

export function useCollection() {
  const [state, setState] = useState<State>({
    status: null,
    collection: null,
    loading: true,
    error: null,
  })
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async (): Promise<GitHubAuthStatus> => {
    const resp = await fetch('/api/github/status')
    const status: GitHubAuthStatus = await resp.json()
    return status
  }, [])

  const loadCollection = useCallback(async (status: GitHubAuthStatus) => {
    if (!status.authenticated) {
      setState({ status, collection: null, loading: false, error: null })
      return
    }
    try {
      const resp = await fetch('/api/collection')
      if (!resp.ok) throw new Error(`collection ${resp.status}`)
      const collection: Collection = await resp.json()
      setState({ status, collection, loading: false, error: null })
    } catch (e) {
      setState({ status, collection: null, loading: false, error: (e as Error).message })
    }
  }, [])

  const refresh = useCallback(async () => {
    const status = await fetchStatus()
    await loadCollection(status)
  }, [fetchStatus, loadCollection])

  useEffect(() => {
    void refresh()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [refresh])

  const startLogin = useCallback(async () => {
    const resp = await fetch('/api/github/device', { method: 'POST' })
    if (!resp.ok) throw new Error(`device ${resp.status}`)
    const dc: DeviceCodeResponse = await resp.json()
    setDeviceCode(dc)
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      const status = await fetchStatus()
      if (status.authenticated) {
        if (pollRef.current) clearInterval(pollRef.current)
        setDeviceCode(null)
        await loadCollection(status)
      }
    }, (dc.interval || 5) * 1000)
  }, [fetchStatus, loadCollection])

  const logout = useCallback(async () => {
    await fetch('/api/github/logout', { method: 'POST' })
    await refresh()
  }, [refresh])

  const add = useCallback(
    async (body: { origin: 'bundled' | 'local'; id?: string; filename?: string }) => {
      const resp = await fetch('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!resp.ok) throw new Error(`add ${resp.status}`)
      await refresh()
    },
    [refresh]
  )

  const install = useCallback(
    async (id: string) => {
      const resp = await fetch('/api/collection/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!resp.ok) throw new Error(`install ${resp.status}`)
      await refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: string) => {
      const resp = await fetch(`/api/collection?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error(`remove ${resp.status}`)
      await refresh()
    },
    [refresh]
  )

  return { ...state, deviceCode, startLogin, logout, add, install, remove, refresh }
}
```

- [ ] **Step 2: Write the failing test**

Create `frontend/tests/features/scripts/collection/useCollection.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCollection } from '@/features/scripts/collection/useCollection'

afterEach(() => vi.restoreAllMocks())

describe('useCollection', () => {
  it('shows unauthenticated when status says so', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/github/status')
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ authenticated: false }) })
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ scripts: [] }) })
      })
    )
    const { result } = renderHook(() => useCollection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.status?.authenticated).toBe(false)
    expect(result.current.collection).toBeNull()
  })

  it('loads the collection when authenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/github/status')
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ authenticated: true, login: 'ruy' }),
          })
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ scripts: [{ id: 'g', filename: 'g.js', installed: false }] }),
        })
      })
    )
    const { result } = renderHook(() => useCollection())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.status?.login).toBe('ruy')
    expect(result.current.collection?.scripts[0].id).toBe('g')
  })
})
```

- [ ] **Step 3: Run the test**

Run: `cd frontend && pnpm exec vitest run tests/features/scripts/collection/useCollection.test.tsx`
Expected: PASS (both).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/scripts/collection/useCollection.ts frontend/tests/features/scripts/collection/useCollection.test.tsx
git commit -m "feat(collection): add useCollection hook"
```

---

## Task 12: Device-flow modal + login panel

**Files:**
- Create: `frontend/src/features/scripts/collection/DeviceFlowModal.tsx`
- Create: `frontend/src/features/scripts/collection/GitHubLoginPanel.tsx`
- Test: `frontend/tests/features/scripts/collection/GitHubLoginPanel.test.tsx`

- [ ] **Step 1: Write the device-flow modal**

Create `frontend/src/features/scripts/collection/DeviceFlowModal.tsx`:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { DeviceCodeResponse } from '@/types'

type DeviceFlowModalProps = {
  device: DeviceCodeResponse | null
  onClose: () => void
}

export function DeviceFlowModal({ device, onClose }: DeviceFlowModalProps) {
  if (!device) return null
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border border-white/15 bg-[#141414] shadow-2xl">
        <DialogHeader>
          <DialogTitle>Connect GitHub</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-[#aaa]">
            Open{' '}
            <a
              href={device.verification_uri}
              target="_blank"
              rel="noreferrer"
              className="text-[#863bff] underline"
            >
              {device.verification_uri}
            </a>{' '}
            and enter this code:
          </p>
          <div className="flex items-center justify-between rounded-md border border-white/10 bg-[#0a0a0a] px-4 py-3">
            <span className="font-mono text-lg tracking-[0.3em] text-[#e5e5e5]">
              {device.user_code}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigator.clipboard?.writeText(device.user_code)}
            >
              Copy
            </Button>
          </div>
          <p className="text-xs text-[#777]">Waiting for authorization…</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Write the login panel**

Create `frontend/src/features/scripts/collection/GitHubLoginPanel.tsx`:

```tsx
import { Button } from '@/components/ui/button'

type GitHubLoginPanelProps = {
  onLogin: () => void
  busy: boolean
}

export function GitHubLoginPanel({ onLogin, busy }: GitHubLoginPanelProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-white/[0.06] px-6 py-12 text-center">
      <p className="text-sm text-[#aaa]">
        Log in with GitHub to keep a portable collection of your hook scripts.
      </p>
      <p className="max-w-md text-xs text-[#777]">
        Your scripts are stored in your own private gist (scope: gist). argus stores nothing — the
        token stays on this machine.
      </p>
      <Button size="sm" disabled={busy} onClick={onLogin}>
        Login with GitHub
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Write the failing test**

Create `frontend/tests/features/scripts/collection/GitHubLoginPanel.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { GitHubLoginPanel } from '@/features/scripts/collection/GitHubLoginPanel'
import { DeviceFlowModal } from '@/features/scripts/collection/DeviceFlowModal'

describe('GitHubLoginPanel', () => {
  it('fires onLogin', () => {
    const onLogin = vi.fn()
    render(<GitHubLoginPanel onLogin={onLogin} busy={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Login with GitHub' }))
    expect(onLogin).toHaveBeenCalled()
  })
})

describe('DeviceFlowModal', () => {
  it('renders the user code when a device is present', () => {
    render(
      <DeviceFlowModal
        device={{
          user_code: 'WDJB-MJHT',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        }}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByText('WDJB-MJHT')).toBeInTheDocument()
  })

  it('renders nothing when device is null', () => {
    const { container } = render(<DeviceFlowModal device={null} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 4: Run the test**

Run: `cd frontend && pnpm exec vitest run tests/features/scripts/collection/GitHubLoginPanel.test.tsx`
Expected: PASS (three).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/scripts/collection/DeviceFlowModal.tsx frontend/src/features/scripts/collection/GitHubLoginPanel.tsx frontend/tests/features/scripts/collection/GitHubLoginPanel.test.tsx
git commit -m "feat(collection): add device-flow modal + login panel"
```

---

## Task 13: Collection row + tab, and ScriptsPage integration

**Files:**
- Create: `frontend/src/features/scripts/collection/CollectionRow.tsx`
- Create: `frontend/src/features/scripts/collection/CollectionTab.tsx`
- Modify: `frontend/src/features/scripts/ScriptsPage.tsx`
- Test: `frontend/tests/features/scripts/collection/CollectionTab.test.tsx`

- [ ] **Step 1: Write the collection row**

Create `frontend/src/features/scripts/collection/CollectionRow.tsx`:

```tsx
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CollectionScript } from '@/types'

type CollectionRowProps = {
  script: CollectionScript
  index: number
  onInstall: (id: string) => void
  onRemove: (id: string) => void
  busy: boolean
}

export function CollectionRow({ script, index, onInstall, onRemove, busy }: CollectionRowProps) {
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.06] px-3 py-3 hover:bg-white/[0.02]">
      <span className="w-6 shrink-0 text-right text-[0.72rem] tabular-nums text-[#555]">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[#e5e5e5]">{script.title}</span>
          <span className="truncate font-mono text-[0.7rem] text-[#666]">{script.filename}</span>
        </div>
        {script.purpose ? (
          <p className="mt-0.5 truncate text-[0.72rem] text-[#888]">{script.purpose}</p>
        ) : null}
      </div>
      <div className="hidden shrink-0 items-center gap-1 md:flex">
        <Badge variant="outline">{script.origin}</Badge>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {script.installed ? (
          <Badge variant="secondary">Installed</Badge>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => onInstall(script.id)}>
            Install
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onRemove(script.id)}>
          Remove
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the collection tab**

Create `frontend/src/features/scripts/collection/CollectionTab.tsx`:

```tsx
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { useCollection } from './useCollection'
import { GitHubLoginPanel } from './GitHubLoginPanel'
import { DeviceFlowModal } from './DeviceFlowModal'
import { CollectionRow } from './CollectionRow'

export function CollectionTab() {
  const { status, collection, loading, error, deviceCode, startLogin, logout, install, remove } =
    useCollection()
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )
  }

  if (!status?.authenticated) {
    return (
      <>
        <GitHubLoginPanel onLogin={() => run(startLogin)} busy={busy} />
        <DeviceFlowModal device={deviceCode} onClose={() => undefined} />
      </>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[0.72rem] text-[#888]">
        <span>
          Signed in as <span className="text-[#ccc]">@{status.login}</span>
        </span>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => run(logout)}>
          Logout
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="overflow-hidden rounded-md border border-white/[0.06]">
        {!collection || collection.scripts.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-[#777]">
            Your collection is empty. Add scripts from the All or Installed tabs.
          </p>
        ) : (
          collection.scripts.map((s, i) => (
            <CollectionRow
              key={s.id}
              script={s}
              index={i + 1}
              busy={busy}
              onInstall={(id) => run(() => install(id))}
              onRemove={(id) => run(() => remove(id))}
            />
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire the tab into ScriptsPage**

In `frontend/src/features/scripts/ScriptsPage.tsx`:

(a) Add the import near the other feature-local imports:

```tsx
import { CollectionTab } from './collection/CollectionTab'
```

(b) Extend the `Tab` type:

```tsx
type Tab = 'all' | 'installed' | 'bundles' | 'collection'
```

(c) Add the toggle item after the Bundles item:

```tsx
            <ToggleGroupItem value="collection">My Collection</ToggleGroupItem>
```

(d) Add the collection branch at the top of the tab body. Change the existing
`{tab === 'bundles' ? (` opening so the collection case is handled first:

```tsx
          {tab === 'collection' ? (
            <CollectionTab />
          ) : tab === 'bundles' ? (
```

(Leave the rest of the bundles/scripts rendering unchanged — it becomes the `else` of this new condition.)

- [ ] **Step 4: Write the failing test**

Create `frontend/tests/features/scripts/collection/CollectionTab.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CollectionTab } from '@/features/scripts/collection/CollectionTab'

afterEach(() => vi.restoreAllMocks())

describe('CollectionTab', () => {
  it('shows the login panel when unauthenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ authenticated: false }) }))
    )
    render(<CollectionTab />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Login with GitHub' })).toBeInTheDocument()
    )
  })

  it('lists collection scripts when authenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url === '/api/github/status')
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ authenticated: true, login: 'ruy' }),
          })
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ scripts: [{ id: 'g', filename: 'g.js', title: 'Guard', origin: 'local', installed: false }] }),
        })
      })
    )
    render(<CollectionTab />)
    await waitFor(() => expect(screen.getByText('Guard')).toBeInTheDocument())
    expect(screen.getByText('@ruy')).toBeInTheDocument()
  })
})
```

> `@ruy` is rendered across two nodes ("Signed in as @" + "ruy"); if `getByText('@ruy')` fails, assert `screen.getByText('ruy')` instead.

- [ ] **Step 5: Run tests + tsc + prettier + eslint**

Run from `frontend/`:
```
pnpm exec prettier --write "src/features/scripts/collection/**/*.{ts,tsx}" "tests/features/scripts/collection/**/*.tsx"
pnpm exec tsc --noEmit
pnpm exec eslint src/features/scripts
pnpm exec vitest run tests/features/scripts
```
Expected: tsc clean, eslint clean, all scripts/collection tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/scripts/collection frontend/src/features/scripts/ScriptsPage.tsx frontend/tests/features/scripts/collection/CollectionTab.test.tsx
git commit -m "feat(collection): add My Collection tab to the Scripts page"
```

---

## Task 14: Add-to-collection actions + docs + full gate

**Files:**
- Modify: `frontend/src/features/scripts/ScriptRow.tsx`
- Modify: `frontend/src/features/scripts/ScriptsPage.tsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add an optional "Add to collection" action to ScriptRow**

In `frontend/src/features/scripts/ScriptRow.tsx`, extend the props and render an optional action. Change the props type:

```tsx
type ScriptRowProps = {
  script: ScriptPackage
  index: number
  onInstall: (id: string) => void
  onDelete: (id: string) => void
  busy: boolean
  canDelete?: boolean
  onAddToCollection?: (id: string) => void
}
```

Update the signature destructuring to include `onAddToCollection`, then add this button just before the install/delete block inside the actions `div` (after `<ScriptSourceDialog .../>`):

```tsx
        {onAddToCollection ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onAddToCollection(script.id)}
          >
            + Collection
          </Button>
        ) : null}
```

- [ ] **Step 2: Pass the add handler from ScriptsPage when authenticated**

`ScriptsPage` already renders `ScriptRow` for the all/installed lists. The collection hook lives in `CollectionTab`, but the "add" action belongs on the All/Installed rows. To avoid two `useCollection` instances fighting, lift a minimal collection-add into `ScriptsPage` via a dedicated call (no full hook): add a helper in `ScriptsPage`:

```tsx
  async function addToCollection(origin: 'bundled' | 'local', script: { id: string; filename: string }) {
    const body =
      origin === 'bundled'
        ? { origin, id: script.id }
        : { origin, filename: script.filename }
    const resp = await fetch('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (resp.status === 401) {
      // Not logged in — point the user to the My Collection tab.
      changeTab('collection')
      return
    }
  }
```

Then pass it to the rows (bundled origin for the All/Bundles scope, local origin for the Installed tab):

```tsx
                    onAddToCollection={(id) =>
                      run(() =>
                        addToCollection(tab === 'installed' ? 'local' : 'bundled', {
                          id,
                          filename: p.filename,
                        })
                      )
                    }
```

(Only wire `onAddToCollection` on the All and Installed tabs — leave it undefined elsewhere so the button doesn't show on bundles.)

- [ ] **Step 3: Document in CLAUDE.md**

In `CLAUDE.md`, under the architecture endpoint list (the `Browser ←` block), add:

```
        → POST /api/github/device            (start GitHub device-flow login)
        ← GET /api/github/status             (auth state; advances device-flow poll)
        → POST /api/github/logout            (delete local token)
        ← GET /api/collection                (user's gist-backed script collection)
        → POST /api/collection               (add a bundled/local script to the gist)
        → POST /api/collection/install       (install a collection script → ~/.argus/hooks/)
        → DELETE /api/collection             (remove a script from the gist)
```

And add a short note after the hook-simulator paragraph:

```
**Scripts collection (Phase 2a):** optional GitHub login (device flow, scope `gist`,
token in `~/.argus/github-token.json` 0600) backs up a user's scripts to their own
private gist (`[argus-collection]`), portable across machines. Backend `internal/github`
owns the token + API; the SPA never sees it. No argus-hosted storage.
```

- [ ] **Step 4: Full verification gate**

Backend (from `backend/`):
```
go build ./... && go test ./... && /tmp/glci/golangci-lint run ./...   # or golangci-lint if on PATH
```
Frontend (from `frontend/`):
```
pnpm exec tsc --noEmit && pnpm run test -- --run && pnpm exec eslint . && pnpm exec prettier --write src
```
Expected: all green.

- [ ] **Step 5: Manual smoke (requires a real OAuth App client id wired in Task 9)**

`make build-local` → open `http://127.0.0.1:10804/scripts` → My Collection tab → Login with GitHub → enter the code at the shown URL → authorize → collection loads. Add a bundled script (+ Collection on an All row), confirm it appears under My Collection, Install it, confirm it lands in `~/.argus/hooks/`, Remove it from the collection. Logout.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/scripts/ScriptRow.tsx frontend/src/features/scripts/ScriptsPage.tsx CLAUDE.md
git commit -m "feat(collection): add-to-collection actions + docs"
```

---

## Self-Review Notes

- **Spec coverage:** device-flow auth (T4/T6/T7) ✓ · token store 0600 (T3) ✓ · gist collection CRUD + `[argus-collection]` discovery (T5) ✓ · backend-mediated, token never in browser (T6/T7/T8) ✓ · `writeHookScript` refactor reused by collection install (T1/T8) ✓ · domain + frontend types mirrored (T2/T10) ✓ · My Collection tab w/ login gate (T11/T12/T13) ✓ · add-from-bundled + add-from-local (T8/T14) ✓ · install/remove (T8/T13) ✓ · `gist`-only scope + 401 gating (T6/T8) ✓ · router + client id (T9) ✓ · docs (T14) ✓.
- **Deferred (spec §1 non-goals):** public sharing, discovery, in-browser authoring, keychain — none in this plan.
- **Type consistency:** `CollectionScript`/`Collection`/`GitHubAuthStatus`/`DeviceCodeResponse` field names + JSON tags identical across `domain/collection.go`, `types/collection.ts`, gist manifest, and handlers. Service methods (`StartDevice`/`Status`/`Logout`/`Collection`/`AddScript`/`RemoveScript`) match handler call sites. Hook actions (`startLogin`/`logout`/`add`/`install`/`remove`) match `CollectionTab` usage.
- **Known manual step:** `defaultGitHubClientID` placeholder in Task 9 must be replaced with the real OAuth App client id before the login flow works end-to-end; unit tests don't need it (fake servers).
