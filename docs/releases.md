# Releases

Argus uses [GoReleaser](https://goreleaser.com) to produce versioned binaries with
checksums. Releases are triggered by pushing a `v*` tag to GitHub.

## Commit format

Use [Conventional Commits](https://www.conventionalcommits.org/) for commit and PR
titles. They keep history scannable and make the hand-written release notes easy to
assemble:

```text
feat: add health endpoint
fix: correct host header middleware allowlist
docs: update quickstart for go build workflow
ci: pin golangci-lint to v1.64
```

## Pre-tag checklist

Automated changelog generation is **disabled** (`changelog: disable: true` in
`.goreleaser.yaml`); release notes come from the hand-written `release.header` block
in that file. Before tagging:

1. Open a PR to `main` so CI (`go build/test/vet/lint`, frontend typecheck/lint/build/test)
   runs on the exact commit you will tag — `release.yml` itself does **not** run the test suite.
2. Update `release.header` in `.goreleaser.yaml` to the new version and its notes.
3. Bump `frontend/package.json` `version` (the Go binary version is set from the git tag
   via ldflags, so `version.go` needs no edit).
4. Verify a **fresh clone** builds and tests green:
   `git clone … && cd argus/backend && go build ./... && go test ./... && cd ../frontend && pnpm install && pnpm run build && npx vitest run`.

## Tagging a release

```bash
git tag v1.0.0
git push origin v1.0.0
```

The release GitHub Actions workflow triggers automatically on `v*` tags. It:

1. Runs GoReleaser, which builds the frontend then cross-compiles the Go binary
2. Produces `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64` archives
3. Creates a `checksums.txt` with SHA256 hashes
4. Publishes a GitHub Release with all artifacts attached

## Verifying a release binary

```bash
# Download the checksum file and a binary archive
sha256sum --check checksums.txt        # Linux
shasum -a 256 --check checksums.txt   # macOS
```

## Release notes

Release notes are **hand-written** in the `release.header` block of `.goreleaser.yaml`
(automatic changelog generation is disabled). Update that block for each release before
tagging; GoReleaser publishes it verbatim as the GitHub Release description.
