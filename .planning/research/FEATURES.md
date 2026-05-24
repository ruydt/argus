# Feature Landscape: hooker

**Domain:** Local-first AI coding session monitoring dashboard
**Researched:** 2026-05-24
**Scope:** Install/onboarding UX, self-diagnostics, data portability, search/filtering, privacy controls

---

## Table Stakes

Features users expect when installing a local developer monitoring tool. Missing = product feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single-command install or a short quickstart | Every comparable tool (AgentPulse, Pi-hole, mise) ships `curl \| bash` or a one-liner. Source-install tools that take >15 min before first data are abandoned. | Low | hooker targets source install; a `./scripts/hooker setup` + copy-paste hook config covers this without curl-pipe-bash risks |
| Automatic hook configuration | AgentPulse auto-writes `~/.claude/settings.json` and `~/.codex/hooks.json` on setup. Users expect this; manual JSON editing is a failure point. | Low–Med | The setup script should detect which agents are installed and write or patch hook config |
| Health endpoint (`/healthz`) | Standard contract since Kubernetes popularized it. Any operator or health-checker (uptime tools, `watch curl`) expects 200/non-200. | Low | Already in Milestone 1 requirements; return 200 when DB is open, non-200 otherwise |
| Readiness endpoint (`/readyz`) | Separate from liveness — indicates "ready to accept traffic." Distinct from /healthz per current conventions (Kubernetes deprecated conflated endpoint in 1.16). | Low | Return 200 only after migrations complete and first DB write succeeds |
| Version visible in logs and UI | Without a version number, users can't report bugs or know if they're running the latest build. Every mature CLI tool and dashboard shows this. | Low | ldflags pattern: `-X main.version=$(git describe --tags)`; expose at `/api/version`; show in footer/sidebar |
| `doctor` subcommand | `flutter doctor`, `brew doctor`, `wp-cli doctor`, Salesforce CLI doctor — the pattern is ubiquitous. Users hit config problems (port in use, DB not writable, hook not set up) and need a single command to diagnose them. | Med | Check: Go version, Node version, DB file writable, port availability, hook config present in `~/.claude/settings.json`, network bind address warning if not loopback |
| Startup fatal errors with actionable messages | If the DB can't open or the port is bound, the process must exit with a clear message ("port 3000 already in use, set ADDR=:3001"). Silent startup failures destroy trust. | Low | Already identified in Milestone 1 |
| Documentation of DB file location + backup instructions | Users will eventually need to back up or reset. SQLite tools (rqlite, Datasette) always document `cp app.db backup.db` and WAL file handling. Must warn: delete `.db-wal` and `.db-shm` before restoring. | Low | A `docs/backup.md` section or README callout; also document `DB_PATH` env var |
| Manual data prune/cleanup path | Long-running tools accumulate data. Users expect either a CLI prune command or documented `DELETE FROM events WHERE created_at < ...` instructions. | Low | Documented SQL + optional `hooker prune --before=30d` command |
| Retention defaults documented | "How long does this tool keep my data?" is a common first question. Explicit answer required — even if the answer is "forever unless you prune." | Low | Single paragraph in README or docs/data.md |

---

## Differentiators

Features that comparable tools lack or do poorly — these create competitive advantage or meaningfully improve daily use.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Full-text search across prompts, paths, tools, errors | AgentPulse has BM25 FTS. The multi-agent observability tool has basic type/session filtering only. FTS across the full event corpus (prompts, tool names, file paths, error messages) makes hooker the best retrospective research tool. | Med–High | SQLite FTS5 with a dual-table architecture: FTS virtual table for relevance, standard table for facet filtering. BM25 ranking. ~10–30ms on years of local data. |
| URL-driven filter state | Datasette proved that shareable, bookmarkable filter URLs are a superpower for local data tools. Being able to link a teammate to "all failed tool runs in session X" is far above table stakes. | Med | Encode active filters in query params; use React Router search params |
| Saved filter presets | Windows Event Viewer, Papertrail, and enterprise log tools all have saved views. For daily users, one-click access to "today's errors" or "last Claude session" is a quality-of-life win no comparable local tool offers. | Med | Persist named filter sets to localStorage; UI to name/recall/delete |
| gitignore-style path exclusion (`~/.config/hooker/ignore`) | None of the comparable tools have per-path exclusion. AgentPulse has regex redaction only for AI processing. A `.hookerignore`-style file letting users exclude `~/work/client-x/**` from capture is a credible privacy differentiator. | Med | Parse glob patterns at ingest time in `handler/hook.go`; paths matching any pattern are dropped before persistence |
| Diagnostics page in UI | A browser-accessible page showing: DB size, event count, normalizer versions, last-seen agent, hook health status (timestamp of last received payload). No comparable local tool surfaces this. | Med | Aggregated from `/api/version` + `/readyz` + a new `/api/stats` extended endpoint |
| Anomaly highlighting | Repeated tool retries, consecutive failures, abnormally long tool durations — surfaced visually in the timeline. None of the comparable tools do this. Turns hooker into a debugging aid, not just a log viewer. | Med–High | Computed at query time from event sequences; UI badge/highlight on anomalous runs |
| Built-in sample data mode | `hooker seed` or `--demo` flag that loads realistic synthetic sessions. Lets new users evaluate the product before configuring agent hooks. No comparable tool offers this (hooker already has `cmd/seed`). | Low | Already partially exists; formalize as a documented mode |
| `/api/version` with build metadata | Git commit hash + build date + normalizer version in one endpoint. Upstream debugging ("what version was running when this happened?") is impossible without this. AgentPulse has version info; the multi-agent tool does not. | Low | ldflags pattern; JSON response `{version, commit, buildDate, normalizerVersion}` |
| JSON export via HTTP | `GET /api/events/export?format=json&since=...` downloads a JSONL file of events in canonical domain format. Users can pipe to `jq`, import to other tools, or archive. No comparable tool exposes this without DB access. | Low–Med | Stream query results as JSONL; Content-Disposition header for download |
| SQLite snapshot download | `GET /api/db/snapshot` streams a hot backup of the SQLite file using the online backup API. Comparable to how Litestream and rqlite handle this. Enables zero-config backup without knowing the DB_PATH. | Med | Use `sqlite3_backup_*` API (available via modernc.org/sqlite driver) |

---

## Anti-Features

Features to explicitly skip — with rationale for why they would hurt more than help.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Automatic redaction / PII scrubbing at ingest | Building reliable regex-based PII detection is a product unto itself. OpenTelemetry Collector's redaction processor is a full component; doing it poorly creates false confidence ("I thought my secrets were scrubbed"). | Document clearly that hooker stores everything it receives; provide path exclusion to prevent capture at the source |
| Telemetry / phone-home | AgentPulse enables anonymous telemetry by default (`AGENTPULSE_TELEMETRY` opt-out). Local-first tools that secretly phone home generate community backlash when discovered. hooker's positioning is explicitly local-first privacy. | Add a clear statement in docs: "hooker sends no data anywhere. All data stays in your local SQLite file." |
| curl-pipe-bash install | Pi-hole does this and gets community criticism for it. For a tool that stores prompts and file paths, users are appropriately skeptical. | Use `./scripts/hooker setup` — explicit, readable, auditable. One extra step worth the trust. |
| Multi-agent orchestration (launch/retry sessions) | AgentPulse adds session launch and retry. This is a different product — a controller, not an observer. Scope creep here would require significant new infra (process management, PTY, IPC) and dilute the monitoring value prop. | Stay read-only observer; link to the agent's own UI for control |
| Saved views stored server-side | Server-side persistence of UI preferences requires a users table, session management, and migration complexity. Disproportionate overhead for a single-user local tool. | localStorage for saved filters; export/import as JSON files if sharing is needed |
| PostgreSQL or external DB support | AgentPulse offers Postgres for "multi-replica setups." hooker's constraint is explicit: SQLite until real usage demands otherwise. Adding a second DB path doubles test surface and migration complexity. | Stay SQLite; document WAL mode for concurrent access |
| Plugin/adapter system for external agents | Too early. Keeping adapters in-tree with fixture coverage requirements is the right call until there are >3 community-contributed adapters demanding extraction. | In-tree adapters with a clear `CONTRIBUTING.md` adapter contract |
| Binary release artifacts (initial) | Cross-platform binary builds require CI matrix testing, code signing (macOS notarization), and ongoing maintenance. Source install + Docker covers the target audience first. | Document `go install` path; add Docker as secondary |
| WebSocket instead of SSE | The multi-agent observability tool uses WebSocket (Vue + Bun). SSE is simpler, works over plain HTTP, needs no upgrade handshake, and is sufficient for one-directional server push. Replacing SSE would be a rewrite with no user benefit. | Keep SSE; document its design in architecture ADR |

---

## Feature Dependencies

```
doctor command → /healthz + /readyz (must exist to be checked)
doctor command → hook config detection (reads ~/.claude/settings.json)
FTS search → SQLite FTS5 migration (new migration adding virtual table)
FTS search → search API endpoint → UI search input
URL-driven filters → React Router search params → filter state refactor
Saved filter presets → URL-driven filters (presets are named URL snapshots)
Anomaly highlighting → event sequence query → UI badge layer
Diagnostics UI page → /api/version endpoint + /api/stats endpoint
SQLite snapshot → online backup API support in modernc.org/sqlite driver
JSON export → streaming query handler → JSONL response
gitignore-style exclusion → ingest-time path matching → exclusion config file format
```

---

## MVP Recommendation (Milestone 1 scope)

Prioritize for immediate trust and adoption:

1. `doctor` subcommand — eliminates the #1 install failure mode
2. `/healthz` + `/readyz` — makes hooker integrate with any monitoring setup
3. Version in logs + UI + `/api/version` — enables bug reports
4. Startup fatal errors with actionable messages — prevents silent failures
5. DB location docs + backup/reset instructions — answers the first data question
6. JSON export — unlocks data portability without full FTS complexity
7. Built-in sample data mode — reduce time-to-value for evaluators

Defer to Phase 4:
- **FTS search**: Requires a new migration and FTS5 virtual table. High value but correct after the reliability foundation is stable (Milestone 2).
- **Saved filter presets**: Nice-to-have; localStorage implementation is low-risk, but ship basic URL-driven filters first.
- **Anomaly highlighting**: Requires event sequence analysis design; defer until event model is stable with `normalizer_version` field (Milestone 2).
- **gitignore-style exclusion**: Medium complexity; correct after security threat model is documented (Milestone 3).
- **SQLite snapshot endpoint**: Verify modernc.org/sqlite backup API support before scheduling; medium complexity.

---

## Competitive Landscape Summary

| Tool | Stack | FTS | Privacy controls | Export | Doctor/Health |
|------|-------|-----|-----------------|--------|---------------|
| hooker (current) | Go + React + SQLite | None | None documented | None | /healthz planned |
| claude-code-hooks-multi-agent-observability | Bun + Vue + SQLite | None | Command blocklist | None | None |
| AgentPulse | Bun + SQLite/Postgres | BM25 FTS | Telemetry opt-out; AI redaction (experimental) | None (DB access only) | None visible |
| Agent Flow | TypeScript + ? | None visible | None visible | None | None |
| Datasette (reference) | Python + SQLite | FTS5 | N/A (viewer) | CSV/JSON/SQL | N/A |

hooker's gap: no FTS, no export, no documented privacy position. Its advantage: Go binary (lower runtime friction), SSE streaming, explicit local-first positioning.

---

## Sources

- AgentPulse GitHub: https://github.com/jstuart0/agentpulse
- claude-code-hooks-multi-agent-observability: https://github.com/disler/claude-code-hooks-multi-agent-observability
- Agent Flow GitHub: https://github.com/patoles/agent-flow
- Flutter doctor pattern: https://mailharshkhatri.medium.com/flutter-doctor-diagnosing-setup-problems-768bcf783ae4
- wp-cli doctor command: https://github.com/wp-cli/doctor-command
- Blackfire Doctor: https://docs.blackfire.io/up-and-running/doctor
- /healthz vs /readyz patterns: https://kubernetes.io/docs/reference/using-api/health-checks/
- SQLite FTS5 in practice: https://thelinuxcode.com/sqlite-full-text-search-fts5-in-practice-fast-search-ranking-and-real-world-patterns/
- Datasette full-text search: https://docs.datasette.io/en/stable/full_text_search.html
- SQLite backup strategies: https://oldmoe.blog/2024/04/30/backup-strategies-for-sqlite-in-production/
- SQLite WAL restore: https://www.sqliteforum.com/p/backing-up-and-restoring-sqlite-databases
- Go version embedding with ldflags: https://www.digitalocean.com/community/tutorials/using-ldflags-to-set-version-information-for-go-applications
- OpenTelemetry redaction processor: https://www.dash0.com/guides/opentelemetry-redaction-processor
- CLI UX patterns: https://clig.dev/
- IronCore Labs AI coding agent privacy: https://ironcorelabs.com/blog/2026/ai-coding-agents-drawing-the-line/
