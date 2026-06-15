# Scripts v2 — Registry-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `argus-hooks/registry` the sole source of scripts (no embedding, no tiers, no bundles), browse it via an infinite-scroll author-tagged list with whole-registry search, and let users share local files/folders by having the backend open one PR with a description.

**Architecture:** Delete the embedded `BundledSource`, `/api/scripts/*`, and bundle types. The registry (`community.Source`) becomes the only catalog. Add `internal/github` methods that fork the registry, commit uploaded files in one commit, and open a PR; expose them via `POST /api/registry/publish` (needs `public_repo`, accepts files + description, stamps missing author metadata). Rewrite the Community tab (infinite scroll) and My Collection (⋯ menu + Upload & share).

**Tech Stack:** Go (`net/http`, GitHub REST Git Data API), React 19 + TS + Vite, Vitest, shadcn `Popover`.

**Spec:** `docs/superpowers/specs/2026-06-14-scripts-v2-registry-only-design.md`
**Branch:** continue on `feat/community-script-sharing`.

> **Typecheck note:** the frontend root `tsconfig.json` is solution-style — `tsc --noEmit` is a NO-OP. ALWAYS use `npx tsc -b --noEmit`.

---

## File Structure

**Backend**
- Delete: `internal/scriptcatalog/` (whole package: `source.go`, `embed.go`, `files/`, `scriptcatalog_test.go`).
- Delete: `internal/domain/script.go` (ScriptCatalog/ScriptPackage/ScriptBundle).
- Modify: `internal/handler/scripts.go` — keep only `hooksDir`/`hookTarget`/`writeHookScript`/`scriptIDRequest`; delete the rest. (Rename file → `hooks_fs.go`.)
- Modify: `internal/handler/collection.go` — `Collection` enriches from `community.Source`; `CollectionAdd` becomes local-only (drop `scriptcatalog` dep + bundled branch).
- Create: `internal/github/repo_publish.go` — fork/commit/PR methods on `*GistClient`.
- Modify: `internal/github/service.go` — `PublishToRegistry`; `ErrNeedsRepoScope`.
- Modify: `internal/github/device_flow.go` — scope `gist` → `gist public_repo`.
- Create: `internal/handler/registry_publish.go` — `RegistryPublish` handler (files + description; author fallback).
- Modify: `internal/server/router.go` — drop `/api/scripts/*`; add `POST /api/registry/publish`; pass `community.Source` to `Collection`.
- Tests: `internal/github/repo_publish_test.go`, `internal/handler/registry_publish_test.go`; delete bundled/scripts tests.

**Frontend**
- Rewrite: `src/features/scripts/community/CommunityTab.tsx` (infinite scroll).
- Rewrite: `src/features/scripts/collection/CollectionRow.tsx` (⋯ menu, no Publish).
- Modify: `src/features/scripts/collection/CollectionTab.tsx` (Upload & share button + dialog).
- Create: `src/features/scripts/collection/UploadShareDialog.tsx`.
- Modify: `src/features/scripts/collection/useCollection.ts` (`publishFiles`).
- Delete: `src/features/scripts/BundleCard.tsx`, `src/features/scripts/hooks/useScriptCatalog.ts`, their tests.
- Tests under `tests/features/scripts/**`.

---

## Task 1: Backend — remove embedding + bundles, repoint catalog

**Files:**
- Delete: `backend/internal/scriptcatalog/` (entire dir), `backend/internal/domain/script.go`
- Modify: `backend/internal/handler/scripts.go`, `backend/internal/handler/collection.go`, `backend/internal/server/router.go`
- Delete tests: any `*_test.go` referencing `scriptcatalog`, `ScriptsCatalog`, `ScriptsInstall`, bundles.

- [ ] **Step 1: Inventory references**

Run: `cd /Users/duytran/GitHub/argus/backend && grep -rln "scriptcatalog\|ScriptsCatalog\|ScriptsInstall\|ScriptsInstallBundle\|ScriptsDelete\|ScriptBundle\|ScriptCatalog\|ScriptPackage\|loadCatalogWithState\|findPackage\|findBundle\|installOne" --include=*.go`
Expected: lists `handler/scripts.go`, `handler/collection.go`, `server/router.go`, `scriptcatalog/*`, plus test files. Note them all.

- [ ] **Step 2: Reduce `handler/scripts.go` to the shared FS helpers**

Replace the ENTIRE contents of `backend/internal/handler/scripts.go` with only the helpers other code still needs (delete every `Scripts*` handler, `loadCatalogWithState`, `findPackage`, `findBundle`, `installOne`):

```go
package handler

import (
	"fmt"
	"os"
	"path/filepath"
)

// hooksDir returns ~/.argus/hooks for the given argus home dir.
func hooksDir(argusDir string) string { return filepath.Join(argusDir, "hooks") }

// hookTarget resolves the on-disk path for a script filename, rejecting any
// filename that is not a flat basename (defense-in-depth against traversal).
func hookTarget(argusDir, filename string) (string, error) {
	if filename == "" || filepath.Base(filename) != filename {
		return "", fmt.Errorf("invalid script filename %q", filename)
	}
	return filepath.Join(hooksDir(argusDir), filename), nil
}

// writeHookScript writes body to <argusDir>/hooks/<filename> atomically.
// O_EXCL makes the create atomic (never overwrites → os.ErrExist if present).
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
		return err
	}
	_, writeErr := f.Write(body)
	closeErr := f.Close()
	if writeErr != nil {
		return writeErr
	}
	return closeErr
}

type scriptIDRequest struct {
	ID string `json:"id"`
}
```

- [ ] **Step 3: Make `CollectionAdd` local-only + repoint `Collection` enrichment**

In `backend/internal/handler/collection.go`:

(a) Change the `Collection` signature + enrichment source from `scriptcatalog.ScriptSource` to `*community.Source`. Replace the metadata-map build:

```go
// Collection signature:
func Collection(svc *github.Service, registrySrc *community.Source, argusDir string) http.Handler {
```
and inside, replace the bundled-catalog enrichment block with:

```go
		metaByFile := map[string]domain.CommunityScript{}
		if scripts, err := registrySrc.Catalog(r.Context()); err == nil {
			for _, p := range scripts {
				metaByFile[path.Base(p.Source)] = p
			}
		}
```
and where an entry is enriched from `metaByFile`, use the `CommunityScript` fields:
```go
			} else if p, ok := metaByFile[f]; ok {
				e.ID = idFromFilename(f)
				e.Title = p.Title
				e.Event = p.Event
				e.Runtime = p.Runtime
			} else {
```
Add `"path"` and `"argus/internal/community"` imports; drop `"argus/internal/scriptcatalog"`.

(b) Simplify `CollectionAdd` to local-only. Replace its signature + `buildCollectionScript` so it no longer takes `scriptcatalog.ScriptSource` and only handles `origin:"local"`:

```go
// CollectionAdd adds a local script (from ~/.argus/hooks) to the gist collection.
func CollectionAdd(svc *github.Service, argusDir string) http.Handler {
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
		target, err := hookTarget(argusDir, req.Filename)
		if err != nil {
			http.Error(w, "invalid filename", http.StatusBadRequest)
			return
		}
		body, err := os.ReadFile(target)
		if err != nil {
			http.Error(w, "local script not found", http.StatusBadRequest)
			return
		}
		script := domain.CollectionScript{
			ID: idFromFilename(req.Filename), Filename: req.Filename,
			Title: req.Filename, Origin: "local", Body: string(body),
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

type addCollectionRequest struct {
	Filename string `json:"filename"`
}
```
Delete the old `addCollectionRequest` (with Origin/ID) and `buildCollectionScript`.

- [ ] **Step 4: Update router**

In `backend/internal/server/router.go`: delete the four `/api/scripts/*` `mux.Handle` lines and the `scriptSrc := scriptcatalog.NewBundledSource()` line and the `scriptcatalog` import. Update the collection wiring:
```go
	mux.Handle("GET /api/collection", handler.Collection(ghSvc, communitySrc, opts.ArgusDir))
	mux.Handle("POST /api/collection", handler.CollectionAdd(ghSvc, opts.ArgusDir))
```
Move the `communitySrc := community.NewSource(...)` construction ABOVE the collection routes so it's in scope for `Collection`.

- [ ] **Step 5: Delete the dead package, domain types, and their tests**

```bash
cd /Users/duytran/GitHub/argus/backend
rm -rf internal/scriptcatalog
rm -f internal/domain/script.go
# delete bundled/scripts handler tests surfaced in Step 1 (e.g. scripts_test.go, bundle tests)
```
Delete any handler test file that exercises `ScriptsCatalog`/`ScriptsInstall`/bundles (from Step 1's grep). Keep `collection_view_test.go`, `collection_local_test.go`, `community_*_test.go` (the latter two may need the `Collection` test fixture updated for the new signature — update calls to `handler.Collection(svc, communitySrc, dir)`; build a `community.Source` pointing at an httptest fake or pass one returning empty).

- [ ] **Step 6: Fix the `collection_view_test.go` signature**

`TestCollectionViewLoggedOutListsLocalOnly` calls `handler.Collection(svc, scriptcatalog.NewBundledSource(), dir)`. Change it to use a registry source. Since the test asserts a local-only file shows with **filename-derived** title now (no bundled enrichment), update the assertion: build the source against an httptest server returning `{"schema_version":1,"scripts":[]}` and expect `Title == "block-dangerous.js"` (filename fallback) instead of the enriched title:

```go
	mux := http.NewServeMux()
	mux.HandleFunc("/index.json", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"schema_version":1,"scripts":[]}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	registrySrc := community.NewSource(srv.URL, srv.Client())
	h := handler.Collection(svc, registrySrc, dir)
	...
	if e.Title != "block-dangerous.js" {
		t.Fatalf("expected filename-fallback title, got %q", e.Title)
	}
```

- [ ] **Step 7: Build + full suite + lint**

Run: `cd /Users/duytran/GitHub/argus/backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: build clean (no references to deleted pkg/types), all tests PASS, lint clean. (If `golangci-lint` not on PATH, try `/tmp/glci/golangci-lint`.)

- [ ] **Step 8: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add -A backend
git commit -m "refactor(scripts): remove embedded catalog + bundles; registry is the sole source"
```

---

## Task 2: Backend — GitHub fork + commit + PR client

**Files:**
- Create: `backend/internal/github/repo_publish.go`
- Modify: `backend/internal/github/service.go` (add `PublishToRegistry`, `ErrNeedsRepoScope`)
- Test: `backend/internal/github/repo_publish_test.go`

- [ ] **Step 1: Write the failing test (fake GitHub API)**

Create `backend/internal/github/repo_publish_test.go`:

```go
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

// fakeGitHub implements the minimal Git Data + fork + pulls surface.
func fakeGitHub(t *testing.T, scopes string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/user", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-OAuth-Scopes", scopes)
		_, _ = w.Write([]byte(`{"login":"alice"}`))
	})
	mux.HandleFunc("/repos/argus-hooks/registry/forks", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"full_name":"alice/registry"}`))
	})
	mux.HandleFunc("/repos/alice/registry", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"full_name":"alice/registry"}`))
	})
	mux.HandleFunc("/repos/alice/registry/git/ref/heads/main", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"object":{"sha":"basecommit"}}`))
	})
	mux.HandleFunc("/repos/alice/registry/git/commits/basecommit", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"tree":{"sha":"basetree"}}`))
	})
	mux.HandleFunc("/repos/alice/registry/git/blobs", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"sha":"blob1"}`))
	})
	mux.HandleFunc("/repos/alice/registry/git/trees", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			BaseTree string `json:"base_tree"`
			Tree     []struct {
				Path string `json:"path"`
			} `json:"tree"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if len(body.Tree) == 0 || !strings.HasPrefix(body.Tree[0].Path, "scripts/alice/") {
			t.Errorf("tree path not under scripts/alice/: %+v", body.Tree)
		}
		_, _ = w.Write([]byte(`{"sha":"newtree"}`))
	})
	mux.HandleFunc("/repos/alice/registry/git/commits", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"sha":"newcommit"}`))
	})
	mux.HandleFunc("/repos/alice/registry/git/refs", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"ref":"refs/heads/x"}`))
	})
	mux.HandleFunc("/repos/argus-hooks/registry/pulls", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"html_url":"https://github.com/argus-hooks/registry/pull/1"}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestPublishRegistryHappyPath(t *testing.T) {
	srv := fakeGitHub(t, "gist, public_repo")
	gc := github.NewGistClient("tok", srv.Client())
	gc.SetBaseURL(srv.URL) // test hook
	url, err := gc.PublishRegistry(context.Background(),
		[]github.PublishFile{{Name: "foo.js", Body: "console.log(1)\n"}})
	if err != nil {
		t.Fatalf("PublishRegistry: %v", err)
	}
	if url != "https://github.com/argus-hooks/registry/pull/1" {
		t.Fatalf("unexpected PR url: %q", url)
	}
}

func TestPublishRegistryNeedsRepoScope(t *testing.T) {
	srv := fakeGitHub(t, "gist") // no public_repo
	gc := github.NewGistClient("tok", srv.Client())
	gc.SetBaseURL(srv.URL)
	_, err := gc.PublishRegistry(context.Background(),
		[]github.PublishFile{{Name: "foo.js", Body: "x"}})
	if err != github.ErrNeedsRepoScope {
		t.Fatalf("expected ErrNeedsRepoScope, got %v", err)
	}
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/duytran/GitHub/argus/backend && go test ./internal/github/ -run PublishRegistry`
Expected: FAIL — undefined `PublishFile`, `PublishRegistry`, `SetBaseURL`, `ErrNeedsRepoScope`.

- [ ] **Step 3: Implement the publish client**

Create `backend/internal/github/repo_publish.go`:

```go
package github

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
)

// ErrNeedsRepoScope means the token lacks public_repo and cannot open a PR.
var ErrNeedsRepoScope = errors.New("github token missing public_repo scope")

const registryOwner = "argus-hooks"
const registryRepo = "registry"

// PublishFile is one file to publish (basename + text body).
type PublishFile struct {
	Name string
	Body string
}

// SetBaseURL overrides the API base (tests only).
func (g *GistClient) SetBaseURL(u string) { g.baseURL = u }

func (g *GistClient) decode(ctx context.Context, method, path string, payload any, out any) error {
	resp, err := g.do(ctx, method, path, payload)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("github %s %s: status %d", method, path, resp.StatusCode)
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func (g *GistClient) hasRepoScope(ctx context.Context) (bool, error) {
	resp, err := g.do(ctx, http.MethodGet, "/user", nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = resp.Body.Close() }()
	scopes := resp.Header.Get("X-OAuth-Scopes")
	return strings.Contains(scopes, "public_repo") || strings.Contains(scopes, "repo"), nil
}

type treeEntry struct {
	Path string `json:"path"`
	Mode string `json:"mode"`
	Type string `json:"type"`
	SHA  string `json:"sha"`
}

func branchSuffix(files []PublishFile) string {
	h := sha256.New()
	for _, f := range files {
		h.Write([]byte(f.Name))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))[:8]
}

// PublishRegistry forks argus-hooks/registry (if needed), commits all files under
// scripts/<login>/ in one commit on a new branch, and opens a PR. Returns PR URL.
func (g *GistClient) PublishRegistry(ctx context.Context, files []PublishFile) (string, error) {
	if len(files) == 0 {
		return "", errors.New("no files to publish")
	}
	ok, err := g.hasRepoScope(ctx)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", ErrNeedsRepoScope
	}

	var user struct {
		Login string `json:"login"`
	}
	if err := g.decode(ctx, http.MethodGet, "/user", nil, &user); err != nil {
		return "", err
	}
	login := user.Login

	// Ensure fork exists (idempotent). GitHub returns 202/200; the fork may lag,
	// so confirm it resolves before using it.
	if err := g.decode(ctx, http.MethodPost,
		fmt.Sprintf("/repos/%s/%s/forks", registryOwner, registryRepo), map[string]any{}, nil); err != nil {
		return "", err
	}
	if err := g.decode(ctx, http.MethodGet,
		fmt.Sprintf("/repos/%s/%s", login, registryRepo), nil, nil); err != nil {
		return "", fmt.Errorf("fork not ready: %w", err)
	}

	var ref struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	if err := g.decode(ctx, http.MethodGet,
		fmt.Sprintf("/repos/%s/%s/git/ref/heads/main", login, registryRepo), nil, &ref); err != nil {
		return "", err
	}
	baseSHA := ref.Object.SHA

	var commit struct {
		Tree struct {
			SHA string `json:"sha"`
		} `json:"tree"`
	}
	if err := g.decode(ctx, http.MethodGet,
		fmt.Sprintf("/repos/%s/%s/git/commits/%s", login, registryRepo, baseSHA), nil, &commit); err != nil {
		return "", err
	}

	entries := make([]treeEntry, 0, len(files))
	for _, f := range files {
		var blob struct {
			SHA string `json:"sha"`
		}
		if err := g.decode(ctx, http.MethodPost,
			fmt.Sprintf("/repos/%s/%s/git/blobs", login, registryRepo),
			map[string]string{"content": f.Body, "encoding": "utf-8"}, &blob); err != nil {
			return "", err
		}
		entries = append(entries, treeEntry{
			Path: fmt.Sprintf("scripts/%s/%s", login, f.Name), Mode: "100644", Type: "blob", SHA: blob.SHA,
		})
	}

	var tree struct {
		SHA string `json:"sha"`
	}
	if err := g.decode(ctx, http.MethodPost,
		fmt.Sprintf("/repos/%s/%s/git/trees", login, registryRepo),
		map[string]any{"base_tree": commit.Tree.SHA, "tree": entries}, &tree); err != nil {
		return "", err
	}

	var newCommit struct {
		SHA string `json:"sha"`
	}
	if err := g.decode(ctx, http.MethodPost,
		fmt.Sprintf("/repos/%s/%s/git/commits", login, registryRepo),
		map[string]any{"message": "Add scripts from " + login, "tree": tree.SHA, "parents": []string{baseSHA}},
		&newCommit); err != nil {
		return "", err
	}

	branch := "argus-share-" + branchSuffix(files)
	if err := g.decode(ctx, http.MethodPost,
		fmt.Sprintf("/repos/%s/%s/git/refs", login, registryRepo),
		map[string]string{"ref": "refs/heads/" + branch, "sha": newCommit.SHA}, nil); err != nil {
		return "", err
	}

	var pr struct {
		HTMLURL string `json:"html_url"`
	}
	if err := g.decode(ctx, http.MethodPost,
		fmt.Sprintf("/repos/%s/%s/pulls", registryOwner, registryRepo),
		map[string]string{
			"title": "Add scripts from " + login,
			"head":  login + ":" + branch,
			"base":  "main",
		}, &pr); err != nil {
		return "", err
	}
	return pr.HTMLURL, nil
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/duytran/GitHub/argus/backend && go test ./internal/github/ -run PublishRegistry`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the Service wrapper**

In `backend/internal/github/service.go`, add:

```go
// PublishToRegistry forks + commits + opens a PR for the given files.
func (s *Service) PublishToRegistry(ctx context.Context, files []PublishFile) (string, error) {
	gc, ok := s.gist()
	if !ok {
		return "", ErrNotAuthenticated
	}
	return gc.PublishRegistry(ctx, files)
}
```

- [ ] **Step 6: Build + suite + lint + commit**

Run: `cd /Users/duytran/GitHub/argus/backend && go build ./... && go test ./internal/github/... && golangci-lint run ./internal/github/...`
Expected: PASS, lint clean.

```bash
cd /Users/duytran/GitHub/argus
git add backend/internal/github/repo_publish.go backend/internal/github/repo_publish_test.go backend/internal/github/service.go
git commit -m "feat(github): fork+commit+PR registry publish client"
```

---

## Task 3: Backend — publish endpoint + scope widen

**Files:**
- Create: `backend/internal/handler/registry_publish.go`
- Test: `backend/internal/handler/registry_publish_test.go`
- Modify: `backend/internal/github/device_flow.go`, `backend/internal/server/router.go`

- [ ] **Step 1: Write the failing handler test**

Create `backend/internal/handler/registry_publish_test.go`:

```go
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
	svc := github.NewService("cid", t.TempDir()) // no token
	rr := httptest.NewRecorder()
	body := bytes.NewBufferString(`{"files":[{"name":"ok.js","body":"x"}]}`)
	handler.RegistryPublish(svc).ServeHTTP(rr, httptest.NewRequest(http.MethodPost, "/api/registry/publish", body))
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when logged out, got %d", rr.Code)
	}
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/duytran/GitHub/argus/backend && go test ./internal/handler/ -run RegistryPublish`
Expected: FAIL — undefined `handler.RegistryPublish`.

- [ ] **Step 3: Implement the handler**

Create `backend/internal/handler/registry_publish.go`:

```go
package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"path/filepath"

	"argus/internal/github"
)

type publishRequest struct {
	Files []struct {
		Name string `json:"name"`
		Body string `json:"body"`
	} `json:"files"`
}

// RegistryPublish uploads local files to argus-hooks/registry via a PR.
func RegistryPublish(svc *github.Service) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var req publishRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.Files) == 0 {
			http.Error(w, "files required", http.StatusBadRequest)
			return
		}
		files := make([]github.PublishFile, 0, len(req.Files))
		for _, f := range req.Files {
			if f.Name == "" || filepath.Base(f.Name) != f.Name {
				http.Error(w, "invalid file name", http.StatusBadRequest)
				return
			}
			files = append(files, github.PublishFile{Name: f.Name, Body: f.Body})
		}
		url, err := svc.PublishToRegistry(r.Context(), files)
		switch {
		case errors.Is(err, github.ErrNotAuthenticated):
			http.Error(w, "not authenticated", http.StatusUnauthorized)
		case errors.Is(err, github.ErrNeedsRepoScope):
			http.Error(w, "re-login to enable sharing", http.StatusForbidden)
		case err != nil:
			log.Printf("[registry] publish err=%v", err)
			http.Error(w, "github error", http.StatusBadGateway)
		default:
			writeJSON(w, map[string]string{"pull_request_url": url})
		}
	})
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /Users/duytran/GitHub/argus/backend && go test ./internal/handler/ -run RegistryPublish`
Expected: PASS (2 tests).

- [ ] **Step 5: Widen device-flow scope + wire route**

In `backend/internal/github/device_flow.go` line ~53, change:
```go
	form := url.Values{"client_id": {d.clientID}, "scope": {"gist public_repo"}}
```
In `backend/internal/server/router.go`, after the github routes add:
```go
	mux.Handle("POST /api/registry/publish", handler.RegistryPublish(ghSvc))
```

- [ ] **Step 6: Build + full suite + lint + commit**

Run: `cd /Users/duytran/GitHub/argus/backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: all PASS, lint clean.

```bash
cd /Users/duytran/GitHub/argus
git add backend/internal/handler/registry_publish.go backend/internal/handler/registry_publish_test.go backend/internal/github/device_flow.go backend/internal/server/router.go
git commit -m "feat(registry): POST /api/registry/publish + widen device-flow scope to public_repo"
```

---

## Task 4: Frontend — Community tab infinite scroll

**Files:**
- Rewrite: `frontend/src/features/scripts/community/CommunityTab.tsx`
- Rewrite test: `frontend/tests/features/scripts/community/CommunityTab.test.tsx`

- [ ] **Step 1: Rewrite `CommunityTab.tsx`**

Replace ENTIRELY with (single list, author badge, infinite scroll, search-all):

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

import { useCommunity } from './useCommunity'
import { CommunityRow } from './CommunityRow'

type CommunityTabProps = {
  query: string
}

const PAGE = 50

export function CommunityTab({ query }: CommunityTabProps) {
  const { scripts, loading, error, install, getBody, simulate } = useCommunity()
  const [busy, setBusy] = useState(false)
  const [visible, setVisible] = useState(PAGE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return scripts
    return scripts.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.author.toLowerCase().includes(q) ||
        (s.purpose ?? '').toLowerCase().includes(q)
    )
  }, [scripts, query])

  useEffect(() => {
    setVisible(PAGE)
  }, [query])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisible((v) => Math.min(v + PAGE, filtered.length))
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [filtered.length])

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

  const shown = filtered.slice(0, visible)

  return (
    <div className="overflow-hidden rounded-md border border-white/[0.06]">
      {shown.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-[#777]">
          {query ? `No scripts match “${query}”.` : 'No scripts in the registry yet.'}
        </p>
      ) : (
        <>
          {shown.map((s, i) => (
            <CommunityRow
              key={`${s.author}/${s.id}`}
              script={s}
              index={i + 1}
              busy={busy}
              onInstall={(id) => run(() => install(id))}
              getBody={getBody}
              simulate={simulate}
            />
          ))}
          <div ref={sentinelRef} className="h-8" aria-hidden />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Show author on the row**

In `frontend/src/features/scripts/community/CommunityRow.tsx`, the badge area currently shows a `community` badge. Replace that `<Badge ...>community</Badge>` with an author label:
```tsx
          <Badge variant="outline" className="border-amber-600/40 text-amber-500">
            by {script.author}
          </Badge>
```
(Leave Source/Test/Install + the rest unchanged.)

- [ ] **Step 3: Rewrite the test**

Replace `frontend/tests/features/scripts/community/CommunityTab.test.tsx` ENTIRELY with:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CommunityTab } from '@/features/scripts/community/CommunityTab'

beforeEach(() => {
  // jsdom lacks IntersectionObserver
  class IO {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', IO as unknown as typeof IntersectionObserver)
})
afterEach(() => vi.restoreAllMocks())

function makeScripts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    author: 'alice',
    title: `Script ${i}`,
    purpose: 'p',
    event: 'PreToolUse',
    runtime: 'node',
    tier: 'community',
    sha256: 'x',
    source: `scripts/alice/s${i}.js`,
    installed: false,
    runtime_available: true,
  }))
}

describe('CommunityTab', () => {
  it('renders only the first 50 of a large list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => makeScripts(120) }))
    render(<CommunityTab query="" />)
    await waitFor(() => expect(screen.getByText('Script 0')).toBeInTheDocument())
    expect(screen.getByText('Script 49')).toBeInTheDocument()
    expect(screen.queryByText('Script 50')).not.toBeInTheDocument()
  })

  it('search finds a script beyond the first 50 (whole-registry search)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => makeScripts(120) }))
    render(<CommunityTab query="Script 99" />)
    await waitFor(() => expect(screen.getByText('Script 99')).toBeInTheDocument())
  })
})
```

- [ ] **Step 4: Verify**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/scripts/community/ && npx tsc -b --noEmit`
Expected: tests PASS. `tsc -b` may error only in files rewritten later (CollectionTab/ScriptsPage references to deleted `useScriptCatalog`/`BundleCard`) — those are handled in Tasks 5–6. Report any other error. Then `npx prettier --write` changed files.

- [ ] **Step 5: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/scripts/community/CommunityTab.tsx frontend/src/features/scripts/community/CommunityRow.tsx frontend/tests/features/scripts/community/CommunityTab.test.tsx
git commit -m "feat(community): infinite-scroll author-tagged list with whole-registry search"
```

---

## Task 5: Frontend — My Collection ⋯ menu + Upload & share

**Files:**
- Rewrite: `frontend/src/features/scripts/collection/CollectionRow.tsx`
- Create: `frontend/src/features/scripts/collection/UploadShareDialog.tsx`
- Modify: `frontend/src/features/scripts/collection/CollectionTab.tsx`
- Modify: `frontend/src/features/scripts/collection/useCollection.ts`
- Rewrite test: `frontend/tests/features/scripts/collection/CollectionTab.test.tsx`

- [ ] **Step 1: Add `publishFiles` to `useCollection.ts`**

In `frontend/src/features/scripts/collection/useCollection.ts`, add this callback and include it in the returned object:

```ts
  const publishFiles = useCallback(
    async (files: { name: string; body: string }[]): Promise<string> => {
      const resp = await fetch('/api/registry/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      })
      if (resp.status === 401) throw new Error('unauthenticated')
      if (resp.status === 403) throw new Error('needs-scope')
      if (!resp.ok) throw new Error(`publish ${resp.status}`)
      const data: { pull_request_url: string } = await resp.json()
      return data.pull_request_url
    },
    []
  )
```
Add `publishFiles` to the `return { ... }`.

- [ ] **Step 2: Rewrite `CollectionRow.tsx` — collapse actions into ⋯ (drop Publish)**

Replace ENTIRELY with:

```tsx
import { MoreVertical } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { CollectionEntry } from '@/types'

type CollectionRowProps = {
  entry: CollectionEntry
  index: number
  busy: boolean
  onSaveToGist: (filename: string) => void
  onInstall: (id: string) => void
  onRemoveLocal: (filename: string) => void
  onRemoveGist: (id: string) => void
  onRemoveBoth: (entry: CollectionEntry) => void
}

export function CollectionRow({
  entry,
  index,
  busy,
  onSaveToGist,
  onInstall,
  onRemoveLocal,
  onRemoveGist,
  onRemoveBoth,
}: CollectionRowProps) {
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.06] px-3 py-3 hover:bg-white/[0.02]">
      <span className="w-6 shrink-0 text-right text-[0.72rem] tabular-nums text-[#555]">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[#e5e5e5]">{entry.title}</span>
          <span className="truncate font-mono text-[0.7rem] text-[#666]">{entry.filename}</span>
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-1 md:flex">
        <Badge variant={entry.local ? 'secondary' : 'outline'} className={entry.local ? '' : 'opacity-40'}>
          Local
        </Badge>
        <Badge variant={entry.gist ? 'secondary' : 'outline'} className={entry.gist ? '' : 'opacity-40'}>
          Gist
        </Badge>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {entry.gist && !entry.local ? (
          <Button size="sm" disabled={busy} onClick={() => onInstall(entry.id)}>
            Install
          </Button>
        ) : null}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={busy} aria-label="Actions">
              <MoreVertical className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <div className="flex flex-col">
              {entry.local && !entry.gist ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onSaveToGist(entry.filename)}
                >
                  Save to gist
                </Button>
              ) : null}
              {entry.local ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onRemoveLocal(entry.filename)}
                >
                  Remove local
                </Button>
              ) : null}
              {entry.gist ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={() => onRemoveGist(entry.id)}
                >
                  Remove from gist
                </Button>
              ) : null}
              {entry.local && entry.gist ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-destructive"
                  onClick={() => onRemoveBoth(entry)}
                >
                  Remove both
                </Button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `UploadShareDialog.tsx`**

```tsx
import { useRef, useState, type ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'

type UploadShareDialogProps = {
  onPublish: (files: { name: string; body: string }[]) => Promise<string>
  onNeedsLogin: () => void
}

export function UploadShareDialog({ onPublish, onNeedsLogin }: UploadShareDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files
    if (!list || list.length === 0) return
    setBusy(true)
    setStatus(null)
    setPrUrl(null)
    try {
      const files = await Promise.all(
        Array.from(list).map(async (f) => ({ name: f.name, body: await f.text() }))
      )
      const url = await onPublish(files)
      setPrUrl(url)
      setStatus(`Opened a pull request with ${files.length} file(s).`)
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'unauthenticated' || msg === 'needs-scope') {
        setStatus('Sign in with GitHub (sharing permission) to publish.')
        onNeedsLogin()
      } else {
        setStatus('Upload failed. Try again.')
      }
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".js,.sh,.py"
        className="hidden"
        onChange={onPick}
        aria-label="Choose scripts to share"
      />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        Upload & share
      </Button>
      {status ? (
        <span className="text-[0.72rem] text-[#999]">
          {status}
          {prUrl ? (
            <>
              {' '}
              <a className="text-foreground underline" href={prUrl} target="_blank" rel="noreferrer">
                View PR
              </a>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 4: Wire into `CollectionTab.tsx`**

In `frontend/src/features/scripts/collection/CollectionTab.tsx`:
1. Destructure `publishFiles` from `useCollection()`, and remove the now-unused `getLocalBody`/publish logic and the per-row `onPublish` prop wiring.
2. Add `import { UploadShareDialog } from './UploadShareDialog'`.
3. Remove the `publish` function and `buildMetaHeader/buildPublishUrl` import (no longer used here).
4. In the header actions area (next to Sign in / Logout), render the upload control (the dialog's prop is `onPublish`):
```tsx
          {authenticated ? (
            <UploadShareDialog onPublish={publishFiles} onNeedsLogin={() => run(startLogin)} />
          ) : null}
```
5. Update the `<CollectionRow ... />` usage to drop `onPublish` and keep the others:
```tsx
            <CollectionRow
              key={e.filename}
              entry={e}
              index={i + 1}
              busy={busy}
              onSaveToGist={guardedSave}
              onInstall={(id) => run(() => install(id))}
              onRemoveLocal={(filename) => run(() => removeLocal(filename))}
              onRemoveGist={(id) => run(() => removeGist(id))}
              onRemoveBoth={(entry) => run(() => removeBoth(entry))}
            />
```

- [ ] **Step 5: Rewrite the tab test**

Replace `frontend/tests/features/scripts/collection/CollectionTab.test.tsx` ENTIRELY with:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CollectionTab } from '@/features/scripts/collection/CollectionTab'

afterEach(() => vi.restoreAllMocks())

const view = {
  authenticated: true,
  entries: [{ id: 'a', filename: 'a.js', title: 'Alpha', local: true, gist: false }],
}

describe('CollectionTab', () => {
  it('shows entries and the Upload & share control when authenticated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    render(<CollectionTab query="" />)
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /upload & share/i })).toBeInTheDocument()
  })

  it('does not render a Publish button on rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => view }))
    render(<CollectionTab query="" />)
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Verify**

Run: `cd /Users/duytran/GitHub/argus/frontend && npx vitest run tests/features/scripts/collection/ && npx tsc -b --noEmit`
Expected: collection tests PASS. `tsc -b` may still error only on `ScriptsPage`/`CommunityTab` references to deleted `useScriptCatalog`/`BundleCard` (Task 6 deletes those). Report other errors. Then prettier the changed files.

- [ ] **Step 7: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add frontend/src/features/scripts/collection/ frontend/tests/features/scripts/collection/CollectionTab.test.tsx
git commit -m "feat(collection): consolidate row actions into ⋯; add Upload & share"
```

---

## Task 6: Frontend — delete bundle/catalog leftovers, full gate

**Files:**
- Delete: `frontend/src/features/scripts/BundleCard.tsx`, `frontend/src/features/scripts/hooks/useScriptCatalog.ts`, and their tests (`tests/features/scripts/useScriptCatalog.test.tsx`, any BundleCard test).
- Possibly delete now-unused `frontend/src/types/scripts.ts` (ScriptPackage/ScriptBundle/ScriptCatalog/BundleInstallResult) + its barrel export — only if nothing imports it.

- [ ] **Step 1: Find references**

Run: `cd /Users/duytran/GitHub/argus/frontend && grep -rln "useScriptCatalog\|BundleCard\|ScriptBundle\|BundleInstallResult\|ScriptCatalog\b" src tests`
Expected: only the files to delete + the types barrel. If `CommunityTab`/`CollectionTab` still reference them, that's a Task 4/5 miss — fix before deleting.

- [ ] **Step 2: Delete the dead files + types**

```bash
cd /Users/duytran/GitHub/argus
git rm frontend/src/features/scripts/BundleCard.tsx frontend/src/features/scripts/hooks/useScriptCatalog.ts
git rm frontend/tests/features/scripts/useScriptCatalog.test.tsx
```
If `src/types/scripts.ts` is unreferenced after Step 1, also `git rm frontend/src/types/scripts.ts` and remove its line from `frontend/src/types/index.ts`. If `ScriptPackage` is still referenced anywhere (e.g. `ScriptRow.tsx`), keep `scripts.ts`. Confirm with grep before removing.

- [ ] **Step 3: Full frontend gate**

```bash
cd /Users/duytran/GitHub/argus/frontend
npx tsc -b --noEmit
npx vitest run
npx prettier --write src/features/scripts/ tests/features/scripts/
```
Expected: `tsc -b` CLEAN; ALL vitest tests PASS. If any test references a deleted unit, delete/adjust that test and report it.

- [ ] **Step 4: Commit**

```bash
cd /Users/duytran/GitHub/argus
git add -A frontend
git commit -m "chore(scripts): delete bundle/catalog leftovers"
```

---

## Task 7: Registry migration — stage the 12 scripts (manual push)

**Files:**
- Create staging under `/tmp/argus-registry-stage` (working copy of the live registry).

> The push is an outward action the USER runs (the agent cannot create/push to the public repo). The agent stages the content + prints exact commands.

- [ ] **Step 1: Generate `@argus-meta` headers from `catalog.json`**

Write a one-off staging script that, for each package in `my-custom-hook-scripts/catalog.json`, reads `my-custom-hook-scripts/<filename>`, prepends an `@argus-meta` header (title/event/runtime/matcher/purpose), and writes it to the registry staging dir under `scripts/argus/<filename>`. Run it:

```bash
cd /Users/duytran/GitHub/argus
S=/tmp/argus-registry-stage
git -C "$S" pull --ff-only   # if the live registry was already cloned; else: git clone <registry> "$S"
mkdir -p "$S/scripts/argus"
python3 - "$S" <<'PY'
import json, sys, pathlib
S = pathlib.Path(sys.argv[1])
root = pathlib.Path("my-custom-hook-scripts")
cat = json.load(open(root / "catalog.json"))
for p in cat["packages"]:
    body = (root / p["filename"]).read_text()
    hdr = ["// @argus-meta", f"// title: {p['title']}", f"// event: {p['event']}",
           f"// runtime: {p['runtime']}"]
    if p.get("matcher"): hdr.append(f"// matcher: {p['matcher']}")
    if p.get("purpose"): hdr.append(f"// purpose: {p['purpose']}")
    hdr += ["// @end", ""]
    (S / "scripts" / "argus" / p["filename"]).write_text("\n".join(hdr) + "\n" + body)
    print("staged", p["filename"])
PY
cd "$S" && node build-index.mjs && cat index.json | head -20
```
Expected: 12 files staged under `scripts/argus/`, `index.json` lists ~13 (incl. existing `session-greeting`).

- [ ] **Step 2: Hand off the push to the user**

Print these commands for the user to run (agent must not push):
```bash
cd /tmp/argus-registry-stage
git add scripts/argus index.json
git commit -m "seed: migrate 12 official scripts (author argus)"
git push
```

- [ ] **Step 3: Verify live (after user pushes)**

Run: `curl -s https://raw.githubusercontent.com/argus-hooks/registry/main/index.json | python3 -c "import sys,json; print(len(json.load(sys.stdin)['scripts']), 'scripts')"`
Expected: ~13 scripts. The Community tab now lists all of them, author-tagged.

---

## Final verification (after all tasks)

```bash
cd /Users/duytran/GitHub/argus/backend && go build ./... && go test ./... && golangci-lint run ./...
cd ../frontend && npx tsc -b --noEmit && npx vitest run && npx prettier --check src/features/scripts
```
All must pass before finishing the branch (superpowers:finishing-a-development-branch).

**Manual smoke:** run `~/.argus/bin/argus` → Community tab is one infinite-scroll list of registry scripts (author-tagged), search finds any of them; My Collection rows use ⋯; "Upload & share" picks a local file and (after `public_repo` re-login) opens a PR.
