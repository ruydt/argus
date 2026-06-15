# Scripts v2 — Registry-Only, Author-Tagged, Upload-to-Share

**Status:** Approved design
**Date:** 2026-06-14
**Supersedes parts of:** Phase 1 (bundled scripts), Phase 2b (community registry), scripts-page-redesign
**Branch:** continue on `feat/community-script-sharing`

---

## 1. Goal

Make `argus-hooks/registry` the single source of all hook scripts. Remove embedded "official"
scripts, tiers, and bundles. The Community tab becomes one infinite-scroll, fully-searchable list of
author-tagged scripts. Users share by uploading local files/folders, which the backend turns into a
single pull request to the registry. My Collection consolidates its row actions into one menu.

## 2. Decisions (locked in brainstorming)

1. **Registry-only.** Stop embedding scripts in the binary. All scripts live in the registry, each
   tagged with its author's GitHub login. No `official`/`community` tiers.
2. **No bundles.** Remove the bundle concept entirely. Shared folders unpack into individual flat
   files (`scripts/<author>/<file>`).
3. **Infinite scroll**, not pagination: fetch the full index, render ~50, append 50 on scroll.
4. **My Collection** row actions collapse into a single **⋯** menu: *Save to gist* and
   *Remove ▸ (local / gist / both)*. **No per-row Publish.**
5. **Sharing = Upload & share only.** A file/folder picker uploads local files; the backend opens one
   PR. There is no way to republish a fetched registry script (no row-level publish exists).
6. **Search covers the whole registry** (the full index is fetched, so search filters all of it).
7. **Publish mechanism = backend-opened PR** (GitHub `public_repo` scope): fork → commit all files →
   one PR.

## 3. Architecture overview

```
BROWSE / INSTALL                         SHARE (upload)
----------------                          --------------
Community tab                             My Collection -> "Upload & share"
  GET /api/community/catalog (full index)   pick file(s)/folder (browser reads text)
  -> infinite scroll (render 50 + scroll)   POST /api/registry/publish {files:[{name,body}], description}
  -> search filters whole list              -> github: fork argus-hooks/registry
  Install: fetch body, verify sha256,          -> branch + one commit (all files under
   write ~/.argus/hooks                          scripts/<login>/) + open PR
                                              -> {pull_request_url}; maintainer merges;
MY COLLECTION                                    Action rebuilds index.json
  GET /api/collection (union local ∪ gist)
  per row ⋯ : Save to gist / Remove ▸
```

No scripts embedded. The binary ships empty of scripts; everything comes from the registry over the
CDN.

## 4. Backend changes

### 4.1 Remove embedded serving + bundles

- Delete the script-serving role of `scriptcatalog.BundledSource` and the routes
  `GET /api/scripts/catalog`, `POST /api/scripts/install`, `POST /api/scripts/install-bundle`,
  `DELETE /api/scripts/installed`, and their handlers in `handler/scripts.go` **except** the shared
  helpers still used elsewhere: `hooksDir`, `hookTarget`, `writeHookScript` (keep these — community
  install + collection-local depend on them). Move those helpers into a small `handler/hooks_fs.go`
  if cleaner, otherwise leave them in `scripts.go` with the dead handlers removed.
- Remove bundle types from `domain` (`ScriptBundle`, `Bundles` field on `ScriptCatalog`), the
  `go:embed` of `files/*`, the `Tier()` method usage, and `make sync-scripts`'s embed target. The
  source collection `my-custom-hook-scripts/` stays in the repo (it seeds the registry, §6).
- `domain.CommunityScript` is the single script type (already has `author`, `sha256`, `source`,
  `event`, `runtime`, `installed`, `runtime_available`). Drop `tier` from the JSON the UI relies on
  (leave the field harmless or remove; UI ignores it).

### 4.2 Registry as the catalog

`community.Source` (rename optional; keep the package) stays the reader of `index.json` +
`ScriptBody` (sha256-verified). `/api/community/catalog` returns the **full** index (no server
paging). `/api/community/install` and `/api/community/simulate` unchanged.

### 4.3 `/api/collection` enrichment switches to the registry

The union handler currently enriches local-only files from the bundled catalog. Re-point it at the
registry: `Collection(svc, registrySrc *community.Source, argusDir)`. Build the metadata map from
`registrySrc.Catalog(ctx)` (best-effort; on fetch error, skip enrichment → filename + ext-derived
runtime). `idFromFilename`/`runtimeFromExt` stay.

### 4.4 New `POST /api/registry/publish`

Request: `{ "files": [ { "name": "foo.js", "body": "..." }, ... ], "description": "..." }` (names
are basenames; reject any with path separators). Handler `RegistryPublish(svc *github.Service)`:

1. Require auth; require the token to carry `public_repo` (see §4.5). On missing scope → `403` with a
   body the SPA maps to "re-login to enable sharing."
2. Stamp missing `// author: <login>` into existing `@argus-meta` blocks, then call
   `svc.PublishToRegistry(ctx, files, description)` → returns the PR URL.
3. Respond `{ "pull_request_url": "..." }`; `400` on empty/invalid files, `502` on GitHub error.

`internal/github` gains `PublishToRegistry(ctx, files []PublishFile) (string, error)` using the
GitHub REST API:

- Resolve the authenticated login.
- Ensure a fork exists: `POST /repos/argus-hooks/registry/forks` (idempotent; poll
  `GET /repos/<login>/registry` until it resolves, bounded retries).
- Read base ref: `GET /repos/<login>/registry/git/ref/heads/main` → base commit SHA → base tree SHA.
- For each file: `POST .../git/blobs` (content + encoding); assemble a tree
  `POST .../git/trees` with entries `scripts/<login>/<name>` (mode `100644`) on top of the base tree.
- `POST .../git/commits` (one commit, parent = base) → new commit SHA.
- `POST .../git/refs` create `refs/heads/argus-share-<n>` (branch name derived from the file set /
  a counter — NOT time, since the codebase forbids wall-clock in some paths; a short hash of the
  names is fine).
- `POST /repos/argus-hooks/registry/pulls` `head=<login>:argus-share-<n>`, `base=main`,
  `body=<description>` → PR URL.

`PublishFile{ Name, Body string }`. All network errors wrapped; partial failures abort with a clear
error (no half-PR state beyond an orphan branch on the fork, which is acceptable).

### 4.5 Device-flow scope

Widen the requested scope from `gist` to `gist public_repo` (wherever `DeviceFlow.Start` sets
`scope`). Existing gist-only tokens keep working for browse/collection; publish detects the missing
scope. Detection: attempt the fork call; a `403`/`404` with a scope message → return a sentinel
`ErrNeedsRepoScope` mapped to the SPA "re-login" prompt. (Simpldest robust check; GitHub does not
expose granted scopes on a device token except via the `X-OAuth-Scopes` response header on any API
call — optionally read that header on `GET /user` to pre-check before attempting the fork.)

## 5. Frontend changes

### 5.1 Community tab — infinite scroll, author-tagged, search-all

- One `useCommunity`-driven list (drop `useScriptCatalog`, `BundleCard`, bundle/section markup).
- Fetch the full index once. Local UI state `visibleCount` starts at 50; an `IntersectionObserver`
  sentinel at the list bottom bumps `visibleCount += 50` when scrolled into view.
- Search box filters the **entire** fetched list (title/id/purpose/author); `visibleCount` resets to
  50 on query change; infinite scroll then pages through the filtered results.
- Row shows `by <author>` (replace the tier badge). Keep Source / Test / Install. ⚠ "untrusted"
  treatment stays (all registry scripts are third-party now).

### 5.2 My Collection — ⋯ menu + Upload & share

- Replace the row's `Save to gist` / `Publish` / `Remove ▾` buttons with a single **⋯** `Popover`
  trigger; the menu lists: *Save to gist* (only when local && !gist), *Remove local*, *Remove from
  gist*, *Remove both* (each gated on the row's flags). **No Publish.**
- Add a header **"Upload & share"** button (visible when authenticated; otherwise it triggers login).
  Opens a small dialog with a file input (`multiple`; a "choose folder" affordance via
  `webkitdirectory`). Selected files are read as text in the browser, posted to
  `/api/registry/publish`. On success show the returned PR URL ("Pull request opened — review &
  merge on GitHub"); on `403` show "Re-login to enable sharing" and start the login flow.
- `useCollection` gains `publishFiles(files: {name,body}[], description: string) =>
  Promise<{pull_request_url}>`.

### 5.3 Removed UI

`BundleCard.tsx`, `useScriptCatalog.ts`, the bundles section, per-row Publish, and any
`scriptFilters`/bundled-catalog remnants and their tests.

## 6. Migration (manual maintainer push; agent stages)

Seed the registry with the 12 existing scripts so argus isn't empty:

1. For each file in `my-custom-hook-scripts/*.js`, prepend an `@argus-meta` header derived from
   `catalog.json` (title/event/runtime/matcher/purpose).
2. Place them under `scripts/argus/` in the registry working copy (author `argus`).
3. Run `node build-index.mjs` → regenerate `index.json` (now ~13 incl. `session-greeting`).
4. Maintainer pushes to `argus-hooks/registry` (outward action; the user runs the push, agent stages
   the content + commands).

## 7. Error handling

- Registry unreachable → Community tab error state; My Collection still lists local scripts (enrich
  degrades to filename).
- Publish: logged out → 401 → prompt login; missing `public_repo` → 403 → prompt re-login; GitHub
  error → 502 surfaced in the dialog. Files with path separators in `name` → 400.
- Uploaded files lacking an `@argus-meta` header are committed but not indexed by the Action until a
  header is added (documented in the dialog hint + registry README).
- sha256 verification on install/simulate unchanged.

## 8. Testing

- **Backend:** `RegistryPublish` handler with a fake GitHub API (httptest) — fork→tree→commit→PR
  happy path returns the PR URL; missing-scope → 403; empty files → 400; path-separator name → 400.
  `internal/github.PublishToRegistry` unit-tested against the fake API (assert the tree entries land
  under `scripts/<login>/`). Collection enrichment from the registry source. Removal of
  `/api/scripts/*` — delete their tests.
- **Frontend:** Community infinite scroll (mock 120 scripts → 50 shown, sentinel intersect → 100);
  search filters full list (a script beyond the first 50 is found by query). My Collection ⋯ menu
  shows correct options per flags; Upload & share posts file bodies and surfaces the PR URL; 403 →
  login prompt. Remove deleted-component tests.
- Gates: backend `go build/test/golangci-lint`; frontend `tsc -b --noEmit` (NOTE: `tsc --noEmit`
  alone is a no-op — root tsconfig is solution-style) + `vitest run` + `prettier`.

## 9. Out of scope (YAGNI)

- Server-side registry search/paging (full-index fetch is fine at current scale; revisit if the index
  grows to thousands).
- Per-file metadata entry UI in the upload dialog (files carry their own `@argus-meta`).
- Editing/updating an already-published script from the UI (re-upload / PR).
- Keeping any offline/embedded fallback catalog.

## 10. Compatibility / risk

- Argus now requires network for any script browsing; the binary ships with zero scripts. Accepted.
- Token scope broadens to `public_repo`; existing users must re-login to share (browse/collection
  unaffected).
- Large deletion (embed/bundles/`/api/scripts/*`) — coordinated test removal required; covered in the
  plan's task sequencing (backend removal first, then frontend).
