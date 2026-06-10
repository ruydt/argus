# ADR 0001: SQLite Local Storage

Status: Accepted
Date: 2026-05-27

## Context

Argus is a local-first, single-user product for observing AI coding agent activity. It stores
prompts, file paths, diffs, tool outputs, raw payloads, sessions, and usage data on the
developer's machine. The product goal favors a source install that works quickly with no
external infrastructure.

## Decision

Use SQLite as the sole local storage engine for the v1 product. The backend owns all schema
changes through versioned migrations under `backend/internal/repository/sqlite/migrations/`,
and services access storage through the `repository.EventRepository` boundary.

## Consequences

- Users can run argus without a database server or cloud account.
- Backup, reset, and export flows can operate on local SQLite files.
- Schema changes require migrations and tests rather than ad hoc database edits.
- Multi-user, horizontally scaled, or cloud-hosted storage remains out of scope until real usage
  data justifies the extra operational cost.
