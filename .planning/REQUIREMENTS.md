# Requirements — hooker

## v1 Requirements

### Installation & Distribution (INSTALL)

- [x] **INSTALL-01**: User can run `./scripts/hooker setup` to install dependencies and patch Claude Code/Codex/Gemini CLI hook config automatically
- [x] **INSTALL-02**: User can run `./scripts/hooker doctor` to check Go version, Node version, DB writability, port availability, and hook config presence — with required failures vs optional warnings clearly separated
- [ ] **INSTALL-03**: User can follow `docs/quickstart.md` and reach first successful hook event capture in under 10 minutes using `go build` (not `go run`)
- [ ] **INSTALL-04**: App emits resolved DB path on startup so user can verify which database file is in use
- [ ] **INSTALL-05**: README is short and action-oriented; detailed content lives in `docs/install.md`, `docs/quickstart.md`, `docs/hooks.md`
- [ ] **INSTALL-06**: Explicit support matrix documented (macOS/Linux/WSL first-class; Go and Node minimum versions; pnpm required for frontend)
- [x] **INSTALL-07**: pnpm enforced via `packageManager` field + `engine-strict=true` in `.npmrc`; `npm`/`yarn` not usable accidentally

### CI & Verification (CI)

- [x] **CI-01**: Every push/PR runs backend `go test ./...`, `go vet ./...`, `golangci-lint run ./...`
- [x] **CI-02**: Every push/PR runs frontend typecheck, Vitest test suite, and Vite build
- [x] **CI-03**: `govulncheck` runs in CI (initially `continue-on-error: true` until existing findings triaged)
- [x] **CI-04**: Go module cache keyed on `go.sum` (not just `go.mod`)
- [x] **CI-05**: pnpm version pinned via `packageManager` field; CI uses corepack, not `npm install -g pnpm`
- [x] **CI-06**: Frontend build is a declared dependency of Go binary build step in release workflow (embed directive cannot build without dist/)

### Diagnostics & Health (DIAG)

- [x] **DIAG-01**: `GET /healthz` returns 200 when process is running
- [x] **DIAG-02**: `GET /readyz` returns 200 only when DB is open and migrations are complete
- [ ] **DIAG-03**: `GET /api/version` returns app version, Git commit, and build date
- [ ] **DIAG-04**: App version visible in frontend UI
- [ ] **DIAG-05**: Startup emits actionable fatal error messages for: port already in use, DB path not writable, migration failure, invalid config
- [x] **DIAG-06**: `doctor` warns on non-loopback bind address

### Data Lifecycle (DATA)

- [ ] **DATA-01**: DB file location and override behavior documented; WAL file behavior explained
- [ ] **DATA-02**: Backup instructions documented (copy `.db` + `.db-wal` + `.db-shm`)
- [ ] **DATA-03**: Reset/cleanup instructions documented (delete DB file, restart to re-run migrations)
- [ ] **DATA-04**: User can export all events as streaming NDJSON via `GET /api/export/events`
- [ ] **DATA-05**: User can export a full-fidelity SQLite snapshot via `GET /api/export/snapshot` (uses `VACUUM INTO`)
- [ ] **DATA-06**: Manual prune/cleanup command or script documented
- [ ] **DATA-07**: Privacy warning documented: prompts, diffs, file paths, tool outputs are stored locally

### Event Data Model (MODEL)

- [ ] **MODEL-01**: Raw payload bytes stored on every ingested event (wire `e.RawPayload = raw` in handler; confirm `repository.Add` SQL includes column)
- [ ] **MODEL-02**: `normalizer_version` field added to stored events so future re-processing can identify which adapter version produced a record
- [ ] **MODEL-03**: `agent_version` field captured when available in hook payload
- [ ] **MODEL-04**: Unknown or partially-supported payloads ingested in degraded mode (store raw, extract whatever canonical fields are available, mark normalization status as partial)
- [ ] **MODEL-05**: `dedupKey()` locked by a snapshot regression test asserting a known payload always produces the same key

### Backend Hardening (HARD)

- [ ] **HARD-01**: HTTP server configured with `ReadHeaderTimeout`, `ReadTimeout`, `IdleTimeout`; `WriteTimeout: 0` for SSE endpoint specifically
- [ ] **HARD-02**: Graceful shutdown drains with a finite context timeout (not `context.Background()` which can hang forever on open SSE tabs)
- [ ] **HARD-03**: Panic recovery middleware logs stack trace and returns 500 instead of crashing process
- [ ] **HARD-04**: `log.Printf` replaced with `log/slog` structured logging (zero new deps)
- [ ] **HARD-05**: Migration runner wraps each migration in `BEGIN`/`COMMIT` with version record inside the same transaction (prevents partial-apply stuck state)
- [ ] **HARD-06**: Background goroutine runs `PRAGMA wal_checkpoint(PASSIVE)` periodically to prevent unbounded WAL growth from long-lived SSE connections

### Security (SEC)

- [x] **SEC-01**: Host header validation middleware rejects requests where Host is not `localhost`, `127.0.0.1`, or `[::1]` (prevents DNS rebinding attack on wildcard CORS)
- [ ] **SEC-02**: CORS origin restricted to explicit allowlist (not `*`) — at minimum `http://localhost` + configured port
- [ ] **SEC-03**: Loopback-only bind (`127.0.0.1`) is enforced default; remote bind requires explicit env var opt-in with startup warning
- [ ] **SEC-04**: Threat model documented: localhost-use only, single-user trust model, no auth for loopback use, remote sharing via ngrok is unofficial/unsupported
- [ ] **SEC-05**: Export endpoints (`/api/export/*`) implement `Sec-Fetch-Site` check before being publicly documented

### Testing & Regression (TEST)

- [ ] **TEST-01**: Frontend: `@testing-library/user-event@^14` added; `unstubGlobals: true` in `vitest.config.ts`
- [ ] **TEST-02**: Frontend: React Testing Library coverage for session rendering, event grouping, dashboard stats rendering, usage display, loading/error states
- [ ] **TEST-03**: Frontend: hook tests for `useSessions`, `useDashboardStats`, `useTraces`
- [ ] **TEST-04**: Backend: full-stack `httptest.NewServer` round-trip test (ingest fixture payload → verify via GET API)
- [ ] **TEST-05**: Backend: migration correctness test against file-based DB with pre-existing rows (not just `:memory:`)
- [ ] **TEST-06**: Backend: fixture corpus for known Claude Code and Codex payload variants; regression tests assert normalization output
- [ ] **TEST-07**: Browser E2E smoke (Playwright, chromium-only): start app, load events/sessions/dashboard, verify core data visible

### Release & Versioning (REL)

- [x] **REL-01**: GoReleaser OSS v2 configured; produces linux/darwin/windows × amd64/arm64 binaries with `checksums.txt`
- [x] **REL-02**: Release workflow triggers on `v*` tags only; CI workflow runs on every push/PR
- [ ] **REL-03**: Squash-merge enforced in GitHub repo settings (required for GoReleaser changelog automation)
- [x] **REL-04**: Conventional commits recommended on PR titles; changelog generated automatically by GoReleaser
- [ ] **REL-05**: App version injected at build time via ldflags (`git describe --tags --always`)

### Privacy & Data Controls (PRIV)

- [ ] **PRIV-01**: gitignore-style path exclusion file (`~/.config/hooker/ignore` or `$HOOKER_IGNORE`) — matched paths not ingested
- [ ] **PRIV-02**: Privacy warning visible in setup docs and `doctor` output: what categories of data are captured
- [ ] **PRIV-03**: Privacy implications of NDJSON/snapshot export documented (exports contain full prompts, diffs, file paths)

### Contributor Infrastructure (CONTRIB)

- [ ] **CONTRIB-01**: `CONTRIBUTING.md` covers: project structure, layer boundaries, how to add a new agent adapter (adapter contract + fixture requirement), when to add new DB columns vs extension data
- [ ] **CONTRIB-02**: ADRs documented for: SQLite choice, hook normalization strategy, local-first positioning, proxy scope
- [ ] **CONTRIB-03**: Frontend-backend contract change process documented: update shared types + fixtures + tests on both sides

---

## v2 Requirements (Deferred)

### Search & Filtering
- Full-text search across prompts, paths, tools, models, errors (SQLite FTS5 with BM25 ranking)
- Filter UI: agent, session, time range, model, event type, status
- URL-driven filter state (bookmarkable via React Router search params)
- Saved filter presets (browser-local first, backend-persisted later)

### Diagnostics UI
- Diagnostics page: DB size, event count, normalizer versions, last-seen agent, hook health, app version
- Hook compatibility warnings visible in UI
- DB maintenance actions (vacuum, checkpoint status)

### Analytics
- Better token and cost analytics
- Anomaly highlighting for failed tool runs / repeated retries
- Agent/session comparison tools
- Richer diff navigation and code context

### Operability
- Structured log mode (JSON output)
- Optional metrics endpoint
- Built-in sample data mode for demos (`hooker seed` formalized)
- JSON import / SQLite snapshot restore

### Security (deferred)
- Optional local auth token for non-loopback use
- Signed release artifacts

---

## Out of Scope

- **Kubernetes/distributed tracing/horizontal scaling** — local-first product; SQLite until proven bottleneck
- **Multi-tenant auth / cloud control plane** — out of product scope; not in roadmap
- **Native Windows first-class support** — macOS/Linux/WSL are first-class; Windows documented separately if at all
- **Binary release artifacts before source install is solid** — source install is the lead path; GoReleaser binaries are Phase 1 end goal, not starting point
- **External adapter plugin system** — keep adapters in-tree until ecosystem justifies complexity
- **Remote sharing / ngrok as official feature** — unofficial/advanced only; public internet exposure not supported
- **Automatic PII redaction** — creates false confidence; gitignore-style exclusion is the right scope
- **curl-pipe-bash install script** — wrong trust model for a tool that stores sensitive dev data
- **Replacing SQLite** — not until real usage data demands it

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| INSTALL-01 | Phase 1 | Complete |
| INSTALL-02 | Phase 1 | Complete |
| INSTALL-03 | Phase 1 | Pending |
| INSTALL-04 | Phase 1 | Pending |
| INSTALL-05 | Phase 1 | Pending |
| INSTALL-06 | Phase 1 | Pending |
| INSTALL-07 | Phase 1 | Complete |
| CI-01 | Phase 1 | Complete |
| CI-02 | Phase 1 | Complete |
| CI-03 | Phase 1 | Complete |
| CI-04 | Phase 1 | Complete |
| CI-05 | Phase 1 | Complete |
| CI-06 | Phase 1 | Complete |
| DIAG-01 | Phase 1 | Complete |
| DIAG-02 | Phase 1 | Complete |
| DIAG-03 | Phase 1 | Pending |
| DIAG-04 | Phase 1 | Pending |
| DIAG-05 | Phase 1 | Pending |
| DIAG-06 | Phase 1 | Complete |
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-03 | Phase 1 | Pending |
| DATA-06 | Phase 1 | Pending |
| DATA-07 | Phase 1 | Pending |
| SEC-01 | Phase 1 | Complete |
| REL-01 | Phase 1 | Complete |
| REL-02 | Phase 1 | Complete |
| REL-03 | Phase 1 | Pending |
| REL-04 | Phase 1 | Complete |
| REL-05 | Phase 1 | Pending |
| DATA-04 | Phase 2 | Pending |
| DATA-05 | Phase 2 | Pending |
| MODEL-01 | Phase 2 | Pending |
| MODEL-02 | Phase 2 | Pending |
| MODEL-03 | Phase 2 | Pending |
| MODEL-04 | Phase 2 | Pending |
| MODEL-05 | Phase 2 | Pending |
| HARD-01 | Phase 2 | Pending |
| HARD-02 | Phase 2 | Pending |
| HARD-03 | Phase 2 | Pending |
| HARD-04 | Phase 2 | Pending |
| HARD-05 | Phase 2 | Pending |
| HARD-06 | Phase 2 | Pending |
| TEST-01 | Phase 2 | Pending |
| TEST-02 | Phase 2 | Pending |
| TEST-03 | Phase 2 | Pending |
| TEST-04 | Phase 2 | Pending |
| TEST-05 | Phase 2 | Pending |
| TEST-06 | Phase 2 | Pending |
| TEST-07 | Phase 2 | Pending |
| SEC-05 | Phase 2 | Pending |
| SEC-02 | Phase 3 | Pending |
| SEC-03 | Phase 3 | Pending |
| SEC-04 | Phase 3 | Pending |
| PRIV-01 | Phase 3 | Pending |
| PRIV-02 | Phase 3 | Pending |
| PRIV-03 | Phase 3 | Pending |
| CONTRIB-01 | Phase 3 | Pending |
| CONTRIB-02 | Phase 3 | Pending |
| CONTRIB-03 | Phase 3 | Pending |

---

*Generated: 2026-05-24 from plan.md + research synthesis*
