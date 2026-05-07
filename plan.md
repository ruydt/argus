# emruy Roadmap and Production-Readiness Plan

## Purpose

This plan compiles the main improvements, optimizations, and future must-have features for `emruy` as a serious local-first product. The current goal is not multi-tenant cloud deployment. The goal is a reliable, low-friction local tool that public OSS users in the developer community can install from source, run, upgrade, and trust on their own machines.

## Product Position

`emruy` is currently best understood as:

- a local monitoring dashboard for Codex and Claude Code activity
- a public OSS tool aimed at developers using coding agents
- a developer tool with a backend data collector and a frontend UI
- a stateful desktop-adjacent app, even if distributed as CLI + browser

That means the highest-priority work is not Kubernetes, distributed tracing, or cloud tenancy. The highest-priority work is:

- installability
- onboarding clarity
- local reliability
- upgrade safety
- data integrity
- regression resistance
- user diagnostics

For the next stage, priority order is:

1. easier install and onboarding
2. catching regressions with tests
3. cleaner architecture for contributors
4. faster feature shipping

## Current Strengths

- Backend has a reasonable layered structure: config, handlers, service, repository, sqlite
- Backend tests exist and pass
- Go linting is now wired with `golangci-lint`
- Frontend has lint, typecheck, and formatting scripts
- SQLite is acceptable for the current single-user local-first model

## Main Gaps

### 1. Local install and run experience is not polished enough

Current setup still feels like a developer repo more than a distributable product.

Missing:

- one source-install path optimized for OSS users
- a hybrid setup strategy: strong docs plus helper automation
- one canonical run path
- release artifacts for end users
- a clear source-first and Docker-second support story
- clearer startup and failure guidance
- better first-run guidance across backend, frontend, and hook setup

### 2. Frontend regression protection is too weak

Backend has tests. Frontend currently lacks automated behavioral coverage.

Missing:

- component or hook tests
- route-level smoke tests
- end-to-end workflow tests for the real user journey

### 3. Operational safety for local users is underdeveloped

Even local tools need strong self-diagnostics and predictable recovery.

Missing:

- health endpoint
- readiness/self-check behavior
- startup validation
- database health checks
- clear error surfacing for common local failures

### 4. Data lifecycle and schema strategy are not yet product features

Local-first products need explicit answers for data ownership and maintenance.

Missing:

- where data is stored
- backup guidance
- restore guidance
- reset/cleanup flows
- retention policy
- migration/upgrade behavior documentation
- explicit strategy for supporting multiple agent payload schemas over time

### 5. Security posture is only safe under narrow assumptions

The app is currently acceptable for loopback-only personal use, but too trusting if exposed beyond localhost or used in less controlled environments.

Missing:

- explicit threat model
- safer defaults around bind address
- documented auth assumptions
- optional local auth or access guardrails
- rate limiting and abuse controls for future expansion
- a clear stance on unofficial remote sharing through tools like `ngrok`
- clearer classification of sensitive local-admin features such as the OpenAI usage proxy

### 6. Privacy and sensitive-data handling are not explicit enough

This product captures prompts, tool outputs, file paths, diffs, transcript references, and potentially sensitive local development context. A serious local-first OSS tool needs clear default behavior and user controls.

Missing:

- explicit warning about what data is stored
- ignore and exclusion controls for sensitive repos or paths
- redaction or masking options for sensitive content
- export sanitization strategy
- privacy guidance for local sharing and remote exposure

### 7. CI and release discipline are not yet at serious-repo level

The repo can be worked on locally, but future maintenance risk is still high.

Missing:

- CI workflows
- release process
- changelog/versioning rules
- dependency and vulnerability automation
- consistent verification matrix across backend and frontend

### 8. Contributor guardrails are not yet explicit enough

As the repo grows, maintainability risk will come from several directions at once.

Missing:

- guardrails against oversized or mixed-responsibility files
- restraint against premature abstraction
- stronger frontend-backend contract discipline
- a cleaner pattern for adding and testing new agent adapters

## Roadmap Principles

1. Local-first over cloud-first
2. Product reliability over architecture vanity
3. One obvious way to install, run, upgrade, and recover
4. Strong tests around user-critical flows
5. Keep SQLite until real usage proves it is the bottleneck
6. Treat public OSS usability as a first-class requirement
7. Prefer hybrid onboarding: excellent docs plus helper scripts
8. Source install first, Docker second, binaries later
9. Separate "must-have for local adoption" from "maybe later for hosted product"

## Immediate Priorities

These are the highest-leverage priorities for the next stretch of work.

### Tier 1: First-Run and Trust

- source-install quickstart that actually works
- root helper script with `setup` and `doctor`
- layered docs with `README`, `docs/quickstart.md`, `docs/install.md`, and `docs/hooks.md`
- `pnpm` standardization
- CI that verifies the documented source-install path

### Tier 2: Data Correctness

- canonical-plus-raw event model
- stronger fixture coverage for Codex and Claude Code payloads
- SQLite migration and repository correctness tests
- partial-ingest and hook-drift detection
- raw-payload replay and backfill path

### Tier 3: Daily-Use Operability

- health and readiness endpoints
- diagnostics surfacing in logs and `doctor`
- export paths for JSON and SQLite snapshot
- visible app, schema, normalizer, and agent-version metadata
- backend runtime hardening and safer defaults
- privacy controls and data-handling warnings

### Tier 4: Monitoring Experience

- stronger search and filtering
- visible diagnostics in UI
- browser smoke coverage
- better surfacing of compatibility issues, errors, and important event data

## Phase 1: Must-Have Foundation

Target: make the repo credible for wider local adoption.

### A. Installation and Distribution

Goals:

- make setup predictable
- reduce support burden
- make releases consumable by non-contributors
- optimize for source installs from the repo

Work:

- choose one primary install story: source install from repo
- support Docker as an official secondary path, but not the lead path
- treat prebuilt binaries as later convenience, not an immediate dependency
- use a hybrid onboarding model:
  - one crisp manual quickstart
  - one root helper script for common setup and verification
- document the shortest path to first successful run in 5 to 10 minutes
- minimize backend/frontend split leakage in first-run docs
- add one root helper script, likely `./scripts/emruy`, with initial subcommands:
  - `setup`
  - `doctor`
  - optional later `run`
- keep setup and doctor separate from long-running app execution
- add versioned releases with checksums
- expose app version in backend logs and frontend UI
- fix README quickstart so commands match real entrypoints
- keep README short and action-oriented
- use a layered docs structure:
  - terse README
  - terse quickstart
  - deeper install, hooks, and troubleshooting docs
- move detailed onboarding into dedicated docs:
  - `docs/quickstart.md` for first successful run
  - `docs/install.md` for source-install details and troubleshooting
  - `docs/hooks.md` for Codex and Claude Code hook setup
- standardize frontend package management on `pnpm`
- remove lockfile and command drift between package managers
- add explicit support matrix:
  - OS support
  - first-class support targets: macOS, Linux, and WSL
  - native Windows status documented separately if not yet first-class
  - Go/Node requirements for source installs
  - Docker expectations for secondary installs
  - `pnpm` requirement for frontend source installs
  - explicitly supported agents: Codex and Claude Code
  - others marked experimental until adapter quality and fixtures exist
  - supported-version window for app releases and integrations

Definition of done:

- a new user can install and run the app in under 10 minutes
- the documented path is tested and repeatable
- releases are versioned and downloadable
- first-run docs are optimized for "run it now", not "understand architecture first"
- the helper script covers the most common setup and verification path
- source install remains the best-supported path even if Docker exists
- package-manager expectations are explicit and consistent across docs and CI

### B. CI and Verification

Goals:

- stop regressions before merge
- make contributor quality bar enforceable

Work:

- optimize CI for moderate runtime, not maximal slowness:
  - fast checks always
  - heavier checks where confidence justifies them
- add CI for:
  - backend `go test ./...`
  - backend `go vet ./...`
  - backend `golangci-lint run ./...`
  - frontend install
  - frontend `npm run check`
  - frontend build
- add a moderate-cost end-to-end or smoke test job
- keep the full default PR pipeline roughly within a reasonable contributor wait time
- add `govulncheck` to CI
- add dependency update automation such as Dependabot or Renovate
- add branch protection guidance in docs if this repo will use PR workflow
- prefer conventional PR titles as release-automation input
- recommend conventional commits, but do not make perfect local commit formatting a hard blocker at first

Definition of done:

- every important check runs in CI
- repo health no longer depends on one maintainer remembering commands
- CI remains strong enough to catch regressions without becoming a contributor tax

### C. Local Diagnostics and Recovery

Goals:

- help users debug local setup issues fast
- reduce blind failures

Work:

- add `/healthz` endpoint
- add `/readyz` endpoint with DB-open check
- add a `doctor` or `self-check` command or script
- make `./scripts/emruy doctor` the canonical self-check entrypoint
- have `doctor` report required failures separately from optional warnings
- required checks should include:
  - Go present and supported
  - Node and npm present and supported
  - backend builds or verifies cleanly
  - frontend installs and builds or verifies cleanly
  - DB path is writable
  - required port is available
- optional warnings should include:
  - Codex hook config missing
  - Claude hook config missing
  - unsupported or unknown agent version
  - partial or degraded normalization detected
  - remote bind enabled
  - proxy route exposed in unsafe mode
- validate config at startup
- improve fatal error messages for:
  - port in use
  - DB open failure
  - migration failure
  - invalid hook input
  - unreadable transcript paths
- add resource-protection diagnostics and limits for:
  - oversized request bodies
  - oversized text payloads such as prompts, tool outputs, or diffs
  - subscriber backpressure or dropped live events
- document troubleshooting playbook in README or dedicated docs

Definition of done:

- most common install/runtime issues produce actionable messages
- users can run one command to verify local setup
- self-check output tells users exactly what blocks first run versus what is merely recommended
- hook compatibility problems are visible first in logs and diagnostics before later UI surfacing
- pathological payload or live-stream problems fail visibly instead of degrading silently

### D. Data Lifecycle

Goals:

- make local persistence understandable and safe
- prevent data-growth surprises
- preserve compatibility where practical as coding-agent payloads evolve
- improve local data portability across machines and versions
- keep data retention under user control before adding aggressive defaults
- let users control privacy risk without disabling the product entirely

Work:

- document DB file location and override behavior
- add backup instructions
- add reset instructions
- prioritize export first, but design the formats so import can come later cleanly
- support two portability paths:
  - human-readable JSON export
  - SQLite snapshot export for full-fidelity portability
- define JSON export to include:
  - canonical normalized events
  - raw payloads
  - agent metadata
  - app version or normalizer version metadata
- document when users should prefer JSON versus SQLite snapshot:
  - JSON for readability, sharing, and inspection
  - SQLite snapshot for exact local-state portability
- plan future import support for both:
  - JSON import for selective or interoperable data restore
  - SQLite snapshot restore for exact full-state recovery or machine migration
- plan JSON import in two modes:
  - exact rehydrate where the export format and app version are compatible enough
  - best-effort ingest through the canonical model when exact restore is not appropriate
- define retention defaults for events
- keep retention and deletion manual-first initially
- plan optional retention settings later for users with larger histories
- add manual cleanup/prune command or script
- document migration behavior across versions
- document compatibility policy:
  - try to preserve old data and old payload support where practical
  - allow breaking changes only with clear upgrade notes
- document privacy and storage behavior clearly:
  - what data is captured by default
  - what ignore or exclusion controls exist
  - what redaction or masking options exist
  - what happens during export

Definition of done:

- users know where their data lives
- users know how to preserve it, clear it, and recover from upgrade issues
- users have a clear path to export useful local data without being locked to one machine
- portability supports both inspection-friendly and full-fidelity workflows
- future import and restore paths are anticipated instead of painted into a corner
- JSON portability is useful both for exact reuse and for cross-version salvage
- users understand and can control the privacy implications of captured data

### E. Event Data Model and Normalization Strategy

Goals:

- support multiple agent payload shapes without constant schema churn
- keep source truth recoverable when normalization changes
- let frontend rely on a stable cross-agent contract
- prioritize coding agents with hook or event streams first
- detect upstream hook-schema drift early instead of silently degrading
- preserve fidelity across all major monitoring event classes already present in the product
- enable future replay and backfill after adapter or normalizer improvements

Work:

- formalize a three-layer event model:
  - raw payload archive
  - canonical normalized event
  - agent-specific extension data
- keep database schema centered on canonical cross-agent fields, not per-agent quirks
- store original raw payload for replay, debugging, and backfills
- add `agent_version` if available
- add `normalizer_version` so mappings can evolve over time
- use optional JSON extension data for agent-specific fields instead of adding columns for every new variant
- on unknown or partially supported payloads:
  - reject payloads that exceed hard safety limits where necessary
  - store raw payload anyway
  - persist any canonical fields that can be extracted safely
  - mark normalization status as partial or degraded
  - surface warning signals for maintainers and users
- use configurable limit behavior by event shape:
  - reject absurdly large request bodies
  - truncate oversized text-heavy fields when reasonable
  - always mark truncation or rejection clearly
- define the minimum canonical fields required across all agents:
  - agent
  - session id
  - timestamp
  - hook event name
  - tool or action
  - path
  - prompt or summary
  - model
  - cwd
  - transcript path
  - error or status
  - usage summary
- treat these event domains as first-class monitoring data that must remain accurate as schemas evolve:
  - tool calls and tool results
  - prompts
  - errors and failures
  - session lifecycle
  - model, usage, and cost-related data
  - file diffs and edits
- document how new agents should be added:
  - new adapter first
  - schema changes only when the canonical contract truly expands
- keep the adapter system broad enough for future local AI or dev tools if their event model fits
- keep product messaging explicit:
  - Codex and Claude Code are first-class supported agents
  - other integrations may exist in experimental form before becoming fully supported
- keep adapters in-tree for now, but preserve boundaries that could support an external adapter model later if it becomes worth the complexity
- add hook-update detection strategy:
  - capture agent identity and version when available
  - maintain fixture corpus for known payload shapes
  - flag unknown fields, missing expected fields, or changed payload structures in tests and diagnostics
  - expose a warning path when payloads are ingested in partial mode
- consider a lightweight payload fingerprint or schema-signature mechanism so maintainers can notice when upstream hook formats change
- plan reprocessing workflows that can:
  - re-run normalization from stored raw payloads
  - backfill improved canonical fields after adapter updates
  - preserve provenance about which normalizer version produced a record
- make replay and backfill manual-only operations with safety rails:
  - dry-run mode first
  - backup or snapshot before mutation
  - idempotent or clearly staged update behavior
  - audit visibility into what changed
- enforce adapter boundaries:
  - each agent owns its normalize logic, fixtures, and version-detection rules
  - shared layers own the canonical event model, storage contract, and common helpers
  - avoid scattering agent-specific conditionals across unrelated packages

Definition of done:

- new agent integrations usually require adapter work, not schema redesign
- raw payloads remain available for reprocessing
- normalized data stays stable enough for the UI and analytics layer
- coding-agent support scales without locking the schema to one vendor's payload
- supported agents have clearer compatibility and test guarantees than experimental ones
- the monitoring model preserves all currently important event types without narrowing the product's visibility
- upstream payload drift becomes visible quickly instead of silently corrupting normalization
- replay and backfill remain possible when adapters improve
- internal adapter design does not block a future ecosystem, but does not pay plugin-system complexity too early
- reprocessing can be trusted because it is explicit, reviewable, and recoverable

## Phase 2: Quality and Maintainability

Target: make the codebase cheaper to evolve and safer to extend.

### A. Test Strategy and Regression Protection

Goals:

- protect ingestion, storage, and critical UI workflows
- make refactors safer

Work:

- prioritize automated coverage in this order:
  - hook payload normalization
  - SQLite repository behavior and migrations
  - full end-to-end local workflow
  - API handlers
  - frontend event rendering and grouping
- expand backend fixture coverage for Codex and Claude payload variants
- add regression fixtures for payload versions when agent updates change structure
- add tests for partial-ingest behavior on unknown or drifted payloads
- add tests for limit behavior:
  - oversized request rejection
  - truncation markers on oversized text fields
  - safe behavior under live-stream backpressure
- prioritize current risk mitigation in this order:
  - missing new event fields when agents update
  - storing events but normalizing them incorrectly
  - failing to surface important captured data clearly in the UI
  - performance degradation as event volume grows
- add migration and repository tests that treat SQLite as the source of truth
- add test runner for frontend, likely Vitest
- add React Testing Library coverage for:
  - event grouping
  - session rendering
  - dashboard stats rendering
  - usage displays
  - loading and error states
- add smoke tests for API-driven hooks and page data loading
- define end-to-end scope in layers:
  - first, start the app and hit real HTTP endpoints with fixture payloads
  - then, add browser-level smoke coverage for the real frontend
- add at least one end-to-end HTTP workflow:
  - start backend
  - ingest sample hook events through real routes
  - verify persisted sessions and events through API endpoints
  - verify dashboard stats endpoint
- add at least one browser smoke path, likely Playwright:
  - start app stack
  - load events page
  - load sessions page
  - load dashboard page
  - verify core data is visible

Definition of done:

- core screens have automated regression coverage
- normalization and SQLite behavior have strong regression protection
- basic local workflow is tested end-to-end
- schema drift is caught by fixtures, diagnostics, or partial-mode warnings before it becomes silent data loss
- end-to-end coverage exercises real HTTP ingestion before deeper browser automation

### B. Backend Reliability Improvements

Goals:

- harden runtime behavior without overengineering

Work:

- replace bare `http.ListenAndServe` with configured `http.Server`
- add graceful shutdown
- add HTTP timeouts:
  - read header timeout
  - read timeout
  - write timeout
  - idle timeout
- add panic recovery middleware
- move repository calls toward context-aware APIs over time
- improve logging format and include request IDs where useful

Definition of done:

- backend startup and shutdown are controlled
- basic runtime safeguards exist
- request failures are easier to trace

### C. SQLite Hardening

Goals:

- make current storage more resilient before considering replacement
- treat SQLite as the source of truth for local usage
- support dozens of sessions and substantial history comfortably before optimizing for extreme scale

Work:

- document expected scale limits for local use
- enable and document WAL behavior if appropriate
- review indexes against real query patterns
- document concurrent access assumptions
- add integrity-check and vacuum/maintenance guidance
- review migrations for idempotence and upgrade safety
- verify schema choices against the canonical-plus-extension event model
- add stronger migration coverage across historical payload samples
- profile likely hot paths once realistic fixture volume exists
- avoid blocking future power users with long histories, even if perfect large-scale optimization comes later
- document and test bounded behavior for large event volumes and oversized records

Definition of done:

- SQLite remains the intentional storage choice, not an accidental default
- storage behavior is documented and maintained
- correctness of persisted data is tested as a first-class concern

### D. API and Contract Clarity

Goals:

- reduce accidental breakage between frontend and backend

Work:

- document API endpoints and response shapes
- define compatibility guarantees for hook payload normalization
- consider shared API schema docs or generated types
- add fixture payloads for Codex and Claude variants
- test normalization against fixture corpus

Definition of done:

- payload drift is easier to detect
- frontend-backend contracts are explicit

## Phase 3: Product Maturity

Target: improve trust, supportability, and broader adoption.

### A. Security and Threat Model

Goals:

- define what is safe today
- prevent unsafe accidental usage

Work:

- document security assumptions:
  - localhost use
  - single-user trust model
  - proxy behavior
- classify the OpenAI proxy and usage dashboard path as a supported but sensitive local-admin feature
- define remote-sharing stance:
  - localhost-only is the supported default
  - remote sharing through tools like `ngrok` is unofficial and advanced
  - public internet exposure is not supported yet
- default bind address should remain loopback unless explicitly overridden
- review permissive CORS and tighten if possible
- consider explicit opt-in for remote binding or remote-share mode
- consider making the OpenAI proxy route explicitly opt-in or easier to disable
- decide whether local auth is needed for non-loopback use
- review OpenAI proxy route for abuse or exposure risks
- add security policy and disclosure guidance

Definition of done:

- users understand safe deployment boundaries
- accidental exposure is less likely
- sensitive local-admin paths are clearly documented and treated differently from ordinary local viewing routes

### B. Privacy and Data Controls

Goals:

- make sensitive-data capture an explicit user tradeoff
- give users practical controls without crippling monitoring value

Work:

- document clearly what categories of data may be captured
- warn users that prompts, diffs, tool output, file paths, and transcript references may be stored
- default to storing full data, but provide controls for:
  - ignored repos or paths
  - exclusion patterns
  - optional redaction or masking for selected fields
- document privacy implications for JSON export, SQLite snapshot export, and remote sharing
- make privacy warnings visible in docs and diagnostics

Definition of done:

- users are not surprised by the sensitivity of stored data
- users can meaningfully reduce capture risk without abandoning the tool

### C. Release and Upgrade Discipline

Goals:

- make updates boring
- minimize manual release bookkeeping

Work:

- adopt semantic versioning with automation, not manual-only discipline
- use conventional commits as the input for automated versioning and release notes
- generate changelog or release notes automatically
- publish upgrade notes for schema or behavior changes when automation alone is not enough
- tag releases consistently through the release pipeline
- add reproducible build steps
- automate release creation as far as practical before adding binary artifacts
- consider signed release artifacts if adoption grows
- document support and deprecation policy:
  - maintain a recent-version support window
  - define how experimental integrations graduate or get dropped
  - define how hard upstream hook breaks are communicated

Definition of done:

- users can upgrade with confidence
- maintainers can explain what changed and why
- releases do not depend on hand-written bookkeeping every time
- support expectations are documented instead of implied

### D. Contributor and Maintainer Docs

Goals:

- lower onboarding cost
- preserve project decisions
- keep growth disciplined without over-bureaucratizing the repo

Work:

- add `CONTRIBUTING.md`
- add architecture overview
- set moderate contributor conventions:
  - docs for repo structure and boundaries
  - lint and test expectations before merge
  - guidance for when to add a new abstraction versus keeping code simple
  - guidance for when to add a new DB column versus using extension data
- add code ownership guidance if team grows
- add ADRs for major decisions:
  - SQLite choice
  - hook normalization strategy
  - local-first positioning
  - proxy scope
- add contributor guidance for keeping files focused and responsibilities narrow
- add contributor guidance for frontend-backend contract changes:
  - update shared types or schema docs
  - update fixtures
  - update tests on both sides when needed
- add contributor guidance for new agent adapters:
  - define adapter contract
  - require fixture coverage
  - prefer adapter-local logic over schema sprawl
- document test strategy

Definition of done:

- new contributors can understand the system and standards quickly
- maintainability risks are controlled by clear conventions rather than tribal knowledge

## Phase 4: Future Features Worth Building

These are not all immediate priorities, but they are strong candidates if the product matures.

### High-Value Product Features

- monitoring-grade search and filtering across sessions and events, including:
  - text search across prompt, path, tool, model, error, and related core fields
  - filters by agent, session, time range, model, event type, and status
  - saved views or presets
  - eventual advanced query capabilities when simpler filtering is stable
  - staged delivery:
    - practical filters and text search first
    - saved views next
    - advanced query model later
  - UX stance:
    - session-centric browsing remains the default exploration mode
    - strong global search acts as a parallel entrypoint, not a replacement
- stage saved-view persistence:
  - browser-local first
  - backend-persisted later if usage justifies it
  - exportable or shareable later if needed
- event retention controls in the UI
- import/export of captured sessions
- richer diff navigation and code context
- agent/session comparison tools
- better token and cost analytics
- anomaly highlighting for failed tool runs or repeated retries
- transcript integrity or provenance indicators

### High-Value Operability Features

- built-in sample data mode for demos
- diagnostics page in the UI
- admin or debug surfaces for:
  - diagnostics status
  - hook compatibility warnings
  - export and restore controls
  - DB path, version, and environment visibility
  - app version
  - DB schema and normalizer version
  - detected agent versions when available
  - compatibility warning details
- use mixed visibility for debug surfaces:
  - visible diagnostics for normal users
  - deeper debug controls can stay tucked away for power users
- DB stats and maintenance actions in admin/debug view
- structured log mode
- optional metrics endpoint
- upstream hook-change alerts or compatibility warnings

### High-Value Ecosystem Features

- plugin or adapter model for more agent providers
- normalization test corpus for external payload contributors
- optional packaged desktop app shell if browser + local server proves awkward

## Explicit Non-Priorities for Now

Unless product direction changes, these should stay below the line:

- Kubernetes deployment
- multi-tenant auth
- distributed tracing stack
- horizontal scaling architecture
- managed cloud control plane
- replacing SQLite before actual evidence demands it

## Recommended Execution Order

1. Fix README and define one canonical install/run path
2. Add CI for backend and frontend verification
3. Add health/readiness/self-check behavior
4. Add release/versioning process and downloadable artifacts
5. Add data lifecycle docs and cleanup/reset flows
6. Add frontend unit/smoke tests
7. Add backend graceful shutdown and timeout hardening
8. Harden SQLite operational behavior
9. Document security model and tighten risky defaults
10. Expand product features only after the above is stable

## Suggested Milestones

### Milestone 1: Local Adoption Baseline

- one clean install path
- Docker documented as supported secondary path
- passing CI
- basic releases
- self-check flow
- corrected README

### Milestone 2: Reliable Daily Use

- data lifecycle docs
- frontend tests
- backend runtime hardening
- better diagnostics

### Milestone 3: Mature Local Product

- upgrade discipline
- compatibility matrix
- security posture docs
- richer analytics and product polish
- better shared-viewing support if remote usage ever becomes official

## Success Criteria

This repo is in strong shape for local serious use when:

- a new user can install it quickly without reading source code
- first-run docs get users to success before asking them to understand internals
- common local failures are diagnosable in minutes
- upgrades do not feel risky
- core frontend and backend flows are covered by automation
- normalization and SQLite correctness are protected by strong tests
- maintainers can ship changes confidently with CI and release discipline
- storage and security assumptions are explicit, documented, and enforced by defaults

## Summary

The biggest shift needed is from "working developer project" to "reliable local OSS product." That means source-install ergonomics, crisp onboarding docs, diagnostics, tests, upgrade safety, and clear operational boundaries matter more right now than cloud-scale architecture. Build those first, keep the data model canonical rather than agent-specific, and expand features or future hosting options only from that stable base.
