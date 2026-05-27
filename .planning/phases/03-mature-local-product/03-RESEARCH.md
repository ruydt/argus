# Phase 3: Mature Local Product - Research

**Researched:** 2026-05-27
**Domain:** Go backend privacy controls, local security posture, contributor documentation
**Confidence:** MEDIUM-HIGH - codebase seams and web security patterns are verified; the gitignore matcher dependency needs a human package legitimacy checkpoint because `slopcheck` misclassified Go module paths as npm packages.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

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

### Deferred Ideas (OUT OF SCOPE)

None - discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-02 | CORS origin restricted to explicit allowlist | Use server middleware allowlist keyed by `Origin`; return matching origin plus `Vary: Origin`; never return `*`. [CITED: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin] |
| SEC-03 | Loopback bind default; remote bind opt-in with warning | Extend `config.Config`, validate `ADDR` host in startup before `ListenAndServe`, fail unless `HOOKER_ALLOW_REMOTE=1`; log warning when enabled. [VERIFIED: codegraph/context + backend/cmd/server/main.go] |
| SEC-04 | Threat model documented | Document localhost-only, single-user trust model, no auth for loopback, and unsupported remote sharing; map to ASVS V1/V8/V13/V14. [CITED: https://devguide.owasp.org/en/03-requirements/05-asvs/] |
| PRIV-01 | Gitignore-style path exclusion file | Add ignore matcher around normalized `cwd` and `path`; drop before `svc.AddEvent`; verify no DB row and no SSE event. [VERIFIED: codegraph/context + backend/internal/handler/hook.go] |
| PRIV-02 | Privacy warning in setup docs and `doctor` | Existing docs already list prompts, tool outputs, file paths, diffs, transcript references; extend `doctor` and setup docs with the same categories. [VERIFIED: docs/install.md + scripts/hooker] |
| PRIV-03 | Export privacy implications documented | Existing export endpoints stream full event records and SQLite snapshots; docs must warn that exports include raw payloads and captured sensitive categories. [VERIFIED: backend/internal/handler/export.go + docs/install.md] |
| CONTRIB-01 | Contributor guide covers structure, layer boundaries, adapter contract, DB-column guidance | Existing `CONTRIBUTING.md` is minimal; expand from `CLAUDE.md` and codebase docs without duplicating a full architecture manual. [VERIFIED: CONTRIBUTING.md + CLAUDE.md] |
| CONTRIB-02 | ADRs for SQLite, normalization, local-first, proxy scope | Create `docs/adr/` one-file-per-decision with lightweight template and accepted status. [VERIFIED: CONTEXT D-10; no docs/adr present] |
| CONTRIB-03 | Frontend-backend contract process | Document JSON tag/type sync between `backend/internal/domain/event.go` and `frontend/src/types/events.ts`, fixtures, and tests. [VERIFIED: CLAUDE.md + frontend/src/types/events.ts] |
</phase_requirements>

## Summary

Phase 3 should be planned as three backend/docs tracks with one dependency checkpoint. Privacy filtering belongs in the backend ingest path after normalization has produced canonical `CWD` and `Path`, but before `EventService.AddEvent`, because `AddEvent` both persists and broadcasts SSE. [VERIFIED: codegraph/context] The filter must only evaluate `cwd` and explicit normalized path fields, never raw payload text, prompts, diffs, or tool output. [VERIFIED: CONTEXT D-02]

Security posture work is mostly configuration and middleware. `Config` currently has only `Addr` and `DBPath`; `cors` currently returns `Access-Control-Allow-Origin: *`; startup only validates `ADDR` syntax. [VERIFIED: backend/internal/config/config.go, backend/internal/server/middleware.go, backend/cmd/server/main.go] Plan to add explicit local origins derived from `ADDR`, an env extension such as `HOOKER_CORS_ORIGINS`, remote bind validation via `HOOKER_ALLOW_REMOTE=1`, and tests for failed remote startup plus warning output. [CITED: https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CORS]

Contributor work is documentation-heavy but still needs verification tasks. `CONTRIBUTING.md` exists but is too thin for the Phase 3 requirements, `docs/adr/` does not exist, and adapter tests are currently inline fixtures rather than a documented fixture corpus rule. [VERIFIED: CONTRIBUTING.md + backend/tests/internal/agents] The planner should include docs checks plus CI proof that backend and frontend contract tests still run. [VERIFIED: .planning/config.json has nyquist_validation=false, CI requirements already exist in REQUIREMENTS.md]

**Primary recommendation:** Use Wave 0 to validate the Go gitignore matcher dependency, then implement privacy ignore as a `backend/internal/privacy/ignore` package injected into `handler.Hook`, followed by CORS/bind hardening and contributor docs/ADRs.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Ignore file loading | API / Backend | Filesystem | Backend owns ingestion and can read `~/.config/hooker/ignore`; browser should not enforce privacy filtering. [VERIFIED: codebase architecture] |
| Ignore decision | API / Backend | — | Must occur before persistence and SSE broadcast; `EventService.AddEvent` currently performs both. [VERIFIED: backend/internal/service/event_service.go] |
| CORS allowlist | API / Backend | Browser / Client | Browser enforces CORS, but server must emit strict allowlist headers. [CITED: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin] |
| Bind validation | API / Backend | OS networking | Startup must reject non-loopback bind before opening the socket. [VERIFIED: backend/cmd/server/main.go; CITED: https://pkg.go.dev/net#SplitHostPort] |
| Threat model docs | Documentation | API / Backend | Security claims must document actual backend behavior: loopback default, no auth, unsupported remote sharing. [VERIFIED: REQUIREMENTS.md SEC-04] |
| Privacy warnings | CLI/docs | API / Backend | `doctor` and setup docs are the user-facing safety surfaces before capture starts. [VERIFIED: scripts/hooker + docs/install.md] |
| Contributor adapter contract | Documentation | Backend tests | Agent adapters live in backend packages and are proven by normalization tests. [VERIFIED: backend/internal/agents + backend/tests/internal/agents] |
| Frontend-backend contract process | Documentation | Backend + Frontend tests | JSON tags and TS types must evolve together; no transformation layer exists. [VERIFIED: CLAUDE.md + frontend/src/types/events.ts] |

## Project Constraints (from AGENTS.md)

- Prefer CodeGraph for structural questions and use native grep/read only for literal text queries. [VERIFIED: prompt AGENTS.md]
- Handler/service/repository boundaries must be respected; do not skip layers. [VERIFIED: CLAUDE.md]
- Backend changes require `rtk go build ./...`, `rtk go test ./...`, and `rtk golangci-lint run ./...` before completion. [VERIFIED: CLAUDE.md + RTK project instruction]
- New handlers/service methods require corresponding Go tests. [VERIFIED: CLAUDE.md]
- Domain JSON tags in `backend/internal/domain/event.go` must stay synchronized with frontend TypeScript types. [VERIFIED: CLAUDE.md]
- Migrations require new numbered SQL files; existing migrations must not be edited. [VERIFIED: CLAUDE.md]
- Agent payload shape changes belong in `backend/internal/agents/<agent>/`, not handler/service parsing. [VERIFIED: CLAUDE.md]
- `frontend/src/components/ui/**` is generated and should not be hand-edited. [VERIFIED: CLAUDE.md]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Go `net/http` | stdlib, Go 1.25+ project target | Router, middleware, preflight handling, SSE | Already the backend HTTP stack. [VERIFIED: backend/go.mod + router.go] |
| Go `net` | stdlib | `SplitHostPort`, IP parsing, loopback checks | Already used for `ADDR` validation and Host middleware. [VERIFIED: main.go + middleware.go; CITED: https://pkg.go.dev/net#SplitHostPort] |
| Go `log/slog` | stdlib | Safe privacy/security logs and remote-bind warning block | Project already migrated backend logs to `slog`. [VERIFIED: codebase grep] |
| `github.com/git-pkgs/gitignore` | v1.2.0, published 2026-05-19 | Gitignore-style matching for `~/.config/hooker/ignore` | Supports comments, negation, directory patterns, `**`, match provenance, and concurrent match calls after construction. [CITED: https://github.com/git-pkgs/gitignore; VERIFIED: go list -m -json] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `github.com/sabhiram/go-gitignore` | pseudo-version 2021-09-23 | Older gitignore parser fallback | Use only if `github.com/git-pkgs/gitignore` is rejected after human verification; it is older and has no tagged stable module. [CITED: https://pkg.go.dev/github.com/sabhiram/go-gitignore; VERIFIED: go list -m -json] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `github.com/git-pkgs/gitignore` | In-tree limited matcher | Avoids a new dependency but risks incorrect `!`, directory, slash, and `**` behavior; requires a larger golden-test matrix. [CITED: https://git-scm.com/docs/gitignore] |
| `github.com/git-pkgs/gitignore` | `github.com/sabhiram/go-gitignore` | More established imports, but older, untagged, and less clearly maintained. [CITED: https://pkg.go.dev/github.com/sabhiram/go-gitignore] |

**Installation:**
```bash
cd backend
rtk go get github.com/git-pkgs/gitignore@v1.2.0
```

**Version verification performed:**
```bash
rtk go list -m -versions github.com/git-pkgs/gitignore
# github.com/git-pkgs/gitignore v0.1.0 v1.0.0 v1.1.0 v1.1.1 v1.1.2 v1.2.0

rtk go list -m -json github.com/git-pkgs/gitignore@v1.2.0
# Version v1.2.0, Time 2026-05-19T12:13:35Z, Origin https://github.com/git-pkgs/gitignore
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `github.com/git-pkgs/gitignore` | Go module proxy / pkg.go.dev | Published 2026-05-19 | Imported by 2 on pkg.go.dev | https://github.com/git-pkgs/gitignore | Tool reported `[SLOP]` because it checked npm, not Go | Flagged - planner must add `checkpoint:human-verify` before install. [VERIFIED: go list; CITED: https://pkg.go.dev/github.com/git-pkgs/gitignore] |
| `github.com/sabhiram/go-gitignore` | Go module proxy / pkg.go.dev | Published 2021-09-23 | Imported by 538 on pkg.go.dev | https://github.com/sabhiram/go-gitignore | Tool reported `[SLOP]` because it checked npm, not Go | Fallback only; planner must add `checkpoint:human-verify` before install. [VERIFIED: go list; CITED: https://pkg.go.dev/github.com/sabhiram/go-gitignore] |

**Packages removed due to slopcheck `[SLOP]` verdict:** none - the verdict was for npm lookups of Go module paths, so it is recorded as a tool applicability failure rather than package evidence. [VERIFIED: local slopcheck output]
**Packages flagged as suspicious `[SUS]`:** `github.com/git-pkgs/gitignore` due to recency and low pkg.go.dev import count; planner must require human verification before `go get`. [CITED: https://pkg.go.dev/github.com/git-pkgs/gitignore]

## Architecture Patterns

### System Architecture Diagram

```text
[AI agent hook payload]
        |
        v
[POST /api/hook handler]
        |
        v
[Read raw JSON] -> [Select agent normalizer] -> [NormalizedEvent with CWD/Path]
        |
        v
[Privacy ignore matcher]
        |                                 |
        | matched                         | not matched
        v                                 v
[safe metadata-only slog]          [model enrichment]
[HTTP 200 {}]                      [safe hook slog]
[STOP: no DB, no SSE]              [svc.AddEvent]
                                           |
                                           v
                                  [repo.Add + session upsert]
                                           |
                                           v
                                  [SSE broadcast]

[Startup config]
        |
        v
[Load ADDR/DB_PATH/HOOKER_ALLOW_REMOTE/HOOKER_CORS_ORIGINS]
        |
        v
[Validate bind host]
        | non-loopback without opt-in       | loopback or explicit opt-in
        v                                  v
[fatal actionable error]             [router with strict CORS allowlist]
                                           |
                                           v
                                  [http.Server.ListenAndServe]
```

### Recommended Project Structure

```text
backend/
├── internal/
│   ├── config/
│   │   └── config.go                  # add AllowRemote, CORSOrigins, IgnorePath
│   ├── handler/
│   │   └── hook.go                    # inject/use privacy gate before AddEvent
│   ├── privacy/
│   │   └── ignore/
│   │       ├── ignore.go              # load matcher + event match API
│   │       └── ignore_test.go         # gitignore core semantics + event field tests
│   └── server/
│       ├── middleware.go              # CORS allowlist helper
│       └── router.go                  # accept route options/config
docs/
├── adr/
│   ├── 0001-sqlite-local-storage.md
│   ├── 0002-hook-normalization-strategy.md
│   ├── 0003-local-first-positioning.md
│   └── 0004-proxy-scope.md
├── security.md                        # threat model
└── privacy.md                         # capture/export warnings
CONTRIBUTING.md                        # practical contributor path
```

### Pattern 1: Privacy Gate Before Persistence and SSE

**What:** Construct a matcher once at startup, pass it into the hook handler, and evaluate `NormalizedEvent.CWD` plus `NormalizedEvent.Path` only. [VERIFIED: CONTEXT D-02, D-03]

**When to use:** Every `POST /api/hook` after normalization/enrichment has canonical fields, before any `svc.SessionModel`, `slog.Info("hook", ...)`, or `svc.AddEvent`. [VERIFIED: backend/internal/handler/hook.go]

**Example:**
```go
// Source: codebase pattern + github.com/git-pkgs/gitignore README
type IgnoreMatcher interface {
    MatchEvent(e domain.NormalizedEvent) (bool, string)
}

func Hook(svc *service.EventService, ignores IgnoreMatcher) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // existing read + normalize + degraded path
        e = enrichContext(e)

        if ignored, reason := ignores.MatchEvent(e); ignored {
            slog.Info("hook ignored", "agent", e.Agent, "session", e.Session, "reason", reason)
            w.Header().Set("Content-Type", "application/json")
            _, _ = w.Write([]byte(`{}`))
            return
        }

        // existing model enrichment + svc.AddEvent
    })
}
```

### Pattern 2: Strict CORS Allowlist

**What:** Build a set of allowed origins from loopback defaults derived from the configured port plus optional comma-separated `HOOKER_CORS_ORIGINS`. For CORS requests, compare the exact `Origin` string and echo it only when present in the allowlist; add `Vary: Origin`. [CITED: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin]

**When to use:** All routes, preserving existing `OPTIONS` handling. Non-CORS requests with no `Origin` should continue without an ACAO header. [CITED: https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CORS]

**Example:**
```go
// Source: MDN ACAO guidance + current middleware.go
func cors(allowed map[string]struct{}, next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        origin := r.Header.Get("Origin")
        if origin != "" {
            if _, ok := allowed[origin]; ok {
                w.Header().Set("Access-Control-Allow-Origin", origin)
                w.Header().Add("Vary", "Origin")
            } else if r.Method == http.MethodOptions {
                http.Error(w, "forbidden origin", http.StatusForbidden)
                return
            }
        }
        w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
        w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        if r.Method == http.MethodOptions {
            w.WriteHeader(http.StatusNoContent)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

### Pattern 3: Remote Bind Gate

**What:** Parse `ADDR` with `net.SplitHostPort`, treat `127.0.0.1`, `localhost`, `::1`, and empty host as local only if explicitly intended; reject `0.0.0.0`, public/private LAN IPs, and non-loopback names unless `HOOKER_ALLOW_REMOTE=1`. [CITED: https://pkg.go.dev/net#SplitHostPort]

**When to use:** Immediately after config load and before DB open/listen. [VERIFIED: backend/cmd/server/main.go]

**Example:**
```go
// Source: Go net docs + current main.go startup validation
func validateBind(cfg config.Config) error {
    host, _, err := net.SplitHostPort(cfg.Addr)
    if err != nil {
        return fmt.Errorf("invalid ADDR %q: %w", cfg.Addr, err)
    }
    if isLoopbackHost(host) {
        return nil
    }
    if !cfg.AllowRemote {
        return fmt.Errorf("refusing non-loopback ADDR %q; set HOOKER_ALLOW_REMOTE=1 to opt in", cfg.Addr)
    }
    slog.Warn("REMOTE BIND ENABLED - hooker captures prompts, diffs, file paths, tool outputs, raw payloads, and exports; public internet exposure is unsupported", "addr", cfg.Addr)
    return nil
}
```

### Anti-Patterns to Avoid

- **Filtering raw payload strings:** This violates D-02 and can leak sensitive data into matching/logging paths. Match only normalized `cwd` and explicit `path`. [VERIFIED: CONTEXT D-02]
- **Putting ignore logic in repository:** Repository only persists already-approved events; privacy policy belongs before `AddEvent`. [VERIFIED: architecture docs]
- **Reflecting arbitrary `Origin`:** MDN and OWASP both call out unchecked reflection as unsafe; use exact allowlist membership. [CITED: https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/07-Testing_Cross_Origin_Resource_Sharing]
- **Allowlisting `Origin: null`:** MDN and OWASP warn that `null` origin is unsafe; do not add it for local development. [CITED: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin]
- **Documenting remote sharing as supported:** Requirement SEC-04 says ngrok/remote sharing is unofficial and unsupported. [VERIFIED: REQUIREMENTS.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gitignore semantics | A casual glob loop over lines | `github.com/git-pkgs/gitignore` after human package verification | Gitignore has negation, slash anchoring, directory-only patterns, and special `**` rules. [CITED: https://git-scm.com/docs/gitignore] |
| CORS policy | Regex or suffix match on origins | Exact string allowlist of origins | OWASP documents regex/reflection bypasses for dynamic CORS policies. [CITED: https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/07-Testing_Cross_Origin_Resource_Sharing] |
| Threat model | Marketing-style security claims | A scoped local threat model doc | ASVS V1 treats architecture, design, and threat modeling as its own security category. [CITED: https://devguide.owasp.org/en/03-requirements/05-asvs/] |
| Contract sync | Manual reviewer memory | CONTRIBUTING checklist + CI commands | Project has no transformation layer between Go JSON tags and TS types. [VERIFIED: CLAUDE.md] |

**Key insight:** The dangerous work here is not algorithmic complexity; it is misplaced responsibility. Privacy filtering must happen before side effects, CORS must be exact rather than permissive, and docs must describe the real trust model without implying remote safety. [VERIFIED: codebase + CONTEXT.md]

## Common Pitfalls

### Pitfall 1: Ignore Gate Runs Too Late
**What goes wrong:** Matched events are persisted or broadcast before being dropped. [VERIFIED: EventService.AddEvent]
**Why it happens:** `AddEvent` bundles persistence, session upsert, and SSE broadcast. [VERIFIED: backend/internal/service/event_service.go]
**How to avoid:** Evaluate ignore rules in `handler.Hook` before calling `svc.AddEvent`.
**Warning signs:** Tests only assert HTTP 200, not DB absence and SSE silence.

### Pitfall 2: Path Normalization Drift
**What goes wrong:** Relative patterns are matched against absolute paths inconsistently. [ASSUMED]
**Why it happens:** Normalizers resolve `tool_input.file_path` against `cwd`, but gitignore libraries generally expect slash-separated paths relative to a root. [VERIFIED: backend/internal/agents/* + CITED: https://github.com/git-pkgs/gitignore]
**How to avoid:** For each event, derive candidate relative paths from `cwd` and `path`; also allow absolute anchored matching if the ignore file contains absolute-looking paths. [ASSUMED]
**Warning signs:** `frontend/**` works in one repo but `/Users/.../frontend/**` does not.

### Pitfall 3: Safe Log Accidentally Includes Sensitive Fields
**What goes wrong:** Dropped events leak prompts, diffs, tool output, raw JSON, or command text into logs. [VERIFIED: CONTEXT D-04]
**Why it happens:** Existing hook log includes `path`; new ignored-event logs may be copied from richer debug logs. [VERIFIED: backend/internal/handler/hook.go]
**How to avoid:** Ignored-event log fields should be metadata only: agent, session, action, matcher source/line, raw length if needed.
**Warning signs:** Tests or snapshots include prompt/diff text in log expectations.

### Pitfall 4: CORS Allows `*`, `null`, or Origin Reflection
**What goes wrong:** Browser code from untrusted origins can read sensitive local responses when other local defenses fail. [CITED: OWASP WSTG CORS]
**Why it happens:** Developers reflect `Origin` for convenience or keep wildcard for dev. [CITED: https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CORS]
**How to avoid:** Exact origin set only; no wildcard; no `null`; add `Vary: Origin` when ACAO varies by request.
**Warning signs:** Tests still expect `Access-Control-Allow-Origin: *`.

### Pitfall 5: Docker Breaks Under Remote Bind Gate
**What goes wrong:** Docker image sets `ADDR=0.0.0.0:8765` and fails after SEC-03. [VERIFIED: Dockerfile]
**Why it happens:** Docker currently binds all interfaces inside the container while compose publishes only `127.0.0.1:8765`. [VERIFIED: Dockerfile + docker-compose.yml]
**How to avoid:** Planner must update Docker defaults or explicitly set `HOOKER_ALLOW_REMOTE=1` only with a documented warning. Prefer `ADDR=127.0.0.1:8765` for local binary and document container nuance. [ASSUMED]
**Warning signs:** Backend tests pass but container smoke fails at startup.

## Code Examples

### Gitignore Core Semantics to Preserve

```text
# Source: Git official gitignore docs
# blank lines and comments ignored
node_modules/
*.log
!keep.log
frontend/**/dist/
```

Git documents `!` negation, slash-relative patterns, trailing slash directory patterns, and special `**` forms. [CITED: https://git-scm.com/docs/gitignore]

### Event Match API

```go
// Source: recommended local wrapper around verified matcher dependency
func (m *Matcher) MatchEvent(e domain.NormalizedEvent) (bool, string) {
    for _, candidate := range candidates(e.CWD, e.Path) {
        if detail := m.gitignore.MatchDetail(candidate); detail.Matched {
            return true, fmt.Sprintf("%s:%d", detail.Source, detail.Line)
        }
    }
    return false, ""
}
```

### CORS Table Tests

```go
// Source: MDN explicit origin guidance + existing router httptest pattern
tests := []struct {
    name       string
    origin     string
    wantStatus int
    wantACAO   string
}{
    {"allowed localhost", "http://localhost:8765", http.StatusNoContent, "http://localhost:8765"},
    {"allowed 127", "http://127.0.0.1:8765", http.StatusNoContent, "http://127.0.0.1:8765"},
    {"denied evil", "https://example.test", http.StatusForbidden, ""},
    {"denied null", "null", http.StatusForbidden, ""},
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Wildcard CORS for convenience | Exact allowlist; echo only a matched origin; `Vary: Origin` | MDN docs current as of 2025-11-21 | Tests should stop expecting `*`. [CITED: MDN ACAO] |
| Local tool relies on docs warning only | Enforced loopback default plus explicit remote opt-in | Phase 3 decision | `ADDR=0.0.0.0:8765` alone must fail. [VERIFIED: CONTEXT D-07/D-08] |
| Implicit privacy behavior | User-controlled ignore file before ingest + explicit warnings | Phase 3 decision | Dropped events have no DB row and no SSE broadcast. [VERIFIED: CONTEXT D-03] |

**Deprecated/outdated:**
- Wildcard CORS in `middleware.go`: replace with explicit origin allowlist. [VERIFIED: backend/internal/server/middleware.go; CITED: OWASP WSTG CORS]
- Existing `CONTRIBUTING.md` quality commands use `npm` for frontend; project requires pnpm. [VERIFIED: CONTRIBUTING.md + frontend/package.json]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Candidate relative path derivation should support both repo-relative and absolute-looking patterns. | Common Pitfalls | Ignore rules may surprise users and either over-capture or over-drop events. |
| A2 | Docker should avoid setting `HOOKER_ALLOW_REMOTE=1` by default unless docs make the container-local bind model explicit. | Common Pitfalls | Container users may see startup failures or an over-broad warning. |

## Resolved Questions

1. **Final matcher dependency approval**
   - What we know: `github.com/git-pkgs/gitignore` has the best D-05 feature fit and Go module verification succeeded. [VERIFIED: go list; CITED: GitHub README]
   - Resolution: Not pre-approved. The package remains gated by the Wave 1 blocking human checkpoint in `03-01-PLAN.md`; execution must record either approval for exact `github.com/git-pkgs/gitignore@v1.2.0` or rejection with a scoped in-tree matcher path before any `rtk go get`. [RESOLVED: 2026-05-27]

2. **Remote bind behavior for Docker**
   - What we know: Dockerfile sets `ADDR=0.0.0.0:8765`; compose publishes only loopback on the host. [VERIFIED: Dockerfile + docker-compose.yml]
   - Resolution: Container usage remains intentional under the remote-bind gate. `03-03-PLAN.md` explicitly requires Docker config/docs updates so Docker either avoids an ungated remote bind default or opts in with `HOOKER_ALLOW_REMOTE=1` plus comments/docs that compose publishes `127.0.0.1:8765:8765` and public internet exposure remains unsupported. [RESOLVED: 2026-05-27]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Go | Backend implementation/tests | yes | go1.26.2 darwin/arm64 | Project target remains Go 1.25+. [VERIFIED: local command + backend/go.mod] |
| Node.js | Frontend docs/contract checks | yes | v25.6.1 | Project supports Node 18+. [VERIFIED: local command + package.json] |
| pnpm | Frontend checks | yes | 10.23.0 | None; project enforces pnpm. [VERIFIED: local command + package.json] |
| curl | `doctor`, docs, hook smoke | yes | curl 8.7.1 | None needed. [VERIFIED: local command] |
| lsof | `doctor` port check | yes | installed | Doctor already handles missing `lsof`. [VERIFIED: scripts/hooker] |
| slopcheck | Package legitimacy | partial | installed, no `--json`; checks npm only | Use Go module proxy/pkg.go.dev plus human checkpoint for Go modules. [VERIFIED: local command] |

**Missing dependencies with no fallback:** none. [VERIFIED: environment probes]

**Missing dependencies with fallback:** Go package legitimacy automation for Go modules; fallback is human checkpoint plus `rtk go list -m -json`. [VERIFIED: local command]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V1 Architecture, Design and Threat Modeling | yes | `docs/security.md` threat model documenting single-user localhost scope. [CITED: OWASP ASVS] |
| V2 Authentication | no for loopback default | Document no auth for loopback and remote sharing unsupported; do not add auth in this phase. [VERIFIED: SEC-04] |
| V3 Session Management | no | No authenticated web sessions exist. [VERIFIED: codebase architecture] |
| V4 Access Control | limited | Host header validation, CORS allowlist, Sec-Fetch-Site export gate, loopback bind. [VERIFIED: SEC-01/SEC-05 + Phase 3] |
| V5 Validation, Sanitization and Encoding | yes | Validate env origin strings and `ADDR`; exact origin allowlist. [CITED: MDN ACAO] |
| V6 Stored Cryptography | no | No encryption-at-rest requirement in Phase 3; SQLite remains local plaintext. [VERIFIED: REQUIREMENTS.md] |
| V8 Data Protection | yes | Privacy warnings, ignore-before-ingest, export warnings. [VERIFIED: PRIV-01..03] |
| V13 API and Web Service | yes | CORS tests, Sec-Fetch-Site existing gate, loopback-only API posture. [CITED: OWASP ASVS] |
| V14 Configuration | yes | Env validation and remote bind warning/failure. [CITED: OWASP ASVS] |

### Known Threat Patterns for Local-First Hooker

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| DNS rebinding / hostile Host header | Spoofing | Existing Host header middleware plus loopback bind. [VERIFIED: middleware.go] |
| Cross-origin read of sensitive local API | Information Disclosure | Exact CORS allowlist, no wildcard, no `null`, no origin reflection. [CITED: OWASP WSTG CORS] |
| Accidental LAN exposure | Information Disclosure | Default `127.0.0.1`; `HOOKER_ALLOW_REMOTE=1` gate; startup warning. [VERIFIED: CONTEXT D-07..D-09] |
| Sensitive data in logs | Information Disclosure | Metadata-only ignored-event logs. [VERIFIED: CONTEXT D-04] |
| Export file oversharing | Information Disclosure | Docs warn NDJSON/snapshot include prompts, diffs, file paths, tool outputs, raw payloads. [VERIFIED: PRIV-03 + docs/install.md] |

## Sources

### Primary (HIGH confidence)

- CodeGraph context for `cors`, `Config`, `Load`, `Hook`, `AddEvent`, and router composition - integration seams verified.
- Local files: `backend/internal/handler/hook.go`, `backend/internal/service/event_service.go`, `backend/internal/server/middleware.go`, `backend/cmd/server/main.go`, `backend/internal/config/config.go`, `scripts/hooker`, `CONTRIBUTING.md`, `CLAUDE.md`, `docs/install.md`, `Dockerfile`, `docker-compose.yml`.
- Git official gitignore docs - pattern behavior: https://git-scm.com/docs/gitignore
- MDN CORS guidance and ACAO reference - explicit origin and `Vary: Origin`: https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CORS and https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin
- OWASP WSTG CORS testing guide - wildcard/reflection/null origin risks: https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/11-Client-side_Testing/07-Testing_Cross_Origin_Resource_Sharing
- OWASP ASVS developer guide - category mapping: https://devguide.owasp.org/en/03-requirements/05-asvs/

### Secondary (MEDIUM confidence)

- `github.com/git-pkgs/gitignore` README and pkg.go.dev page - matcher features and module metadata: https://github.com/git-pkgs/gitignore and https://pkg.go.dev/github.com/git-pkgs/gitignore
- `github.com/sabhiram/go-gitignore` README and pkg.go.dev page - fallback metadata: https://github.com/sabhiram/go-gitignore and https://pkg.go.dev/github.com/sabhiram/go-gitignore
- Go `net` package docs for `SplitHostPort`: https://pkg.go.dev/net#SplitHostPort

### Tertiary (LOW confidence)

- None used for recommendations.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - stdlib pieces are verified; gitignore package requires human checkpoint due package legitimacy tooling mismatch.
- Architecture: HIGH - integration points are verified against codegraph and local files.
- Pitfalls: MEDIUM-HIGH - CORS/security pitfalls are official-source verified; path derivation details need implementation proof.

**Research date:** 2026-05-27
**Valid until:** 2026-06-26 for codebase architecture; 2026-06-03 for package/version recommendation because the chosen matcher is new.
