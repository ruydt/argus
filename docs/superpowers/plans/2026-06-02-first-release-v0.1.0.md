# First Release v0.1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag argus v0.1.0 as the first public release, producing downloadable macOS/Linux binaries on GitHub Releases.

**Architecture:** Two phases — Phase 12 fixes all pre-release blockers (URL placeholders, slog migration, GoReleaser dry-run), then Phase 13 tags and ships. No new features; this is entirely release plumbing and cleanup.

**Tech Stack:** Go 1.25, `log/slog` (stdlib), GoReleaser v2, GitHub Actions

---

## File Map

| File | Change |
|------|--------|
| `README.md` | Fill `<repo>` → real URL |
| `docs/quickstart.md` | Fill `<repo-url>` → real URL |
| `docs/install.md` | Fill `<repo-url>` → real URL |
| `backend/cmd/watcher/main.go` | Replace `"log"` import + 2 `log.Printf` calls → `slog` |
| `backend/cmd/seed/main.go` | Replace `"log"` import + 4 `log.*` calls → `slog` |

---

## Phase 12: Release Readiness

### Task 1: Fill Repo URL Placeholders

**Files:**
- Modify: `README.md:10`
- Modify: `docs/quickstart.md:8`
- Modify: `docs/install.md:29`

- [ ] **Step 1: Fix README.md**

Open `README.md`. Line 10 currently reads:

```
git clone <repo>
```

Change to:

```
git clone https://github.com/duytrandt04-afk/argus
```

- [ ] **Step 2: Fix docs/quickstart.md**

Open `docs/quickstart.md`. Line 8 currently reads:

```
git clone <repo-url> argus
```

Change to:

```
git clone https://github.com/duytrandt04-afk/argus
```

- [ ] **Step 3: Fix docs/install.md**

Open `docs/install.md`. Line 29 currently reads:

```
git clone <repo-url> argus
```

Change to:

```
git clone https://github.com/duytrandt04-afk/argus
```

- [ ] **Step 4: Verify no placeholders remain**

```bash
grep -rn "<repo" README.md docs/quickstart.md docs/install.md
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/quickstart.md docs/install.md
git commit -m "docs: replace repo URL placeholders with real GitHub URL"
```

---

### Task 2: Migrate cmd/watcher log.Printf → slog

**Files:**
- Modify: `backend/cmd/watcher/main.go`

The watcher is a dev/experimental tool for Gemini CLI transcript polling. It uses `"log"` which is inconsistent with the main server's `slog`. Two `log.Printf` calls need migrating.

- [ ] **Step 1: Replace the import block**

Open `backend/cmd/watcher/main.go`. The current imports (lines 3–14):

```go
import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)
```

Replace `"log"` with `"log/slog"`:

```go
import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)
```

- [ ] **Step 2: Replace log.Printf in main()**

Line 51 currently reads:

```go
log.Printf("Glob error: %v", err)
```

Change to:

```go
slog.Error("glob", "err", err)
```

- [ ] **Step 3: Replace log.Printf in sendHook()**

Line 151 currently reads:

```go
log.Printf("Hook error: %v", err)
```

Change to:

```go
slog.Error("hook", "err", err)
```

- [ ] **Step 4: Build and vet**

```bash
cd backend
go build ./cmd/watcher/...
go vet ./cmd/watcher/...
```

Expected: no errors, no output.

- [ ] **Step 5: Confirm no log.Printf remains in watcher**

```bash
grep -n "log\.Printf\|\"log\"" backend/cmd/watcher/main.go
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add backend/cmd/watcher/main.go
git commit -m "chore: migrate cmd/watcher from log.Printf to slog"
```

---

### Task 3: Migrate cmd/seed log.Printf → slog

**Files:**
- Modify: `backend/cmd/seed/main.go`

The seed command has 4 `log.*` calls: one `log.Fatalf` (fatal open error) and three `log.Printf` (close error, insert failures).

- [ ] **Step 1: Replace the import block**

Open `backend/cmd/seed/main.go`. Current imports (lines 3–12):

```go
import (
	"crypto/sha256"
	"database/sql"
	"fmt"
	"log"
	"math/rand"
	"time"

	_ "modernc.org/sqlite"
)
```

Replace `"log"` with `"log/slog"` and add `"os"`:

```go
import (
	"crypto/sha256"
	"database/sql"
	"fmt"
	"log/slog"
	"math/rand"
	"os"
	"time"

	_ "modernc.org/sqlite"
)
```

- [ ] **Step 2: Replace log.Fatalf for db open error**

Lines 18–20 currently read:

```go
if err != nil {
    log.Fatalf("failed to open db: %v", err)
}
```

Change to:

```go
if err != nil {
    slog.Error("failed to open db", "err", err)
    os.Exit(1)
}
```

- [ ] **Step 3: Replace log.Printf for db close error**

Lines 22–24 (inside the defer) currently read:

```go
defer func() {
    if err := db.Close(); err != nil {
        log.Printf("failed to close db: %v", err)
    }
}()
```

Change to:

```go
defer func() {
    if err := db.Close(); err != nil {
        slog.Error("failed to close db", "err", err)
    }
}()
```

- [ ] **Step 4: Replace log.Printf for session insert error**

Line 65–67 currently reads:

```go
if err != nil {
    log.Printf("failed to insert session %s: %v", sessionID, err)
    continue
}
```

Change to:

```go
if err != nil {
    slog.Error("failed to insert session", "session_id", sessionID, "err", err)
    continue
}
```

- [ ] **Step 5: Replace log.Printf for event insert error**

Line 97–99 currently reads:

```go
if err != nil {
    log.Printf("failed to insert event for session %s: %v", sessionID, err)
}
```

Change to:

```go
if err != nil {
    slog.Error("failed to insert event", "session_id", sessionID, "err", err)
}
```

- [ ] **Step 6: Build and vet**

```bash
cd backend
go build ./cmd/seed/...
go vet ./cmd/seed/...
```

Expected: no errors, no output.

- [ ] **Step 7: Full backend build to confirm no regressions**

```bash
cd backend
go build ./...
go vet ./...
```

Expected: clean.

- [ ] **Step 8: Confirm no log.Printf remains in seed**

```bash
grep -n "log\.Printf\|log\.Fatalf\|\"log\"" backend/cmd/seed/main.go
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add backend/cmd/seed/main.go
git commit -m "chore: migrate cmd/seed from log to slog"
```

---

### Task 4: GoReleaser Dry-Run

**Files:** none — validation only

This task proves the release pipeline before pushing the tag. `--snapshot` builds real binaries without publishing; `--clean` wipes the previous `dist/` so output is fresh.

- [ ] **Step 1: Install GoReleaser (if not present)**

Check first:

```bash
goreleaser --version 2>/dev/null && echo "already installed"
```

If not installed, install via Homebrew:

```bash
brew install goreleaser/tap/goreleaser
```

Or via Go:

```bash
go install github.com/goreleaser/goreleaser/v2@latest
```

Verify:

```bash
goreleaser --version
```

Expected: `goreleaser version 2.x.x`

- [ ] **Step 2: Build frontend (required for embed)**

GoReleaser's `before.hooks` run `pnpm install` and `pnpm run build`. Verify the frontend builds cleanly first:

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm run build
```

Expected: `dist/` directory populated, no errors.

- [ ] **Step 3: Run snapshot release**

From the repo root:

```bash
goreleaser release --snapshot --clean
```

This takes several minutes — it cross-compiles for darwin/linux × amd64/arm64.

Expected output (abbreviated):

```
• starting release action=snapshot
• building binaries
  • building  binary=dist/argus_darwin_amd64_v1/argus
  • building  binary=dist/argus_darwin_arm64/argus
  • building  binary=dist/argus_linux_amd64_v1/argus
  • building  binary=dist/argus_linux_arm64/argus
• archives
• calculating checksums
• release succeeded
```

- [ ] **Step 4: Verify snapshot artifacts**

```bash
ls dist/*.tar.gz dist/checksums.txt
```

Expected 5 files:

```
dist/checksums.txt
dist/argus_0.0.0-SNAPSHOT-<commit>_darwin_amd64.tar.gz
dist/argus_0.0.0-SNAPSHOT-<commit>_darwin_arm64.tar.gz
dist/argus_0.0.0-SNAPSHOT-<commit>_linux_amd64.tar.gz
dist/argus_0.0.0-SNAPSHOT-<commit>_linux_arm64.tar.gz
```

- [ ] **Step 5: Smoke test one snapshot binary**

Extract and run the binary matching your machine (darwin arm64 for Apple Silicon, darwin amd64 for Intel):

```bash
# Apple Silicon
cd dist
tar -xzf argus_*_darwin_arm64.tar.gz
./argus &
sleep 1
curl -s http://127.0.0.1:8765/healthz
kill %1
```

Expected: `curl` returns HTTP 200 (empty body). The startup log will show `version -> 0.0.0-SNAPSHOT-<commit>` (snapshot version, not 0.1.0 — that only appears on a real tag).

- [ ] **Step 6: Verify docs/releases.md accuracy**

Read `docs/releases.md` and cross-check against the actual release workflow:

```bash
cat docs/releases.md
```

Verify these claims are still true:
- Tag format `v*` triggers `.github/workflows/release.yml` ✓ (check the workflow `on.push.tags` filter)
- GoReleaser produces linux/darwin × amd64/arm64 ✓ (matches `.goreleaser.yml` `goos`/`goarch`)
- `checksums.txt` with SHA256 ✓ (matches `.goreleaser.yml` `checksum` block)

If anything is inaccurate, update `docs/releases.md` and commit before proceeding to Phase 13.

- [ ] **Step 7: Clean snapshot artifacts**

```bash
rm -rf dist/
```

Snapshot artifacts must not be committed.

---

## Phase 13: Tag v0.1.0

### Task 5: Tag and Ship v0.1.0

**Files:** none — git operations and CI monitoring only

Only proceed once all Phase 12 tasks are complete and Task 4 dry-run succeeded without errors.

- [ ] **Step 1: Verify branch and working tree**

```bash
git status
git log --oneline -5
```

Expected: clean working tree, on `gsd/phase-11-frontend-polish-ux` branch (or main — verify with team). All Phase 12 commits visible.

- [ ] **Step 2: Ensure commits are on the release branch**

If on a feature branch, merge to main first:

```bash
git checkout main
git merge --ff-only gsd/phase-11-frontend-polish-ux
git push origin main
```

Wait for CI (push trigger) to pass before tagging. Do not tag a failing commit.

- [ ] **Step 3: Create and push the tag**

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers `.github/workflows/release.yml` immediately.

- [ ] **Step 4: Monitor the release workflow**

Open: `https://github.com/duytrandt04-afk/argus/actions`

Watch the `Release` workflow triggered by the `v0.1.0` tag. Steps to pass:
1. `Build frontend` — pnpm install + build
2. `Sync frontend dist` — copies dist into embed path
3. `Release via GoReleaser` — cross-compiles and publishes

If any step fails: check the step logs. Most likely failure is the frontend build step (pnpm/lockfile). Fix, delete the tag, retag after fixing:

```bash
git tag -d v0.1.0
git push origin :refs/tags/v0.1.0
# fix issue, commit, then re-tag
git tag v0.1.0
git push origin v0.1.0
```

- [ ] **Step 5: Verify GitHub Release page**

Open: `https://github.com/duytrandt04-afk/argus/releases/tag/v0.1.0`

Verify all of the following:
- Release title: `v0.1.0`
- Release notes auto-generated from conventional commits (should list `feat:` and `fix:` entries)
- 4 binary archives present:
  - `argus_0.1.0_darwin_amd64.tar.gz`
  - `argus_0.1.0_darwin_arm64.tar.gz`
  - `argus_0.1.0_linux_amd64.tar.gz`
  - `argus_0.1.0_linux_arm64.tar.gz`
- `checksums.txt` present

- [ ] **Step 6: Download and verify the release binary**

```bash
# Download (Apple Silicon example — adjust arch if needed)
curl -L -o argus_release.tar.gz \
  https://github.com/duytrandt04-afk/argus/releases/download/v0.1.0/argus_0.1.0_darwin_arm64.tar.gz

# Download checksums
curl -L -o checksums.txt \
  https://github.com/duytrandt04-afk/argus/releases/download/v0.1.0/checksums.txt

# Verify checksum (macOS)
shasum -a 256 --check checksums.txt 2>/dev/null | grep argus_0.1.0_darwin_arm64

# Extract
tar -xzf argus_release.tar.gz
```

Expected checksum line: `argus_0.1.0_darwin_arm64.tar.gz: OK`

- [ ] **Step 7: Smoke test the release binary**

```bash
./argus &
sleep 1
curl -s http://127.0.0.1:8765/healthz && echo " <- healthz OK"
curl -s http://127.0.0.1:8765/readyz && echo " <- readyz OK"
kill %1
```

Expected output:

```
 <- healthz OK
 <- readyz OK
```

Also verify version in startup logs — the binary should print:

```
argus version -> 0.1.0
```

Not `0.0.0-dev`. If it shows `0.0.0-dev`, GoReleaser did not inject the version via ldflags — check the `goreleaser.yml` `ldflags` section.

- [ ] **Step 8: Clean up downloaded artifacts**

```bash
rm -f argus_release.tar.gz checksums.txt argus
```

---

## Done

**Success criteria:**
- GitHub Release page live at `https://github.com/duytrandt04-afk/argus/releases/tag/v0.1.0`
- 4 binary archives + `checksums.txt` downloadable
- Downloaded binary reports `version -> 0.1.0` at startup
- `healthz` and `readyz` both return 200
- No `<repo-url>` placeholders remain in any doc
- No `log.Printf` in `cmd/watcher` or `cmd/seed`
