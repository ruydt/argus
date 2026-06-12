# Reveal in Folder — Design

**Date:** 2026-06-11
**Status:** Approved
**Scope:** Diagnostics File System card — per-file button that reveals the file in the OS file manager.

## Backend

- `POST /api/diagnostics/reveal`, JSON body `{"path": "/abs/path"}`.
- Validation: non-POST → 405; missing/empty path or bad JSON → 400; `os.Stat` failure → 404.
- Reveal: `runtime.GOOS == "darwin"` → `open -R <path>` (Finder with file selected); `"linux"` → `xdg-open <parent dir>`; otherwise 501.
- Path passed as a single argv element — no shell.
- Exec hidden behind an injectable function so handler tests don't open real Finder windows.
- Success → 204 No Content.
- Handler: `backend/internal/handler/reveal.go`; route in router.go. Tests for 405/400/404 + success path with stubbed exec.

## Frontend

- `FileSystemCard.tsx`: `FolderOpen` (lucide) icon button per file row, beside the copy button, rendered only when the entry exists.
- Click → `fetch('/api/diagnostics/reveal', { method: 'POST', body: JSON.stringify({ path }) })`, fire-and-forget (no UI on failure beyond console).
- `aria-label` "Show <name> in folder".
- Applies to: logs rows, SubSection rows, binary row, claudeHistory row where exists.

## Security

Reveals arbitrary local paths via OS file manager. Acceptable: argus binds 127.0.0.1, single-user local tool; the neighboring simulate endpoint already executes arbitrary shell commands.

## Out of scope

- Windows support (501).
- Opening files themselves (only reveal/parent-dir).
