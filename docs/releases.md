# Releases

Hooker uses [GoReleaser](https://goreleaser.com) to produce versioned binaries with
checksums. Releases are triggered by pushing a `v*` tag to GitHub.

## Before your first release

**Required GitHub repo setting (one-time manual step):**

Enable squash merging and enforce it as the only merge strategy:

1. Go to your GitHub repository -> **Settings** -> **General**.
2. Under **Pull Requests**, uncheck **Allow merge commits** and **Allow rebase merging**.
3. Check only **Allow squash merging**.
4. Set the squash merge commit message to **Pull request title and description**.

This is required for GoReleaser changelog automation to work correctly. GoReleaser reads
squash-merged PR titles as conventional commits.

## Commit format

Use [Conventional Commits](https://www.conventionalcommits.org/) for PR titles:

```text
feat: add health endpoint
fix: correct host header middleware allowlist
docs: update quickstart for go build workflow
ci: pin golangci-lint to v1.64
```

GoReleaser filters out `docs:`, `test:`, and `ci:` commits from the changelog automatically.

## Tagging a release

```bash
git tag v0.1.0
git push origin v0.1.0
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

GoReleaser generates release notes automatically from PR titles since the previous tag.
Edit the GitHub Release description to add context if needed.
