# Hook Scripts Library — Design

**Date:** 2026-06-13
**Status:** Approved (pending spec review)
**Topic:** A new "Scripts" page to browse the bundled hook-script collection and install/remove scripts into `~/.argus/hooks/`.

---

## 1. Problem & Goal

Argus already ships a public hook-script collection (`my-custom-hook-scripts/`, 12 scripts) and already scans `~/.argus/hooks/` for user-installed scripts (surfaced via `/api/diagnostics`, consumed by the simulator picker). But there is **no in-app way to get a script from the collection into `~/.argus/hooks/`** — the user must manually `cp` files by hand and know the paths.

**Goal:** A "Scripts" page where a user browses the bundled collection, reads each script's source, and installs it into `~/.argus/hooks/` with one click — then wires it (existing hooks-config) and tests it (existing simulator).

**Long-term vision (informs v1 shape — NOT built in v1):** a community "hook script hub" where anyone publishes scripts + bundles and everyone installs them. v1 does not build the hub, but its data model and source abstraction are deliberately shaped like a registry so future phases are *additive, not a rewrite* (see §10 Roadmap).

**Non-goals (YAGNI / deferred):**
- Live-fetching scripts from GitHub or a remote registry (Phase 2).
- Community submissions / the hub itself (Phase 3).
- In-browser editing of installed scripts.
- Enabling/disabling or wiring scripts into `settings.json` from this page (that stays in hooks-config).
- Auto-update / "newer version available" notifications.

---

## 2. Locked Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| **Script source** | **Bundled in the binary** via `go:embed` | Local-first, offline, version-locked, no remote-code-exec trust problem. Matches "no cloud dependencies" + "no surprises". |
| **Manage scope** | **Install (new file only) + Delete + read-only View source** | Closes the core loop; wiring/config/testing already owned by hooks-config + simulator. |
| **Install conflict** | **Existence check** — if filename already in `~/.argus/hooks/`, badge **"Added"** and Install **disabled** (no reinstall, no overwrite) | Backend never overwrites → tightest write path; "no data loss". |
| **Catalog metadata** | Hand-maintained `catalog.json` manifest, embedded alongside scripts | Single source for name/purpose/event/runtime; no fragile parsing of script headers. |
| **Source abstraction** | **`ScriptSource` interface**; `BundledSource` is impl #1 | Phase 2 `RemoteSource` / Phase 3 hub plug in behind the same contract — page + install flow unchanged. |
| **Manifest shape** | **Registry-shaped entries** carrying `id`, `version`, `author`, `source`/provenance, `checksum`, `tier` | Forward-compat fields cost ~nothing now (all `official`/local) but are painful to retrofit once remote entries exist. |
| **Bundles** | **First-class concept** — a bundle = named list of script `id`s | User vision includes sharable bundles; cheap to model now, render as groups, install-all. |

---

## 3. Architecture

Follows existing layering: **handler → service → repository/domain** (this feature touches handler + domain + a new embed package; no repository/SQLite changes).

### 3.0 `ScriptSource` abstraction (forward-compat seam)

All script access goes through one interface. v1 ships exactly one implementation (`BundledSource`); Phase 2/3 add more behind the same contract — the handler, page, install flow, and badges never change.

```go
// ScriptSource provides a catalog of hook scripts and their bodies.
type ScriptSource interface {
    // Catalog returns all packages + bundles this source offers (no install state).
    Catalog(ctx context.Context) (domain.ScriptCatalog, error)
    // ReadScript returns the verified body for one package id.
    ReadScript(ctx context.Context, id string) ([]byte, error)
    // Tier identifies trust level: "official" (v1) vs "community" (Phase 3).
    Tier() string
}
```

- **v1:** `BundledSource` wraps the embedded FS + `catalog.json`. `ReadScript` returns embedded bytes; `checksum` verified at build via the drift-guard test.
- **Phase 2:** `RemoteSource` fetches a static `index.json` + files, verifies `checksum` before returning bytes, caches to `~/.argus/registry-cache/`.
- **Phase 3:** the hub is just a `RemoteSource` pointed at a community-built static index (`tier="community"` → loud UI warning).

The handler composes one or more sources (v1: a single `BundledSource`). Install state (`Installed`) is computed by the handler against `~/.argus/hooks/`, **not** by the source — sources are stateless catalogs.

```
Browser
  GET  /api/scripts/catalog   ─┐
  POST /api/scripts/install    ├─ handler.Scripts(...)  →  scriptcatalog (embed)  +  ~/.argus/hooks/ (fs)
  DELETE /api/scripts/installed┘
```

### 3.1 Embed source & the sync step (the `..` wrinkle)

The Go module root is `backend/`. The canonical collection lives at repo-root `my-custom-hook-scripts/`, **outside** the module — `go:embed` cannot use `../`. Solution mirrors the existing `frontend/dist → backend/internal/ui/dist` Makefile copy:

- New package `backend/internal/scriptcatalog/`.
- Generated asset dir `backend/internal/scriptcatalog/files/` holds copies of `my-custom-hook-scripts/*.js` **plus** `catalog.json`.
- `make sync-scripts` (also wired as a prerequisite of the existing build target) copies `my-custom-hook-scripts/*.js` → `files/`.
- `embed.go` in the package does `//go:embed files/*` → exposes an `embed.FS`.
- **Drift guard:** a unit test in `scriptcatalog` fails if any embedded `.js` byte-differs from the repo-root source, or if `catalog.json` references a missing file / omits a present one. Keeps "single source = repo-root collection" honest.
- `files/` is committed (so `go build ./...` works standalone) and documented as **auto-generated — do not hand-edit**, same convention as `components/ui/*` and `ui/dist`.

### 3.2 Catalog manifest (`my-custom-hook-scripts/catalog.json`)

Hand-maintained, lives **with the source collection** (committed, edited by the maintainer when adding a script), copied into `files/` by the sync step. Schema is **registry-shaped** (versioned envelope + packages + bundles) so a remote source can serve the identical shape:

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
      "source": "https://github.com/<owner>/argus/tree/main/my-custom-hook-scripts",
      "tier": "official",
      "checksum": "sha256:<hex>"
    }
  ],
  "bundles": [
    {
      "id": "safety-starter",
      "title": "Safety starter pack",
      "description": "Sensible guardrails for any project.",
      "packages": ["block-dangerous", "protect-secrets", "protect-branch"]
    }
  ]
}
```

Field notes:
- `id` is the stable key used everywhere (install/read/bundle membership); `filename` is just the on-disk target.
- `runtime` ∈ {`node`, `python3`, `sh`} — drives the "runtime missing" warning (cross-checked against the diagnostics runtime info the simulator already uses).
- `checksum` is `sha256` of the script body. v1: verified at build by the drift-guard test (defense against a bad sync). Phase 2: verified at fetch time before bytes are trusted.
- `tier` is `official` for everything in v1. The field exists so community entries can be visually + behaviorally separated later.
- `bundles[].packages` reference package `id`s; a missing reference is a drift-guard test failure.

### 3.3 Domain types (`backend/internal/domain/`)

```go
// ScriptCatalog is what a source offers plus per-request install state.
type ScriptCatalog struct {
    Packages []ScriptPackage `json:"packages"`
    Bundles  []ScriptBundle  `json:"bundles"`
}

// ScriptPackage is one hook script's metadata, body, and install state.
type ScriptPackage struct {
    ID        string   `json:"id"`
    Filename  string   `json:"filename"`
    Version   string   `json:"version"`
    Title     string   `json:"title"`
    Purpose   string   `json:"purpose"`
    Event     string   `json:"event"`
    Matcher   string   `json:"matcher,omitempty"`
    Runtime   string   `json:"runtime"`            // node | python3 | sh
    Agents    []string `json:"agents"`
    Author    string   `json:"author"`
    Source    string   `json:"source"`             // provenance URL (where it came from)
    Tier      string   `json:"tier"`               // official | community
    Checksum  string   `json:"checksum"`           // sha256:<hex> of Body
    Body      string   `json:"body"`               // full script text (read-only display)
    Installed bool     `json:"installed"`          // file present in ~/.argus/hooks/
}

// ScriptBundle is a named set of package ids installed together.
type ScriptBundle struct {
    ID          string   `json:"id"`
    Title       string   `json:"title"`
    Description string   `json:"description"`
    Packages    []string `json:"packages"`
}
```

Note: `Source` is now provenance (URL), and the script text moved to `Body` (avoids the name clash). Frontend mirror in `frontend/src/types/` (new `scripts.ts`, added to the `types/` barrel) — JSON tags kept in sync, no transformation layer (per CLAUDE.md contract rule).

### 3.4 Endpoints

Requests address scripts by **`id`** (stable key), not raw filename. The handler holds a composed `ScriptSource` (v1: one `BundledSource`).

| Method + path | Handler | Behavior |
| --- | --- | --- |
| `GET /api/scripts/catalog` | `handler.ScriptsCatalog` | `source.Catalog()` → packages + bundles, attach `Body`, set each `Installed` by checking `~/.argus/hooks/<filename>` existence. Returns `domain.ScriptCatalog`. |
| `POST /api/scripts/install` `{ "id": "..." }` | `handler.ScriptsInstall` | Resolve `id` against the catalog (unknown → `400`). `ReadScript(id)` (verifies checksum). If `~/.argus/hooks/<filename>` exists → `409 Conflict`. Else write verified bytes → `~/.argus/hooks/<filename>`, `chmod 0755`. Returns updated package. |
| `POST /api/scripts/install-bundle` `{ "id": "..." }` | `handler.ScriptsInstallBundle` | Resolve bundle `id`; install each member package that isn't already present (skip existing, never overwrite). Returns per-package results (`installed` / `skipped` / `error`). |
| `DELETE /api/scripts/installed?id=...` | `handler.ScriptsDelete` | Resolve `id` → filename via catalog. `os.Remove(~/.argus/hooks/<filename>)`. Idempotent: missing file → success. |

**Security invariants (all handlers):**
- The request `id` **must resolve to a known catalog package** — the on-disk filename comes from the catalog entry, never from the request. Makes `../`, absolute paths, and symlinks structurally impossible (primary defense, unchanged by the registry shape).
- Install writes **only checksum-verified source bytes** (`ReadScript` rejects a body whose sha256 ≠ manifest `checksum`) — never request body content.
- `~/.argus/hooks/` resolved from `ArgusDir` (already plumbed via `router.Options.ArgusDir` → `service.DiagnosticsOptions.ArgusDir`); create the dir (`0755`) if absent on install.
- Install **never overwrites**: existing file → `409`/`skipped`, no write.
- Phase 3 note: a `tier="community"` package must surface a confirm-with-warning before install (out of scope for v1 code, but the invariant is recorded here so the install path is built with the hook in mind).

### 3.5 Router wiring (`backend/internal/server/router.go`)

```go
src := scriptcatalog.NewBundledSource() // v1: single source
mux.Handle("GET /api/scripts/catalog",        handler.ScriptsCatalog(src, opts.ArgusDir))
mux.Handle("POST /api/scripts/install",       handler.ScriptsInstall(src, opts.ArgusDir))
mux.Handle("POST /api/scripts/install-bundle", handler.ScriptsInstallBundle(src, opts.ArgusDir))
mux.Handle("DELETE /api/scripts/installed",   handler.ScriptsDelete(src, opts.ArgusDir))
```

---

## 4. Frontend

### 4.1 Route + nav
- New lazy route `scripts` in `App.tsx` → `features/scripts/ScriptsPage.tsx`.
- New `Sidebar.tsx` nav item ("Scripts", e.g. `ScrollText`/`FileCode` lucide icon), placed near "Hooks Config".

### 4.2 Feature module `frontend/src/features/scripts/`
```
ScriptsPage.tsx            # page shell: bundle section + full script grid
BundleCard.tsx             # one bundle: title, description, member chips, "Install bundle" (installs missing)
ScriptCard.tsx             # one script: title, purpose, event+matcher badges, runtime, tier badge, state badge, actions
ScriptSourceDialog.tsx     # read-only source viewer (Dialog + ScrollArea + <pre>)
hooks/useScriptCatalog.ts  # fetch catalog (packages+bundles), install, install-bundle, delete, optimistic refresh
__tests__/                 # co-located tests
```

### 4.3 Card states (existence-driven)
- **Available** — not in `~/.argus/hooks/`. Primary action: **Install**.
- **Added** — present. Install **disabled** ("Added" badge); secondary action: **Delete** (with confirm).
- **Runtime missing** — `runtime` binary absent (from diagnostics): show amber "needs `node`" hint; install still allowed (file copy is harmless; it just won't run until runtime present).
- **Tier badge** — v1 renders an "Official" badge from `tier`. The slot is where the future "Community — unverified" warning treatment will live (Phase 3); building it now keeps the card layout stable.

### 4.3b Bundles
- Rendered as a section above the script grid. A `BundleCard` shows member chips and an **Install bundle** action that installs only the *missing* members (already-present ones are skipped). Bundle install state: Available / Partially installed / Fully installed, derived from member `Installed` flags.

### 4.4 Components
Use shadcn primitives only (per rules): `Card`, `Badge`, `Button`, `Dialog`/`Popover` + `ScrollArea` for source, `Skeleton` for load, `Empty` for the (unlikely) empty catalog. No raw `<button>`/`<span>`.

### 4.5 Cross-links
- Card → "Wire it up" link/button routing to **Hooks Config** (pre-filtered to the script's event if cheap; otherwise plain nav).
- Card → "Test in simulator" link routing to the simulator tab.

---

## 5. Data Flow

**Install:**
```
ScriptCard [Install] → POST /api/scripts/install {id}
  → handler resolves id ∈ catalog → ReadScript(id) verifies checksum
  → write verified bytes → ~/.argus/hooks/<filename>, chmod 0755
  → 200 {package installed:true}
  → useScriptCatalog flips card to "Added"
```
The diagnostics FS scan + simulator picker pick up the new file on their next read automatically (no coupling needed).

**Install bundle:** `POST /api/scripts/install-bundle {id}` → install each missing member → per-package results → cards flip.

**Delete:** symmetric → `DELETE /api/scripts/installed?id=...` → `os.Remove` → card back to "Available".

---

## 6. Error Handling (per CLAUDE.md backend rules)

- Every fail path returns `(_, error)` internally; handlers map to `http.Error(w, msg, status)`.
- `install` on existing file → `409 Conflict`, body `script already installed`.
- Unknown `id` → `400 Bad Request`, body `unknown script`.
- Checksum mismatch in `ReadScript` → `500`, body `script integrity check failed`, nothing written.
- FS write failure → `500`, logged `log.Printf("[scripts] install id=%s err=%v", ...)`.
- Malformed `catalog.json` at startup is a build/test failure (drift guard), not a runtime branch.
- No panics, no sentinel errors — plain `errors.New`/`fmt.Errorf`.

---

## 7. Testing

**Backend (per CLAUDE.md patterns):**
- `scriptcatalog` package: drift guard test (embedded == repo-root source; every manifest `checksum` matches its file's sha256; every `bundles[].packages` id resolves; manifest parse test); `BundledSource.ReadScript` returns bytes for a known id and errors on checksum mismatch / unknown id.
- `handler` (black-box `package handler_test`, temp dir as `ArgusDir`):
  - catalog returns packages + bundles with correct `Installed` flags.
  - install writes file with `0755`, returns `installed:true`.
  - install on existing file → `409`, original bytes untouched.
  - install unknown `id` → `400`, nothing written outside dir.
  - install-bundle installs missing members, skips present ones, never overwrites.
  - delete removes file; delete-missing is idempotent success.
- Run gate: `go build ./...`, `go test ./...`, `golangci-lint run ./...`.

**Frontend (per CLAUDE.md patterns):**
- `useScriptCatalog`: fetch → state, install → optimistic flip, install-bundle → multi-flip, delete → flip back, error surface.
- `ScriptCard`: renders Available vs Added (install disabled when Added), tier badge, runtime-missing hint.
- `BundleCard`: Available / Partially / Fully installed states from member flags.
- Run gate: `npx tsc --noEmit`, `npx vitest run`, `npx prettier --write`.

---

## 8. Files Touched

**New (backend):**
- `backend/internal/scriptcatalog/embed.go` (+ generated `files/`)
- `backend/internal/scriptcatalog/source.go` (`ScriptSource` interface + `BundledSource`: parse manifest, read+verify body)
- `backend/internal/scriptcatalog/scriptcatalog_test.go`
- `backend/internal/handler/scripts.go`
- `backend/internal/handler/scripts_test.go`

**New (frontend):**
- `frontend/src/features/scripts/ScriptsPage.tsx`, `ScriptCard.tsx`, `BundleCard.tsx`, `ScriptSourceDialog.tsx`
- `frontend/src/features/scripts/hooks/useScriptCatalog.ts`
- `frontend/src/features/scripts/__tests__/*`
- `frontend/src/types/scripts.ts`

**New (source collection):**
- `my-custom-hook-scripts/catalog.json`

**Edited:**
- `backend/internal/domain/scripts.go` (new file) — `ScriptCatalog`, `ScriptPackage`, `ScriptBundle`
- `backend/internal/server/router.go` — 4 routes + source construction
- `frontend/src/App.tsx` — lazy route
- `frontend/src/app/Sidebar.tsx` — nav item
- `frontend/src/types/index.ts` — barrel export
- `Makefile` — `sync-scripts` target + build prereq
- `CLAUDE.md` — document new surface + "auto-generated `scriptcatalog/files/`" convention
- `.gitignore` — (decision: commit `files/`, so no ignore; document as generated)

---

## 9. Open Risks / Notes

- **Manifest maintenance:** adding a future script means editing `catalog.json` + dropping the `.js`; the drift guard test enforces both. Acceptable solo-maintainer cost.
- **Runtime warning accuracy:** depends on diagnostics already detecting `node`/`python3`. If a runtime isn't probed today, warning is best-effort (non-blocking).
- **Scope creep guard:** wiring + enable/disable explicitly stay in hooks-config. This page is browse + install + delete only.
- **Forward-compat is structural, not behavioral:** v1 builds the `ScriptSource` seam, registry-shaped manifest, checksum verification, tier badge slot, and bundles. It does **not** build any network code, remote source, or community submission path. Those are Phases 2–3 below.

---

## 10. Roadmap — toward a community hook-script hub

The vision: a place where anyone publishes scripts + bundles and everyone installs them. Built in phases so infra/security cost is paid only when demand justifies it. v1 (this spec) makes each next phase **additive**.

### Phase 1 — Bundled (this spec)
Official scripts embedded in the binary. One `BundledSource`. Seeds the abstraction + schema.

### Phase 2 — Remote official registry (no new infra)
- Host the **same manifest schema** + script files as **static files** (GitHub Pages / `raw.githubusercontent` / getargus.org). Just files — no service.
- New `RemoteSource implements ScriptSource`: fetch `index.json`, verify each `checksum` before trusting bytes, cache to `~/.argus/registry-cache/`.
- Handler composes `[BundledSource, RemoteSource]`. Page unchanged.
- Gets users fresh scripts without an argus upgrade. Still offline-capable (bundled remains the fallback).

### Phase 3 — Community hub
**Recommendation: keep it git-backed + static for as long as possible** (Homebrew-tap / awesome-list model), graduating to a real backend service only if scale forces it.
- Community submits a script/bundle via **PR to a public repo**.
- **CI validates** schema + computes checksums + builds a static `index.json`.
- Argus reads that static index — still just a `RemoteSource`, `tier="community"`.

Why git-backed beats a live service here:
- **No server to operate** (solo-maintainer constraint).
- **Moderation = PR review** — the security gate is the submission flow, for free.
- Free hosting, free CDN, **GitHub identity = provenance/author**.

### Cross-phase: supply-chain trust model
Community code auto-runs as agent hooks → serious attack surface. Built incrementally, but the v1 seams (tier, checksum, provenance, mandatory source-view) exist so this is layering, not retrofitting:
- **Tiers:** `official` (maintainer-audited) vs `community` (unaudited → loud confirm-with-warning before install).
- **Provenance on every card:** author, source repo, last-updated, checksum.
- **Mandatory source-view before install** (already v1).
- **Simulator-test before live wiring** — argus's existing sandbox is the killer feature for untrusted scripts: "try it against a synthetic payload before any agent fires it." Promote this hard in the hub UX.
- **Checksum/signature** on every entry; reject on mismatch (already v1 for bundled).
