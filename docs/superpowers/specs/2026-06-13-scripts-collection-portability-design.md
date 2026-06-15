# Scripts Collection — GitHub Portability (Phase 2a) — Design

**Date:** 2026-06-13
**Status:** Approved (pending spec review)
**Topic:** Let a user log in with GitHub and keep a portable **personal collection** of hook scripts stored in their own private gist, so their scripts follow them to any machine and can be installed into `~/.argus/hooks/` anywhere.

> **Current note:** Later scripts-v2 work supersedes the tab layout and add-to-collection entry
> points in this Phase 2a design. Current UI uses **Community** + **My Collection**; collection list
> is local ∪ gist and auth-optional.

---

## 1. Problem & Goal

Phase 1 shipped an in-app library of **bundled** scripts (embedded in the binary). But a user's *own* scripts in `~/.argus/hooks/` are trapped on one machine — switch laptops and they're gone. There is no way to keep a personal, portable collection.

**Goal:** A "My Collection" surface where a user logs in with GitHub and backs up scripts to a private gist they own. On any machine, logging in shows the same collection and installs any script into `~/.argus/hooks/`. argus stores nothing server-side — the user's GitHub *is* the storage.

**Core value:** Portability with zero argus-hosted infrastructure, preserving the local-first model (argus is still a local client; the "cloud" is the user's own GitHub account).

**Non-goals (deferred to later cycles):**
- Public **sharing** of scripts and discovering others' scripts (Phase 2b).
- In-browser authoring of brand-new scripts (paste/edit a script from scratch).
- OS-keychain token storage (file `0600` for now).
- Multiple collections, folders, or a repo-backed collection (gist only).
- Any argus-hosted backend service, database, or object storage.

---

## 2. Product Direction Note

argus's stated constraints include "local-first, no cloud dependencies, data stays local." This phase **adds an optional, opt-in network feature** but does not violate the spirit:
- It is **opt-in** — everything in Phase 1 (bundled library, local install, simulator) keeps working with no login and no network.
- argus stores **no user data** — the collection lives in the user's own GitHub gist; argus only holds a local token.
- No argus-operated service, account system, or telemetry is introduced.

This is recorded so reviewers understand the deliberate, bounded expansion.

---

## 3. Locked Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| **Storage** | User's own **private GitHub Gist** | Zero argus infra, free portability, user owns the data. |
| **Auth** | GitHub **OAuth Device Flow** | No client secret, no callback server — works from a local binary. |
| **Integration site** | **Backend-mediated** (Go owns token + API calls) | Token stays out of the browser; avoids GitHub CORS limits; fits existing layering. |
| **Token storage** | `~/.argus/github-token.json`, perms `0600`, scope `gist` | Minimal blast radius; matches local-first; keychain deferred. |
| **Collection identity** | A gist whose description starts with `[argus-collection]` | Discoverable on any machine via `GET /gists` → the portability mechanism. |
| **Add sources (v1)** | From a **bundled** library script, or an existing **`~/.argus/hooks/`** local script | Backs up the user's real scripts; custom authoring deferred. |
| **Scope** | Portability only — **no sharing** | Smaller, de-risks auth/storage before the social layer. |

---

## 4. Architecture

Follows existing layering: **handler → service → repository/domain**. This phase adds a new `internal/github` package (device flow, token store, gist client) and a thin collection service; handlers expose it. No SQLite changes (the collection lives in GitHub, not the local DB).

```
Browser (SPA)
  POST /api/github/device   ─┐
  GET  /api/github/status    ├─ handler.GitHubAuth ─► github.DeviceFlow + github.TokenStore (~/.argus/github-token.json)
  POST /api/github/logout   ─┘
  GET    /api/collection     ─┐
  POST   /api/collection      ├─ handler.Collection ─► github.GistClient (user's gist) + writeHookScript (~/.argus/hooks/)
  DELETE /api/collection      │                         + scriptcatalog.BundledSource (for add-from-bundled bodies)
  POST   /api/collection/install ┘
```

**Token never reaches the browser.** The SPA only ever sees `{authenticated, login}` and collection metadata.

### 4.1 `internal/github` package

Three focused units, each independently testable:

- **`TokenStore`** — `Save(token) / Load() (token, ok) / Delete()`. Writes `~/.argus/github-token.json` at `0600`. No GitHub knowledge.
- **`DeviceFlow`** — `Start(ctx) (DeviceCode, error)` → POSTs `github.com/login/device/code`; `Poll(ctx, deviceCode) (token, pending, error)` → POSTs `login/oauth/access_token`, returns `pending` until the user authorizes. Takes a `client_id` and an `*http.Client` (injected for tests).
- **`GistClient`** — wraps the authenticated GitHub API: `FindOrCreateCollection(ctx) (gistID, error)` (list gists, match `[argus-collection]` description, create if absent), `ReadCollection(ctx, gistID) (Collection, error)`, `AddScript(ctx, gistID, ScriptFile) error` (PATCH), `RemoveScript(ctx, gistID, filename) error` (PATCH with file deletion), `Login(ctx) (string, error)` (`GET /user`). Takes a token + `*http.Client`.

The OAuth App `client_id` is a build-time constant (public; device flow needs no secret). Optionally overridable via env `ARGUS_GITHUB_CLIENT_ID` for forks.

### 4.2 Collection service / handler glue

A small layer composes the units: resolve the gist id (cache in `~/.argus/collection-gist-id` after first find), read/modify the collection, and reuse Phase-1's hook-write helper for local install. Auth state is derived from `TokenStore.Load()` + a cached login.

### 4.3 Shared install helper (refactor)

Phase 1's `installOne` (in `handler/scripts.go`) embeds the "write bytes to `~/.argus/hooks/<filename>` atomically, no overwrite" logic. Extract the write into a reusable helper so both bundled-install and collection-install share one implementation and one set of invariants:

```go
// writeHookScript writes body to <argusDir>/hooks/<filename> atomically
// (O_CREATE|O_EXCL, 0755), rejecting non-basename filenames. Returns os.ErrExist
// if the file is already present (never overwrites).
func writeHookScript(argusDir, filename string, body []byte) error
```

`installOne` becomes a thin wrapper (resolve bundled bytes → `writeHookScript`). Collection install calls `writeHookScript` directly with the gist file body.

---

## 5. Domain Types

New `backend/internal/domain/collection.go`:

```go
// CollectionScript is one script in the user's GitHub-backed collection,
// plus its local install state.
type CollectionScript struct {
    ID        string `json:"id"`        // stable key (filename without extension)
    Filename  string `json:"filename"`
    Title     string `json:"title"`
    Purpose   string `json:"purpose,omitempty"`
    Event     string `json:"event,omitempty"`
    Matcher   string `json:"matcher,omitempty"`
    Runtime   string `json:"runtime,omitempty"`
    Origin    string `json:"origin"`    // "bundled" | "local"
    Body      string `json:"body"`      // script text (read-only display)
    Installed bool   `json:"installed"` // present in ~/.argus/hooks/
}

// Collection is the user's full collection.
type Collection struct {
    Scripts []CollectionScript `json:"scripts"`
}

// GitHubAuthStatus is what the SPA learns about the session (never the token).
type GitHubAuthStatus struct {
    Authenticated bool   `json:"authenticated"`
    Login         string `json:"login,omitempty"`
}

// DeviceCodeResponse is returned to the SPA to drive the device-flow modal.
type DeviceCodeResponse struct {
    UserCode        string `json:"user_code"`
    VerificationURI string `json:"verification_uri"`
    ExpiresIn       int    `json:"expires_in"`
    Interval        int    `json:"interval"`
}
```

The gist's `manifest.json` stores the script metadata array (everything except `Body`/`Installed`, which come from the per-file content and a local stat). Frontend mirror in `frontend/src/types/collection.ts`.

---

## 6. Data Flow

### 6.1 Login (device flow)
```
SPA [Login with GitHub] → POST /api/github/device
  backend DeviceFlow.Start → {user_code, verification_uri, interval, expires_in}
  SPA shows: "open <verification_uri>, enter <user_code>" + copy button + spinner
  backend begins polling GitHub (DeviceFlow.Poll at `interval`) in a goroutine,
    OR the SPA polls GET /api/github/status which drives one Poll step server-side
  on success: TokenStore.Save(token); GistClient.Login cached
  SPA GET /api/github/status → {authenticated:true, login} → close modal
```
(Poll mechanism detail — server-driven background poll vs SPA-triggered — is settled in the plan; both keep the token server-side.)

### 6.2 Add to collection
```
"Add to collection" on a bundled or local script → POST /api/collection {origin, id|filename}
  backend resolves the body+metadata:
    origin=bundled → scriptcatalog.BundledSource.ReadScript + catalog metadata
    origin=local   → read ~/.argus/hooks/<filename> (metadata minimal: title=filename)
  GistClient.FindOrCreateCollection → AddScript (PATCH gist: write file + update manifest.json)
  → 200, updated collection
```

### 6.3 Portability / install on a new machine
```
new machine: Login → GET /api/collection
  GistClient.FindOrCreateCollection (finds the [argus-collection] gist by description)
  ReadCollection → scripts; each Installed computed by stat ~/.argus/hooks/<filename>
SPA shows rows → [Install] → POST /api/collection/install {id}
  writeHookScript(argusDir, filename, body) → ~/.argus/hooks/  (atomic, no overwrite)
```

### 6.4 Remove from collection
```
[Remove] → DELETE /api/collection?id= → GistClient.RemoveScript (PATCH: delete file + manifest entry)
```
(Removing from the collection does **not** uninstall the local copy; that's the Installed tab's Delete.)

---

## 7. Endpoints

| Method · path | Behavior | Errors |
| --- | --- | --- |
| `POST /api/github/device` | Start device flow; return user_code/verification_uri/interval. | 502 if GitHub unreachable |
| `GET /api/github/status` | `{authenticated, login}`; advances a poll step if a device flow is pending. | always 200 (auth=false on no token) |
| `POST /api/github/logout` | Delete token + cached gist id/login. | 200 |
| `GET /api/collection` | Read the user's collection gist; fill `installed` per script. | 401 if not authenticated; 502 on GitHub error |
| `POST /api/collection` `{origin, id?, filename?}` | Add a bundled or local script to the gist. | 400 unknown source; 401; 409 already in collection |
| `DELETE /api/collection?id=` | Remove a script from the gist. | 401; 404 not in collection |
| `POST /api/collection/install` `{id}` | Write a collection script to `~/.argus/hooks/`. | 401; 409 already installed; 400 unknown id |

All collection endpoints require a valid token (else `401` → SPA shows the login CTA). Network/GitHub failures map to `502` with a clear message; the bundled library is unaffected.

---

## 8. Frontend

New tab on `/scripts`: **All · Installed · Bundles · My Collection**.

- **Not authenticated:** the My Collection tab shows a `GitHubLoginPanel` — "Login with GitHub" button → opens `DeviceFlowModal` (shows `user_code`, a copy button, a link to `verification_uri`, and a spinner that polls `GET /api/github/status` until authenticated).
- **Authenticated:** header shows `@login` + Logout; the tab lists `CollectionRow`s (reusing the dense row style) each with **Install / Installed** and **Remove from collection**.
- **Add-to-collection entry points:** an "Add to collection" action on rows in the All tab (bundled scripts) and Installed tab (local scripts), enabled only when authenticated.

New feature files under `frontend/src/features/scripts/collection/`:
`useCollection.ts` (auth status, list, add, remove, install, login start/poll, logout), `CollectionTab.tsx`, `GitHubLoginPanel.tsx`, `DeviceFlowModal.tsx`, `CollectionRow.tsx`. Types in `frontend/src/types/collection.ts`.

Use existing shadcn primitives (Dialog for the device-flow modal, Button, Badge, Skeleton). No raw elements.

---

## 9. Security

- **Token scope `gist` only** — cannot read/write the user's repos or code. Stored `0600` in `~/.argus/`; deleted on logout.
- **Device flow** — no client secret is shipped; the public `client_id` is safe to embed.
- **Token never in the browser** — SPA only sees `{authenticated, login}`.
- **Install path = Phase 1 invariants** — `writeHookScript` rejects non-basename filenames, writes atomically with `O_EXCL` (never overwrites), `0755`.
- **Trust** — v1 collection scripts are the user's **own** content (their bundled picks or their local scripts), so no untrusted-code surface is introduced. Source-view-before-install is available. (Untrusted public scripts + checksum/provenance land with the deferred sharing phase.)
- **Failure isolation** — all GitHub features fail closed without breaking the offline bundled library or local install.

---

## 10. Testing

**Backend (per CLAUDE.md patterns):**
- `internal/github` (`package github_test` where black-box fits):
  - `TokenStore`: save→load round-trip, file mode `0600`, delete, load-missing returns `ok=false`.
  - `DeviceFlow`: `Start`/`Poll` against an `httptest.Server` faking GitHub (pending → success; expired/denied error paths).
  - `GistClient`: `FindOrCreateCollection` (match by description vs create), `ReadCollection` manifest round-trip, `AddScript`/`RemoveScript` PATCH bodies — all against an `httptest.Server`.
- `handler` (black-box, stubbed github service via an interface; temp `ArgusDir`):
  - status reflects token presence; logout deletes token.
  - collection list/add/remove; install writes `0755` and 409s on existing.
  - 401 when unauthenticated on every collection endpoint.
- Shared `writeHookScript`: atomic create, no overwrite (409), non-basename rejected — and Phase-1 bundled-install tests still pass through the refactor.
- Gate: `go build ./... && go test ./... && golangci-lint run ./...`.

**Frontend (per CLAUDE.md patterns):**
- `useCollection`: unauth → list 401 surfaces login CTA; login poll transitions to authenticated; add/install/remove call the right endpoints and refresh.
- `CollectionTab`: logged-out CTA vs authenticated rows; `DeviceFlowModal` renders `user_code` + copy.
- Gate: `tsc --noEmit && vitest run && prettier --write`.

---

## 11. Files Touched

**New (backend):**
- `internal/github/token_store.go` (+ test)
- `internal/github/device_flow.go` (+ test)
- `internal/github/gist_client.go` (+ test)
- `internal/handler/github_auth.go` (+ test)
- `internal/handler/collection.go` (+ test)
- `internal/domain/collection.go`

**New (frontend):**
- `src/types/collection.ts` (+ barrel export)
- `src/features/scripts/collection/useCollection.ts`
- `src/features/scripts/collection/CollectionTab.tsx`
- `src/features/scripts/collection/GitHubLoginPanel.tsx`
- `src/features/scripts/collection/DeviceFlowModal.tsx`
- `src/features/scripts/collection/CollectionRow.tsx`
- `frontend/tests/features/scripts/collection/*`

**Edited:**
- `internal/handler/scripts.go` — extract `writeHookScript`; `installOne` wraps it
- `internal/server/router.go` — register the 7 new routes (needs `ArgusDir` + `client_id`)
- `frontend/src/features/scripts/ScriptsPage.tsx` — add My Collection tab + add-to-collection actions
- `CLAUDE.md` — document the GitHub integration + token file
- `docs/` — a short note on the optional GitHub login + privacy/scope

---

## 12. Roadmap Position

This is **Phase 2a** of the scripts roadmap. It builds the auth + gist machinery that **Phase 2b (public sharing & discovery)** will extend: a public gist + a discovery index, `tier="community"` trust treatment, checksum/provenance, and the simulator-gate for untrusted scripts. None of that is in this phase; the seams (token, gist client, collection model) are designed so Phase 2b is additive.

---

## 13. Open Risks / Notes

- **GitHub OAuth App setup** is a one-time manual maintainer step (register the app, enable device flow, record the public `client_id`). Documented in the plan.
- **Device-flow poll mechanism** (server background goroutine vs SPA-driven `status` poll) is an implementation detail settled in the plan; both keep the token server-side.
- **Gist rate limits** (authenticated 5000 req/hr) are far above expected use; collection reads are cached briefly.
- **Gist as a "DB"** is intentionally simple (flat files + one manifest). If a user hand-edits the gist, the manifest is the source of truth; a missing file referenced by the manifest is skipped with a logged warning.
