# Gemini CLI Agent Support

> **Status:** Draft
> **Topic:** Support for Gemini CLI as a first-class agent in hooker.

## Overview

Gemini CLI uses `rtk` (Rust Token Killer) for its hooks. `rtk` provides a standardized hook payload that is also used by Claude Code and Codex (via `hooker`'s current logic). This spec defines how to explicitly detect and handle Gemini CLI payloads in the backend and frontend.

## Architecture

1.  **Backend Agent Adapter:** Create `backend/internal/agents/geminicli/` to handle Gemini-specific normalization and usage computation.
2.  **Detection:** Identify Gemini CLI sessions via `transcript_path` (contains `/.gemini/`) or `source` field.
3.  **Usage Computation:** Scan Gemini CLI transcript files (JSONL) for token usage records.
4.  **Frontend Integration:** Add Gemini agent configuration with logo and usage display logic.

## Design Sections

### 1. Backend: `geminicli` Package

- **Location:** `backend/internal/agents/geminicli/geminicli.go`
- **Functions:**
    - `MatchesTranscript(path string) bool`: Returns true if path contains `/.gemini/`.
    - `Normalize(raw []byte) (domain.NormalizedEvent, error)`: Unmarshals and maps `rtk` fields to `NormalizedEvent`.
    - `ComputeUsage(path string) domain.SessionUsage`: Aggregate usage from transcript.
    - `ComputeUsageBreakdown(path string) domain.UsageBreakdown`: Detailed breakdown by model.
    - `AgentName() string`: Returns `"geminicli"`.

### 2. Payload Mapping

Gemini CLI payloads sent via `rtk hook gemini` match the `domain.RawPayload` structure.
- `Agent`: `"geminicli"`
- `Action`: Derived from `hook_event_name` or `tool_name` using `fileutil` helpers.
- `Path`: Resolved using `cwd` and `file_path` or extracted from `command`.

### 3. Usage Computation

Gemini CLI transcripts are JSONL files stored in `~/.gemini/history/<project>/`.
We need to verify the exact record format, but assuming it follows the `assistant` type with `usage` fields similar to Claude Code or turn-based usage.

### 4. Frontend: Agent Configuration

- **Location:** `frontend/src/agents/geminicli/index.ts`
- **ID:** `geminicli`
- **Label:** `Gemini CLI`
- **Logo:** Google/Gemini logo (add to `logos.tsx`).
- **Matching:** `event.transcript_path?.includes('/.gemini/')`.

## Success Criteria

1.  Events from Gemini CLI are correctly attributed to "Gemini CLI" agent.
2.  Logos appear in the timeline and session views.
3.  Token usage is correctly computed and displayed for Gemini sessions.
4.  Backend tests for `geminicli` normalization pass.

## Approaches

### Option 1: Separate Agent (Recommended)
Create a dedicated `geminicli` package. This keeps the code clean and follows the project's existing pattern.
- **Pros:** Clear boundaries, easy to test, consistent with Claude/Codex.
- **Cons:** Some code duplication with `claudecode` normalization (both use `rtk` schema).

### Option 2: Generic `rtk` Agent
Refactor `claudecode` and Gemini to use a shared `rtk` base agent.
- **Pros:** Less duplication.
- **Cons:** Agents still have different usage computation logic (transcripts differ). More complex refactoring.

**Recommendation:** Option 1. Priority is reliability and speed of delivery.
