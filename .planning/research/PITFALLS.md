# Domain Pitfalls: hooker — Working Prototype to Reliable Product

**Domain:** Local-first OSS developer tool, Go+React+SQLite, source-install primary
**Researched:** 2026-05-24
**Scope:** Install/onboarding, CI, SQLite operations, frontend testing, local security, data model evolution, release process

---

## 1. Install and Onboarding Pitfalls

### 1.1 CRITICAL — DB path resolves differently under `go run` vs installed binary

**What goes wrong:** `config.go` walks the filesystem from cwd/executable to locate the backend root and places `hooker.db` there. Running `go run ./cmd/server/main.go` from `backend/` puts the DB in `backend/hooker.db`. Running a compiled binary from the repo root resolves differently. Users who mix invocation styles accumulate two separate databases and see missing data.

**Why it happens:** The resolution heuristic is CWD-dependent. A user following the quickstart runs from one directory; their daily alias or shell function runs from another.

**Warning signs:**
- Users reporting "sessions disappeared" after rebuilding
- `doctor` checks pass but DB is empty despite prior use
- Two `.db` files appearing in different locations

**Prevention:**
- Document the exact expected invocation in the quickstart and in the `doctor` output
- The `doctor` command should print the resolved DB path and warn if it differs from the last known path (store resolved path in a `.hooker-state` sidecar, or just always emit it prominently on startup)
- Long-term: support `--db` flag with an explicit default, documented in one place

**Phase:** Milestone 1 (Startup validation / doctor command)

---

### 1.2 HIGH — `set -euo pipefail` masks useful error messages in the helper script

**What goes wrong:** The existing `scripts/hooker` uses `set -euo pipefail`. This is correct for safety but means that when a subcommand fails (e.g., `pnpm install` exits non-zero due to a lockfile mismatch), the script exits silently without printing which step failed or what to do about it.

**Why it happens:** `set -e` exits immediately; if there is no `trap ERR` or per-command error handler, the user sees nothing actionable.

**Warning signs:**
- User sees `./scripts/hooker setup` exit with code 1, no message
- `pnpm install --frozen-lockfile` fails in CI with `ERR_PNPM_OUTDATED_LOCKFILE` and no guidance

**Prevention:**
- Add a `trap 'echo "setup failed at line $LINENO — see error above"' ERR` at the top of the script
- On lockfile errors specifically, print a remediation hint: "run `cd frontend && pnpm install` to update the lockfile, then commit pnpm-lock.yaml"
- The `doctor` command should separate required failures from warnings and print a summary line count at the end

**Phase:** Milestone 1 (helper script / doctor command)

---

### 1.3 MEDIUM — `go run` as the quickstart instruction causes first-impression confusion

**What goes wrong:** The scripts/hooker `setup` output tells users to start the backend with `go run ./cmd/server/main.go`. This compiles on every invocation, is slow, and places the binary in a temp directory that the DB resolution heuristic cannot find, triggering pitfall 1.1.

**Warning signs:**
- Users report slow startup
- DB ends up at an unexpected path on first run

**Prevention:**
- Quickstart should show `go build -o hooker ./cmd/server && ./hooker` as the canonical invocation
- The `setup` success message should emit the exact commands to run, not a generic "start with go run"

**Phase:** Milestone 1 (docs / quickstart)

---

### 1.4 MEDIUM — Missing Go/Node version requirements cause silent incompatibility

**What goes wrong:** The script checks that `go`, `node`, and `pnpm` are present but does not assert minimum versions. Go 1.21 would fail to compile modules using Go 1.22+ range-over-integer syntax. Node 16 cannot run Vite 5.

**Warning signs:**
- Cryptic compile errors from users on older toolchains
- `pnpm` version mismatches produce `ERR_PNPM_OUTDATED_LOCKFILE` in CI

**Prevention:**
- Add version assertions in `ensure_tools`: `go version | awk '{print $3}'` checked against a minimum
- Pin pnpm version in `package.json` `engines` field and in `corepack prepare`
- The `doctor` output already shows versions — add a PASS/WARN verdict per tool

**Phase:** Milestone 1 (doctor command)

---

## 2. CI Pitfalls (GitHub Actions, Go+React Monorepo)

### 2.1 HIGH — Go module cache key not invalidated when `go.sum` changes without `go.mod` changing

**What goes wrong:** A common pattern caches Go modules keyed on `hashFiles('**/go.mod')` alone. Indirect dependency bumps update `go.sum` without touching `go.mod`, so the cache restores a stale module set and `go test` downloads missing packages every run — or worse, uses an incorrect cached version.

**Warning signs:**
- CI takes as long as a cold build despite caching
- `go mod verify` fails in CI but passes locally

**Prevention:**
```yaml
key: go-${{ runner.os }}-${{ hashFiles('backend/go.mod', 'backend/go.sum') }}
restore-keys: go-${{ runner.os }}-
```
Always include `go.sum` in the cache key.

**Phase:** Milestone 1 (CI setup)

---

### 2.2 HIGH — pnpm version drift between local and CI

**What goes wrong:** CI installs the latest pnpm via `npm install -g pnpm` or `corepack enable`. If local development used pnpm 9.x and CI installs pnpm 10.x, the lockfile format differs and `--frozen-lockfile` raises `ERR_PNPM_OUTDATED_LOCKFILE`. This is a known pnpm issue on detached HEAD checkouts (tag checkouts in release workflows are especially prone).

**Warning signs:**
- CI fails on `pnpm install --frozen-lockfile` on release tags but not on branch pushes
- Local `pnpm install` silently rewrites the lockfile format

**Prevention:**
- Pin pnpm in `package.json`:
  ```json
  "packageManager": "pnpm@9.x.x"
  ```
- Use `corepack prepare pnpm@<exact-version> --activate` in CI, not `npm install -g pnpm`
- Add `pnpm-lock.yaml` to `.gitattributes` as `merge=binary` to prevent accidental merge conflicts rewriting it

**Phase:** Milestone 1 (CI setup + pnpm standardization)

---

### 2.3 HIGH — SQLite in-memory tests share state across parallel test packages

**What goes wrong:** The codebase correctly uses `db.SetMaxOpenConns(1)` for `:memory:` databases. However, if any two test packages accidentally share a global `*DB` reference (via package-level `var`), parallel package execution (`go test ./...`) produces non-deterministic failures — tests pass individually but flake under `go test -race ./...`.

**Why it happens:** `modernc.org/sqlite` in-memory databases are per-connection, not per-process. A single connection shared across goroutines without locking is a race.

**Warning signs:**
- `go test -race ./...` shows data race on `*sql.DB` fields
- Tests pass with `-p 1` but flake with default parallelism

**Prevention:**
- Never use package-level `var db *DB` in tests; always construct in `TestMain` or per-test
- Add `-race` to the CI `go test` invocation from day one — it is cheaper to enforce this early than retrofit later
- Repository tests should use `sqlite.New(":memory:")` per test function, not per package

**Phase:** Milestone 1 (CI) + Milestone 2 (test coverage)

---

### 2.4 MEDIUM — Frontend build not validated in CI before backend embed check

**What goes wrong:** The Go binary embeds the React SPA via `//go:embed`. If `pnpm run build` is not run before `go build`, the embed directive fails with a compile error. In CI, if the frontend build step is in a separate job that runs after the Go build job, the Go build job fails with a confusing embed error.

**Warning signs:**
- `go build` fails locally for contributors who have not run `pnpm build`
- CI job ordering causes misleading "embed: no matching files" errors

**Prevention:**
- Enforce job ordering in the workflow: `build-frontend` → `build-backend` (with `needs:`)
- Add a `Makefile` or script target that runs both in sequence, so contributors have a single command
- Document this ordering constraint explicitly in `CONTRIBUTING.md`

**Phase:** Milestone 1 (CI setup)

---

### 2.5 MEDIUM — No `go vet` or `golangci-lint` in CI means lint regressions accumulate invisibly

**What goes wrong:** A working prototype typically skips linting in CI. Once the project stabilizes, hundreds of lint warnings accumulate and enabling lint in CI requires a large cleanup commit that obscures intent.

**Warning signs:**
- `golangci-lint run ./...` locally produces dozens of warnings that never appear in PR reviews
- Contributors copy patterns from existing code that violates style rules

**Prevention:**
- Add `go vet ./...` and `golangci-lint run ./...` to CI from the first CI setup, even if the initial config is minimal
- Use a `.golangci.yml` with a small enabled-linter set initially; expand over time
- Fail the CI job on lint errors, not just test failures

**Phase:** Milestone 1 (CI setup)

---

## 3. SQLite Operational Pitfalls

### 3.1 CRITICAL — Migration recorded as applied after partial DDL execution

**What goes wrong:** The current migration runner executes the SQL for each migration and then records the version. If a migration contains multiple DDL statements (e.g., migration 005 runs five `ALTER TABLE` statements) and the third one fails, statements 1 and 2 are already committed (SQLite auto-commits each DDL), but the version is never recorded. On the next startup, the migration reruns from the beginning and the first two `ALTER TABLE` calls fail with "duplicate column" errors — causing the app to refuse to start. The database is now stuck.

**Why it happens:** The migration runner does not wrap each migration in an explicit transaction. SQLite supports transactional DDL — `BEGIN`/`COMMIT` around DDL statements causes all-or-nothing behavior.

**Warning signs:**
- App fails to start after a partial upgrade (power loss, OOM kill during migration)
- `schema_migrations` table does not contain the version that appears partially applied
- "duplicate column name" errors in startup logs

**Prevention:**
```go
// In migrate(), wrap each migration:
tx, err := d.db.Begin()
if err != nil { return err }
if _, err := tx.Exec(m.sql); err != nil {
    _ = tx.Rollback()
    return fmt.Errorf("migration %d: %w", m.version, err)
}
if _, err := tx.Exec(`INSERT INTO schema_migrations (version) VALUES (?)`, m.version); err != nil {
    _ = tx.Rollback()
    return fmt.Errorf("record migration %d: %w", m.version, err)
}
if err := tx.Commit(); err != nil { return err }
```
- Multi-statement migrations should use a single `BEGIN...COMMIT` block in the SQL file itself as an additional safeguard
- Add a migration smoke test that verifies idempotency: run migrations twice on the same DB and assert no error

**Phase:** Milestone 2 (SQLite correctness)

---

### 3.2 HIGH — WAL file grows unbounded under sustained read load

**What goes wrong:** WAL mode defers checkpointing (flushing the WAL back to the main DB file) until no readers are active. The SSE event stream in this app creates a long-lived read connection for every open browser tab. If a user leaves the dashboard open and hook events keep arriving, the WAL file grows continuously because the checkpoint is always blocked by the SSE reader.

**Why it happens:** SQLite's WAL checkpointing requires a moment with no active readers. The SSE handler holds a connection open indefinitely.

**Warning signs:**
- `hooker.db-wal` file grows to hundreds of MB over days of use
- Query latency slowly increases as the WAL grows
- `PRAGMA wal_checkpoint(TRUNCATE)` in `sqlite3` CLI returns non-zero `busy` count

**Prevention:**
- Separate the SSE read path from the SQLite connection pool. SSE should hold events in memory (already done via the broadcaster), not hold open DB cursors
- Add `PRAGMA wal_autocheckpoint(1000)` to the connection string to force checkpointing every 1000 pages
- Run `PRAGMA wal_checkpoint(PASSIVE)` periodically (e.g., in a background goroutine every 5 minutes) to flush when possible
- Add a `doctor` check that reports WAL file size

**Phase:** Milestone 2 (SQLite WAL documented, indexes reviewed)

---

### 3.3 HIGH — Upgrading from an old DB with missing columns silently produces zero values

**What goes wrong:** When a user upgrades hooker and a migration adds a new `NOT NULL DEFAULT 0` column to `sessions`, existing rows get the default value. But if the application then reads and displays that column (e.g., token counts), it shows zero for all historical sessions — not an error, just silently wrong data. Users assume their usage history was lost.

**Warning signs:**
- After upgrade, token totals for old sessions show as 0
- No error in logs

**Prevention:**
- Accept that `DEFAULT 0` columns on historical rows will show as 0 — this is correct behavior
- Document this explicitly in the upgrade notes: "Sessions before vX.Y will show zero token counts"
- Add a `backfill` concept: on startup, if a session has zero token counts but a transcript exists, queue a backfill (the existing `backfillSessionUsage` mechanism handles this case but must be kept active)
- Test the upgrade path: migrate a pre-migration DB fixture and assert display behavior is "0 (not backfilled)" not "error"

**Phase:** Milestone 2 (migration correctness tested)

---

### 3.4 MEDIUM — `PRAGMA foreign_keys = ON` in migration 1, but subsequent migrations disable it mid-transaction

**What goes wrong:** The initial schema sets `PRAGMA foreign_keys = ON`. However, the current migrations run outside a transaction, and SQLite PRAGMAs are connection-scoped, not persistent. If the driver opens a new connection for a migration, the FK pragma may not be active. A future migration that adds a FK constraint could silently insert orphaned rows.

**Warning signs:**
- Referential integrity violations not caught by SQLite at insert time
- `PRAGMA foreign_key_check` after migration returns orphaned rows

**Prevention:**
- Add `PRAGMA foreign_keys = ON` to the connection string (`_pragma=foreign_keys(on)`) to ensure it applies on every connection, not just at schema init
- Wrap DDL migrations in transactions so PRAGMA state is consistent throughout

**Phase:** Milestone 2 (migration correctness)

---

### 3.5 MEDIUM — Editing an existing migration file corrupts databases that have already applied it

**What goes wrong:** The CLAUDE.md rule "never edit existing migrations" exists for good reason but is not enforced. A contributor who edits migration 005 to fix a typo causes no CI failure. Users who have already applied migration 005 will not re-run it (version is recorded), so they silently run a different schema than a fresh install. The divergence is only visible when a query relying on the changed column fails.

**Warning signs:**
- A migration file has a recent git blame modification date
- Fresh installs and upgraded installs behave differently

**Prevention:**
- Add a CI check: compute a checksum of each migration file and compare to a committed `migrations.sha256` manifest. If any existing migration file changed, fail CI with a clear message: "Do not edit migration NNN — add a new migration instead"
- This is a one-time CI addition with no ongoing maintenance cost

**Phase:** Milestone 1 (CI) — add the checksum check alongside the initial CI setup

---

## 4. Frontend Test Pitfalls

### 4.1 HIGH — SSE tests that do not clean up global `EventSource` stub leak state between test files

**What goes wrong:** The existing `useEvents.test.tsx` uses `vi.stubGlobal('EventSource', MockES)` without a corresponding `vi.unstubAllGlobals()` in `afterAll`. If Vitest runs test files in the same worker (the default), the stub persists into subsequent test files that expect a real `EventSource` or a different mock. Tests pass in isolation but fail in a random order depending on worker assignment.

**Warning signs:**
- Tests pass with `vitest run --reporter=verbose` but fail with `--pool=forks`
- Tests that do not touch `EventSource` start failing after adding a new SSE test file

**Prevention:**
- Add `afterAll(() => vi.unstubAllGlobals())` to every test file that calls `vi.stubGlobal`
- Alternatively, set `unstubGlobals: true` in `vitest.config.ts` to restore stubs automatically after each test — this is the safer default
- The `fetch` stub has the same issue — every `vi.stubGlobal('fetch', ...)` call should be matched with cleanup

**Phase:** Milestone 2 (frontend regression coverage)

---

### 4.2 HIGH — `act()` warnings from fake timers + async state updates are silently suppressed in Vitest

**What goes wrong:** Vitest does not always surface React `act()` warnings as test failures. A hook test that uses `vi.useFakeTimers()` and advances time with `vi.runAllTimers()` may trigger state updates outside `act()`. The warning appears in console output but does not fail the test. This masks real bugs — the component is in an indeterminate state but the assertion happens to pass.

**Why it happens:** Vitest issue #6782 documents that act warnings are not reliably propagated as failures. Using async timers (`vi.runAllTimersAsync()`) and `await act(async () => { vi.runAllTimers() })` resolves it but is not obvious.

**Warning signs:**
- `act(...)` warnings in Vitest console output that do not cause test failures
- Tests that pass individually but intermittently fail in `--reporter=verbose` runs

**Prevention:**
- Treat any `act()` warning in CI output as a blocking issue even if the test passes
- Use `waitFor` from RTL instead of manual timer advancement where possible
- When fake timers are required, wrap timer advancement in `act()`:
  ```ts
  await act(async () => { vi.runAllTimers() })
  ```
- Add a Vitest `onConsoleWarn` hook that fails the test on `act()` warnings

**Phase:** Milestone 2 (frontend regression coverage)

---

### 4.3 MEDIUM — Testing implementation details of hooks (internal state, fetch call counts) instead of observable behavior

**What goes wrong:** Hook tests that assert `fetchMock.toHaveBeenCalledTimes(2)` or check internal state variables break when the implementation is refactored, even when behavior is correct. This produces false negatives that slow down Milestone 2 refactors (the `EventService` split, the `useOpenAIUsage` cleanup identified in CONCERNS.md).

**Warning signs:**
- A refactor that does not change user-visible behavior breaks multiple tests
- Tests mock the module under test's own internal calls

**Prevention:**
- Test observable behavior: what data is returned, what is rendered, what events fire
- Mock at network boundaries (fetch/EventSource), not at module boundaries
- The existing `useEvents.test.tsx` pattern is good — it mocks `EventSource` and `fetch`, then asserts on returned `events` arrays and SSE URLs

**Phase:** Milestone 2 (when writing new tests)

---

### 4.4 MEDIUM — Missing `MemoryRouter` wrapper causes silent test failures for route-dependent hooks

**What goes wrong:** Several hooks use `useSearchParams` from `react-router-dom`. Rendering them in tests without a `MemoryRouter` wrapper throws an error from the router context. The error is sometimes swallowed and the hook returns empty data, causing assertions like `expect(result.current.events).toHaveLength(0)` to pass trivially — the test is actually broken, not passing.

**Warning signs:**
- Tests pass with `toHaveLength(0)` but the assertion is trivially true due to a thrown error
- Adding `console.error` spy reveals router context errors

**Prevention:**
- Create a shared `renderHookWithRouter(hook, options)` wrapper in `src/test/` and use it in every hook test that touches routing
- Add a global `console.error` spy in `src/test/setup.ts` that fails tests on React context errors

**Phase:** Milestone 2 (frontend regression coverage)

---

### 4.5 LOW — `getByTestId` usage creates maintenance coupling between test and markup

**What goes wrong:** Using `data-testid` attributes ties tests to DOM structure rather than semantics. When the component is refactored to use a different HTML element or shadcn primitive, tests break for no behavioral reason.

**Warning signs:**
- Many `getByTestId` calls in test files
- Tests break after changing from `<span>` to `<Badge>` with identical text

**Prevention:**
- Prefer `getByRole`, `getByLabelText`, `getByText` in that priority order
- `getByTestId` is acceptable only for elements with no semantic role (e.g., SVG icons, chart wrappers)

**Phase:** Milestone 2 (when writing new tests — not worth retrofitting existing tests unless they are already failing)

---

## 5. Local Tool Security Pitfalls

### 5.1 CRITICAL — Wildcard CORS + localhost bind = DNS rebinding attack surface

**What goes wrong:** The middleware sets `Access-Control-Allow-Origin: *`. This is currently mitigated by the default `127.0.0.1:8765` bind address. But DNS rebinding bypasses the loopback restriction: an attacker registers a domain that resolves to `127.0.0.1` after a TTL flip (typically 40-60 seconds). The victim's browser makes requests to `attacker.com`, which resolves to `127.0.0.1:8765`, and the wildcard CORS header allows the response to be read by the attacker's JavaScript. The `/api/hook` endpoint can then be used to inject fabricated events; the read endpoints expose prompt content and file paths.

**Why it matters for hooker specifically:** The app captures full prompt text, file contents in diffs, command outputs, and file paths. This is sensitive data. DNS rebinding is not theoretical — it is documented against MCP servers (a very similar class of localhost tool) in multiple recent CVEs.

**Warning signs:**
- `Access-Control-Allow-Origin: *` present on API responses
- No `Host` header validation
- ADDR env var overridden to `0.0.0.0` in any documented example

**Prevention (ordered by implementation cost):**
1. **Immediate:** Add `Host` header validation middleware that rejects requests where `Host` is not `localhost`, `127.0.0.1`, or `[::1]`. Return 403. This is a 15-line Go change and blocks DNS rebinding entirely.
2. **Milestone 3:** Replace `Access-Control-Allow-Origin: *` with an explicit allowlist (configurable via `CORS_ORIGINS` env var, defaulting to the frontend dev server origin during development and `null` in production single-binary mode).
3. **Document:** Never show `ADDR=0.0.0.0` in documentation without a prominent security warning.

**Phase:** Milestone 1 (the Host header fix is low-cost, high-impact — do it before any public documentation) / Milestone 3 (full CORS tightening)

---

### 5.2 HIGH — `ADDR=0.0.0.0` accidentally enables LAN exposure with no auth

**What goes wrong:** A user sets `ADDR=0.0.0.0:8765` to access hooker from another device on their LAN (common in Docker setups). The app then accepts unauthenticated `POST /api/hook` from any LAN host. The existing security concern in CONCERNS.md notes this but there is no runtime warning. Users who do this in shared office or coffee shop environments expose their prompt history and allow event injection.

**Warning signs:**
- Docker Compose examples using `0.0.0.0` binding
- No warning in startup logs when binding to non-loopback address

**Prevention:**
- In `main.go` startup logging, add an explicit warning when `cfg.Addr` does not begin with `127.0.0.1` or `[::1]`:
  ```
  WARNING: binding to 0.0.0.0 exposes the hook endpoint to all network interfaces with no authentication
  ```
- The `doctor` command should flag remote binding as a warning
- Include this check in the security threat model documented in Milestone 3

**Phase:** Milestone 1 (startup validation) + Milestone 3 (threat model)

---

### 5.3 MEDIUM — API keys stored in `localStorage` are accessible to any injected script

**What goes wrong:** `useOpenAIUsage.ts` persists the OpenAI API key in `localStorage`. If any third-party script (analytics, ad injection in a browser extension, an XSS from a rendered diff/prompt) runs in the same origin, it can read the key. The app renders user-supplied content (diffs, file paths, command outputs) — any stored XSS payload in the DB would execute in the same origin.

**Warning signs:**
- `localStorage.getItem('openai_api_key')` works in the browser console
- The app renders raw HTML or unescaped markdown from event data

**Prevention:**
- Move to session-only storage (in-memory React state, cleared on tab close)
- If persistence is required, add an explicit opt-in checkbox and a "clear saved key" button
- Audit all event renderers to ensure they use React's escaped text rendering, not `dangerouslySetInnerHTML`

**Phase:** Milestone 3 (privacy controls + security threat model)

---

## 6. Data Model Evolution Pitfalls

### 6.1 CRITICAL — Adding a `NOT NULL` column without a `DEFAULT` to an existing table crashes on upgrade

**What goes wrong:** SQLite's `ALTER TABLE ADD COLUMN` requires that new columns either be nullable or have a constant default value. A migration that adds `NOT NULL` without `DEFAULT` fails with "NOT NULL constraint failed" on the `ALTER TABLE` itself if there are any existing rows. The app cannot start; the user has no recovery path other than deleting their database.

**Why it happens:** Developers test migrations on fresh databases (no rows) where this constraint is not triggered.

**Warning signs:**
- Migration tested only on CI with a fresh `:memory:` database
- Upgrade fails for any user with existing data

**Prevention:**
- Every `ALTER TABLE ADD COLUMN` must include a `DEFAULT` or be nullable — no exceptions
- Add a migration integration test that: (1) inserts seed rows using the pre-migration schema, (2) applies the migration, (3) asserts all rows are readable. This test catches the "works on empty DB, fails on real data" class of bugs.
- CI test matrix should include a "migrate from populated DB" fixture alongside the fresh-install test

**Phase:** Milestone 2 (migration correctness tested)

---

### 6.2 HIGH — Renaming or dropping a column requires a full table rebuild but the current pattern only uses `ALTER TABLE ADD COLUMN`

**What goes wrong:** SQLite does not support `DROP COLUMN` before version 3.35 and `RENAME COLUMN` before 3.25. The `modernc.org/sqlite` driver bundles a specific SQLite version — if a future migration needs to rename `session_id` to `session`, the developer may attempt `ALTER TABLE RENAME COLUMN` and find it works in their local SQLite CLI but fails against the driver's bundled version, or works locally but fails on a user's older OS SQLite.

**Why it happens:** `modernc.org/sqlite` uses a statically compiled SQLite, which may differ from the system SQLite version used in testing. The version bundled by the driver is the source of truth, not the system `sqlite3`.

**Warning signs:**
- A migration uses `RENAME COLUMN` or `DROP COLUMN`
- The developer tested with system `sqlite3` but not with the Go driver

**Prevention:**
- Any migration beyond `ADD COLUMN` must use the safe table-rebuild pattern: create new table with correct schema, insert-select, drop old, rename new
- Add this rule to the migration contribution guide
- Check the bundled SQLite version in `go.mod` (modernc.org/sqlite) and document the minimum supported SQLite feature set

**Phase:** Milestone 2 (migration correctness) — document the rule, enforce in PR review

---

### 6.3 HIGH — `dedup_key` schema change breaks idempotency for existing events

**What goes wrong:** The `hook_events` table uses a `dedup_key UNIQUE NOT NULL` to prevent duplicate event ingestion (`INSERT OR IGNORE`). The `dedup_key` is derived from event fields in `dedupKey()`. If a future change alters the `dedupKey()` function (e.g., adding a new field to the hash), all existing events get a different computed key than the one stored. Events that were already ingested will be re-ingested as duplicates are no longer detected — every event that Claude Code replays or re-sends appears as new.

**Why it happens:** The dedup key is a computed value, not a stable ID from the agent. If the computation changes, the stored value is stale.

**Warning signs:**
- After a version upgrade, session event counts double
- Historical sessions show duplicate events in the timeline

**Prevention:**
- The `dedup_key` must be treated as immutable once stored — its computation must not change for existing event types
- When changing `dedupKey()`, version the function and add a migration that recomputes keys for new events only (use a `normalizer_version` field, already planned in Milestone 2)
- Add a test that asserts a known payload always produces the same `dedup_key` across versions

**Phase:** Milestone 2 (normalizer_version fields) — the test can be added in Milestone 1 as a regression guard

---

### 6.4 MEDIUM — Raw payload stored as `raw_payload TEXT` loses type fidelity for future reprocessing

**What goes wrong:** `raw_payload` is stored as a TEXT column (JSON string). If a future migration needs to reprocess raw payloads to backfill a new field, it must parse JSON from TEXT — which is fine, but if the original JSON contained non-UTF-8 bytes or was stored with encoding loss, the reprocessing produces different output than the original ingest.

**Warning signs:**
- Backfill jobs produce different results than original ingest for non-ASCII content
- `json.Unmarshal` on stored `raw_payload` fails for some rows

**Prevention:**
- This is a known acceptable tradeoff for SQLite; no change needed now
- When implementing the raw payload archive layer (Milestone 2), ensure the storage type is explicitly `TEXT` (not BLOB) and document the UTF-8 assumption
- Add a sanity check in the ingest path: if `raw_payload` contains non-UTF-8 bytes, log a warning

**Phase:** Milestone 2 (raw payload archive layer)

---

## 7. Release Process Pitfalls

### 7.1 HIGH — Squash-merge strategy breaks release-please/conventional commits automation

**What goes wrong:** If the repository uses GitHub's default "merge commit" strategy (or allows all three strategies), release-please cannot reliably parse conventional commit prefixes. A PR merged as a merge commit produces `Merge pull request #N from user/branch` as the commit message — release-please skips it. Versions are never bumped, changelogs are empty, and the automation silently does nothing.

**Why it happens:** release-please requires a linear commit history with conventional-commit messages. Merge commits obscure the PR-level message.

**Warning signs:**
- `release-please` runs on every push to main but never opens a release PR
- Changelog shows no entries despite merged `feat:` PRs

**Prevention:**
- Enforce squash-merge only in the GitHub repository settings ("Allow squash merging" only, disable "Allow merge commits" and "Allow rebase merging")
- Configure branch protection to require PR title to follow conventional commits format (GitHub has a built-in PR title validation option, or use the `amannn/action-semantic-pull-request` Action)
- For a solo project, the simpler alternative is `goreleaser` with manual tagging and a `CHANGELOG.md` maintained by convention — this avoids the commit discipline requirement entirely

**Phase:** Milestone 1 (versioned releases) — decide on the strategy before any releases are published

---

### 7.2 HIGH — Embedded SPA assets are stale after `go build` without a preceding `pnpm build`

**What goes wrong:** The release workflow must build the frontend before building the Go binary. If the CI workflow runs `go build` without first running `pnpm run build`, it embeds whatever assets are in `frontend/dist/` from a previous build — or fails with "embed: no matching files" if `dist/` does not exist. A published release binary contains stale frontend code.

**Warning signs:**
- Release binary serves a UI version different from the git tag
- `/api/version` returns the correct version but the UI shows an older build timestamp

**Prevention:**
- The release workflow must have explicit step ordering:
  ```
  1. pnpm install --frozen-lockfile
  2. pnpm run build
  3. go build -ldflags "-X hooker/internal/version.Version=$(git describe --tags)"
  ```
- Add a build-time assertion: the embedded `index.html` should contain the build hash. The Go binary should log the frontend build hash at startup so mismatches are visible.
- Never publish a release without running the full build sequence in CI

**Phase:** Milestone 1 (versioned releases)

---

### 7.3 MEDIUM — Version string not injected via ldflags produces `dev` in all non-CI builds

**What goes wrong:** `version.Version` is a compile-time constant. If contributors build locally with `go build ./cmd/server` (without `-ldflags "-X hooker/internal/version.Version=..."`), the binary reports `dev` or an empty string. Users who build from source and report bugs cannot be diagnosed by version because the version is always `dev`.

**Warning signs:**
- Bug reports that include version: `dev`
- The `doctor` command reports version as `dev` even on a tagged commit

**Prevention:**
- The helper script's build command should always inject the version:
  ```bash
  go build -ldflags "-X hooker/internal/version.Version=$(git describe --tags --always --dirty)" -o hooker ./cmd/server
  ```
- Document this in `CONTRIBUTING.md`
- The `doctor` command should warn if the running version is `dev`

**Phase:** Milestone 1 (versioned releases + app version visible in logs)

---

### 7.4 MEDIUM — Checksum file format incompatible with standard tools makes verification harder for users

**What goes wrong:** The existing `scripts/release-checksums` generates a checksum file. If the format does not match `sha256sum -c` expectations (e.g., wrong whitespace, missing filename format), users who try to verify the download get an error and assume the file is corrupt.

**Warning signs:**
- `sha256sum -c checksums.txt` exits non-zero despite correct file
- Users skip verification because it does not work

**Prevention:**
- Use the standard `sha256sum` output format: `<hash>  <filename>` (two spaces)
- Test the checksum file with `sha256sum -c` in CI as part of the release workflow
- Include verification instructions in the release notes

**Phase:** Milestone 1 (versioned releases with checksums)

---

### 7.5 LOW — GitHub Actions workflow permissions not scoped narrowly enough for release automation

**What goes wrong:** Release workflows that use `permissions: write-all` or the default `GITHUB_TOKEN` with full permissions can create supply chain risks. For a solo project this is low probability, but if the repository ever accepts external contributions, a compromised workflow could push malicious releases.

**Warning signs:**
- Workflow YAML has `permissions: write-all` or no `permissions` block
- Release workflow has access to secrets beyond `GITHUB_TOKEN`

**Prevention:**
- Scope permissions explicitly:
  ```yaml
  permissions:
    contents: write   # for release creation
    id-token: none
  ```
- Keep release secrets (if any, e.g., signing keys) in environment-scoped secrets, not repository-wide secrets

**Phase:** Milestone 1 (CI setup) — set permissions correctly from the start

---

## Phase-Specific Warning Summary

| Phase | Topic | Highest-Risk Pitfall | Mitigation Priority |
|-------|-------|----------------------|---------------------|
| M1 | CI setup | Go cache keyed on go.mod only | Fix cache key before first CI run |
| M1 | CI setup | pnpm version drift | Pin packageManager in package.json |
| M1 | CI setup | Migration file edited silently | Add checksum CI check |
| M1 | Helper script | Silent failures from set -e | Add ERR trap with line number |
| M1 | DB path | Multiple hooker.db locations | Emit resolved DB path prominently |
| M1 | Security | DNS rebinding via wildcard CORS | Add Host header validation (15-line fix) |
| M1 | Security | 0.0.0.0 bind with no warning | Add startup log warning |
| M1 | Releases | Squash vs merge commit strategy | Decide and enforce before first tag |
| M1 | Releases | SPA not built before go build | Enforce workflow step ordering |
| M2 | SQLite | Partial migration leaves DB stuck | Wrap migrations in transactions |
| M2 | SQLite | WAL grows unbounded under SSE load | Add autocheckpoint + periodic PASSIVE checkpoint |
| M2 | SQLite | NOT NULL column on populated DB | Require DEFAULT in all ADD COLUMN migrations |
| M2 | SQLite | dedup_key computation change | Add regression test for known payloads |
| M2 | Frontend tests | EventSource global stub leaks | Add unstubGlobals: true to vitest.config |
| M2 | Frontend tests | act() warnings not failing tests | Add console.error spy in test setup |
| M3 | Security | CORS wildcard replacement | Explicit allowlist + CORS_ORIGINS env |
| M3 | Security | localStorage API key | Move to session-only storage |
