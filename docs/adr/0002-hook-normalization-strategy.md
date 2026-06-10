# ADR 0002: Hook Normalization Strategy

Status: Accepted
Date: 2026-05-27

## Context

Claude Code and Codex emit different hook payload shapes. The rest of argus needs
a stable event contract for persistence, SSE, and frontend rendering. The canonical contract is
`domain.NormalizedEvent`, and frontend fields mirror its JSON tags.

## Decision

Keep agent normalization in-tree under `backend/internal/agents/<agent>/`. Each adapter converts
source payloads into `domain.NormalizedEvent` and owns source-specific usage calculations. Any
new or changed adapter behavior must include a fixture payload and a normalization test under
`backend/tests/internal/agents/<agent>/`.

## Consequences

- Handler and service code stay free of agent-specific payload parsing.
- Fixture payloads preserve real wire shapes for future regression checks.
- Normalization tests prove canonical fields, `NormalizerVersion`, and `NormalizationStatus`.
- External adapter plugins are deferred until there is enough ecosystem demand to justify the
  complexity.
