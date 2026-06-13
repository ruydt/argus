# Hook Scripts Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Scripts" page that browses the bundled hook-script collection (and bundles) and installs/removes scripts into `~/.argus/hooks/`.

**Architecture:** Scripts ship embedded in the Go binary via `go:embed`, synced from the repo-root `my-custom-hook-scripts/` collection by a Makefile step. A `ScriptSource` interface fronts the catalog (one `BundledSource` impl in v1; remote sources plug in later). New handler endpoints expose catalog/install/delete; install only ever writes embedded bytes to a catalog-resolved filename (no path from the request). A new React feature renders package + bundle cards with Available/Added state.

**Tech Stack:** Go 1.25 (`net/http`, `embed`, `crypto/sha256`), React 19 + TypeScript, Vitest, shadcn/ui primitives.

**Grounded refinements vs spec (deliberate):**
- `catalog.json` omits per-script `checksum`; the loader computes sha256 from embedded bytes. For `BundledSource`, `ReadScript` returns compile-time-trusted bytes (no manifest-vs-body compare — that check is meaningful only for the future `RemoteSource`, where body and checksum arrive separately). The `checksum` field still ships in the API for display + forward-compat.
- Runtime availability (`node`/`python3`/`sh` present?) is not in existing diagnostics, so the catalog handler computes `runtime_available` per package via `exec.LookPath`.

---

## File Structure

**New (backend):**
- `backend/internal/domain/scripts.go` — `ScriptCatalog`, `ScriptPackage`, `ScriptBundle`
- `backend/internal/scriptcatalog/files/` — generated: copies of `*.js` + `catalog.json` (committed; auto-generated)
- `backend/internal/scriptcatalog/embed.go` — `//go:embed files/*`
- `backend/internal/scriptcatalog/source.go` — `ScriptSource` interface + `BundledSource`
- `backend/internal/scriptcatalog/scriptcatalog_test.go` — drift guard + loader tests
- `backend/internal/handler/scripts.go` — catalog/install/install-bundle/delete handlers
- `backend/internal/handler/scripts_test.go` — black-box handler tests

**New (source collection):**
- `my-custom-hook-scripts/catalog.json` — hand-maintained manifest

**New (frontend):**
- `frontend/src/types/scripts.ts`
- `frontend/src/features/scripts/hooks/useScriptCatalog.ts`
- `frontend/src/features/scripts/ScriptCard.tsx`
- `frontend/src/features/scripts/BundleCard.tsx`
- `frontend/src/features/scripts/ScriptSourceDialog.tsx`
- `frontend/src/features/scripts/ScriptsPage.tsx`
- `frontend/src/features/scripts/__tests__/useScriptCatalog.test.tsx`
- `frontend/src/features/scripts/__tests__/ScriptCard.test.tsx`

**Modified:**
- `Makefile` — `sync-scripts` target + `build-local` prereq
- `backend/internal/server/router.go` — 4 routes + source construction
- `frontend/src/types/index.ts` — barrel export
- `frontend/src/App.tsx` — lazy route
- `frontend/src/app/Sidebar.tsx` — nav item
- `CLAUDE.md` — document new surface + generated-dir convention

---

## Task 1: Manifest + sync step (embed source of truth)

**Files:**
- Create: `my-custom-hook-scripts/catalog.json`
- Create: `backend/internal/scriptcatalog/files/.gitkeep`
- Modify: `Makefile`

- [ ] **Step 1: Author the manifest**

Create `my-custom-hook-scripts/catalog.json`:

```json
{
  "schema_version": 1,
  "packages": [
    {
      "id": "block-dangerous",
      "filename": "block-dangerous.js",
      "version": "1.0.0",
      "title": "Block dangerous commands",
      "purpose": "Deny dangerous shell commands (rm -rf ~, curl | sh, force-push to main, mkfs) with a reason the agent can act on.",
      "event": "PreToolUse",
      "matcher": "Bash",
      "runtime": "node",
      "agents": ["claude-code", "codex"],
      "author": "argus",
      "source": "https://github.com/argus-hooks/argus/tree/main/my-custom-hook-scripts",
      "tier": "official"
    },
    {
      "id": "protect-secrets",
      "filename": "protect-secrets.js",
      "version": "1.0.0",
      "title": "Protect secret files",
      "purpose": "Deny access to secret files (.env, *.pem, ~/.ssh/, ~/.aws/). .env.example/sample/template and secrets.test/spec.* are allowed.",
      "event": "PreToolUse",
      "matcher": "Read|Edit|Write|Bash",
      "runtime": "node",
      "agents": ["claude-code", "codex"],
      "author": "argus",
      "source": "https://github.com/argus-hooks/argus/tree/main/my-custom-hook-scripts",
      "tier": "official"
    },
    {
      "id": "cost-warn",
      "filename": "cost-warn.js",
      "version": "1.0.0",
      "title": "Cost warning",
      "purpose": "Warn when token usage in the rolling 5h window crosses a threshold. Silent otherwise.",
      "event": "SessionStart",
      "matcher": "",
      "runtime": "node",
      "agents": ["claude-code", "codex"],
      "author": "argus",
      "source": "https://github.com/argus-hooks/argus/tree/main/my-custom-hook-scripts",
      "tier": "official"
    },
    {
      "id": "permission-request",
      "filename": "permission-request.js",
      "version": "1.0.0",
      "title": "Permission request dialog",
      "purpose": "Native macOS approval dialog with an Always list.",
      "event": "PermissionRequest",
      "matcher": "",
      "runtime": "node",
      "agents": ["claude-code", "codex"],
      "author": "argus",
      "source": "https://github.com/argus-hooks/argus/tree/main/my-custom-hook-scripts",
      "tier": "official"
    },
    {
      "id": "stop",
      "filename": "stop.js",
      "version": "1.0.0",
      "title": "Stop notification",
      "purpose": "Local notification when the agent finishes.",
      "event": "Stop",
      "matcher": "",
      "runtime": "node",
      "agents": ["claude-code", "codex"],
      "author": "argus",
      "source": "https://github.com/argus-hooks/argus/tree/main/my-custom-hook-scripts",
      "tier": "official"
    },
    {
      "id": "argus-activate-local",
      "filename": "argus-activate-local.js",
      "version": "1.0.0",
      "title": "Argus liveness banner",
      "purpose": "Argus liveness banner with event/session counts at session start.",
      "event": "SessionStart",
      "matcher": "",
      "runtime": "node",
      "agents": ["claude-code", "codex"],
      "author": "argus",
      "source": "https://github.com/argus-hooks/argus/tree/main/my-custom-hook-scripts",
      "tier": "official"
    },
    {
      "id": "format-lint",
      "filename": "format-lint.js",
      "version": "1.0.0",
      "title": "Format & lint on edit",
      "purpose": "Auto-format the edited file (prettier/ruff/gofmt, single-file) and feed lint errors back so the agent fixes them.",
      "event": "PostToolUse",
      "matcher": "Edit|Write|MultiEdit",
      "runtime": "node",
      "agents": ["claude-code", "codex"],
      "author": "argus",
      "source": "https://github.com/argus-hooks/argus/tree/main/my-custom-hook-scripts",
      "tier": "official"
    },
    {
      "id": "protect-branch",
      "filename": "protect-branch.js",
      "version": "1.0.0",
      "title": "Protect branches",
      "purpose": "Deny git commit/push/branch-deletion on protected branches (main, master); suggests a feature branch.",
      "event": "PreToolUse",
      "matcher": "Bash",
      "runtime": "node",
      "agents": ["claude-code", "codex"],
      "author": "argus",
      "source": "https://github.com/argus-hooks/argus/tree/main/my-custom-hook-scripts",
      "tier": "official"
    },
    {
      "id": "notify-webhook",
      "filename": "notify-webhook.js",
      "version": "1.0.0",
      "title": "Notify webhook",
      "purpose": "Slack / Discord / ntfy / Telegram / custom webhook when the agent finishes or needs attention. Rate-limited; silent without config.",
      "event": "Stop",
      "matcher": "",
      "runtime": "node",
      "agents": ["claude-code", "codex"],
      "author": "argus",
      "source": "https://github.com/argus-hooks/argus/tree/main/my-custom-hook-scripts",
      "tier": "official"
    },
    {
      "id": "git-autostage",
      "filename": "git-autostage.js",
      "version": "1.0.0",
      "title": "Git autostage",
      "purpose": "Opt-in checkpoint per agent turn: git add -u (tracked files only), optional local commit, never pushes.",
      "event": "Stop",
      "matcher": "",
      "runtime": "node",
      "agents": ["claude-code", "codex"],
      "author": "argus",
      "source": "https://github.com/argus-hooks/argus/tree/main/my-custom-hook-scripts",
      "tier": "official"
    },
    {
      "id": "scan-injection",
      "filename": "scan-injection.js",
      "version": "1.0.0",
      "title": "Prompt-injection scanner",
      "purpose": "Warn-only prompt-injection scanner on tool output. Injects a caution into context instead of blocking.",
      "event": "PostToolUse",
      "matcher": "Read|WebFetch|WebSearch|Grep|Bash|Task",
      "runtime": "node",
      "agents": ["claude-code", "codex"],
      "author": "argus",
      "source": "https://github.com/argus-hooks/argus/tree/main/my-custom-hook-scripts",
      "tier": "official"
    },
    {
      "id": "inject-context",
      "filename": "inject-context.js",
      "version": "1.0.0",
      "title": "Inject context",
      "purpose": "Inject just-in-time context per prompt: git branch + working-tree state, plus .argus-context.md or ~/.argus/context.md if present.",
      "event": "UserPromptSubmit",
      "matcher": "",
      "runtime": "node",
      "agents": ["claude-code", "codex"],
      "author": "argus",
      "source": "https://github.com/argus-hooks/argus/tree/main/my-custom-hook-scripts",
      "tier": "official"
    }
  ],
  "bundles": [
    {
      "id": "safety-starter",
      "title": "Safety starter pack",
      "description": "Sensible guardrails for any project: block dangerous commands, protect secrets, protect branches.",
      "packages": ["block-dangerous", "protect-secrets", "protect-branch"]
    },
    {
      "id": "notifications",
      "title": "Notifications",
      "description": "Get told when the agent finishes or needs you.",
      "packages": ["stop", "notify-webhook"]
    }
  ]
}
```

- [ ] **Step 2: Create the generated dir placeholder**

Create `backend/internal/scriptcatalog/files/.gitkeep` (empty file). Keeps the dir present before the first sync.

- [ ] **Step 3: Add the sync target to `Makefile`**

At the top, after the `DIST :=` line, add:

```makefile
SCRIPTS_SRC  := my-custom-hook-scripts
SCRIPTS_DST  := backend/internal/scriptcatalog/files
```

Change the `.PHONY` line to:

```makefile
.PHONY: build-local clean sync-scripts
```

Add this target (tabs, not spaces, for recipe lines):

```makefile
# Sync the public hook-script collection into the Go embed dir.
# The collection lives at repo root (outside the Go module), so go:embed
# cannot reach it directly — copy the *.js + manifest into the package.
sync-scripts:
	@mkdir -p $(SCRIPTS_DST)
	@find $(SCRIPTS_DST) -type f ! -name '.gitkeep' -delete
	cp $(SCRIPTS_SRC)/*.js $(SCRIPTS_DST)/
	cp $(SCRIPTS_SRC)/catalog.json $(SCRIPTS_DST)/
	@echo "Synced scripts → $(SCRIPTS_DST)"
```

Make `build-local` depend on it — change the target line:

```makefile
build-local: sync-scripts
```

- [ ] **Step 4: Run the sync**

Run: `make sync-scripts`
Expected: prints `Synced scripts → backend/internal/scriptcatalog/files`. The dir now holds 12 `.js` files + `catalog.json`.

Verify: `ls backend/internal/scriptcatalog/files | wc -l` → `14` (12 js + catalog.json + .gitkeep).

- [ ] **Step 5: Commit**

```bash
git add my-custom-hook-scripts/catalog.json Makefile backend/internal/scriptcatalog/files
git commit -m "feat(scripts): add catalog manifest + embed sync step"
```

---

## Task 2: Domain types

**Files:**
- Create: `backend/internal/domain/scripts.go`

- [ ] **Step 1: Write the types**

Create `backend/internal/domain/scripts.go`:

```go
package domain

// ScriptCatalog is what a ScriptSource offers, plus per-request install state.
type ScriptCatalog struct {
	Packages []ScriptPackage `json:"packages"`
	Bundles  []ScriptBundle  `json:"bundles"`
}

// ScriptPackage is one hook script's metadata, body, and install state.
type ScriptPackage struct {
	ID               string   `json:"id"`
	Filename         string   `json:"filename"`
	Version          string   `json:"version"`
	Title            string   `json:"title"`
	Purpose          string   `json:"purpose"`
	Event            string   `json:"event"`
	Matcher          string   `json:"matcher,omitempty"`
	Runtime          string   `json:"runtime"` // node | python3 | sh
	Agents           []string `json:"agents"`
	Author           string   `json:"author"`
	Source           string   `json:"source"`   // provenance URL
	Tier             string   `json:"tier"`     // official | community
	Checksum         string   `json:"checksum"` // sha256:<hex> of Body (loader-computed)
	Body             string   `json:"body"`     // full script text (read-only display)
	Installed        bool     `json:"installed"`
	RuntimeAvailable bool     `json:"runtime_available"`
}

// ScriptBundle is a named set of package ids installed together.
type ScriptBundle struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Packages    []string `json:"packages"`
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd backend && go build ./...`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add backend/internal/domain/scripts.go
git commit -m "feat(scripts): add domain types for catalog/package/bundle"
```

---

## Task 3: `scriptcatalog` package (embed + BundledSource)

**Files:**
- Create: `backend/internal/scriptcatalog/embed.go`
- Create: `backend/internal/scriptcatalog/source.go`
- Test: `backend/internal/scriptcatalog/scriptcatalog_test.go`

- [ ] **Step 1: Write the embed declaration**

Create `backend/internal/scriptcatalog/embed.go`:

```go
package scriptcatalog

import "embed"

// bundledFS holds the synced hook-script collection + manifest.
// Populated by `make sync-scripts` from the repo-root my-custom-hook-scripts/.
//
//go:embed files/*.js files/catalog.json
var bundledFS embed.FS
```

- [ ] **Step 2: Write the source (interface + BundledSource)**

Create `backend/internal/scriptcatalog/source.go`:

```go
package scriptcatalog

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path"

	"argus/internal/domain"
)

// ScriptSource provides a catalog of hook scripts and their bodies.
// v1 ships one implementation (BundledSource); remote sources plug in later.
type ScriptSource interface {
	Catalog(ctx context.Context) (domain.ScriptCatalog, error)
	ReadScript(ctx context.Context, id string) ([]byte, error)
	Tier() string
}

// BundledSource serves scripts embedded in the binary.
type BundledSource struct{}

func NewBundledSource() *BundledSource { return &BundledSource{} }

func (BundledSource) Tier() string { return "official" }

// manifest mirrors files/catalog.json. Packages decode straight into
// domain.ScriptPackage (Body/Checksum/Installed/RuntimeAvailable stay zero
// and are filled by the loader / handler).
type manifest struct {
	SchemaVersion int                    `json:"schema_version"`
	Packages      []domain.ScriptPackage `json:"packages"`
	Bundles       []domain.ScriptBundle  `json:"bundles"`
}

func (s BundledSource) loadManifest() (manifest, error) {
	raw, err := bundledFS.ReadFile("files/catalog.json")
	if err != nil {
		return manifest{}, fmt.Errorf("read manifest: %w", err)
	}
	var m manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return manifest{}, fmt.Errorf("parse manifest: %w", err)
	}
	return m, nil
}

// Catalog returns every package (with Body + loader-computed Checksum) and bundle.
func (s BundledSource) Catalog(_ context.Context) (domain.ScriptCatalog, error) {
	m, err := s.loadManifest()
	if err != nil {
		return domain.ScriptCatalog{}, err
	}
	pkgs := make([]domain.ScriptPackage, 0, len(m.Packages))
	for _, p := range m.Packages {
		body, err := bundledFS.ReadFile(path.Join("files", p.Filename))
		if err != nil {
			return domain.ScriptCatalog{}, fmt.Errorf("read script %s: %w", p.ID, err)
		}
		p.Body = string(body)
		p.Checksum = checksum(body)
		pkgs = append(pkgs, p)
	}
	return domain.ScriptCatalog{Packages: pkgs, Bundles: m.Bundles}, nil
}

// ReadScript returns the embedded body for one package id.
func (s BundledSource) ReadScript(_ context.Context, id string) ([]byte, error) {
	m, err := s.loadManifest()
	if err != nil {
		return nil, err
	}
	for _, p := range m.Packages {
		if p.ID == id {
			return bundledFS.ReadFile(path.Join("files", p.Filename))
		}
	}
	return nil, fmt.Errorf("unknown script id %q", id)
}

func checksum(b []byte) string {
	sum := sha256.Sum256(b)
	return "sha256:" + hex.EncodeToString(sum[:])
}
```

- [ ] **Step 3: Write the failing tests**

Create `backend/internal/scriptcatalog/scriptcatalog_test.go`:

```go
package scriptcatalog

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestCatalogLoadsAllPackagesAndBundles(t *testing.T) {
	cat, err := NewBundledSource().Catalog(context.Background())
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}
	if len(cat.Packages) != 12 {
		t.Fatalf("packages = %d, want 12", len(cat.Packages))
	}
	if len(cat.Bundles) != 2 {
		t.Fatalf("bundles = %d, want 2", len(cat.Bundles))
	}
	for _, p := range cat.Packages {
		if p.ID == "" || p.Filename == "" || p.Body == "" {
			t.Errorf("package %+v missing id/filename/body", p)
		}
		if len(p.Checksum) != len("sha256:")+64 {
			t.Errorf("package %s checksum = %q, want sha256:<64 hex>", p.ID, p.Checksum)
		}
	}
}

func TestReadScriptKnownAndUnknown(t *testing.T) {
	src := NewBundledSource()
	body, err := src.ReadScript(context.Background(), "block-dangerous")
	if err != nil {
		t.Fatalf("ReadScript(known) error = %v", err)
	}
	if len(body) == 0 {
		t.Fatal("ReadScript(known) returned empty body")
	}
	if _, err := src.ReadScript(context.Background(), "does-not-exist"); err == nil {
		t.Fatal("ReadScript(unknown) error = nil, want error")
	}
}

// TestEmbedMatchesSourceCollection is the drift guard: every embedded .js must
// byte-match the repo-root source, and every bundle package id must resolve.
func TestEmbedMatchesSourceCollection(t *testing.T) {
	cat, err := NewBundledSource().Catalog(context.Background())
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}
	ids := map[string]bool{}
	for _, p := range cat.Packages {
		ids[p.ID] = true
		srcPath := filepath.Join("..", "..", "..", "my-custom-hook-scripts", p.Filename)
		want, err := os.ReadFile(srcPath)
		if err != nil {
			t.Fatalf("read source %s: %v (run `make sync-scripts`)", srcPath, err)
		}
		if string(want) != p.Body {
			t.Errorf("embedded %s differs from source — run `make sync-scripts`", p.Filename)
		}
	}
	for _, b := range cat.Bundles {
		for _, pid := range b.Packages {
			if !ids[pid] {
				t.Errorf("bundle %s references unknown package %q", b.ID, pid)
			}
		}
	}
}
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && go test ./internal/scriptcatalog/...`
Expected: PASS (files already synced in Task 1). If `read source` fails, run `make sync-scripts` from repo root first.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/scriptcatalog/embed.go backend/internal/scriptcatalog/source.go backend/internal/scriptcatalog/scriptcatalog_test.go
git commit -m "feat(scripts): add ScriptSource interface + embedded BundledSource"
```

---

## Task 4: HTTP handlers

**Files:**
- Create: `backend/internal/handler/scripts.go`
- Test: `backend/internal/handler/scripts_test.go`

- [ ] **Step 1: Write the handlers**

Create `backend/internal/handler/scripts.go`:

```go
package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"

	"argus/internal/domain"
	"argus/internal/scriptcatalog"
)

// hooksDir returns ~/.argus/hooks for the given argus home dir.
func hooksDir(argusDir string) string { return filepath.Join(argusDir, "hooks") }

// loadCatalogWithState returns the catalog with Installed + RuntimeAvailable filled in.
func loadCatalogWithState(src scriptcatalog.ScriptSource, argusDir string) (domain.ScriptCatalog, error) {
	cat, err := src.Catalog(nil)
	if err != nil {
		return domain.ScriptCatalog{}, err
	}
	dir := hooksDir(argusDir)
	runtimeCache := map[string]bool{}
	for i := range cat.Packages {
		p := &cat.Packages[i]
		_, statErr := os.Stat(filepath.Join(dir, p.Filename))
		p.Installed = statErr == nil
		avail, ok := runtimeCache[p.Runtime]
		if !ok {
			_, lookErr := exec.LookPath(p.Runtime)
			avail = lookErr == nil
			runtimeCache[p.Runtime] = avail
		}
		p.RuntimeAvailable = avail
	}
	return cat, nil
}

func findPackage(cat domain.ScriptCatalog, id string) (domain.ScriptPackage, bool) {
	for _, p := range cat.Packages {
		if p.ID == id {
			return p, true
		}
	}
	return domain.ScriptPackage{}, false
}

func findBundle(cat domain.ScriptCatalog, id string) (domain.ScriptBundle, bool) {
	for _, b := range cat.Bundles {
		if b.ID == id {
			return b, true
		}
	}
	return domain.ScriptBundle{}, false
}

// installOne writes a package's embedded bytes to ~/.argus/hooks/<filename>.
// Never overwrites: returns os.ErrExist if the file is already present.
func installOne(src scriptcatalog.ScriptSource, argusDir string, p domain.ScriptPackage) error {
	dir := hooksDir(argusDir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	target := filepath.Join(dir, p.Filename)
	if _, err := os.Stat(target); err == nil {
		return os.ErrExist
	}
	body, err := src.ReadScript(nil, p.ID)
	if err != nil {
		return err
	}
	return os.WriteFile(target, body, 0o755)
}

// ScriptsCatalog returns the full catalog with install + runtime state.
func ScriptsCatalog(src scriptcatalog.ScriptSource, argusDir string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		cat, err := loadCatalogWithState(src, argusDir)
		if err != nil {
			log.Printf("[scripts] catalog err=%v", err)
			http.Error(w, "failed to load catalog", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(cat); err != nil {
			log.Printf("[scripts] encode catalog: %v", err)
		}
	})
}

type scriptIDRequest struct {
	ID string `json:"id"`
}

// ScriptsInstall writes one bundled script into ~/.argus/hooks/.
func ScriptsInstall(src scriptcatalog.ScriptSource, argusDir string) http.Handler {
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
		cat, err := loadCatalogWithState(src, argusDir)
		if err != nil {
			http.Error(w, "failed to load catalog", http.StatusInternalServerError)
			return
		}
		p, ok := findPackage(cat, req.ID)
		if !ok {
			http.Error(w, "unknown script", http.StatusBadRequest)
			return
		}
		switch err := installOne(src, argusDir, p); {
		case errors.Is(err, os.ErrExist):
			http.Error(w, "script already installed", http.StatusConflict)
			return
		case err != nil:
			log.Printf("[scripts] install id=%s err=%v", p.ID, err)
			http.Error(w, "install failed", http.StatusInternalServerError)
			return
		}
		p.Installed = true
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(p); err != nil {
			log.Printf("[scripts] encode install: %v", err)
		}
	})
}

type bundleInstallResult struct {
	ID     string `json:"id"`
	Status string `json:"status"` // installed | skipped | error
}

// ScriptsInstallBundle installs every missing member of a bundle.
func ScriptsInstallBundle(src scriptcatalog.ScriptSource, argusDir string) http.Handler {
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
		cat, err := loadCatalogWithState(src, argusDir)
		if err != nil {
			http.Error(w, "failed to load catalog", http.StatusInternalServerError)
			return
		}
		b, ok := findBundle(cat, req.ID)
		if !ok {
			http.Error(w, "unknown bundle", http.StatusBadRequest)
			return
		}
		results := make([]bundleInstallResult, 0, len(b.Packages))
		for _, pid := range b.Packages {
			p, found := findPackage(cat, pid)
			if !found {
				results = append(results, bundleInstallResult{ID: pid, Status: "error"})
				continue
			}
			switch err := installOne(src, argusDir, p); {
			case errors.Is(err, os.ErrExist):
				results = append(results, bundleInstallResult{ID: pid, Status: "skipped"})
			case err != nil:
				log.Printf("[scripts] bundle install id=%s err=%v", pid, err)
				results = append(results, bundleInstallResult{ID: pid, Status: "error"})
			default:
				results = append(results, bundleInstallResult{ID: pid, Status: "installed"})
			}
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(results); err != nil {
			log.Printf("[scripts] encode bundle: %v", err)
		}
	})
}

// ScriptsDelete removes an installed script from ~/.argus/hooks/.
func ScriptsDelete(src scriptcatalog.ScriptSource, argusDir string) http.Handler {
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
		cat, err := loadCatalogWithState(src, argusDir)
		if err != nil {
			http.Error(w, "failed to load catalog", http.StatusInternalServerError)
			return
		}
		p, ok := findPackage(cat, id)
		if !ok {
			http.Error(w, "unknown script", http.StatusBadRequest)
			return
		}
		if err := os.Remove(filepath.Join(hooksDir(argusDir), p.Filename)); err != nil && !errors.Is(err, os.ErrNotExist) {
			log.Printf("[scripts] delete id=%s err=%v", id, err)
			http.Error(w, "delete failed", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}
```

Note: handlers pass `nil` as the `context.Context` to `src` methods — `BundledSource` ignores it. (A later remote source would thread `r.Context()`.)

- [ ] **Step 2: Write the failing tests**

Create `backend/internal/handler/scripts_test.go`:

```go
package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"argus/internal/domain"
	"argus/internal/handler"
	"argus/internal/scriptcatalog"
)

func newSrc() scriptcatalog.ScriptSource { return scriptcatalog.NewBundledSource() }

func TestScriptsCatalogReturnsPackagesWithState(t *testing.T) {
	dir := t.TempDir()
	// Pre-install one script so Installed flips true.
	if err := os.MkdirAll(filepath.Join(dir, "hooks"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "hooks", "stop.js"), []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	handler.ScriptsCatalog(newSrc(), dir).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/scripts/catalog", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var cat domain.ScriptCatalog
	if err := json.Unmarshal(rec.Body.Bytes(), &cat); err != nil {
		t.Fatal(err)
	}
	if len(cat.Packages) != 12 {
		t.Fatalf("packages = %d, want 12", len(cat.Packages))
	}
	var stop domain.ScriptPackage
	for _, p := range cat.Packages {
		if p.ID == "stop" {
			stop = p
		}
	}
	if !stop.Installed {
		t.Error("stop.Installed = false, want true (pre-installed)")
	}
}

func TestScriptsInstallWritesFile(t *testing.T) {
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/scripts/install", strings.NewReader(`{"id":"block-dangerous"}`))
	handler.ScriptsInstall(newSrc(), dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	info, err := os.Stat(filepath.Join(dir, "hooks", "block-dangerous.js"))
	if err != nil {
		t.Fatalf("script not written: %v", err)
	}
	if info.Mode().Perm() != 0o755 {
		t.Errorf("perm = %v, want 0755", info.Mode().Perm())
	}
}

func TestScriptsInstallExistingReturns409(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "hooks"), 0o755); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(dir, "hooks", "block-dangerous.js")
	if err := os.WriteFile(target, []byte("ORIGINAL"), 0o644); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/scripts/install", strings.NewReader(`{"id":"block-dangerous"}`))
	handler.ScriptsInstall(newSrc(), dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
	got, _ := os.ReadFile(target)
	if string(got) != "ORIGINAL" {
		t.Error("existing file was overwritten")
	}
}

func TestScriptsInstallUnknownReturns400(t *testing.T) {
	dir := t.TempDir()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/scripts/install", strings.NewReader(`{"id":"../etc/passwd"}`))
	handler.ScriptsInstall(newSrc(), dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Error("unknown install wrote something to argus dir")
	}
}

func TestScriptsInstallBundleInstallsMissingSkipsExisting(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "hooks"), 0o755); err != nil {
		t.Fatal(err)
	}
	// Pre-install one bundle member.
	if err := os.WriteFile(filepath.Join(dir, "hooks", "block-dangerous.js"), []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/scripts/install-bundle", strings.NewReader(`{"id":"safety-starter"}`))
	handler.ScriptsInstallBundle(newSrc(), dir).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var results []struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &results); err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, r := range results {
		got[r.ID] = r.Status
	}
	if got["block-dangerous"] != "skipped" {
		t.Errorf("block-dangerous = %q, want skipped", got["block-dangerous"])
	}
	if got["protect-secrets"] != "installed" {
		t.Errorf("protect-secrets = %q, want installed", got["protect-secrets"])
	}
}

func TestScriptsDeleteRemovesAndIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "hooks"), 0o755); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(dir, "hooks", "stop.js")
	if err := os.WriteFile(target, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	del := handler.ScriptsDelete(newSrc(), dir)

	rec := httptest.NewRecorder()
	del.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/scripts/installed?id=stop", nil))
	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if _, err := os.Stat(target); !os.IsNotExist(err) {
		t.Error("file not removed")
	}
	// Idempotent: deleting again still succeeds.
	rec2 := httptest.NewRecorder()
	del.ServeHTTP(rec2, httptest.NewRequest(http.MethodDelete, "/api/scripts/installed?id=stop", nil))
	if rec2.Code != http.StatusNoContent {
		t.Fatalf("second delete status = %d, want 204", rec2.Code)
	}
}
```

- [ ] **Step 3: Run the tests**

Run: `cd backend && go test ./internal/handler/ -run TestScripts`
Expected: PASS (all six).

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handler/scripts.go backend/internal/handler/scripts_test.go
git commit -m "feat(scripts): add catalog/install/install-bundle/delete handlers"
```

---

## Task 5: Router wiring + backend gate

**Files:**
- Modify: `backend/internal/server/router.go`

- [ ] **Step 1: Add the import**

In `backend/internal/server/router.go`, add to the import block:

```go
	"argus/internal/scriptcatalog"
```

- [ ] **Step 2: Register the routes**

Immediately before the `mux.Handle("GET /", ui.Handler())` line, add:

```go
	scriptSrc := scriptcatalog.NewBundledSource()
	mux.Handle("GET /api/scripts/catalog", handler.ScriptsCatalog(scriptSrc, opts.ArgusDir))
	mux.Handle("POST /api/scripts/install", handler.ScriptsInstall(scriptSrc, opts.ArgusDir))
	mux.Handle("POST /api/scripts/install-bundle", handler.ScriptsInstallBundle(scriptSrc, opts.ArgusDir))
	mux.Handle("DELETE /api/scripts/installed", handler.ScriptsDelete(scriptSrc, opts.ArgusDir))
```

- [ ] **Step 3: Run the full backend gate**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: build clean, all tests pass, no lint errors.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/server/router.go
git commit -m "feat(scripts): wire scripts endpoints into router"
```

---

## Task 6: Frontend types

**Files:**
- Create: `frontend/src/types/scripts.ts`
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Write the types**

Create `frontend/src/types/scripts.ts` (mirror backend JSON tags exactly):

```ts
export type ScriptPackage = {
  id: string
  filename: string
  version: string
  title: string
  purpose: string
  event: string
  matcher?: string
  runtime: string
  agents: string[]
  author: string
  source: string
  tier: string
  checksum: string
  body: string
  installed: boolean
  runtime_available: boolean
}

export type ScriptBundle = {
  id: string
  title: string
  description: string
  packages: string[]
}

export type ScriptCatalog = {
  packages: ScriptPackage[]
  bundles: ScriptBundle[]
}

export type BundleInstallResult = {
  id: string
  status: 'installed' | 'skipped' | 'error'
}
```

- [ ] **Step 2: Export from the barrel**

In `frontend/src/types/index.ts`, append:

```ts
export type { ScriptPackage, ScriptBundle, ScriptCatalog, BundleInstallResult } from './scripts'
```

- [ ] **Step 3: Verify types**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/scripts.ts frontend/src/types/index.ts
git commit -m "feat(scripts): add frontend catalog types"
```

---

## Task 7: `useScriptCatalog` hook

**Files:**
- Create: `frontend/src/features/scripts/hooks/useScriptCatalog.ts`
- Test: `frontend/src/features/scripts/__tests__/useScriptCatalog.test.tsx`

- [ ] **Step 1: Write the hook**

Create `frontend/src/features/scripts/hooks/useScriptCatalog.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'

import type { ScriptCatalog } from '@/types'

type State = {
  catalog: ScriptCatalog | null
  loading: boolean
  error: string | null
}

export function useScriptCatalog() {
  const [state, setState] = useState<State>({ catalog: null, loading: true, error: null })

  const reload = useCallback(async () => {
    try {
      const resp = await fetch('/api/scripts/catalog')
      if (!resp.ok) throw new Error(`catalog ${resp.status}`)
      const catalog: ScriptCatalog = await resp.json()
      setState({ catalog, loading: false, error: null })
    } catch (e) {
      setState({ catalog: null, loading: false, error: (e as Error).message })
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const install = useCallback(
    async (id: string) => {
      const resp = await fetch('/api/scripts/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!resp.ok) throw new Error(`install ${resp.status}`)
      await reload()
    },
    [reload]
  )

  const installBundle = useCallback(
    async (id: string) => {
      const resp = await fetch('/api/scripts/install-bundle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!resp.ok) throw new Error(`install-bundle ${resp.status}`)
      await reload()
    },
    [reload]
  )

  const remove = useCallback(
    async (id: string) => {
      const resp = await fetch(`/api/scripts/installed?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!resp.ok) throw new Error(`delete ${resp.status}`)
      await reload()
    },
    [reload]
  )

  return { ...state, reload, install, installBundle, remove }
}
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/features/scripts/__tests__/useScriptCatalog.test.tsx`:

```tsx
import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useScriptCatalog } from '../hooks/useScriptCatalog'

const catalog = {
  packages: [
    { id: 'stop', filename: 'stop.js', installed: false, runtime_available: true },
  ],
  bundles: [],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useScriptCatalog', () => {
  it('loads the catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(catalog) }))
    )
    const { result } = renderHook(() => useScriptCatalog())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.catalog?.packages[0].id).toBe('stop')
  })

  it('posts install then reloads', async () => {
    const fetchMock = vi.fn((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST') return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      return Promise.resolve({ ok: true, json: () => Promise.resolve(catalog) })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useScriptCatalog())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.install('stop')
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/scripts/install',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('surfaces an error on failed load', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 })))
    const { result } = renderHook(() => useScriptCatalog())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('500')
  })
})
```

- [ ] **Step 3: Run the test**

Run: `cd frontend && npx vitest run src/features/scripts/__tests__/useScriptCatalog.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/scripts/hooks/useScriptCatalog.ts frontend/src/features/scripts/__tests__/useScriptCatalog.test.tsx
git commit -m "feat(scripts): add useScriptCatalog hook"
```

---

## Task 8: Cards, source dialog, page

**Files:**
- Create: `frontend/src/features/scripts/ScriptCard.tsx`
- Create: `frontend/src/features/scripts/ScriptSourceDialog.tsx`
- Create: `frontend/src/features/scripts/BundleCard.tsx`
- Create: `frontend/src/features/scripts/ScriptsPage.tsx`
- Test: `frontend/src/features/scripts/__tests__/ScriptCard.test.tsx`

> Note: this repo uses `Dialog` via shadcn. Confirm it exists: `ls frontend/src/components/ui/dialog.tsx`. If absent, run `npx shadcn@latest add dialog` from `frontend/` before Step 2 (CLAUDE.md: never hand-write ui primitives).

- [ ] **Step 1: Write the source dialog**

Create `frontend/src/features/scripts/ScriptSourceDialog.tsx`:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import type { ScriptPackage } from '@/types'

type ScriptSourceDialogProps = {
  script: ScriptPackage
}

export function ScriptSourceDialog({ script }: ScriptSourceDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          View source
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{script.filename}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] rounded-md border">
          <pre className="p-4 text-xs leading-relaxed">{script.body}</pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Write the script card**

Create `frontend/src/features/scripts/ScriptCard.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ScriptPackage } from '@/types'

import { ScriptSourceDialog } from './ScriptSourceDialog'

type ScriptCardProps = {
  script: ScriptPackage
  onInstall: (id: string) => void
  onDelete: (id: string) => void
  busy: boolean
}

export function ScriptCard({ script, onInstall, onDelete, busy }: ScriptCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{script.title}</CardTitle>
          {script.installed ? (
            <Badge variant="secondary">Added</Badge>
          ) : (
            <Badge variant="outline">Available</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{script.purpose}</p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{script.event}</Badge>
          {script.matcher ? <Badge variant="outline">{script.matcher}</Badge> : null}
          <Badge variant="outline">{script.tier === 'official' ? 'Official' : script.tier}</Badge>
        </div>
        {!script.runtime_available ? (
          <p className="text-xs text-amber-600">Needs `{script.runtime}` installed to run.</p>
        ) : null}
        <div className="flex gap-2">
          <ScriptSourceDialog script={script} />
          {script.installed ? (
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => onDelete(script.id)}>
              Delete
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => onInstall(script.id)}>
              Install
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Write the bundle card**

Create `frontend/src/features/scripts/BundleCard.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ScriptBundle, ScriptPackage } from '@/types'

type BundleCardProps = {
  bundle: ScriptBundle
  packages: ScriptPackage[]
  onInstallBundle: (id: string) => void
  busy: boolean
}

export function BundleCard({ bundle, packages, onInstallBundle, busy }: BundleCardProps) {
  const members = packages.filter((p) => bundle.packages.includes(p.id))
  const installedCount = members.filter((p) => p.installed).length
  const allInstalled = members.length > 0 && installedCount === members.length
  const label = allInstalled
    ? 'Fully installed'
    : installedCount > 0
      ? `${installedCount}/${members.length} installed`
      : 'Available'

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{bundle.title}</CardTitle>
          <Badge variant={allInstalled ? 'secondary' : 'outline'}>{label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{bundle.description}</p>
        <div className="flex flex-wrap gap-1">
          {members.map((p) => (
            <Badge key={p.id} variant="outline">
              {p.title}
            </Badge>
          ))}
        </div>
        <Button size="sm" disabled={busy || allInstalled} onClick={() => onInstallBundle(bundle.id)}>
          {allInstalled ? 'Installed' : 'Install bundle'}
        </Button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Write the page**

Create `frontend/src/features/scripts/ScriptsPage.tsx`:

```tsx
import { useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

import { useScriptCatalog } from './hooks/useScriptCatalog'
import { ScriptCard } from './ScriptCard'
import { BundleCard } from './BundleCard'

export function ScriptsPage() {
  const { catalog, loading, error, install, installBundle, remove } = useScriptCatalog()
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
      <div className="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    )
  }

  if (error || !catalog) {
    return <p className="p-6 text-sm text-destructive">Failed to load scripts: {error}</p>
  }

  return (
    <div className="space-y-8 p-6">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Bundles</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {catalog.bundles.map((b) => (
            <BundleCard
              key={b.id}
              bundle={b}
              packages={catalog.packages}
              busy={busy}
              onInstallBundle={(id) => run(() => installBundle(id))}
            />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">All scripts</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {catalog.packages.map((p) => (
            <ScriptCard
              key={p.id}
              script={p}
              busy={busy}
              onInstall={(id) => run(() => install(id))}
              onDelete={(id) => run(() => remove(id))}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Write the card test**

Create `frontend/src/features/scripts/__tests__/ScriptCard.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ScriptCard } from '../ScriptCard'
import type { ScriptPackage } from '@/types'

const base: ScriptPackage = {
  id: 'block-dangerous',
  filename: 'block-dangerous.js',
  version: '1.0.0',
  title: 'Block dangerous commands',
  purpose: 'Deny dangerous shell commands.',
  event: 'PreToolUse',
  matcher: 'Bash',
  runtime: 'node',
  agents: ['claude-code'],
  author: 'argus',
  source: 'https://example.com',
  tier: 'official',
  checksum: 'sha256:abc',
  body: 'console.log(1)',
  installed: false,
  runtime_available: true,
}

describe('ScriptCard', () => {
  it('shows Install when available and fires onInstall', () => {
    const onInstall = vi.fn()
    render(<ScriptCard script={base} onInstall={onInstall} onDelete={vi.fn()} busy={false} />)
    expect(screen.getByText('Available')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Install' }))
    expect(onInstall).toHaveBeenCalledWith('block-dangerous')
  })

  it('shows Added + Delete when installed', () => {
    const onDelete = vi.fn()
    render(
      <ScriptCard script={{ ...base, installed: true }} onInstall={vi.fn()} onDelete={onDelete} busy={false} />
    )
    expect(screen.getByText('Added')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('block-dangerous')
  })

  it('warns when runtime missing', () => {
    render(
      <ScriptCard
        script={{ ...base, runtime_available: false }}
        onInstall={vi.fn()}
        onDelete={vi.fn()}
        busy={false}
      />
    )
    expect(screen.getByText(/Needs/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the tests + format**

Run: `cd frontend && npx vitest run src/features/scripts && npx prettier --write src/features/scripts src/types/scripts.ts`
Expected: card + hook tests PASS; prettier formats files.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/scripts
git commit -m "feat(scripts): add script/bundle cards, source dialog, page"
```

---

## Task 9: Route + sidebar nav

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/app/Sidebar.tsx`

- [ ] **Step 1: Add the lazy route**

In `frontend/src/App.tsx`, add after the `HooksConfig` lazy declaration:

```tsx
const ScriptsPage = lazy(() =>
  import('./features/scripts/ScriptsPage').then((m) => ({ default: m.ScriptsPage }))
)
```

Add the route after the `hooks-config` `<Route>` block (before `</Route>`):

```tsx
          <Route
            path="scripts"
            element={
              <Suspense fallback={null}>
                <ScriptsPage />
              </Suspense>
            }
          />
```

- [ ] **Step 2: Add the sidebar nav item**

In `frontend/src/app/Sidebar.tsx`, add `ScrollText` to the existing `lucide-react` import (alphabetical with the others). Then add to `NAV_ITEMS`, after the `hooks-config` entry:

```tsx
  {
    to: '/scripts',
    label: 'Scripts',
    ariaLabel: 'Hook Scripts Library',
    icon: ScrollText,
    end: false,
  },
```

- [ ] **Step 3: Verify types + run the app build**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/app/Sidebar.tsx
git commit -m "feat(scripts): add Scripts route + sidebar nav"
```

---

## Task 10: Docs + full verification gate

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the new surface**

In `CLAUDE.md`, under the "Auto-generated — do not edit directly" table, add a row:

```markdown
| `backend/internal/scriptcatalog/files/*` | Generated by `make sync-scripts` from `my-custom-hook-scripts/`. Never hand-edit; edit the source collection + `catalog.json` and re-sync. |
```

In the "What lives where" frontend tree, add under `features/`:

```
│       │   ├── scripts/      # ScriptsPage — browse + install/delete bundled hook scripts
```

In the architecture endpoint list (the `Browser ←` block), add:

```
        ← GET /api/scripts/catalog            (bundled hook-script library + install state)
        → POST /api/scripts/install           (copy embedded script → ~/.argus/hooks/)
        → POST /api/scripts/install-bundle    (install a named bundle's missing members)
        → DELETE /api/scripts/installed       (remove an installed script)
```

- [ ] **Step 2: Run the full backend gate**

Run: `cd backend && go build ./... && go test ./... && golangci-lint run ./...`
Expected: clean.

- [ ] **Step 3: Run the full frontend gate**

Run: `cd frontend && npx tsc --noEmit && npx vitest run && npx prettier --write src`
Expected: clean; prettier formats.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `make build-local` (from repo root) — rebuilds, syncs scripts, hot-swaps the local service.
Then open `http://127.0.0.1:10804/scripts`, install a script, confirm it appears in `~/.argus/hooks/`, confirm the card flips to "Added", delete it, confirm removal.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(scripts): document Scripts surface + generated embed dir"
```

---

## Self-Review Notes

- **Spec coverage:** bundled `go:embed` (T1/T3) ✓ · `ScriptSource` abstraction (T3) ✓ · registry-shaped manifest w/ version/author/source/tier/checksum (T1/T2) ✓ · bundles first-class (T1/T2/T8) ✓ · Install new-file-only + 409 (T4) ✓ · Delete idempotent (T4) ✓ · existence-driven Available/Added (T4/T8) ✓ · filename-from-catalog security invariant (T4 + unknown-id test) ✓ · runtime-missing hint (T4/T8) ✓ · tier badge slot (T8) ✓ · drift guard (T3) ✓ · route + nav (T9) ✓ · docs (T10) ✓.
- **Deferred (per spec §1 non-goals):** remote fetch, community hub, in-browser edit, wire-into-settings — none in this plan, by design.
- **Type consistency:** `ScriptPackage`/`ScriptBundle`/`ScriptCatalog` field names + JSON tags identical across `domain/scripts.go`, `types/scripts.ts`, handler tests, and hook. `install` / `installBundle` / `remove` hook method names match usage in `ScriptsPage.tsx`.
- **Checksum deviation** (documented in header): bundled checksum is loader-computed; `ReadScript` does not verify body-vs-manifest for bundled (compile-time trusted). The verification primitive activates with the future `RemoteSource`.
