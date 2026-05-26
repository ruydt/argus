# Phase 2: Reliable Daily Use - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 2-Reliable Daily Use
**Areas discussed:** Raw payload schema, Degraded event UX, Export endpoint design, Playwright data strategy

---

## Raw Payload Schema

### Where should raw payload + metadata columns live?

| Option | Description | Selected |
|--------|-------------|----------|
| Columns on events table | Add raw_payload BLOB, normalizer_version TEXT, agent_version TEXT directly to events. Single table, no joins. | ✓ |
| Separate raw_payloads table | events.id FK → raw_payloads. Cleaner separation but adds join overhead + migration complexity. | |

**User's choice:** Columns on events table

### What to do with very large raw payloads?

| Option | Description | Selected |
|--------|-------------|----------|
| Store full raw bytes, no cap | Simplest. Matches full-fidelity export goal. DB size user-owned. | ✓ |
| Cap at N KB, truncate if larger | Keeps DB lean but loses full fidelity. Complicates export guarantee. | |
| You decide | Leave to implementation judgment. | |

**User's choice:** Store full raw bytes, no cap

### normalization_status enum values?

| Option | Description | Selected |
|--------|-------------|----------|
| ok / degraded | Binary. ok = fully normalized, degraded = unknown or partial. Simple to implement and display. | ✓ |
| ok / partial / unknown / failed | Four levels. More precise but more surface area. | |

**User's choice:** ok / degraded

---

## Degraded Event UX

### How should degraded events appear in the events feed?

| Option | Description | Selected |
|--------|-------------|----------|
| Badge on event row | Small 'degraded' badge on the event. Uses existing Badge component. Low noise, discoverable. | ✓ |
| Global warning banner | Banner at top of events page when any degraded events exist. More prominent. | |
| No UI change — server-side log only | Just slog on ingest. Degraded events look normal in UI. | |

**User's choice:** Badge on event row

### Should the degraded badge be clickable to show raw payload?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — expand to show raw JSON | Click badge → collapsible raw payload viewer. Uses Collapsible component. | |
| No — badge only, no drill-down | Visual indicator only. Raw payload in DB but not surfaced in UI in this phase. | ✓ |

**User's choice:** No — badge only, no drill-down

---

## Export Endpoint Design

### Should GET /api/export/events support filter params?

| Option | Description | Selected |
|--------|-------------|----------|
| Full dump only — no filters | Simpler. User downloads everything and filters locally. Matches backup/migration use case. | ✓ |
| Date range filter (since / until) | Accept ?since=ISO8601&until=ISO8601. Useful for incremental exports. | |
| Session filter too | ?since=&until=&session=. Most flexible but highest scope. | |

**User's choice:** Full dump only — no filters

### What to do when Sec-Fetch-Site check fails?

| Option | Description | Selected |
|--------|-------------|----------|
| 403 for cross-site; allow missing header | Block cross-site browser requests. Allow missing header (curl/wget work). | ✓ |
| Require same-origin strictly — block curl too | Maximum protection but breaks CLI usage. | |

**User's choice:** 403 for cross-site; allow missing header (curl/wget still work)

### Snapshot response integrity metadata?

| Option | Description | Selected |
|--------|-------------|----------|
| Content-Disposition + Content-Length only | Standard file download headers. Simple. User verifies with sqlite3 locally. | ✓ |
| Add ETag or SHA256 checksum header | Checksum header for download integrity. More robust but adds compute overhead. | |
| You decide | Leave to implementation judgment. | |

**User's choice:** Content-Disposition + Content-Length only

---

## Playwright Data Strategy

### Where does TEST-07 smoke test data come from?

| Option | Description | Selected |
|--------|-------------|----------|
| POST fixture payloads via API during test setup | Test POSTs known fixtures to /api/hook, then verifies. Fully isolated, reproducible. | ✓ |
| Pre-seeded SQLite test DB file | Commit test.db to repo. Faster startup but drifts from schema as migrations evolve. | |
| Page load only — no data verification | Just verify pages load without JS errors. Weak smoke test. | |

**User's choice:** POST fixture payloads via API during test setup

### When should Playwright run in CI?

| Option | Description | Selected |
|--------|-------------|----------|
| Every push/PR in CI | Same cadence as unit tests. Catches regressions early. | ✓ |
| Release tags only | Cheaper but regressions accumulate. | |
| Local-only — not in CI yet | Write test, add CI later. But TEST-07 requires CI verification. | |

**User's choice:** Every push/PR in CI

---

## Claude's Discretion

- HTTP timeout values (HARD-01): specific milliseconds for ReadHeaderTimeout, ReadTimeout, IdleTimeout
- Graceful shutdown drain timeout (HARD-02): specific duration
- slog migration scope (HARD-04): full replacement vs new-code-only
- WAL checkpoint interval (HARD-06): specific duration
- Panic recovery middleware placement
- Migration transaction wrapping implementation details

## Deferred Ideas

- Raw payload drill-down UI (clickable degraded badge) — future phase
- NDJSON export filter params — full dump sufficient for Phase 2
- SHA256 checksum header on snapshot — user can run sha256sum locally
- Windows native binary — still deferred from Phase 1
- Homebrew tap — still deferred from Phase 1
