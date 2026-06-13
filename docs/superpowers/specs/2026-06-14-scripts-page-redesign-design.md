# Scripts Page Redesign — Community-first + Unified Collection

**Status:** Approved design
**Date:** 2026-06-14
**Builds on:** Phase 1 (bundled scripts), Phase 2a (gist collection), Phase 2b (community registry)
**Branch:** `feat/community-script-sharing` (folds into the in-flight Phase 2b branch; replaces its Publish-on-Installed wiring)

---

## 1. Goal

Collapse the scripts page to two tabs — **Community** (discover + install) and **My Collection**
(manage what you have) — and make the install→keep→sync→remove lifecycle obvious. Installing from
Community drops a script locally; My Collection then shows it and lets the user optionally back it up
to their gist and remove it from either or both places.

## 2. Decisions (locked in brainstorming)

- **Tabs:** `Community` (first, default) and `My Collection`. Remove `All`, `Installed`, `Bundles`.
- **Official scripts merge into Community.** The 12 embedded scripts + official bundles render in
  Community alongside the remote registry. Community works offline / before the registry repo exists
  because official content is embedded.
- **Community install is local-only** (writes to `~/.argus/hooks/`). No direct-to-gist from Community.
- **My Collection = union of local ∪ gist.** One row per script installed locally OR saved in the
  gist (or both); each row carries independent `Local` and `Gist` flags.
- **Bundles are batch installers only.** Installing a bundle installs its member scripts, which
  appear as individual single-script rows in My Collection. No bundle entity in the gist.
- **3-way remove** via a `Remove ▾` dropdown (Popover-based): *Remove local* / *Remove from gist* /
  *Remove both* — only applicable options shown.
- **Publish moves to My Collection** local rows (the Installed tab that hosted it is gone).

## 3. UX

### 3.1 Community tab (discover + install)

Two sections under the shared search box:

- **Bundles:** official embedded bundles (reuse the existing `BundleCard`). One click installs all
  members locally. (The registry has no bundle concept yet; remote bundles are future and out of
  scope — the section shows official bundles only.)
- **Single scripts:** official (embedded) + community (remote) merged into one list, each row badged
  `official` ⭐ or `community` ⚠. Row actions: **Source** (view body), **Test** (sandbox sim, community
  rows), **Install** → local.

Offline / no registry: the official content still renders; the remote portion silently contributes
nothing (its fetch error does not blank the tab).

### 3.2 My Collection tab (manage)

Union of locally-installed scripts and gist-saved scripts. Each row shows two state badges —
**Local** on/off and **Gist** on/off — and context actions:

| Row state | Actions |
| --- | --- |
| Local on, Gist off | **Save to gist**, **Publish**, **Remove ▾** (local) |
| Local on, Gist on | **Publish**, **Remove ▾** (local / gist / both) |
| Local off, Gist on | **Install**, **Remove ▾** (gist) |

- **Save to gist** pushes the local file into the user's gist (`origin:"local"`).
- **Install** pulls the gist copy into `~/.argus/hooks/`.
- **Publish** uses the existing prefilled-GitHub-PR flow (`buildPublishUrl`).
- **Remove ▾** is a `Popover` menu; *both* = the client calls the local-delete and gist-remove
  endpoints in sequence.

When logged out, the tab still lists local scripts (Gist column off). Save-to-gist / Publish prompt
GitHub login (reuse the existing device-flow login panel + 401 redirect pattern).

## 4. Backend changes

### 4.1 Domain (`backend/internal/domain/collection.go`)

Add the union view types (existing `CollectionScript` stays as the gist storage/transport type):

```go
type CollectionEntry struct {
	ID       string `json:"id"`
	Filename string `json:"filename"`
	Title    string `json:"title"`
	Event    string `json:"event,omitempty"`
	Runtime  string `json:"runtime,omitempty"`
	Local    bool   `json:"local"`
	Gist     bool   `json:"gist"`
}

type CollectionView struct {
	Authenticated bool              `json:"authenticated"`
	GistURL       string            `json:"gist_url,omitempty"`
	Entries       []CollectionEntry `json:"entries"`
}
```

### 4.2 `GET /api/collection` → union, auth-optional

Rewrite the `Collection` handler (new signature: `Collection(svc, src scriptcatalog.ScriptSource,
argusDir)`):

1. Scan `~/.argus/hooks/` for `*.js`, `*.sh`, `*.py` → the local filename set.
2. If `svc.Collection(ctx)` succeeds (authenticated), take its scripts as the gist set and capture
   `GistURL`; if it returns `ErrNotAuthenticated`, treat the gist set as empty and
   `Authenticated:false` (do **not** 401).
3. Merge by filename:
   - Each gist script → `CollectionEntry{Local: localSet has filename, Gist: true, ...}`; drop its
     filename from the local set.
   - Each remaining local file → `CollectionEntry{Local: true, Gist: false}`, with `Title/Event/
     Runtime` enriched by matching the filename against the bundled catalog; if absent, `Title =
     filename` and `Runtime` derived from extension (`.js`→`node`, `.sh`→`sh`, `.py`→`python3`).
4. Return `CollectionView`. A genuine GitHub/transport error (not `ErrNotAuthenticated`) still maps
   to `502`.

Entries are sorted by filename for deterministic output (and stable tests).

### 4.3 `/api/collection/local?filename=` — local body (GET) + delete (DELETE)

One route, two methods (handler `CollectionLocal(argusDir)`):

- **DELETE** → resolve via `hookTarget(argusDir, filename)` (rejects non-basename), `os.Remove`;
  `204` on success, `204` also if already absent (`os.ErrNotExist` ignored), `400` on invalid
  filename.
- **GET** → read the file via `hookTarget`, return `{ "filename": ..., "body": ... }`; `400` on
  invalid filename, `404` if the file is absent. Used by Publish to obtain a local row's script text
  (the union entry does not carry the body).

### 4.4 Reused unchanged

`POST /api/collection` (CollectionAdd, origin `local`), `DELETE /api/collection?id=`
(CollectionRemove, gist), `POST /api/collection/install` (gist→local), all `/api/community/*`, all
`/api/scripts/*` (Community tab reads `/api/scripts/catalog` for official content). The now-unused
`DELETE /api/scripts/installed` route is left in place (no behavior depends on removing it).

### 4.5 Router

`Collection` route gains the `scriptSrc` argument; add
`mux.Handle("DELETE /api/collection/local", handler.CollectionRemoveLocal(opts.ArgusDir))`.

## 5. Frontend changes

### 5.1 `ScriptsPage.tsx` → thin shell

Search box + a 2-item `ToggleGroup` (`community` default, `collection`). Remove the All/Installed/
Bundles branches, the bundled-catalog pagination state, the row-level `addToCollection`/`publish`
wiring, and the `useScriptCatalog`-driven `ScriptRow` list. Renders `<CommunityTab query>` or
`<CollectionTab query>`.

### 5.2 `community/CommunityTab.tsx` → two sections

- Fetch official catalog (`/api/scripts/catalog`, via the existing `useScriptCatalog`) and remote
  (`/api/community/catalog`, via `useCommunity`).
- **Bundles section:** render `catalog.bundles` with `BundleCard` (install via `installBundle`).
- **Single scripts section:** concatenate official `catalog.packages` (badge `official`) + remote
  community scripts (badge `community`), filter by `query`, paginate with `PaginationBar`. Official
  rows install via `useScriptCatalog.install`; community rows via `useCommunity.install` and keep
  Source/Test. A small adapter renders both shapes through one row component.
- A remote-fetch error degrades gracefully (official section still shows; no full-tab error).

### 5.3 `collection/CollectionTab.tsx` → union manager (rewrite)

- `useCollection` (rewritten) loads `GET /api/collection` → `CollectionView`.
- Each entry → a row with **Local**/**Gist** badges and the state-driven actions from §3.2.
- **Remove ▾** = `Popover` containing the applicable buttons; *both* calls `removeLocal` then
  `removeGist`.
- **Publish** reuses `buildPublishUrl`/`buildMetaHeader`. The union entry carries no body, so Publish
  fetches it lazily via `GET /api/collection/local?filename=` (§4.3) before building the URL.
- Login panel (existing device-flow) shown to drive Save-to-gist / Publish when logged out; the
  "View scripts on GitHub" gist link stays when `gist_url` is present.

### 5.4 `useCollection.ts` (rewrite)

Returns `{ authenticated, gistUrl, entries, loading, error, reload, saveToGist, install, removeLocal,
removeGist, removeBoth, getLocalBody }`. `removeBoth` awaits `removeLocal` then `removeGist`.

## 6. Error handling

- `GET /api/collection` never 401s; logged-out = local-only view. Real GitHub errors → 502, surfaced
  as a tab error state.
- Save-to-gist / gist-remove when logged out → 401 → prompt login (existing pattern).
- Local delete of an absent file is a no-op success (idempotent).
- Community remote-fetch failure is contained to the remote section.
- All new backend functions return `(T, error)`; handlers map to `http.Error`; log `[collection] …`.

## 7. Testing

- **Backend union handler:** local-only (logged out), gist-only, both, and enrichment-from-catalog
  cases; deterministic filename sort; real-error → 502.
- **Backend local delete + local body GET:** writes/reads/removes under a temp `argusDir`; invalid
  filename → 400; absent file delete → 204.
- **Frontend CommunityTab:** renders Bundles + Single sections; official vs community badges; remote
  error still shows official.
- **Frontend CollectionTab:** union rows with Local/Gist badges; Remove ▾ menu shows only applicable
  options; Save-to-gist (local→gist) and Install (gist→local) call the right endpoints; logged-out
  shows local rows.
- Gates: backend `go build ./... && go test ./... && golangci-lint run ./...`; frontend
  `tsc --noEmit && vitest run && prettier --write`.

## 8. Out of scope (YAGNI)

- Remote/community bundles in the registry (Bundles section is official-only for now).
- Bundles as tracked gist entities.
- Bulk actions across multiple collection rows.
- Removing the dead `DELETE /api/scripts/installed` route (left untouched).

## 9. Migration / compatibility

No schema or gist-format change: the gist still stores `CollectionScript` items. `GET /api/collection`
changes its response shape (`CollectionView` instead of `Collection`) — the only consumer is the SPA,
rewritten in the same change. `GET /api/collection/local` is added (GET = read body, DELETE = remove).
