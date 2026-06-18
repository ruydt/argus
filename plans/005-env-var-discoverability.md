# Plan 005: Make the existing env-var docs discoverable + add a reference `.env.example`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 11c8916..HEAD -- docs/install.md CONTRIBUTING.md backend/internal/config/config.go backend/internal/server/router.go`
> If any changed since this plan was written, compare the "Current state" excerpts
> against the live files before proceeding; on a mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `11c8916`, 2026-06-18

## Why this matters

The runtime env vars **are** already documented — `docs/install.md:83-101` has a
complete 9-variable table, and `docs/security.md` / `docs/privacy.md` explain the
sensitive ones. The real gap is **discoverability**, not absence:

- `CONTRIBUTING.md` (where a contributor sets up locally) mentions only `DB_PATH`
  (line 28-30) and never points to the full table — so a developer reading
  CONTRIBUTING has no idea the other knobs exist.
- There is no `.env.example` to copy from. (Note: argus reads **real** environment
  variables — it does **not** auto-load a `.env` file. So an `.env.example` here is a
  copy-pasteable *reference*, and must say so to avoid the false expectation that
  dropping a `.env` will be picked up.)

This is a small, honest doc/DX fix: add the missing pointer and the reference file,
without duplicating the canonical table (which stays in `install.md`).

> Scope note: an earlier audit framed this as "env vars undocumented." That was
> inaccurate — they are documented in `install.md`. This plan only improves
> discoverability and adds the example file.

## Current state

- `docs/install.md:83-101` — the canonical table (the single source of truth). It lists,
  with defaults and purpose: `ADDR`, `DB_PATH`, `ARGUS_IGNORE`, `ARGUS_CORS_ORIGINS`,
  `ARGUS_ALLOW_REMOTE`, `ARGUS_RETENTION_DAYS`, `ARGUS_MAX_EVENTS`,
  `ARGUS_REGISTRY_RAW_URL`, `ARGUS_GITHUB_CLIENT_ID`, and cross-links to privacy.md /
  security.md.

- The vars come from two places in code:
  - `backend/internal/config/config.go:25-39` reads `ADDR`, `DB_PATH`,
    `ARGUS_CORS_ORIGINS`, `ARGUS_IGNORE`, `ARGUS_ALLOW_REMOTE` (`== "1"`),
    `ARGUS_RETENTION_DAYS`, `ARGUS_MAX_EVENTS` (via `envInt`, non-negative or fallback).
  - `backend/internal/server/router.go:114-122` reads `ARGUS_REGISTRY_RAW_URL` and
    `ARGUS_GITHUB_CLIENT_ID` (these two are NOT in the `Config` struct).

- `CONTRIBUTING.md:28-30` — the only env mention in the contributor guide:

  ```
  By default, the backend listens on `127.0.0.1:10804` and stores SQLite data in
  `backend/argus.db`. Use `DB_PATH=/absolute/path/to/my.db` when you need a separate
  database.
  ```

- **Verified during recon**: no `.env`, `.env.example`, or `*.example` file exists in
  the repo. There is no `.env` loader in the codebase (config reads `os.Getenv`
  directly). `ARGUS_GITHUB_CLIENT_ID` is a **public** OAuth App client id, not a secret;
  there are no secret env vars.

## Commands you will need

| Purpose                       | Command                                                              | Expected                     |
|-------------------------------|----------------------------------------------------------------------|------------------------------|
| Confirm no .env exists        | `find . -maxdepth 2 -name '.env*'`                                   | empty (before this plan)     |
| Confirm env reads             | `grep -rn 'os.Getenv\|envOr\|envInt' backend/internal/config/config.go backend/internal/server/router.go` | the 9 vars |
| Frontend/back unaffected      | `cd backend && go build ./...`                                      | exit 0 (docs-only change)    |

## Scope

**In scope** (create or modify only these):
- `backend/.env.example` (**create**) — reference mirror of the install.md table, with a
  header stating it is not auto-loaded.
- `CONTRIBUTING.md` (**modify**) — add a short "Environment variables" pointer to
  `docs/install.md#configuration` and to `backend/.env.example`, near the existing
  `DB_PATH` paragraph.

**Out of scope** (do NOT touch):
- `config.go`, `main.go`, `router.go`, or any code — this is docs only. Do **not** add a
  `.env` loader / godotenv dependency; argus intentionally uses real env vars.
- The `docs/install.md` table itself — it is already complete and is the single source
  of truth. Do not duplicate it into CONTRIBUTING; link to it.
- Do not put any secret value in `.env.example` (there are none; keep it that way).

## Git workflow

- Branch: `advisor/005-env-discoverability`.
- Commit message style: conventional commits, e.g.
  `docs: add backend/.env.example reference and link env vars from CONTRIBUTING`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Create `backend/.env.example`

Create `backend/.env.example` mirroring the install.md table. Use this content (keep
the header comment — it prevents the "why isn't my .env loaded" confusion):

```bash
# argus backend environment variables — REFERENCE ONLY.
#
# argus reads real environment variables; it does NOT auto-load this file.
# To use a value, export it or prefix the command, e.g.:
#   DB_PATH=/tmp/argus.db go run ./cmd/server
# Canonical, always-current documentation: docs/install.md ("Configuration").

# Backend listen address.
ADDR=127.0.0.1:10804

# SQLite database path (default: backend/argus.db).
# DB_PATH=/absolute/path/to/argus.db

# Path to a gitignore-style privacy exclusion file (default: ~/.config/argus/ignore).
# ARGUS_IGNORE=~/.config/argus/ignore

# Extra comma-separated CORS origins beyond the loopback defaults.
# ARGUS_CORS_ORIGINS=http://localhost:3000

# SECURITY: set to 1 to allow binding to non-loopback addresses. See docs/security.md
# before enabling — it exposes the hook simulator and reveal endpoints to the network.
# ARGUS_ALLOW_REMOTE=1

# Prune hook events older than N days (sweep runs every 6h). 0 = keep everything.
# ARGUS_RETENTION_DAYS=0

# Cap the hook_events table to the N newest rows. 0 = keep everything.
# ARGUS_MAX_EVENTS=0

# Override the public hook-script registry base URL (for forks / self-host).
# ARGUS_REGISTRY_RAW_URL=https://raw.githubusercontent.com/ruydt/argus/main/registry

# Override the GitHub OAuth App client id used for device-flow login.
# (The built-in default is a public client id, not a secret.)
# ARGUS_GITHUB_CLIENT_ID=
```

**Verify**: `test -f backend/.env.example && grep -c '=' backend/.env.example` → file
exists and contains the variable lines.

### Step 2: Link from CONTRIBUTING.md

In `CONTRIBUTING.md`, immediately after the `DB_PATH` paragraph (around line 30), add:

```
All other runtime settings are environment variables too. See
[docs/install.md](docs/install.md) ("Configuration") for the full table, and
`backend/.env.example` for a copy-pasteable reference. Note: argus reads real
environment variables — it does not auto-load a `.env` file.
```

**Verify**: `grep -n "install.md\|.env.example" CONTRIBUTING.md` → returns the new line(s).

### Step 3: Confirm nothing else changed

**Verify**: `cd backend && go build ./...` → exit 0 (sanity: no code touched);
`git status --porcelain` shows only `backend/.env.example` (new) and `CONTRIBUTING.md`.

## Test plan

No automated tests — documentation only. Verification is the `grep`/`test` checks above
plus a human read confirming the `.env.example` matches `docs/install.md`'s table
(same variables, same defaults).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `backend/.env.example` exists and lists all nine variables from `docs/install.md`
- [ ] `backend/.env.example` header states it is NOT auto-loaded
- [ ] `grep -n "install.md" CONTRIBUTING.md` returns the new pointer
- [ ] No code files modified (`git status --porcelain '*.go'` is empty)
- [ ] `git status --porcelain` shows only `backend/.env.example` and `CONTRIBUTING.md`
- [ ] `plans/README.md` status row for 005 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The set of env vars in `config.go` + `router.go` no longer matches the nine in
  `docs/install.md` (code drifted from docs) — report the mismatch; updating the
  install.md table to match is a reasonable extension but confirm first.
- You are tempted to add a `.env` auto-loader to "make the example work" — do NOT; that
  is a behavior change and explicitly out of scope.

## Maintenance notes

- `docs/install.md` is the single source of truth; `backend/.env.example` is a
  convenience mirror. When a new env var is added, update the install.md table first,
  then the example. The example's header points readers back to install.md to minimize
  drift damage.
- A reviewer should diff the example against the install.md table to ensure they list
  the same variables and defaults.
- Deferred: if env vars proliferate, consider centralizing the two router.go reads
  (`ARGUS_REGISTRY_RAW_URL`, `ARGUS_GITHUB_CLIENT_ID`) into `config.Config` so all env
  reads live in one place. Out of scope here (code change).
