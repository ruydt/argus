# INTEGRATIONS.md — External Integrations

**Last mapped:** 2026-05-05

---

## Claude Code (Anthropic)

**Type:** Hook receiver — inbound events from Claude Code agent

**How:** Claude Code posts hook payloads to `POST /api/hook`. Backend reads JSONL transcript files from `~/.claude/` to extract model info and compute session token usage.

**Detection:** `claudecode.MatchesTranscript(path)` — checks for `/.claude/` in transcript path.

**Key files:**
- `backend/internal/agents/claudecode/claudecode.go` — diff generation, model extraction, usage computation
- `backend/main.go` — hook handler

**Auth:** None (loopback-only binding)

---

## OpenAI Codex

**Type:** Hook receiver — inbound events from Codex agent

**How:** Codex posts hook payloads (same schema as Claude Code) to `POST /api/hook`. Backend parses apply_patch commands for diff display.

**Detection:** Catch-all — any transcript path that is not Claude Code is treated as Codex.

**Key files:**
- `backend/internal/agents/codex/codex.go` — diff generation, usage computation, patch parsing

**Auth:** None (loopback-only binding)

---

## OpenAI API (admin usage stats)

**Type:** Outbound proxy — backend forwards requests to OpenAI

**Endpoint:** `GET /api/openai/*` → proxies to `https://api.openai.com/v1/organization/*`

**Auth flow:**
1. Frontend reads API key from `localStorage` (`openai_api_key`)
2. Frontend sends `Authorization: Bearer sk-admin-...` header
3. Backend forwards header verbatim to OpenAI

**Purpose:** Fetch organization-level token usage statistics for display in Usage page.

**Key file:** `backend/main.go` — `/api/openai/` handler

---

## ngrok (Dev Tunnel)

**Type:** Dev-only — exposes local server to internet

**Configured hostname:** `nonendemic-intermolar-exie.ngrok-free.dev` (hardcoded in `frontend/vite.config.ts`)

**Purpose:** Allows remote access to `127.0.0.1:8765` during development.

**Risk:** Committed hostname bypasses loopback-only security. Unauthenticated `/api/hook` and `/api/events` become publicly accessible when tunnel is active.

**Key file:** `frontend/vite.config.ts`

---

## Summary Table

| Integration | Direction | Auth | Risk |
|-------------|-----------|------|------|
| Claude Code hooks | Inbound POST | None | Low (loopback) |
| Codex hooks | Inbound POST | None | Low (loopback) |
| OpenAI admin API | Outbound proxy | Bearer from localStorage | Medium (key in browser storage) |
| ngrok tunnel | Bidirectional | None | High when active |
