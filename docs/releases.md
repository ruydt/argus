# Releases

Source install is the supported install path today. Release artifacts are a
convenience layer and must include checksums.

## Version

The repo version lives in `VERSION`.

Before tagging a release:

1. Update `VERSION`.
2. Update `frontend/package.json` version to the same value without a leading
   `v`.
3. Build artifacts with the same version embedded:

   ```bash
   cd backend
   go build -ldflags "-X hooker/internal/version.Version=$(cat ../VERSION)" -o ../dist/release/hooker-server ./cmd/server

   cd ../frontend
   pnpm run build
   ```

## Checksums

Put release files in `dist/release`, then run:

```bash
./scripts/release-checksums dist/release
```

Publish `SHA256SUMS` next to the artifacts.

## Current artifact stance

- Source install from repo: primary
- Docker backend image: secondary
- Prebuilt binaries: later convenience
