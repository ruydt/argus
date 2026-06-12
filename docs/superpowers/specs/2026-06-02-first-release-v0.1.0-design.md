# First Release v0.1.0

**Date:** 2026-06-02
**Milestone:** v1.4
**Status:** Approved

## Goal

Tag v0.1.0 as argus's first public release. Produce real downloadable macOS/Linux binaries on GitHub Releases with checksums. Prove the release pipeline end-to-end.

## Context

argus has a complete release infrastructure — GoReleaser config, CI/CD workflow, version package with ldflags injection, cross-compile targets for darwin/linux × amd64/arm64, and `docs/releases.md`. However `VERSION=0.0.0-dev` and no tag has ever been pushed. The pipeline is untested against a real tag.

**Already done — not in scope:**
- GoReleaser config (`.goreleaser.yml`)
- Release CI workflow (`.github/workflows/release.yml`)
- `backend/internal/version` package with ldflags injection
- `docs/releases.md` with conventional commit format and release runbook
- LICENSE file

**Blockers identified:**
1. `<repo-url>` / `<repo>` placeholder in README, `docs/quickstart.md`, `docs/install.md`
2. GoReleaser config never dry-run validated
3. `log.Printf` in `cmd/watcher/main.go` and `cmd/seed/main.go` — inconsistent with `slog` used everywhere else in the server

## Phases

### Phase 12: Release Readiness

Fix all blockers before touching the tag.

**Tasks:**

1. **Fill repo URL placeholders**
   - `README.md`: `git clone <repo>` → `git clone https://github.com/duytrandt04-afk/argus`
   - `docs/quickstart.md`: `git clone <repo-url> argus` → `git clone https://github.com/duytrandt04-afk/argus`
   - `docs/install.md`: `git clone <repo-url> argus` → `git clone https://github.com/duytrandt04-afk/argus`

2. **Migrate `log.Printf` → `slog`**
   - `backend/cmd/watcher/main.go`: replace all `log.Printf` calls with structured `slog.Error` / `slog.Warn`
   - `backend/cmd/seed/main.go`: same migration
   - Verify `go build ./...` and `go vet ./...` pass

3. **GoReleaser dry-run**
   - Install goreleaser locally: `brew install goreleaser` or `go install github.com/goreleaser/goreleaser/v2@latest`
   - Run: `goreleaser release --snapshot --clean` from repo root
   - Verify: 4 binaries produced (darwin/linux × amd64/arm64), `checksums.txt` exists, version string baked in
   - Fix any issues the dry-run surfaces before proceeding

4. **Doc accuracy check**
   - Verify `docs/releases.md` matches current GoReleaser workflow behavior
   - Verify `docs/quickstart.md` startup output example matches actual `slog` output format

**Success criteria for Phase 12:**
- No `<repo-url>` placeholders remain in any doc
- `go build ./...` passes with zero `log.Printf` in production server code
- `goreleaser release --snapshot --clean` completes without errors
- Snapshot binary runs and reports correct version

### Phase 13: Tag v0.1.0

Tag and ship after Phase 12 passes.

**Tasks:**

1. **Create and push the tag**
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

2. **Monitor CI release workflow**
   - Watch `.github/workflows/release.yml` run in GitHub Actions
   - Confirm all steps pass: frontend build, backend embed sync, GoReleaser

3. **Verify GitHub Release**
   - Release page shows `v0.1.0`
   - 4 binary archives present: `argus_0.1.0_linux_amd64.tar.gz`, `argus_0.1.0_linux_arm64.tar.gz`, `argus_0.1.0_darwin_amd64.tar.gz`, `argus_0.1.0_darwin_arm64.tar.gz`
   - `checksums.txt` present with SHA256 hashes
   - Release notes auto-generated from conventional commits

4. **Smoke test the release binary**
   - Download the darwin binary for the current machine
   - Verify checksum: `shasum -a 256 --check checksums.txt` (macOS) or `sha256sum --check checksums.txt` (Linux)
   - Extract and run: `./argus`
   - Confirm startup output shows `version -> 0.1.0` (not `0.0.0-dev`)

**Success criteria for Phase 13:**
- GitHub Release page live at `https://github.com/duytrandt04-afk/argus/releases/tag/v0.1.0`
- 4 binary archives + checksums.txt downloadable
- Released binary starts cleanly and reports `version -> 0.1.0`
- All CI checks green on the tag

## Non-Goals

- CHANGELOG.md file — GoReleaser auto-generates release notes from conventional commits; no separate file needed
- Version bump automation — manual tag is sufficient for v0.1.0
- Signed artifacts — deferred until adoption justifies it
- Windows binary — not first-class yet per support matrix

## Risk

**GoReleaser frontend build step** is the most likely failure point. The `.goreleaser.yml` `before.hooks` run `pnpm install --frozen-lockfile && pnpm run build` then sync dist into the embed path. If pnpm version or lockfile diverges between local and CI this will fail. The Phase 12 dry-run catches this before the real tag.
