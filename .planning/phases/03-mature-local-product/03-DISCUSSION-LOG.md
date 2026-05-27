# Phase 3: Mature Local Product - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-27
**Phase:** 3-Mature Local Product
**Areas discussed:** Ignore rules, Local security, Contributor docs

---

## Ignore Rules

| Option | Description | Selected |
|--------|-------------|----------|
| `~/.config/hooker/ignore` | Matches requirement, stable user config path. | yes |
| `$HOOKER_IGNORE` only | Easier tests and custom setups, less discoverable. | |
| Both | Default path plus env override. | |

**User's choice:** `~/.config/hooker/ignore`

| Option | Description | Selected |
|--------|-------------|----------|
| `cwd` only | Repo/project path decides event inclusion. | |
| `cwd + event path` | Excludes repo paths and explicit file paths when payload includes `path`. | yes |
| All path-like fields | Strongest privacy, higher false-positive risk. | |

**User's choice:** Match `cwd` plus explicit event `path`.

| Option | Description | Selected |
|--------|-------------|----------|
| Drop silently | No DB row, no UI noise, less debuggable. | |
| Drop with log | No DB row/SSE, safe server log metadata only. | yes |
| Store redacted event | Visible audit trail, but conflicts with "not ingested." | |

**User's choice:** Drop with safe log metadata.

| Option | Description | Selected |
|--------|-------------|----------|
| Basic glob | `*`, `?`, directory prefixes. | |
| Gitignore-like core | Comments, blank lines, negation, directory patterns, and `**`. | yes |
| Exact gitignore parity | Use full compatibility behavior. | |

**User's choice:** Gitignore-like core.
**Notes:** User moved to next area after four questions.

---

## Local Security

| Option | Description | Selected |
|--------|-------------|----------|
| Derived local origin only | Allow `http://localhost:{port}` and `http://127.0.0.1:{port}` from `ADDR`. | |
| Env allowlist | Explicit comma list only. | |
| Derived + env extension | Local origins always allowed; env can add extra local/dev origins. | yes |

**User's choice:** Derived local origins plus env extension.

| Option | Description | Selected |
|--------|-------------|----------|
| `HOOKER_ALLOW_REMOTE=1` | Explicit risk acknowledgement; `ADDR` alone cannot expose server. | yes |
| `ADDR=0.0.0.0:8765` enough | Simpler, easier accidental exposure. | |
| `HOOKER_BIND=remote` | Explicit, but overlaps with existing `ADDR`. | |

**User's choice:** `HOOKER_ALLOW_REMOTE=1`.

| Option | Description | Selected |
|--------|-------------|----------|
| Fatal startup error | Server refuses to start and explains required opt-in. | yes |
| Fallback to `127.0.0.1` | Keeps app running but may surprise scripts. | |
| Warn only | Starts exposed anyway. | |

**User's choice:** Fatal startup error.
**Notes:** User asked for examples before answering. Example covered `ADDR=0.0.0.0:8765 ./hooker` versus `HOOKER_ALLOW_REMOTE=1 ADDR=0.0.0.0:8765 ./hooker`.

| Option | Description | Selected |
|--------|-------------|----------|
| One-line warning | Concise log only. | |
| Prominent warning block | Lists captured data categories and unsupported public exposure. | yes |
| Warning + doctor fail | Stronger, but remote use may be intentional. | |

**User's choice:** Prominent warning block.
**Notes:** User moved to next area after four questions.

---

## Contributor Docs

| Option | Description | Selected |
|--------|-------------|----------|
| One ADR per decision | `docs/adr/0001-sqlite.md`, `0002-normalization.md`, `0003-local-first.md`. | yes |
| Single architecture decisions doc | One doc with all decisions. | |
| `CONTRIBUTING.md` sections only | Minimal files, weaker traceability. | |

**User's choice:** One ADR per decision.
**Notes:** User asked what ADR means. Explanation: Architecture Decision Record, a small doc recording one important technical/product decision.

| Option | Description | Selected |
|--------|-------------|----------|
| Fixture required | Every new/changed agent adapter must include fixture payload and normalization test. | yes |
| Fixture recommended | Easier contributions, weaker safety. | |
| Golden fixture corpus | Strictest shared central corpus and snapshot expectations. | |

**User's choice:** Fixture required.

| Option | Description | Selected |
|--------|-------------|----------|
| Manual checklist | Update Go domain, TS type, fixtures, tests. | |
| Shared schema later | Manual now, note schema generation as future. | |
| Manual checklist + CI expectation | Docs say PR must update both sides and tests prove it. | yes |

**User's choice:** Manual checklist plus CI expectation.

| Option | Description | Selected |
|--------|-------------|----------|
| Quick contributor path | Structure, commands, boundaries, common changes, adapter steps. | yes |
| Full architecture manual | Deep reference, higher maintenance. | |
| Minimal OSS template | License/PR basics only, too thin for this project. | |

**User's choice:** Quick contributor path.

---

## the agent's Discretion

- Exact env var name for extra CORS origins, delimiter, and validation behavior.
- Exact matcher package or implementation for gitignore-like core semantics.
- Exact ADR numbering, status labels, and document template.
- Exact wording for privacy warnings.

## Deferred Ideas

None.
