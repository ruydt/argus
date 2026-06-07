# ADR 0004: Proxy Scope

Status: Accepted
Date: 2026-05-27

## Context

During local development, the frontend dev server proxies `/api` requests to the local Go
backend. In production, the Go backend serves both API routes and the embedded React SPA. Hooker
also receives local agent hook payloads at `POST /api/hook`.

## Decision

Keep proxy behavior local and development-focused. The supported proxy scope is the Vite dev
proxy from `localhost:5173` to the local backend and local hook forwarding into
`127.0.0.1:10804`. The proxy is not a cloud gateway, remote sharing layer, or public ingress
feature.

## Consequences

- Documentation should describe proxy behavior as a local developer convenience.
- Public internet exposure and remote sharing are unsupported product scenarios.
- Security work should preserve loopback-first behavior and avoid implying that proxying makes
  remote access safe.
- Any future remote access feature needs explicit auth, threat modeling, and a new ADR before it
  is treated as supported.
