# Phase 2b — Community Script Sharing & Discovery

**Status:** Approved design
**Date:** 2026-06-14
**Builds on:** Phase 1 (bundled scripts library), Phase 2a (GitHub-portable personal collection)

---

## 1. Goal

Let users **publish** their hook scripts publicly and **discover + install** scripts shared by
others — without argus hosting any server, database, or storage. Public scripts live in a
maintainer-owned Git repository; argus reads a static, CDN-cached index. This is the final scripts
phase before the first complete release.

## 2. Constraints (carried forward, locked)

- **No argus-hosted infra.** Storage = GitHub (repo + Actions). Argus reads static files only.
- **Token stays `gist`-scope only.** Publishing must NOT require expanding GitHub permissions.
- **Trust is explicit.** Community scripts are untrusted code; the UI must say so and offer
  inspection + sandboxed testing before install.
- **Solo maintainer.** Avoid moderation/automation that creates maintenance tax. PR review is the
  one human gate, and it doubles as the trust + spam control.
- **Privacy.** Publishing sends a user's code off their machine — it requires an explicit,
  reviewable consent step (the browser commit).

## 3. Architecture overview

```
PUBLISH                                       DISCOVER / INSTALL
-------                                        ------------------
argus "Publish" button                         argus "Community" tab
  -> prefilled GitHub "new file" URL             -> GET /api/community/catalog
  -> user commits in browser                        (backend RemoteSource: fetch+cache index.json)
  -> auto-fork + PR to argus-hooks/registry      -> browse rows (search, paginate, ⚠ badge)
  -> MAINTAINER merges  (trust + spam gate)      -> source-view / Test-in-simulator (sandboxed)
  -> Action rebuilds index.json (sha256)         -> Install: fetch body, VERIFY sha256, write
                                                    -> installed = local script
                                                    -> existing "+ Collection" applies if wanted
```

No new persistence in argus. The registry is external and read-only from argus's perspective.

## 4. Storage — `argus-hooks/registry` (new public repo)

```
registry/
├── index.json                       # AUTO-GENERATED — never hand-edited
├── scripts/<login>/<id>.js          # script bodies, each with an @argus-meta header
├── .github/workflows/build-index.yml
└── README.md                        # header schema + contribution guide
```

### 4.1 Script body metadata header

Each body carries a parseable header the Action reads to build the index:

```js
// @argus-meta
// title: Auto-stash before checkout
// event: PreToolUse
// matcher: Bash
// runtime: node
// purpose: Stash a dirty working tree before the agent runs git checkout.
// @end

<script body follows>
```

- `title`, `event`, `runtime`, `purpose` required; `matcher` optional.
- `<login>` in the path is the author identity. `scripts/<login>/` namespacing prevents
  cross-author `id` collisions in the repo.

### 4.2 `index.json` (Action-generated)

```json
{
  "schema_version": 1,
  "scripts": [
    {
      "id": "git-autostash",
      "author": "alice",
      "title": "Auto-stash before checkout",
      "purpose": "Stash a dirty working tree before the agent runs git checkout.",
      "event": "PreToolUse",
      "matcher": "Bash",
      "runtime": "node",
      "tier": "community",
      "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "source": "scripts/alice/git-autostash.js",
      "published_at": "2026-06-14"
    }
  ]
}
```

### 4.3 `build-index.yml` Action

On merge to `main`: walk `scripts/**.js`, parse each `@argus-meta` header, compute `sha256` of the
file body, regenerate `index.json`, commit it back. Benefits:

- Contributors add **one file**; never touch `index.json` (no merge conflicts between PRs).
- Checksums computed by CI, not by hand — always correct, always matches the committed body.

### 4.4 Scope decision — community-only registry

The registry holds **community-tier scripts only**. Official scripts stay bundled in
`backend/internal/scriptcatalog` / `catalog.json` (Phase 1), unchanged. This keeps the trust tiers
cleanly separated and the blast radius small.

## 5. Publish flow (gist-token only, no new scope)

1. User clicks **"Publish to community"** on one of their own scripts (a local or collection
   script). Requires GitHub login (Phase 2a) so argus knows `<login>` for the path.
2. Argus composes the file body = `@argus-meta` header + script body, and a GitHub
   **"propose new file"** URL:
   ```
   https://github.com/argus-hooks/registry/new/main
     ?filename=scripts/<login>/<id>.js
     &value=<url-encoded body>
   ```
3. **Prefill threshold:** if the encoded body is < ~6KB, prefill via `value=`. If larger, open the
   blank new-file page and surface a **"Copy body"** button instead (copy fallback).
4. User reviews on GitHub (already authenticated in browser) and commits → GitHub auto-forks and
   opens a PR.
5. **Maintainer merges.** Merge = live + reviewed. This single human gate is the trust and spam
   control. The Action then rebuilds `index.json`.

Rationale for the browser step: it keeps the token at `gist` scope (expanding to `public_repo`
would let argus write all of a user's public repos), and the in-browser commit is an explicit
consent checkpoint for code leaving the machine.

## 6. Discover + install flow

### 6.1 Community tab

New `'community'` tab in `ScriptsPage`, alongside All / Installed / Bundles / My Collection. Browse
rows reuse `ScriptRow` + search + `PaginationBar`. Each community row shows:

- ⚠ **`community` badge** (untrusted treatment).
- **Source-view** (inspect the body before install).
- **Test in simulator** (sandboxed run — see 6.3).
- **Install**.

Install is **not blocked** behind the simulator — badge + source-view + sim button inform the user,
who decides. Forcing a sim run on every install is friction without added safety (source-view is
already present).

### 6.2 Install

`POST /api/community/install {id}` → backend fetches the raw body → **verifies `sha256` against the
index entry** (tamper / transit-corruption guard) → writes via the existing `writeHookScript`
(O_EXCL atomic, basename-only, traversal-rejecting — hardened in Phase 2a). A duplicate filename in
`~/.argus/hooks` surfaces the existing "already exists" error; the user renames/resolves.

After install the script is an ordinary **local** script, so the existing Phase 2a
**"+ Collection"** path lets the user add it to their personal gist for cross-machine portability
if they choose. No special "community origin" is stored — keeps `CollectionScript.origin` as
`'bundled' | 'local'`.

### 6.3 Test in simulator (pre-install, sandboxed)

`POST /api/community/simulate {id, event, payload}` → backend fetches + verifies the body → writes a
temp file (`0700`) → executes it with the declared runtime, feeding the synthetic payload on stdin
→ returns `{stdout, stderr, exit, durationMs}` → removes the temp file. Reuses the existing simulate
execution core (`handler/hooks_simulate.go`). Lets the user safely observe behavior **before** the
script ever touches `~/.argus/hooks` or a live agent.

## 7. Components & data model

### 7.1 Backend — new `internal/community/` (the `ScriptSource` impl #2)

- `community.go` — `Source{ httpClient, rawBaseURL, cache }`.
  - `Catalog(ctx) ([]CommunityScript, error)` — fetch + cache `index.json`, TTL ~15min, serve last
    good cache on fetch error (offline tolerance).
  - `ScriptBody(ctx, id) (string, error)` — fetch raw body, verify `sha256`, return; error on
    mismatch or unknown id.
  - `rawBaseURL` = compile-time const, overridable via env `ARGUS_REGISTRY_RAW_URL` (forks/tests).
- `internal/handler/community.go`:
  - `GET  /api/community/catalog` → `[]CommunityScript`
  - `GET  /api/community/script?id=` → body (source-view)
  - `POST /api/community/install {id}` → fetch + verify → `writeHookScript`
  - `POST /api/community/simulate {id, event, payload}` → sandboxed temp-file run
- Wire 4 routes in `backend/internal/server/router.go`.

`CommunityScript` domain type:
`{ id, author, title, purpose?, event?, matcher?, runtime?, tier:"community", sha256, source,
published_at }`. **No SQLite migration, no change to `domain.NormalizedEvent`** — the registry is
external and read-only.

### 7.2 Frontend — `features/scripts/community/`

- `useCommunity.ts` — `{ scripts, loading, error, install, getBody, simulate, refresh }`.
- `CommunityTab.tsx` — browse + search + `PaginationBar`; ⚠ badge, source-view, Test-in-sim,
  install.
- `publishUrl.ts` — pure helpers: `buildMetaHeader(script)` and
  `buildPublishUrl(login, script) -> { url, prefilled: boolean }` (prefill if encoded body < 6KB,
  else `prefilled:false` for copy fallback). Unit-tested.
- `ScriptsPage.tsx` — `Tab` union gains `'community'`; render `<CommunityTab />`. Publish button on
  local / collection rows, using `login` from the existing `/api/github/status`.
- `types/community.ts` — `CommunityScript` mirroring the backend JSON tags (added to the
  `src/types` barrel).

## 8. Error handling

- **Registry unreachable + no cache:** Community tab shows an error state ("Couldn't reach the
  script registry"); offline with a warm cache serves the stale list.
- **`sha256` mismatch on install/simulate:** hard error, install aborts ("script integrity check
  failed").
- **Duplicate install filename:** existing `os.ErrExist` → "already installed / name in use".
- **Publish without login:** prompt to log in (mirrors the Phase 2a 401 → switch-to-collection-tab
  pattern).
- **Body too large for prefill:** copy fallback, not an error.
- **Backend:** every fallible function returns `(T, error)`; handlers map to `http.Error`; log
  `[community] key=val`.

## 9. Testing

- **Backend `Source`:** `httptest` fake registry serving `index.json` + bodies — assert cache TTL,
  stale-fallback on fetch error, and `sha256` **mismatch → error**.
- **Backend handlers:** catalog / install / simulate against the fake registry via
  `ARGUS_REGISTRY_RAW_URL`; install duplicate → exists error; install writes the expected file.
- **Frontend:** `useCommunity` fetch/install paths; `CommunityTab` render + search + badge presence;
  `buildPublishUrl` / `buildMetaHeader` — prefill threshold and copy-fallback branch.
- **Action generator:** unit test for header parsing + `sha256` emission (lives in the registry
  repo).
- Gates: backend `go build ./... && go test ./... && golangci-lint run ./...`; frontend
  `tsc --noEmit && vitest run && prettier --write`.

## 10. Manual one-time maintainer setup (documented in the plan)

1. Create the public repo **`argus-hooks/registry`**.
2. Add `build-index.yml` (header parse → `sha256` → `index.json`), `README.md` (header schema +
   contribution guide). No seeding (community-only).
3. Record the raw base URL the backend reads (default const;
   `ARGUS_REGISTRY_RAW_URL` override for forks).

## 11. Out of scope (YAGNI)

- Auto-update notifications for installed community scripts (re-discover + reinstall instead).
- Ratings, install counts, comments, author profiles.
- In-app PR automation / `public_repo` token scope.
- A community "origin" persisted in the personal collection model.

## 12. Roadmap position

This is **Phase 2b**, the final scripts phase. It completes the publish ↔ discover loop on top of
the Phase 2a auth + gist machinery and the Phase 1 `ScriptSource` seam. After this ships, argus cuts
its first complete release (recommend `1.0.0`; `0.1.0` is already tagged).
