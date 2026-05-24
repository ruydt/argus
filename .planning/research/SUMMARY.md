# Research Summary — hooker

## Executive Summary

hooker is a working prototype that needs hardening into a reliable daily-use product. The stack (Go + React + SQLite + SSE) is the right choice and requires no changes — every architectural decision is validated. The immediate problem is that a functional codebase is not the same as a trustworthy product: there are live bugs in CORS (DNS rebinding vector), no CI, no graceful shutdown, no migration transaction safety, and a raw payload archive gap (one missing line in the handler). These must be fixed before any feature work.

The competitive landscape confirms hooker's positioning. Go binary with no runtime friction, SSE streaming, and explicit local-first privacy are genuine advantages over AgentPulse (Bun), multi-agent-observability (Bun + Vue), and Agent Flow. The differentiator gap is closure of table stakes that no comparable tool has either: `doctor` command, version visibility, health endpoints, NDJSON export, and SQLite snapshot.

---

## Recommended Stack

No changes to current stack. Additions only:

| Technology | Role | Action |
|---|---|---|
| Go stdlib `net/http` | Backend + SSE | Keep; add panic recovery + timeouts (`WriteTimeout: 0` for SSE) |
| `log/slog` | Structured logging | Replace `log.Printf` — stdlib since Go 1.21, zero new deps |
| Vitest 4.x + RTL 16 | Frontend unit tests | Keep; add `@testing-library/user-event@^14` |
| Playwright (to add) | E2E smoke | Chromium-only, CI-only, 3-5 tests max |
| GoReleaser OSS v2 | Binary releases | Add; linux/darwin/windows × amd64/arm64; requires `fetch-depth: 0` |
| govulncheck-action | Vuln scanning | Add to CI; more precise than Dependabot for Go (call-graph-aware) |

**Critical config facts:**
- `WriteTimeout: 0` is mandatory on SSE endpoint — non-zero kills streaming connections
- `go-version-file: backend/go.mod` in CI (not hardcoded version)
- pnpm setup via `packageManager` field + corepack in CI (not `npm install -g pnpm`)
- Frontend build must be a declared CI dependency of Go binary step (embed directive)

---

## Table Stakes Features (M1)

Features whose absence makes the product feel broken or untrustworthy:

1. `./scripts/hooker doctor` — checks Go/Node versions, DB writable, port free, hook config in `~/.claude/settings.json`
2. `/healthz` + `/readyz` (readyz includes DB-open check)
3. Version in logs + UI + `/api/version` (ldflags: `git describe --tags`)
4. Startup fatal errors with actionable messages (port in use, DB not writable, migration failure)
5. Automatic hook configuration — setup script writes/patches agent settings files
6. DB location documented + backup instructions (WAL file behavior explained)
7. JSON/NDJSON export via `GET /api/export/events` — no comparable tool has this

---

## Differentiators

Features none of the comparable tools (AgentPulse, multi-agent-observability, Agent Flow) offer:

1. **NDJSON export + SQLite snapshot** — streaming `GET /api/export/events` (cursor, no buffering) and `GET /api/export/snapshot` (`VACUUM INTO` to temp file). No comparable tool has export without DB access.
2. **SQLite FTS5 full-text search** — BM25 ranking across prompts, tool names, file paths, errors. Dual-table architecture (FTS virtual + standard for facets). Phase 4 but clearest competitive moat.
3. **gitignore-style path exclusion** — per-path capture exclusion at ingest time. No comparable tool has this privacy control.
4. **URL-driven filter state** — bookmarkable/shareable filter URLs via React Router search params.
5. **Diagnostics UI page** — DB size, event count, normalizer versions, last-seen agent, hook health.
6. **Built-in sample data mode** — `hooker seed` (partial implementation in `cmd/seed` already).

---

## Critical Pitfalls (Live Bugs — Must Fix)

**Before any public documentation:**
1. **DNS rebinding via wildcard CORS** (`Access-Control-Allow-Origin: *` on a localhost server storing prompts/diffs). Fix: Host header validation middleware rejecting non-`localhost`/`127.0.0.1`/`[::1]` requests. ~15-line Go change. **Ships in M1.**

**Before any new migrations:**
2. **Migration runner not transactional** — multi-statement migrations apply partially on power loss/OOM kill, then refuse to restart with "duplicate column" errors. DB stuck unrecoverable. Fix: wrap each migration in `BEGIN`/`COMMIT` with version record inside the same transaction. **Ships in M2.**

**One-liner fix, blocks M2 feature:**
3. **Raw payload archive gap** — `e.RawPayload = raw` never assigned in `handler/hook.go` before `svc.AddEvent(e)`. Schema column exists (`raw_payload TEXT DEFAULT ''` in migration 001). One-line handler fix + confirm SQL INSERT includes the column. **Fix in M2.**

**Onboarding trust destruction:**
4. **DB path resolves differently under `go run` vs binary** — users accumulate two separate databases, sessions appear to "disappear." Fix: emit resolved DB path on startup; `doctor` warns on mismatch; quickstart shows `go build`, not `go run`.

**SQLite WAL growth:**
5. **SSE read connection blocks WAL checkpoint** — with browser tab open, `.db-wal` file grows unbounded. Fix: periodic `PRAGMA wal_checkpoint(PASSIVE)` in background goroutine. **Ships in M2.**

**Frontend test integrity:**
6. **SSE global stub leaks between Vitest test files** — `vi.stubGlobal('EventSource', MockES)` without cleanup causes non-deterministic failures. Fix: `unstubGlobals: true` in `vitest.config.ts`.

**Dedup key drift:**
7. **`dedupKey()` change silently re-ingests all events as duplicates** — no regression test locks the computation. Add one snapshot test asserting a known payload always produces the same key.

---

## Build Order

**Phase 1 — Local Adoption Baseline**
CI first (gates all changes), then Host header fix (before public docs), then doctor/health/version/export/quickstart. GoReleaser + checksums closes milestone.

*Avoid:* Go module cache keyed on `go.mod` alone (must include `go.sum`), pnpm version drift in CI, `go run` in quickstart docs.

**Phase 2 — Reliable Daily Use**
Panic recovery middleware + HTTP timeouts + shutdown drain (zero-risk, immediate stability). Migration transaction wrapping (prerequisite for all subsequent schema work). Raw payload archive + `normalizer_version` fields. Frontend regression coverage + Playwright smoke. WAL autocheckpoint goroutine.

*Avoid:* NOT NULL without DEFAULT in any new migration, package-level `*DB` in tests.

**Phase 3 — Mature Local Product**
CORS tightening (replace `*` with allowlist + `Sec-Fetch-Site` check). Privacy controls (path exclusion at ingest). Contributor infrastructure (CONTRIBUTING.md, adapter contract, ADRs). `EventService` decomposition.

**Phase 4 — Product Features**
FTS5 full-text search (requires migration correctness from M2 + `normalizer_version` field). URL-driven filters. Diagnostics page. Anomaly highlighting. Sample data mode formalized.

---

## Open Questions

1. Does `repository.Add` SQL include `raw_payload` column? (Almost certainly omitted — verify before wiring handler fix.)
2. `WriteTimeout: 0` globally acceptable for M1/M2 (loopback only). Revisit in M3 when non-loopback bind is documented.
3. NDJSON/snapshot export access control — Phase 1 ships without (loopback default). Phase 3 must add `Sec-Fetch-Site` check before endpoints are publicly documented.
4. Squash-merge vs merge commits — must decide and enforce in GitHub settings before first GoReleaser tag ships.
5. `govulncheck` initial CI job should use `continue-on-error: true` until existing findings are triaged.

---

*Generated: 2026-05-24 from parallel research across Stack, Features, Architecture, and Pitfalls dimensions.*
