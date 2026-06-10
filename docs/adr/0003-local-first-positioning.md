# ADR 0003: Local-First Positioning

Status: Accepted
Date: 2026-05-27

## Context

Argus captures sensitive local development context, including prompts, diffs, file paths, tool
outputs, raw payloads, and exported data. The intended user is a solo developer who wants
visibility into local agent sessions without sending that data to a hosted service.

## Decision

Position argus as a local-first product. The default runtime stores data locally, serves the
frontend from the local backend, and avoids cloud sync, hosted dashboards, multi-tenant access,
and remote sharing as supported product features.

## Consequences

- Privacy controls and warnings are part of the core product, not optional marketing copy.
- Source install, local binary, and Docker usage should keep data on the user's machine.
- Product decisions optimize for low local operational overhead over team or cloud workflows.
- Features that require remote sharing, hosted storage, or multi-user auth require a future
  architecture decision before implementation.
