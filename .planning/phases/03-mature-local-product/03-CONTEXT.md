# Phase 3: Mature Local Product - Context

**Gathered:** 2026-05-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete the mature local product layer for hooker. Deliver explicit privacy controls over captured event data, enforce a local-first security posture, document the threat model, and give contributors clear guardrails for safe extension. This phase does not add search, analytics, diagnostics UI, cloud sharing, or plugin architecture.

</domain>

<decisions>
## Implementation Decisions

### Ignore Rules

- **D-01:** The default ignore file is `~/.config/hooker/ignore`.
- **D-02:** Ignore matching applies to the event `cwd` and explicit event `path` fields. Do not scan prompts, tool output, diffs, or arbitrary text for path-like substrings.
- **D-03:** Matched events are not ingested: no database row and no SSE broadcast.
- **D-04:** Matched events produce a safe backend log entry with metadata only. Do not log raw payload, prompt text, tool output, or diffs.
- **D-05:** Ignore semantics should support gitignore-like core behavior: blank lines, `#` comments, negation with `!`, directory patterns, and `**`. Exact full gitignore parity is not required.

### Local Security Posture

- **D-06:** CORS should allow derived local origins by default and support an env extension for additional explicit origins. The implementation should replace wildcard `*`.
- **D-07:** Remote bind requires explicit `HOOKER_ALLOW_REMOTE=1`. Setting `ADDR=0.0.0.0:8765` or another non-loopback address alone must not expose hooker.
- **D-08:** If a non-loopback bind is configured without `HOOKER_ALLOW_REMOTE=1`, startup must fail with an actionable error.
- **D-09:** If remote bind is explicitly enabled, startup must emit a prominent warning block that lists captured data categories and states public internet exposure is unsupported.

### Contributor Infrastructure

- **D-10:** ADRs should be one file per decision under `docs/adr/`, covering SQLite choice, normalization strategy, and local-first positioning.
- **D-11:** Any new or changed agent adapter must include a fixture payload and a normalization test.
- **D-12:** Frontend-backend contract changes must follow a documented cross-layer checklist and be proven by CI. The checklist should cover Go domain shape, TypeScript types, fixtures, and backend/frontend tests.
- **D-13:** `CONTRIBUTING.md` should be a practical quick contributor path: project structure, commands, layer boundaries, common change flows, and adapter steps. It should not become a full architecture manual.

### the agent's Discretion

- Exact env var name for extra CORS origins, delimiter, and validation behavior.
- Exact matcher package or implementation for gitignore-like core semantics.
- Exact ADR numbering, status labels, and document template.
- Exact wording for privacy warnings in `doctor`, setup docs, startup logs, and threat model.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements

- `.planning/REQUIREMENTS.md` — Phase 3 requirements: `SEC-02`, `SEC-03`, `SEC-04`, `PRIV-01`, `PRIV-02`, `PRIV-03`, `CONTRIB-01`, `CONTRIB-02`, `CONTRIB-03`.
- `.planning/ROADMAP.md` — Phase 3 goal and success criteria.
- `.planning/phases/01-local-adoption-baseline/01-CONTEXT.md` — Existing install, doctor, version, CI, and security context.
- `.planning/phases/02-reliable-daily-use/02-CONTEXT.md` — Raw payload, degraded ingestion, export, and Sec-Fetch-Site decisions.

### Codebase Maps

- `.planning/codebase/STACK.md` — Go/React/pnpm stack and env-based runtime config.
- `.planning/codebase/ARCHITECTURE.md` — Layered Go monolith, handler/service/repository boundaries, middleware/router integration points.
- `.planning/codebase/CONVENTIONS.md` — File naming, error handling, test naming, and docs/code style.

### Privacy Controls

- `backend/internal/handler/hook.go` — Hook payload normalization and current `svc.AddEvent` ingestion point; ignore decision should happen before persistence and broadcast.
- `backend/internal/service/event_service.go` — `AddEvent` persists, updates session state, and broadcasts SSE.
- `backend/internal/domain/event.go` — Normalized event fields used for `cwd` and `path` matching.

### Security Controls

- `backend/internal/config/config.go` — Runtime env config currently uses `ADDR` and `DB_PATH`; remote bind opt-in and CORS extension belong in this config surface.
- `backend/cmd/server/main.go` — Startup validation and warning output.
- `backend/internal/server/middleware.go` — Existing CORS, Host header, panic recovery, and Sec-Fetch-Site middleware home.
- `backend/internal/server/router.go` — Middleware composition and route registration.

### Contributor Docs

- `CONTRIBUTING.md` — New contributor guide target.
- `docs/` — Existing documentation tree where ADRs and privacy/security docs should live.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `backend/internal/server/middleware.go`: Current `cors` sets `Access-Control-Allow-Origin: *`; Phase 3 replaces this with allowlist behavior.
- `backend/internal/server/middleware.go`: Existing Host header middleware already rejects non-localhost Host values, complementing CORS and bind enforcement.
- `backend/internal/config/config.go`: Existing env config pattern should be reused for `HOOKER_ALLOW_REMOTE` and explicit CORS origins.
- `backend/internal/handler/hook.go`: Has raw payload and normalized event before `svc.AddEvent`; best place to apply ignore matching without storing or streaming matched events.
- `./scripts/hooker doctor`: Existing doctor command should add privacy warning output and remote bind/security checks.

### Established Patterns

- Runtime configuration is env-var based.
- Backend changes should preserve handler/service/repository layer boundaries.
- Tests already cover HTTP handlers, repository behavior, migrations, frontend components/hooks, and Playwright smoke.
- Docs are layered: README stays terse; detailed behavior belongs in `docs/`.

### Integration Points

- Ignore matcher must run before repository persistence and before SSE broadcast.
- CORS middleware must keep `OPTIONS` preflight behavior while restricting allowed origins.
- Remote bind validation must happen during startup before listening.
- ADRs and `CONTRIBUTING.md` should reference existing architecture decisions rather than duplicating all implementation details.

</code_context>

<specifics>
## Specific Ideas

- Example denied remote bind: `ADDR=0.0.0.0:8765 ./hooker` should fail unless `HOOKER_ALLOW_REMOTE=1` is set.
- Example explicit remote bind: `HOOKER_ALLOW_REMOTE=1 ADDR=0.0.0.0:8765 ./hooker` should start but print a prominent warning.
- Privacy warning categories to mention: prompts, diffs, file paths, tool outputs, raw payloads, and exports.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-Mature Local Product*
*Context gathered: 2026-05-27*
