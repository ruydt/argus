# Phase 2b — Community Script Sharing & Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users publish hook scripts to a maintainer-owned public registry repo (via a prefilled GitHub link) and discover + install others' scripts from an in-app Community tab, with checksum verification and a sandboxed simulator — no argus-hosted infra.

**Architecture:** A new public repo `argus-hooks/registry` stores script bodies (`scripts/<login>/<id>.js`) with an `@argus-meta` header; a GitHub Action regenerates `index.json` (with `sha256`) on merge. Argus backend gets a `community.Source` that fetches + caches `index.json` and verifies bodies on install; four `/api/community/*` handlers expose catalog/source/install/simulate. Frontend adds a Community tab + a Publish button that builds a prefilled GitHub "new file" URL. No SQLite/domain-event changes.

**Tech Stack:** Go (`net/http`, `crypto/sha256`), React 19 + TypeScript + Vite, Vitest + Testing Library, Node 20 (registry Action generator).

**Spec:** `docs/superpowers/specs/2026-06-14-community-script-sharing-design.md`

---

## File Structure

**Backend (`backend/`)**
- Create `internal/domain/community.go` — `CommunityScript` type.
- Create `internal/community/source.go` — `Source`: fetch/cache `index.json`, verify `sha256`.
- Create `internal/community/source_test.go` — Source tests (cache, stale, integrity).
- Create `internal/handler/community.go` — 4 handlers + `communityState` helper.
- Create `internal/handler/community_test.go` — handler tests.
- Modify `internal/handler/hooks_simulate.go` — extract shared `runHookCommand`.
- Modify `internal/server/router.go` — wire 4 routes + `defaultRegistryRawURL`.

**Frontend (`frontend/`)**
- Create `src/types/community.ts` — `CommunityScript` type; Modify `src/types/index.ts` barrel.
- Create `src/features/scripts/community/useCommunity.ts` — catalog/install/getBody/simulate.
- Create `src/features/scripts/community/CommunityRow.tsx` — one row (badge/source/test/install).
- Create `src/features/scripts/community/CommunityTab.tsx` — browse + search + paginate.
- Create `src/features/scripts/community/publishUrl.ts` — `buildMetaHeader` + `buildPublishUrl`.
- Modify `src/features/scripts/ScriptRow.tsx` — optional `onPublish`.
- Modify `src/features/scripts/ScriptsPage.tsx` — `'community'` tab + `publish()`.
- Tests under `tests/features/scripts/community/`.

**Registry repo scaffold (`registry/`, pushed to `argus-hooks/registry`)**
- Create `registry/build-index.mjs`, `registry/test/build-index.test.mjs`,
  `registry/.github/workflows/build-index.yml`, `registry/README.md`.

---

## Task 1: Backend `CommunityScript` domain type + frontend type

**Files:**
- Create: `backend/internal/domain/community.go`
- Create: `frontend/src/types/community.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Create the backend domain type**

`backend/internal/domain/community.go`:

```go
package domain

// CommunityScript is one entry in the public registry's index.json, plus the
// per-request install/runtime state argus fills in. The registry is external
// and read-only; nothing here is persisted to SQLite.
type CommunityScript struct {
	ID               string `json:"id"`
	Author           string `json:"author"`
	Title            string `json:"title"`
	Purpose          string `json:"purpose,omitempty"`
	Event            string `json:"event,omitempty"`
	Matcher          string `json:"matcher,omitempty"`
	Runtime          string `json:"runtime,omitempty"` // node | python3 | sh
	Tier             string `json:"tier"`              // always "community"
	SHA256           string `json:"sha256"`            // bare hex of the file body
	Source           string `json:"source"`            // path within the registry repo
	PublishedAt      string `json:"published_at,omitempty"`
	Installed        bool   `json:"installed"`         // filled by handler
	RuntimeAvailable bool   `json:"runtime_available"` // filled by handler
}
```

- [ ] **Step 2: Create the frontend type**

`frontend/src/types/community.ts`:

```ts
export type CommunityScript = {
  id: string
  author: string
  title: string
  purpose?: string
  event?: string
  matcher?: string
  runtime?: string
  tier: 'community'
  sha256: string
  source: string
  published_at?: string
  installed: boolean
  runtime_available: boolean
}
```

- [ ] **Step 3: Add to the types barrel**

In `frontend/src/types/index.ts`, after the `./collection` re-export block, add:

```ts
export type { CommunityScript } from './community'
```

- [ ] **Step 4: Verify both compile**

Run: `cd backend && go build ./...`
Expected: no output (success).

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/domain/community.go frontend/src/types/community.ts frontend/src/types/index.ts
git commit -m "feat(community): add CommunityScript domain + frontend types"
```

---

## Task 2: Backend `community.Source` (fetch, cache, verify)

**Files:**
- Create: `backend/internal/community/source.go`
- Test: `backend/internal/community/source_test.go`

- [ ] **Step 1: Write the failing test**

`backend/internal/community/source_test.go`:

```go
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
	mux.HandleFunc("/index.json", func(w http.ResponseWriter, r *http.Request) {
		if indexStatus != nil {
			if s := atomic.LoadInt32(indexStatus); s != 0 {
				w.WriteHeader(int(s))
				return
			}
		}
		fmt.Fprintf(w, `{"schema_version":1,"scripts":[{"id":"demo","author":"alice","title":"Demo","runtime":"node","tier":"community","sha256":%q,"source":"scripts/alice/demo.js"}]}`, sha)
	})
	mux.HandleFunc("/scripts/alice/demo.js", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, demoBody)
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && go test ./internal/community/...`
Expected: FAIL — `package community` does not exist / undefined `community.NewSource`.

- [ ] **Step 3: Implement the source**

`backend/internal/community/source.go`:

```go
// Package community reads the public hook-script registry (a static index.json
// served from raw.githubusercontent) and verifies script bodies on fetch.
package community

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"argus/internal/domain"
)

// Source fetches and caches the registry index. It is safe for concurrent use.
type Source struct {
	baseURL string
	client  *http.Client
	ttl     time.Duration

	mu        sync.Mutex
	cached    []domain.CommunityScript
	fetchedAt time.Time
	hasCache  bool
}

// NewSource builds a Source reading from baseURL (e.g.
// https://raw.githubusercontent.com/argus-hooks/registry/main).
func NewSource(baseURL string, client *http.Client) *Source {
	if client == nil {
		client = http.DefaultClient
	}
	return &Source{baseURL: baseURL, client: client, ttl: 15 * time.Minute}
}

type indexFile struct {
	SchemaVersion int                      `json:"schema_version"`
	Scripts       []domain.CommunityScript `json:"scripts"`
}

// Catalog returns the registry scripts, cached for ttl. On a fetch error it
// serves the last good cache (offline tolerance); only a cold-cache error
// propagates.
func (s *Source) Catalog(ctx context.Context) ([]domain.CommunityScript, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.hasCache && time.Since(s.fetchedAt) < s.ttl {
		return s.cached, nil
	}
	scripts, err := s.fetchIndex(ctx)
	if err != nil {
		if s.hasCache {
			return s.cached, nil // serve stale
		}
		return nil, err
	}
	s.cached = scripts
	s.fetchedAt = time.Now()
	s.hasCache = true
	return scripts, nil
}

func (s *Source) fetchIndex(ctx context.Context) ([]domain.CommunityScript, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/index.json", nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("registry index status %d", resp.StatusCode)
	}
	var idx indexFile
	if err := json.NewDecoder(resp.Body).Decode(&idx); err != nil {
		return nil, fmt.Errorf("parse index: %w", err)
	}
	return idx.Scripts, nil
}

func (s *Source) lookup(ctx context.Context, id string) (domain.CommunityScript, error) {
	scripts, err := s.Catalog(ctx)
	if err != nil {
		return domain.CommunityScript{}, err
	}
	for _, c := range scripts {
		if c.ID == id {
			return c, nil
		}
	}
	return domain.CommunityScript{}, fmt.Errorf("unknown community script %q", id)
}

// ScriptBody fetches the raw body for id and verifies its sha256 against the
// index entry. Returns the entry metadata alongside the verified body.
func (s *Source) ScriptBody(ctx context.Context, id string) (domain.CommunityScript, []byte, error) {
	cs, err := s.lookup(ctx, id)
	if err != nil {
		return cs, nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.baseURL+"/"+cs.Source, nil)
	if err != nil {
		return cs, nil, err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return cs, nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return cs, nil, fmt.Errorf("registry body status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return cs, nil, err
	}
	sum := sha256.Sum256(body)
	if got := hex.EncodeToString(sum[:]); got != cs.SHA256 {
		return cs, nil, fmt.Errorf("integrity check failed for %q", id)
	}
	return cs, body, nil
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && go test ./internal/community/...`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + commit**

```bash
cd backend && golangci-lint run ./internal/community/...
cd .. && git add backend/internal/community/
git commit -m "feat(community): registry Source with caching + checksum verify"
```

---

## Task 3: Backend handlers + simulate refactor + routes

**Files:**
- Modify: `backend/internal/handler/hooks_simulate.go`
- Create: `backend/internal/handler/community.go`
- Create: `backend/internal/handler/community_test.go`
- Modify: `backend/internal/server/router.go`

- [ ] **Step 1: Extract `runHookCommand` from `hooks_simulate.go`**

In `backend/internal/handler/hooks_simulate.go`, replace the body of the
`HooksSimulate` handler (everything from `timeoutSeconds := 10` through the
`resp := simulateResponse{...}` construction) so it delegates to a new shared
helper. The final file:

```go
package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"os/exec"
	"strconv"
	"time"
)

type simulateRequest struct {
	Command        string          `json:"command"`
	Payload        json.RawMessage `json:"payload"`
	TimeoutSeconds *int            `json:"timeout_seconds,omitempty"`
}

type simulateResponse struct {
	Stdout     string `json:"stdout"`
	Stderr     string `json:"stderr"`
	ExitCode   int    `json:"exit_code"`
	DurationMs int64  `json:"duration_ms"`
}

// runHookCommand executes `sh -c command` with payload on stdin under a timeout,
// capturing stdout/stderr/exit code. Shared by the hook simulator and the
// community sandbox.
func runHookCommand(ctx context.Context, command string, payload []byte, timeoutSeconds int) simulateResponse {
	if timeoutSeconds <= 0 {
		timeoutSeconds = 10
	}
	cctx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(cctx, "sh", "-c", command)
	cmd.Stdin = bytes.NewReader(payload)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	runErr := cmd.Run()
	durationMs := time.Since(start).Milliseconds()

	exitCode := 0
	if runErr != nil {
		if exitErr, ok := runErr.(*exec.ExitError); ok && cctx.Err() != context.DeadlineExceeded {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
			if stderr.Len() == 0 {
				stderr.WriteString("hook timed out after " + strconv.Itoa(timeoutSeconds) + "s")
			}
		}
	}

	return simulateResponse{
		Stdout:     stdout.String(),
		Stderr:     stderr.String(),
		ExitCode:   exitCode,
		DurationMs: durationMs,
	}
}

func HooksSimulate() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req simulateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "bad json", http.StatusBadRequest)
			return
		}
		if req.Command == "" {
			http.Error(w, "command is required", http.StatusBadRequest)
			return
		}
		if len(req.Payload) == 0 || !json.Valid(req.Payload) {
			http.Error(w, "payload must be valid JSON", http.StatusBadRequest)
			return
		}

		timeoutSeconds := 10
		if req.TimeoutSeconds != nil && *req.TimeoutSeconds > 0 {
			timeoutSeconds = *req.TimeoutSeconds
		}

		resp := runHookCommand(r.Context(), req.Command, req.Payload, timeoutSeconds)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})
}
```

- [ ] **Step 2: Verify the simulator still passes**

Run: `cd backend && go test ./internal/handler/ -run Simulate`
Expected: PASS (existing simulator tests still green).

- [ ] **Step 3: Write the failing handler test**

`backend/internal/handler/community_test.go`:

```go
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
	mux.HandleFunc("/index.json", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"schema_version":1,"scripts":[{"id":"demo","author":"alice","title":"Demo","runtime":"sh","tier":"community","sha256":%q,"source":"scripts/alice/demo.sh"}]}`, csSHA())
	})
	mux.HandleFunc("/scripts/alice/demo.sh", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, csBody)
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
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd backend && go test ./internal/handler/ -run Community`
Expected: FAIL — undefined `handler.CommunityCatalog` / `CommunityInstall` / `CommunitySimulate`.

- [ ] **Step 5: Implement the handlers**

`backend/internal/handler/community.go`:

```go
package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path"
	"path/filepath"

	"argus/internal/community"
	"argus/internal/domain"
)

// communityState fills Installed + RuntimeAvailable for each script. The install
// filename is the basename of the registry source path (e.g. demo.sh).
func communityState(scripts []domain.CommunityScript, argusDir string) []domain.CommunityScript {
	dir := hooksDir(argusDir)
	runtimeCache := map[string]bool{}
	out := make([]domain.CommunityScript, len(scripts))
	for i, c := range scripts {
		_, statErr := os.Stat(filepath.Join(dir, path.Base(c.Source)))
		c.Installed = statErr == nil
		avail, ok := runtimeCache[c.Runtime]
		if !ok {
			_, lookErr := exec.LookPath(c.Runtime)
			avail = lookErr == nil
			runtimeCache[c.Runtime] = avail
		}
		c.RuntimeAvailable = avail
		out[i] = c
	}
	return out
}

// CommunityCatalog returns the registry scripts with per-machine install state.
func CommunityCatalog(src *community.Source, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		scripts, err := src.Catalog(r.Context())
		if err != nil {
			log.Printf("[community] catalog err=%v", err)
			http.Error(w, "failed to load community catalog", http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(communityState(scripts, argusDir)); err != nil {
			log.Printf("[community] encode catalog: %v", err)
		}
	})
}

// CommunityScriptBody returns one script's verified body for source-view.
func CommunityScriptBody(src *community.Source) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		if id == "" {
			http.Error(w, "id is required", http.StatusBadRequest)
			return
		}
		_, body, err := src.ScriptBody(r.Context(), id)
		if err != nil {
			log.Printf("[community] body id=%s err=%v", id, err)
			http.Error(w, "failed to load script", http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]string{"id": id, "body": string(body)}); err != nil {
			log.Printf("[community] encode body: %v", err)
		}
	})
}

// CommunityInstall fetches + verifies a community script and writes it into
// ~/.argus/hooks/<basename>. Never overwrites (409 on conflict).
func CommunityInstall(src *community.Source, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req scriptIDRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == "" {
			http.Error(w, "id is required", http.StatusBadRequest)
			return
		}
		cs, body, err := src.ScriptBody(r.Context(), req.ID)
		if err != nil {
			log.Printf("[community] install fetch id=%s err=%v", req.ID, err)
			http.Error(w, "install failed", http.StatusBadGateway)
			return
		}
		switch err := writeHookScript(argusDir, path.Base(cs.Source), body); {
		case errors.Is(err, os.ErrExist):
			http.Error(w, "script already installed", http.StatusConflict)
			return
		case err != nil:
			log.Printf("[community] install id=%s err=%v", req.ID, err)
			http.Error(w, "install failed", http.StatusInternalServerError)
			return
		}
		cs.Installed = true
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(cs); err != nil {
			log.Printf("[community] encode install: %v", err)
		}
	})
}

type communitySimulateRequest struct {
	ID      string          `json:"id"`
	Payload json.RawMessage `json:"payload"`
}

// CommunitySimulate runs a community script against a synthetic payload in a
// temp file (0700, removed after) before it ever touches ~/.argus/hooks.
func CommunitySimulate(src *community.Source) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req communitySimulateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ID == "" {
			http.Error(w, "id is required", http.StatusBadRequest)
			return
		}
		if len(req.Payload) == 0 || !json.Valid(req.Payload) {
			http.Error(w, "payload must be valid JSON", http.StatusBadRequest)
			return
		}
		cs, body, err := src.ScriptBody(r.Context(), req.ID)
		if err != nil {
			log.Printf("[community] simulate fetch id=%s err=%v", req.ID, err)
			http.Error(w, "failed to load script", http.StatusBadGateway)
			return
		}
		tmp, err := os.CreateTemp("", "argus-community-*"+path.Ext(cs.Source))
		if err != nil {
			http.Error(w, "sandbox error", http.StatusInternalServerError)
			return
		}
		tmpName := tmp.Name()
		defer func() { _ = os.Remove(tmpName) }()
		if _, err := tmp.Write(body); err != nil {
			_ = tmp.Close()
			http.Error(w, "sandbox error", http.StatusInternalServerError)
			return
		}
		if err := tmp.Close(); err != nil {
			http.Error(w, "sandbox error", http.StatusInternalServerError)
			return
		}
		if err := os.Chmod(tmpName, 0o700); err != nil {
			http.Error(w, "sandbox error", http.StatusInternalServerError)
			return
		}
		runtimeBin := cs.Runtime
		if runtimeBin == "" {
			runtimeBin = "sh"
		}
		resp := runHookCommand(r.Context(), runtimeBin+" '"+tmpName+"'", req.Payload, 10)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && go test ./internal/handler/ -run Community`
Expected: PASS (3 tests).

- [ ] **Step 7: Wire routes in `router.go`**

In `backend/internal/server/router.go`, immediately after the GitHub/collection
route block (after the `POST /api/collection/install` line), add:

```go
	registryURL := os.Getenv("ARGUS_REGISTRY_RAW_URL")
	if registryURL == "" {
		registryURL = defaultRegistryRawURL
	}
	communitySrc := community.NewSource(registryURL, nil)
	mux.Handle("GET /api/community/catalog", handler.CommunityCatalog(communitySrc, opts.ArgusDir))
	mux.Handle("GET /api/community/script", handler.CommunityScriptBody(communitySrc))
	mux.Handle("POST /api/community/install", handler.CommunityInstall(communitySrc, opts.ArgusDir))
	mux.Handle("POST /api/community/simulate", handler.CommunitySimulate(communitySrc))
```

Add the import `"argus/internal/community"` to the import block. Next to the
`defaultGitHubClientID` const, add:

```go
// defaultRegistryRawURL is where argus reads the public community script index.
// Override at runtime with ARGUS_REGISTRY_RAW_URL (forks/tests).
const defaultRegistryRawURL = "https://raw.githubusercontent.com/argus-hooks/registry/main"
```

- [ ] **Step 8: Build, full backend test, lint**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: build clean, all tests PASS, no lint errors.

- [ ] **Step 9: Commit**

```bash
git add backend/internal/handler/hooks_simulate.go backend/internal/handler/community.go backend/internal/handler/community_test.go backend/internal/server/router.go
git commit -m "feat(community): catalog/source/install/simulate handlers + routes"
```

---

## Task 4: Frontend `useCommunity` hook

**Files:**
- Create: `frontend/src/features/scripts/community/useCommunity.ts`
- Test: `frontend/tests/features/scripts/community/useCommunity.test.tsx`

- [ ] **Step 1: Write the failing test**

`frontend/tests/features/scripts/community/useCommunity.test.tsx`:

```tsx
import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useCommunity } from '@/features/scripts/community/useCommunity'

afterEach(() => vi.restoreAllMocks())

const sample = [
  {
    id: 'demo',
    author: 'alice',
    title: 'Demo',
    tier: 'community',
    sha256: 'abc',
    source: 'scripts/alice/demo.js',
    installed: false,
    runtime_available: true,
  },
]

describe('useCommunity', () => {
  it('loads the catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => sample })
    )
    const { result } = renderHook(() => useCommunity())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.scripts).toHaveLength(1)
    expect(result.current.scripts[0].id).toBe('demo')
  })

  it('posts an install then reloads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => sample }) // initial load
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // install POST
      .mockResolvedValueOnce({ ok: true, json: async () => sample }) // reload
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCommunity())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.install('demo')
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/community/install',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run tests/features/scripts/community/useCommunity.test.tsx`
Expected: FAIL — cannot resolve `@/features/scripts/community/useCommunity`.

- [ ] **Step 3: Implement the hook**

`frontend/src/features/scripts/community/useCommunity.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'

import type { CommunityScript } from '@/types'

type State = {
  scripts: CommunityScript[]
  loading: boolean
  error: string | null
}

export type SimulateResult = {
  stdout: string
  stderr: string
  exit_code: number
  duration_ms: number
}

export function useCommunity() {
  const [state, setState] = useState<State>({ scripts: [], loading: true, error: null })

  const reload = useCallback(async () => {
    try {
      const resp = await fetch('/api/community/catalog')
      if (!resp.ok) throw new Error(`community ${resp.status}`)
      const scripts: CommunityScript[] = await resp.json()
      setState({ scripts, loading: false, error: null })
    } catch (e) {
      setState({ scripts: [], loading: false, error: (e as Error).message })
    }
  }, [])

  useEffect(() => {
    // Async IIFE keeps the fetch-driven setState off the effect's sync path.
    void (async () => {
      await reload()
    })()
  }, [reload])

  const install = useCallback(
    async (id: string) => {
      const resp = await fetch('/api/community/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!resp.ok) throw new Error(`install ${resp.status}`)
      await reload()
    },
    [reload]
  )

  const getBody = useCallback(async (id: string): Promise<string> => {
    const resp = await fetch(`/api/community/script?id=${encodeURIComponent(id)}`)
    if (!resp.ok) throw new Error(`script ${resp.status}`)
    const data: { id: string; body: string } = await resp.json()
    return data.body
  }, [])

  const simulate = useCallback(async (id: string, payload: unknown): Promise<SimulateResult> => {
    const resp = await fetch('/api/community/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, payload }),
    })
    if (!resp.ok) throw new Error(`simulate ${resp.status}`)
    return resp.json()
  }, [])

  return { ...state, reload, install, getBody, simulate }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run tests/features/scripts/community/useCommunity.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/scripts/community/useCommunity.ts frontend/tests/features/scripts/community/useCommunity.test.tsx
git commit -m "feat(community): useCommunity hook"
```

---

## Task 5: Frontend `publishUrl` helpers

**Files:**
- Create: `frontend/src/features/scripts/community/publishUrl.ts`
- Test: `frontend/tests/features/scripts/community/publishUrl.test.ts`

- [ ] **Step 1: Write the failing test**

`frontend/tests/features/scripts/community/publishUrl.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { buildMetaHeader, buildPublishUrl } from '@/features/scripts/community/publishUrl'

const base = {
  id: 'git-autostash',
  title: 'Auto-stash',
  purpose: 'stash before checkout',
  event: 'PreToolUse',
  matcher: 'Bash',
  runtime: 'node',
  body: 'console.log(1)',
}

describe('buildMetaHeader', () => {
  it('emits the required fields between markers', () => {
    const header = buildMetaHeader(base)
    expect(header).toContain('// @argus-meta')
    expect(header).toContain('// title: Auto-stash')
    expect(header).toContain('// event: PreToolUse')
    expect(header).toContain('// matcher: Bash')
    expect(header).toContain('// @end')
  })
})

describe('buildPublishUrl', () => {
  it('prefills the body for a small script', () => {
    const { url, prefilled } = buildPublishUrl('alice', base)
    expect(prefilled).toBe(true)
    expect(url).toContain('/argus-hooks/registry/new/main')
    expect(url).toContain('filename=scripts%2Falice%2Fgit-autostash.js')
    expect(url).toContain('&value=')
  })

  it('falls back to no prefill for a large script', () => {
    const big = { ...base, body: 'x'.repeat(8000) }
    const { url, prefilled } = buildPublishUrl('alice', big)
    expect(prefilled).toBe(false)
    expect(url).not.toContain('&value=')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run tests/features/scripts/community/publishUrl.test.ts`
Expected: FAIL — cannot resolve `publishUrl`.

- [ ] **Step 3: Implement the helpers**

`frontend/src/features/scripts/community/publishUrl.ts`:

```ts
export type PublishScript = {
  id: string
  title: string
  purpose?: string
  event?: string
  matcher?: string
  runtime?: string
  body: string
}

const REGISTRY_NEW_FILE = 'https://github.com/argus-hooks/registry/new/main'
// GitHub's prefill query param overflows past ~8KB; stay well under.
const PREFILL_LIMIT = 6000

export function buildMetaHeader(s: PublishScript): string {
  const lines = [
    '// @argus-meta',
    `// title: ${s.title}`,
    `// event: ${s.event ?? ''}`,
    `// runtime: ${s.runtime ?? 'node'}`,
  ]
  if (s.matcher) lines.push(`// matcher: ${s.matcher}`)
  if (s.purpose) lines.push(`// purpose: ${s.purpose}`)
  lines.push('// @end', '')
  return lines.join('\n')
}

export function buildPublishUrl(
  login: string,
  s: PublishScript
): { url: string; prefilled: boolean } {
  const filename = `scripts/${login}/${s.id}.js`
  const body = buildMetaHeader(s) + '\n' + s.body
  const encoded = encodeURIComponent(body)
  const base = `${REGISTRY_NEW_FILE}?filename=${encodeURIComponent(filename)}`
  if (encoded.length < PREFILL_LIMIT) {
    return { url: `${base}&value=${encoded}`, prefilled: true }
  }
  return { url: base, prefilled: false }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npx vitest run tests/features/scripts/community/publishUrl.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/scripts/community/publishUrl.ts frontend/tests/features/scripts/community/publishUrl.test.ts
git commit -m "feat(community): publish URL + metadata header helpers"
```

---

## Task 6: Frontend Community tab + Publish wiring

**Files:**
- Create: `frontend/src/features/scripts/community/CommunityRow.tsx`
- Create: `frontend/src/features/scripts/community/CommunityTab.tsx`
- Modify: `frontend/src/features/scripts/ScriptRow.tsx`
- Modify: `frontend/src/features/scripts/ScriptsPage.tsx`
- Test: `frontend/tests/features/scripts/community/CommunityTab.test.tsx`

- [ ] **Step 1: Create `CommunityRow.tsx`**

`frontend/src/features/scripts/community/CommunityRow.tsx`:

```tsx
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CommunityScript } from '@/types'

import type { SimulateResult } from './useCommunity'

type CommunityRowProps = {
  script: CommunityScript
  index: number
  busy: boolean
  onInstall: (id: string) => void
  getBody: (id: string) => Promise<string>
  simulate: (id: string, payload: unknown) => Promise<SimulateResult>
}

const SAMPLE_PAYLOAD = {
  session_id: 'sim',
  transcript_path: '/tmp/argus-sim.jsonl',
  hook_event_name: 'PreToolUse',
}

export function CommunityRow({
  script,
  index,
  busy,
  onInstall,
  getBody,
  simulate,
}: CommunityRowProps) {
  const [body, setBody] = useState<string | null>(null)
  const [sim, setSim] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  async function toggleSource() {
    if (body !== null) {
      setBody(null)
      return
    }
    setWorking(true)
    try {
      setBody(await getBody(script.id))
    } catch {
      setBody('// failed to load source')
    } finally {
      setWorking(false)
    }
  }

  async function runSim() {
    setWorking(true)
    try {
      const r = await simulate(script.id, SAMPLE_PAYLOAD)
      setSim(`exit ${r.exit_code} · ${r.duration_ms}ms\n${r.stdout}${r.stderr}`)
    } catch {
      setSim('simulation failed')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="border-b border-white/[0.06] px-3 py-3 hover:bg-white/[0.02]">
      <div className="flex items-center gap-4">
        <span className="w-6 shrink-0 text-right text-[0.72rem] tabular-nums text-[#555]">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-[#e5e5e5]">{script.title}</span>
            <span className="truncate font-mono text-[0.7rem] text-[#666]">
              {script.author}/{script.id}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[0.72rem] text-[#888]">{script.purpose}</p>
        </div>
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          <Badge variant="outline" className="border-amber-600/40 text-amber-500">
            community
          </Badge>
          {script.event ? <Badge variant="outline">{script.event}</Badge> : null}
          {!script.runtime_available ? (
            <Badge variant="outline" className="border-amber-600/40 text-amber-500">
              needs {script.runtime}
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" disabled={busy || working} onClick={toggleSource}>
            Source
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || working || !script.runtime_available}
            onClick={runSim}
          >
            Test
          </Button>
          {!script.installed ? (
            <Button size="sm" disabled={busy || working} onClick={() => onInstall(script.id)}>
              Install
            </Button>
          ) : (
            <Badge variant="secondary" className="px-2.5 py-1">
              Installed
            </Badge>
          )}
        </div>
      </div>
      {body !== null ? (
        <pre className="mt-2 max-h-[40vh] overflow-auto rounded-md bg-black/40 p-3 text-[0.72rem] text-[#bbb]">
          {body}
        </pre>
      ) : null}
      {sim !== null ? (
        <pre className="mt-2 max-h-[30vh] overflow-auto rounded-md border border-white/[0.08] bg-black/20 p-3 text-[0.72rem] text-[#bbb]">
          {sim}
        </pre>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Create `CommunityTab.tsx`**

`frontend/src/features/scripts/community/CommunityTab.tsx`:

```tsx
import { useMemo, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { PaginationBar } from '@/components/shared/PaginationBar'

import { useCommunity } from './useCommunity'
import { CommunityRow } from './CommunityRow'

type CommunityTabProps = {
  query: string
}

const PAGE_SIZE = 10

export function CommunityTab({ query }: CommunityTabProps) {
  const { scripts, loading, error, install, getBody, simulate } = useCommunity()
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return scripts
    return scripts.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.purpose ?? '').toLowerCase().includes(q)
    )
  }, [scripts, query])

  async function runInstall(id: string) {
    setBusy(true)
    try {
      await install(id)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <p className="px-3 py-8 text-center text-sm text-[#777]">
        Couldn’t reach the script registry. Try again shortly.
      </p>
    )
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const clampedPage = Math.min(page, totalPages - 1)
  const start = clampedPage * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, filtered.length)
  const visible = filtered.slice(start, end)

  return (
    <div className="overflow-hidden rounded-md border border-white/[0.06]">
      {filtered.length > PAGE_SIZE && (
        <PaginationBar
          page={clampedPage}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          totalItems={filtered.length}
          rangeStart={start}
          rangeEnd={end}
          defaultPageSize={PAGE_SIZE}
          onPageChange={setPage}
          onPageSizeChange={() => setPage(0)}
        />
      )}
      {visible.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-[#777]">
          {query ? `No community scripts match “${query}”.` : 'No community scripts yet.'}
        </p>
      ) : (
        visible.map((s, i) => (
          <CommunityRow
            key={`${s.author}/${s.id}`}
            script={s}
            index={start + i + 1}
            busy={busy}
            onInstall={runInstall}
            getBody={getBody}
            simulate={simulate}
          />
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add optional `onPublish` to `ScriptRow.tsx`**

In `frontend/src/features/scripts/ScriptRow.tsx`, extend the props type and the
action row. Change the `ScriptRowProps` type to add:

```tsx
  onPublish?: (script: ScriptPackage) => void
```

Add `onPublish` to the destructured params, then inside the final
`<div className="flex shrink-0 items-center gap-2">` block, immediately after the
`{onAddToCollection ? (...) : null}` button, add:

```tsx
        {onPublish ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onPublish(script)}>
            Publish
          </Button>
        ) : null}
```

- [ ] **Step 4: Wire the `'community'` tab + `publish()` in `ScriptsPage.tsx`**

In `frontend/src/features/scripts/ScriptsPage.tsx`:

1. Add imports below the existing `CollectionTab` import:

```tsx
import { CommunityTab } from './community/CommunityTab'
import { buildMetaHeader, buildPublishUrl } from './community/publishUrl'
import type { ScriptPackage } from '@/types'
```

2. Change the `Tab` type:

```tsx
type Tab = 'all' | 'installed' | 'bundles' | 'collection' | 'community'
```

3. Add a `publish` function next to `addToCollection`:

```tsx
  async function publish(script: ScriptPackage) {
    try {
      const resp = await fetch('/api/github/status')
      const status: { authenticated: boolean; login?: string } = await resp.json()
      if (!status.authenticated || !status.login) {
        setNotice('Log in with GitHub (My Collection tab) to publish.')
        changeTab('collection')
        return
      }
      const fields = {
        id: script.id,
        title: script.title,
        purpose: script.purpose,
        event: script.event,
        matcher: script.matcher,
        runtime: script.runtime,
        body: script.body,
      }
      const { url, prefilled } = buildPublishUrl(status.login, fields)
      if (!prefilled) {
        await navigator.clipboard.writeText(buildMetaHeader(fields) + '\n' + script.body)
        setNotice('Script copied — paste it into the new file on GitHub.')
      }
      window.open(url, '_blank', 'noopener')
    } catch {
      setNotice('Could not start publishing.')
    }
  }
```

4. Add the toggle item after the `collection` item in the `ToggleGroup`:

```tsx
            <ToggleGroupItem value="community">Community</ToggleGroupItem>
```

5. Change the tab render chain so `community` renders the tab. Replace the
opening of the conditional:

```tsx
          {tab === 'collection' ? (
            <CollectionTab />
          ) : tab === 'community' ? (
            <CommunityTab query={query} />
          ) : tab === 'bundles' ? (
```

6. In the `ScriptRow` render (the `visibleScripts.map`), add the publish prop:

```tsx
                    onPublish={tab === 'installed' ? publish : undefined}
```

- [ ] **Step 5: Write the Community tab test**

`frontend/tests/features/scripts/community/CommunityTab.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CommunityTab } from '@/features/scripts/community/CommunityTab'

afterEach(() => vi.restoreAllMocks())

const scripts = [
  {
    id: 'git-autostash',
    author: 'alice',
    title: 'Auto-stash',
    purpose: 'stash before checkout',
    event: 'PreToolUse',
    runtime: 'node',
    tier: 'community',
    sha256: 'abc',
    source: 'scripts/alice/git-autostash.js',
    installed: false,
    runtime_available: true,
  },
]

describe('CommunityTab', () => {
  it('renders rows with a community badge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => scripts }))
    render(<CommunityTab query="" />)
    await waitFor(() => expect(screen.getByText('Auto-stash')).toBeInTheDocument())
    expect(screen.getByText('community')).toBeInTheDocument()
  })

  it('filters by query', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => scripts }))
    render(<CommunityTab query="nomatch" />)
    await waitFor(() =>
      expect(screen.getByText(/No community scripts match/)).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 6: Run frontend gates**

Run: `cd frontend && npx tsc --noEmit && npx vitest run tests/features/scripts/ && npx prettier --write src/features/scripts/community/ tests/features/scripts/community/ src/features/scripts/ScriptRow.tsx src/features/scripts/ScriptsPage.tsx`
Expected: no type errors; community + existing scripts tests PASS; prettier formats files.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/scripts/community/ frontend/src/features/scripts/ScriptRow.tsx frontend/src/features/scripts/ScriptsPage.tsx frontend/tests/features/scripts/community/CommunityTab.test.tsx
git commit -m "feat(community): Community tab, rows, and Publish button"
```

---

## Task 7: Registry repo scaffold (Action-built index)

**Files:**
- Create: `registry/build-index.mjs`
- Create: `registry/test/build-index.test.mjs`
- Create: `registry/.github/workflows/build-index.yml`
- Create: `registry/README.md`

> These files are the source of truth for the standalone `argus-hooks/registry`
> repo. After this task, the maintainer pushes the `registry/` contents to the
> new public repo (manual step, documented in the README).

- [ ] **Step 1: Write the failing generator test**

`registry/test/build-index.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import { buildIndex } from '../build-index.mjs'

test('buildIndex parses the header and computes sha256', async () => {
  const root = await mkdtemp(join(tmpdir(), 'reg-'))
  await mkdir(join(root, 'scripts', 'alice'), { recursive: true })
  const body = [
    '// @argus-meta',
    '// title: Demo',
    '// event: PreToolUse',
    '// runtime: node',
    '// purpose: demo script',
    '// @end',
    '',
    'console.log("hi")',
    '',
  ].join('\n')
  await writeFile(join(root, 'scripts', 'alice', 'demo.js'), body)

  const index = await buildIndex(root)

  assert.equal(index.schema_version, 1)
  assert.equal(index.scripts.length, 1)
  const s = index.scripts[0]
  assert.equal(s.id, 'demo')
  assert.equal(s.author, 'alice')
  assert.equal(s.title, 'Demo')
  assert.equal(s.runtime, 'node')
  assert.equal(s.tier, 'community')
  assert.equal(s.source, 'scripts/alice/demo.js')
  assert.equal(s.sha256, createHash('sha256').update(body).digest('hex'))
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test registry/test/`
Expected: FAIL — cannot find module `../build-index.mjs`.

- [ ] **Step 3: Implement the generator**

`registry/build-index.mjs`:

```js
import { readFile, readdir, writeFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'

const SCRIPTS_DIR = 'scripts'

function parseHeader(text) {
  const start = text.indexOf('// @argus-meta')
  const end = text.indexOf('// @end')
  if (start === -1 || end === -1) return null
  const meta = {}
  for (const line of text.slice(start, end).split('\n')) {
    const m = line.match(/^\/\/\s*(\w+):\s*(.*)$/)
    if (m) meta[m[1]] = m[2].trim()
  }
  return meta
}

async function walk(dir) {
  const out = []
  let entries
  try {
    entries = await readdir(dir)
  } catch {
    return out // scripts/ may not exist yet
  }
  for (const name of entries) {
    const p = join(dir, name)
    const s = await stat(p)
    if (s.isDirectory()) out.push(...(await walk(p)))
    else if (name.endsWith('.js')) out.push(p)
  }
  return out
}

export async function buildIndex(root = '.') {
  const files = (await walk(join(root, SCRIPTS_DIR))).sort()
  const scripts = []
  for (const file of files) {
    const text = await readFile(file, 'utf8')
    const meta = parseHeader(text)
    if (!meta || !meta.title) continue
    const rel = relative(root, file).split('\\').join('/')
    const author = rel.split('/')[1]
    const id = rel.split('/').pop().replace(/\.js$/, '')
    const sha256 = createHash('sha256').update(text).digest('hex')
    scripts.push({
      id,
      author,
      title: meta.title,
      purpose: meta.purpose ?? '',
      event: meta.event ?? '',
      matcher: meta.matcher ?? '',
      runtime: meta.runtime ?? 'node',
      tier: 'community',
      sha256,
      source: rel,
      published_at: meta.published ?? '',
    })
  }
  return { schema_version: 1, scripts }
}

// Run as a CLI: regenerate index.json in the current directory.
if (import.meta.url === `file://${process.argv[1]}`) {
  const index = await buildIndex('.')
  await writeFile('index.json', JSON.stringify(index, null, 2) + '\n')
  console.log(`wrote index.json with ${index.scripts.length} scripts`)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test registry/test/`
Expected: PASS (1 test).

- [ ] **Step 5: Add the Action + README**

`registry/.github/workflows/build-index.yml`:

```yaml
name: build-index
on:
  push:
    branches: [main]
    paths: ['scripts/**']
permissions:
  contents: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: node --test test/
      - run: node build-index.mjs
      - run: |
          git config user.name "argus-bot"
          git config user.email "bot@users.noreply.github.com"
          git add index.json
          git commit -m "chore: rebuild index.json" || echo "no changes"
          git push
```

`registry/README.md`:

```markdown
# argus-hooks/registry

Public community hook scripts for [argus](https://github.com/argus-hooks/argus).
`index.json` is **auto-generated** by CI — never edit it by hand.

## Contribute a script

1. Add one file at `scripts/<your-github-login>/<id>.js`.
2. Start it with an `@argus-meta` header:

   ```js
   // @argus-meta
   // title: Short human title
   // event: PreToolUse
   // runtime: node          # node | python3 | sh
   // matcher: Bash          # optional
   // purpose: One line describing what it does.
   // @end

   // ...script body...
   ```

3. Open a PR. On merge, CI parses the header, computes the `sha256`, and
   regenerates `index.json`. argus then lists your script in its Community tab.

## Maintainer setup (one time)

Push this `registry/` directory to a new **public** repo `argus-hooks/registry`.
argus reads `https://raw.githubusercontent.com/argus-hooks/registry/main/index.json`
(override with the `ARGUS_REGISTRY_RAW_URL` env var).
```

- [ ] **Step 6: Commit**

```bash
git add registry/
git commit -m "feat(registry): build-index Action, generator, and contributor docs"
```

---

## Manual one-time maintainer setup (post-merge)

After this plan lands, the maintainer (out of band, not a code task):
1. Create the **public** repo `argus-hooks/registry`.
2. Push the `registry/` directory contents to its root (so `build-index.mjs`,
   `test/`, `.github/workflows/`, `README.md` sit at the repo root).
3. Confirm `https://raw.githubusercontent.com/argus-hooks/registry/main/index.json`
   resolves (CI commits it after the first script PR; seed with an empty
   `{"schema_version":1,"scripts":[]}` if you want the tab populated before any
   contribution).

---

## Final verification (after all tasks)

```bash
cd backend && go build ./... && go test ./... && golangci-lint run ./...
cd ../frontend && npx tsc --noEmit && npx vitest run && npx prettier --check src/features/scripts
node --test registry/test/
```
All must pass before finishing the branch (superpowers:finishing-a-development-branch).

After this ships, cut the first complete release — recommend `1.0.0` (`0.1.0` is
already tagged): bump version, tag `v1.0.0`, push to trigger GoReleaser.
```
