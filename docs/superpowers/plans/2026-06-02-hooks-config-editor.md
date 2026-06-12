# Hooks Config Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/hooks-config` page to argus's frontend where users can view and edit Claude Code (`~/.claude/settings.json`) and Codex (`~/.codex/hooks.json`) hook configurations via a structured form or raw JSON editor.

**Architecture:** New `GET/PUT /api/hooks-config?agent=claudecode|codex` handler does direct file I/O — GET reads the hooks map, PUT merges (claudecode) or replaces (codex) the config file. Frontend calls these endpoints from a `useHooksConfig` hook and renders either a `StructuredEditor` (collapsible event sections with fields) or a raw JSON textarea, toggled per agent tab.

**Tech Stack:** Go stdlib `net/http`, `os`/`encoding/json` for file I/O. React 19, TypeScript, shadcn/ui (Badge, Button, Card, Input, Select, Skeleton, Tabs, Alert), lucide-react icons, Vitest + Testing Library for tests.

---

## File Map

### Create
- `backend/internal/handler/hooks_config.go` — GET/PUT handler, local types, file read/write helpers
- `backend/tests/internal/handler/hooks_config_test.go` — handler tests using temp dirs
- `frontend/src/features/hooks-config/types.ts` — HookEntry, HookGroup, HooksConfig, AgentKey, HooksConfigState
- `frontend/src/features/hooks-config/hooks/useHooksConfig.ts` — fetch, save, dirty tracking
- `frontend/src/features/hooks-config/StructuredEditor.tsx` — collapsible event sections, add/remove
- `frontend/src/features/hooks-config/HooksConfigPage.tsx` — page shell, agent tabs, save button, view toggle
- `frontend/tests/features/hooks-config/useHooksConfig.test.ts` — hook unit tests
- `frontend/tests/features/hooks-config/HooksConfigPage.test.tsx` — page render tests

### Modify
- `backend/internal/server/router.go` — add `ClaudeSettingsPath`/`CodexHooksPath` to Options, register route
- `backend/cmd/server/main.go` — compute paths from home dir, pass to router
- `frontend/src/App.tsx` — add lazy route for `/hooks-config`
- `frontend/src/app/Sidebar.tsx` — add nav item

---

## Task 1: Backend handler — hooks_config.go

**Files:**
- Create: `backend/internal/handler/hooks_config.go`

- [ ] **Step 1: Create the handler file**

```go
package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
)

type hooksConfigPayload struct {
	Hooks map[string][]hooksConfigGroup `json:"hooks"`
}

type hooksConfigGroup struct {
	Matcher string             `json:"matcher,omitempty"`
	Hooks   []hooksConfigEntry `json:"hooks"`
}

type hooksConfigEntry struct {
	Type          string `json:"type"`
	Command       string `json:"command"`
	Timeout       *int   `json:"timeout,omitempty"`
	StatusMessage string `json:"statusMessage,omitempty"`
}

// HooksConfig handles GET and PUT /api/hooks-config?agent=claudecode|codex.
// claudeSettingsPath is the full path to ~/.claude/settings.json.
// codexHooksPath is the full path to ~/.codex/hooks.json.
func HooksConfig(claudeSettingsPath, codexHooksPath string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		agent := r.URL.Query().Get("agent")
		if agent != "claudecode" && agent != "codex" {
			http.Error(w, "agent must be claudecode or codex", http.StatusBadRequest)
			return
		}
		switch r.Method {
		case http.MethodGet:
			serveGetHooksConfig(w, agent, claudeSettingsPath, codexHooksPath)
		case http.MethodPut:
			servePutHooksConfig(w, r, agent, claudeSettingsPath, codexHooksPath)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
}

func serveGetHooksConfig(w http.ResponseWriter, agent, claudeSettingsPath, codexHooksPath string) {
	var hooks map[string][]hooksConfigGroup
	if agent == "claudecode" {
		hooks = readClaudeHooks(claudeSettingsPath)
	} else {
		hooks = readCodexHooks(codexHooksPath)
	}
	if hooks == nil {
		hooks = map[string][]hooksConfigGroup{}
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(hooksConfigPayload{Hooks: hooks}); err != nil {
		slog.Error("[hooks-config] encode response", "err", err)
	}
}

func readClaudeHooks(settingsPath string) map[string][]hooksConfigGroup {
	data, err := os.ReadFile(settingsPath)
	if err != nil {
		return nil
	}
	var settings map[string]json.RawMessage
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil
	}
	hooksRaw, ok := settings["hooks"]
	if !ok {
		return nil
	}
	var hooks map[string][]hooksConfigGroup
	if err := json.Unmarshal(hooksRaw, &hooks); err != nil {
		return nil
	}
	return hooks
}

func readCodexHooks(hooksPath string) map[string][]hooksConfigGroup {
	data, err := os.ReadFile(hooksPath)
	if err != nil {
		return nil
	}
	var payload hooksConfigPayload
	if err := json.Unmarshal(data, &payload); err != nil {
		return nil
	}
	return payload.Hooks
}

func servePutHooksConfig(w http.ResponseWriter, r *http.Request, agent, claudeSettingsPath, codexHooksPath string) {
	var body hooksConfigPayload
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	var err error
	if agent == "claudecode" {
		err = writeClaudeHooks(claudeSettingsPath, body.Hooks)
	} else {
		err = writeCodexHooks(codexHooksPath, body.Hooks)
	}
	if err != nil {
		slog.Error("[hooks-config] write config", "agent", agent, "err", err)
		http.Error(w, fmt.Sprintf("failed to write config: %v", err), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("[hooks-config] encode response", "err", err)
	}
}

func writeClaudeHooks(settingsPath string, hooks map[string][]hooksConfigGroup) error {
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0o700); err != nil {
		return err
	}
	// Read existing settings to preserve all non-hooks keys.
	settings := map[string]json.RawMessage{}
	if data, err := os.ReadFile(settingsPath); err == nil {
		_ = json.Unmarshal(data, &settings)
	}
	hooksJSON, err := json.Marshal(hooks)
	if err != nil {
		return err
	}
	settings["hooks"] = hooksJSON
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(settingsPath, data, 0o600)
}

func writeCodexHooks(hooksPath string, hooks map[string][]hooksConfigGroup) error {
	if err := os.MkdirAll(filepath.Dir(hooksPath), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(hooksConfigPayload{Hooks: hooks}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(hooksPath, data, 0o600)
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd backend && go build ./...
```

Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/internal/handler/hooks_config.go
git commit -m "feat(backend): add HooksConfig GET/PUT handler for claudecode and codex"
```

---

## Task 2: Backend handler tests

**Files:**
- Create: `backend/tests/internal/handler/hooks_config_test.go`

- [ ] **Step 1: Create the test file**

```go
package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"argus/internal/handler"
)

func TestHooksConfigGetUnknownAgent(t *testing.T) {
	h := handler.HooksConfig("/tmp/noop-settings.json", "/tmp/noop-hooks.json")
	req := httptest.NewRequest(http.MethodGet, "/api/hooks-config?agent=unknown", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHooksConfigPutUnknownAgent(t *testing.T) {
	h := handler.HooksConfig("/tmp/noop-settings.json", "/tmp/noop-hooks.json")
	req := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=unknown",
		bytes.NewBufferString(`{"hooks":{}}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHooksConfigUnsupportedMethod(t *testing.T) {
	h := handler.HooksConfig("/tmp/noop-settings.json", "/tmp/noop-hooks.json")
	req := httptest.NewRequest(http.MethodPost, "/api/hooks-config?agent=claudecode", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestHooksConfigGetMissingFile(t *testing.T) {
	dir := t.TempDir()
	h := handler.HooksConfig(
		filepath.Join(dir, "settings.json"),
		filepath.Join(dir, "hooks.json"),
	)
	for _, agent := range []string{"claudecode", "codex"} {
		req := httptest.NewRequest(http.MethodGet, "/api/hooks-config?agent="+agent, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("agent=%s: status = %d, want 200", agent, rec.Code)
		}
		var payload map[string]any
		if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
			t.Fatalf("agent=%s: decode: %v", agent, err)
		}
		hooks, ok := payload["hooks"].(map[string]any)
		if !ok {
			t.Fatalf("agent=%s: hooks is not object: %#v", agent, payload["hooks"])
		}
		if len(hooks) != 0 {
			t.Fatalf("agent=%s: hooks = %v, want empty", agent, hooks)
		}
	}
}

func TestHooksConfigPutInvalidJSON(t *testing.T) {
	dir := t.TempDir()
	h := handler.HooksConfig(
		filepath.Join(dir, "settings.json"),
		filepath.Join(dir, "hooks.json"),
	)
	req := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=claudecode",
		bytes.NewBufferString("not json"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestHooksConfigClaudeCodeRoundtrip(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")
	h := handler.HooksConfig(settingsPath, filepath.Join(dir, "hooks.json"))

	putBody := `{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"curl http://localhost:8765/api/hook","timeout":5}]}]}}`
	putReq := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=claudecode",
		bytes.NewBufferString(putBody))
	putRec := httptest.NewRecorder()
	h.ServeHTTP(putRec, putReq)
	if putRec.Code != http.StatusOK {
		t.Fatalf("PUT status = %d, want 200: %s", putRec.Code, putRec.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/hooks-config?agent=claudecode", nil)
	getRec := httptest.NewRecorder()
	h.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", getRec.Code)
	}
	var got map[string]any
	if err := json.NewDecoder(getRec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	hooks := got["hooks"].(map[string]any)
	if _, ok := hooks["SessionStart"]; !ok {
		t.Fatalf("hooks missing SessionStart: %v", hooks)
	}
}

func TestHooksConfigClaudeCodePreservesOtherKeys(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "settings.json")
	initial := `{"theme":"dark","hooks":{},"model":"claude-3"}`
	if err := os.WriteFile(settingsPath, []byte(initial), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	h := handler.HooksConfig(settingsPath, filepath.Join(dir, "hooks.json"))

	putBody := `{"hooks":{"PreToolUse":[{"matcher":".*","hooks":[{"type":"command","command":"echo hi"}]}]}}`
	req := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=claudecode",
		bytes.NewBufferString(putBody))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	var settings map[string]any
	if err := json.Unmarshal(data, &settings); err != nil {
		t.Fatalf("unmarshal written file: %v", err)
	}
	if settings["theme"] != "dark" {
		t.Fatalf("theme = %v, want dark", settings["theme"])
	}
	if settings["model"] != "claude-3" {
		t.Fatalf("model = %v, want claude-3", settings["model"])
	}
}

func TestHooksConfigCodexRoundtrip(t *testing.T) {
	dir := t.TempDir()
	hooksPath := filepath.Join(dir, "hooks.json")
	h := handler.HooksConfig(filepath.Join(dir, "settings.json"), hooksPath)

	putBody := `{"hooks":{"PreToolUse":[{"matcher":".*","hooks":[{"type":"command","command":"curl http://localhost:8765/api/hook"}]}]}}`
	putReq := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=codex",
		bytes.NewBufferString(putBody))
	putRec := httptest.NewRecorder()
	h.ServeHTTP(putRec, putReq)
	if putRec.Code != http.StatusOK {
		t.Fatalf("PUT status = %d, want 200", putRec.Code)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/hooks-config?agent=codex", nil)
	getRec := httptest.NewRecorder()
	h.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("GET status = %d, want 200", getRec.Code)
	}
	var got map[string]any
	if err := json.NewDecoder(getRec.Body).Decode(&got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if _, ok := got["hooks"].(map[string]any)["PreToolUse"]; !ok {
		t.Fatalf("missing PreToolUse in hooks: %v", got)
	}
}

func TestHooksConfigPutCreatesParentDirs(t *testing.T) {
	dir := t.TempDir()
	settingsPath := filepath.Join(dir, "nested", "dir", "settings.json")
	h := handler.HooksConfig(settingsPath, filepath.Join(dir, "hooks.json"))

	req := httptest.NewRequest(http.MethodPut, "/api/hooks-config?agent=claudecode",
		bytes.NewBufferString(`{"hooks":{}}`))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	if _, err := os.Stat(settingsPath); err != nil {
		t.Fatalf("file not created: %v", err)
	}
}
```

- [ ] **Step 2: Run the tests**

```bash
cd backend && go test ./tests/internal/handler/ -run TestHooksConfig -v
```

Expected: all `TestHooksConfig*` tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
cd backend && go test ./...
```

Expected: all tests pass, no regressions.

- [ ] **Step 4: Run linter**

```bash
cd backend && golangci-lint run ./...
```

Expected: no lint errors. If linter flags unused imports or similar, fix before committing.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/internal/handler/hooks_config_test.go
git commit -m "test(backend): add HooksConfig handler tests for GET/PUT, roundtrip, key preservation"
```

---

## Task 3: Wire routes and paths in router + main

**Files:**
- Modify: `backend/internal/server/router.go`
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Add fields to Options and register route in router.go**

In `backend/internal/server/router.go`, add two fields to the `Options` struct (after the `AllowRemote` field):

```go
// ClaudeSettingsPath is the full path to the Claude Code settings file.
// Defaults to ~/.claude/settings.json if empty.
ClaudeSettingsPath string

// CodexHooksPath is the full path to the Codex hooks config file.
// Defaults to ~/.codex/hooks.json if empty.
CodexHooksPath string
```

Then in `NewRouter`, add this route registration after the existing `mux.Handle("GET /api/export/snapshot", ...)` line:

```go
mux.Handle("/api/hooks-config", handler.HooksConfig(opts.ClaudeSettingsPath, opts.CodexHooksPath))
```

- [ ] **Step 2: Pass paths from main.go**

In `backend/cmd/server/main.go`, add `"path/filepath"` to the import block. Then update the `server.NewRouter(...)` call to include the two new fields. The full updated call looks like:

```go
home, _ := os.UserHomeDir()

h := server.NewRouter(svc, repo, repo.Ready, server.Options{
    Matcher:            matcher,
    CORSOrigins:        cfg.CORSOrigins,
    DBPath:             cfg.DBPath,
    IgnoreFile:         domainIgnoreFile(ignoreStatus),
    Addr:               cfg.Addr,
    AllowRemote:        cfg.AllowRemote,
    HookConfig:         hookconfig.Detector{}.Detect(),
    ClaudeSettingsPath: filepath.Join(home, ".claude", "settings.json"),
    CodexHooksPath:     filepath.Join(home, ".codex", "hooks.json"),
})
```

- [ ] **Step 3: Build and run full test suite**

```bash
cd backend && go build ./... && go test ./... && golangci-lint run ./...
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/server/router.go backend/cmd/server/main.go
git commit -m "feat(backend): register /api/hooks-config route with home-dir paths"
```

---

## Task 4: Frontend types and useHooksConfig hook

**Files:**
- Create: `frontend/src/features/hooks-config/types.ts`
- Create: `frontend/src/features/hooks-config/hooks/useHooksConfig.ts`

- [ ] **Step 1: Create types.ts**

```typescript
export type HookEntry = {
  type: string
  command: string
  timeout?: number
  statusMessage?: string
}

export type HookGroup = {
  matcher?: string
  hooks: HookEntry[]
}

export type HooksConfig = {
  hooks: Record<string, HookGroup[]>
}

export type AgentKey = 'claudecode' | 'codex'

export type HooksConfigState = {
  config: HooksConfig | null
  draftJSON: string
  loading: boolean
  saving: boolean
  error: string | null
  saveError: string | null
  isDirty: boolean
  setDraftJSON: (json: string) => void
  setConfig: (config: HooksConfig) => void
  save: () => Promise<void>
  reload: () => void
}
```

- [ ] **Step 2: Create useHooksConfig.ts**

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentKey, HooksConfig, HooksConfigState } from '../types'

export function useHooksConfig(agent: AgentKey): HooksConfigState {
  const [config, setConfigState] = useState<HooksConfig | null>(null)
  const [draftJSON, setDraftJSONState] = useState<string>('')
  const [savedJSON, setSavedJSON] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const mountedRef = useRef(true)

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    setError(null)

    fetch(`/api/hooks-config?agent=${agent}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<HooksConfig>
      })
      .then((data) => {
        if (!mountedRef.current) return
        const json = JSON.stringify(data, null, 2)
        setConfigState(data)
        setDraftJSONState(json)
        setSavedJSON(json)
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return
        setError(err instanceof Error ? err.message : 'Failed to load hooks config')
      })
      .finally(() => {
        if (!mountedRef.current) return
        setLoading(false)
      })

    return () => {
      mountedRef.current = false
    }
  }, [agent, reloadKey])

  // setConfig: update the parsed config object and derive draftJSON from it.
  const setConfig = useCallback((c: HooksConfig) => {
    setConfigState(c)
    setDraftJSONState(JSON.stringify(c, null, 2))
  }, [])

  // setDraftJSON: update raw JSON; also update parsed config if the JSON is valid.
  const setDraftJSON = useCallback((json: string) => {
    setDraftJSONState(json)
    try {
      const parsed = JSON.parse(json) as HooksConfig
      setConfigState(parsed)
    } catch {
      // keep stale config; draftJSON is the live edit buffer
    }
  }, [])

  const save = useCallback(async () => {
    setSaveError(null)
    setSaving(true)
    try {
      const parsed = JSON.parse(draftJSON) as HooksConfig
      const res = await fetch(`/api/hooks-config?agent=${agent}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text.trim() || `HTTP ${res.status}`)
      }
      const saved = (await res.json()) as HooksConfig
      const json = JSON.stringify(saved, null, 2)
      setConfigState(saved)
      setDraftJSONState(json)
      setSavedJSON(json)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [agent, draftJSON])

  return {
    config,
    draftJSON,
    loading,
    saving,
    error,
    saveError,
    isDirty: draftJSON !== savedJSON,
    setDraftJSON,
    setConfig,
    save,
    reload,
  }
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/hooks-config/types.ts frontend/src/features/hooks-config/hooks/useHooksConfig.ts
git commit -m "feat(frontend): add hooks-config types and useHooksConfig hook"
```

---

## Task 5: useHooksConfig tests

**Files:**
- Create: `frontend/tests/features/hooks-config/useHooksConfig.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHooksConfig } from '@/features/hooks-config/hooks/useHooksConfig'

const emptyConfig = { hooks: {} }
const populatedConfig = {
  hooks: {
    SessionStart: [{ hooks: [{ type: 'command', command: 'curl http://localhost:8765/api/hook' }] }],
  },
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => emptyConfig })
  )
})

afterEach(() => vi.clearAllMocks())

describe('useHooksConfig', () => {
  it('starts with loading=true', () => {
    const { result } = renderHook(() => useHooksConfig('claudecode'))
    expect(result.current.loading).toBe(true)
  })

  it('populates config on successful fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => populatedConfig })
    )
    const { result } = renderHook(() => useHooksConfig('claudecode'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.config).toEqual(populatedConfig)
    expect(result.current.isDirty).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets error on fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    )
    const { result } = renderHook(() => useHooksConfig('codex'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('HTTP 500')
    expect(result.current.config).toBeNull()
  })

  it('isDirty becomes true after setDraftJSON with different content', async () => {
    const { result } = renderHook(() => useHooksConfig('claudecode'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setDraftJSON('{"hooks":{"PreToolUse":[]}}'))
    expect(result.current.isDirty).toBe(true)
  })

  it('isDirty stays false when setDraftJSON matches saved content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => emptyConfig })
    )
    const { result } = renderHook(() => useHooksConfig('claudecode'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Set to the same content as savedJSON (which is JSON.stringify(emptyConfig, null, 2))
    act(() => result.current.setDraftJSON(JSON.stringify(emptyConfig, null, 2)))
    expect(result.current.isDirty).toBe(false)
  })

  it('save calls PUT and clears isDirty on success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => emptyConfig })
      .mockResolvedValueOnce({ ok: true, json: async () => populatedConfig })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useHooksConfig('claudecode'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setDraftJSON(JSON.stringify(populatedConfig, null, 2)))
    expect(result.current.isDirty).toBe(true)

    await act(() => result.current.save())

    expect(result.current.isDirty).toBe(false)
    expect(result.current.saveError).toBeNull()
    expect(result.current.config).toEqual(populatedConfig)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/hooks-config?agent=claudecode',
      expect.objectContaining({ method: 'PUT' })
    )
  })

  it('save sets saveError on PUT failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => emptyConfig })
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'disk full' })
    )
    const { result } = renderHook(() => useHooksConfig('claudecode'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setDraftJSON('{"hooks":{}}'))
    await act(() => result.current.save())

    expect(result.current.saveError).toBeTruthy()
  })

  it('reload triggers a new fetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => emptyConfig })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useHooksConfig('codex'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.reload())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd frontend && npx vitest run tests/features/hooks-config/useHooksConfig.test.ts
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/tests/features/hooks-config/useHooksConfig.test.ts
git commit -m "test(frontend): add useHooksConfig hook tests"
```

---

## Task 6: StructuredEditor component

**Files:**
- Create: `frontend/src/features/hooks-config/StructuredEditor.tsx`

- [ ] **Step 1: Create StructuredEditor.tsx**

```tsx
import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AgentKey, HookEntry, HookGroup, HooksConfig } from './types'

const CLAUDE_EVENT_TYPES = [
  'SessionStart',
  'Setup',
  'SessionEnd',
  'UserPromptSubmit',
  'UserPromptExpansion',
  'PreToolUse',
  'PostToolUse',
  'PreCompact',
  'PostCompact',
  'Stop',
  'SubagentStop',
]

const CODEX_EVENT_TYPES = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'PreCompact',
  'PostCompact',
]

function emptyEntry(): HookEntry {
  return { type: 'command', command: '' }
}

function emptyGroup(): HookGroup {
  return { hooks: [emptyEntry()] }
}

type StructuredEditorProps = {
  config: HooksConfig
  agent: AgentKey
  onChange: (config: HooksConfig) => void
}

export function StructuredEditor({ config, agent, onChange }: StructuredEditorProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const knownEvents = agent === 'claudecode' ? CLAUDE_EVENT_TYPES : CODEX_EVENT_TYPES
  const usedEvents = Object.keys(config.hooks)
  const availableToAdd = knownEvents.filter((e) => !usedEvents.includes(e))

  function toggleCollapse(eventType: string) {
    setCollapsed((prev) => ({ ...prev, [eventType]: !prev[eventType] }))
  }

  function setEventGroups(eventType: string, groups: HookGroup[]) {
    onChange({ hooks: { ...config.hooks, [eventType]: groups } })
  }

  function removeEventType(eventType: string) {
    const next = { ...config.hooks }
    delete next[eventType]
    onChange({ hooks: next })
  }

  function addEventType(eventType: string) {
    onChange({ hooks: { ...config.hooks, [eventType]: [emptyGroup()] } })
  }

  function addGroup(eventType: string) {
    setEventGroups(eventType, [...(config.hooks[eventType] ?? []), emptyGroup()])
  }

  function removeGroup(eventType: string, groupIdx: number) {
    const groups = [...(config.hooks[eventType] ?? [])]
    groups.splice(groupIdx, 1)
    if (groups.length === 0) {
      removeEventType(eventType)
    } else {
      setEventGroups(eventType, groups)
    }
  }

  function patchGroup(eventType: string, groupIdx: number, patch: Partial<HookGroup>) {
    const groups = [...(config.hooks[eventType] ?? [])]
    groups[groupIdx] = { ...groups[groupIdx], ...patch }
    setEventGroups(eventType, groups)
  }

  function addEntry(eventType: string, groupIdx: number) {
    const groups = [...(config.hooks[eventType] ?? [])]
    groups[groupIdx] = { ...groups[groupIdx], hooks: [...groups[groupIdx].hooks, emptyEntry()] }
    setEventGroups(eventType, groups)
  }

  function removeEntry(eventType: string, groupIdx: number, entryIdx: number) {
    const groups = [...(config.hooks[eventType] ?? [])]
    const hooks = [...groups[groupIdx].hooks]
    hooks.splice(entryIdx, 1)
    groups[groupIdx] = { ...groups[groupIdx], hooks }
    setEventGroups(eventType, groups)
  }

  function patchEntry(
    eventType: string,
    groupIdx: number,
    entryIdx: number,
    patch: Partial<HookEntry>
  ) {
    const groups = [...(config.hooks[eventType] ?? [])]
    const hooks = [...groups[groupIdx].hooks]
    hooks[entryIdx] = { ...hooks[entryIdx], ...patch }
    groups[groupIdx] = { ...groups[groupIdx], hooks }
    setEventGroups(eventType, groups)
  }

  return (
    <div className="flex flex-col gap-3">
      {usedEvents.map((eventType) => {
        const groups = config.hooks[eventType] ?? []
        const hookCount = groups.reduce((n, g) => n + g.hooks.length, 0)
        const isCollapsed = collapsed[eventType] ?? false

        return (
          <div key={eventType} className="border border-border rounded-lg overflow-hidden">
            {/* Event type header */}
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 bg-secondary/40 hover:bg-secondary/60 transition-colors text-left"
              onClick={() => toggleCollapse(eventType)}
            >
              <div className="flex items-center gap-2">
                {isCollapsed ? (
                  <ChevronRight className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
                <span className="font-mono text-[13px] font-medium">{eventType}</span>
                <Badge variant="outline" className="text-[11px]">
                  {hookCount} {hookCount !== 1 ? 'hooks' : 'hook'}
                </Badge>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${eventType}`}
                onClick={(e) => {
                  e.stopPropagation()
                  removeEventType(eventType)
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </button>

            {!isCollapsed && (
              <div className="flex flex-col gap-3 p-4">
                {groups.map((group, groupIdx) => (
                  <div
                    key={groupIdx}
                    className="border border-border/60 rounded-md p-3 flex flex-col gap-2 bg-background"
                  >
                    {/* Matcher row */}
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-muted-foreground w-20 shrink-0">
                        Matcher
                      </span>
                      <Input
                        value={group.matcher ?? ''}
                        onChange={(e) =>
                          patchGroup(eventType, groupIdx, {
                            matcher: e.target.value || undefined,
                          })
                        }
                        placeholder=".*  (empty = match all)"
                        className="h-7 text-[13px] font-mono flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        aria-label="Remove group"
                        onClick={() => removeGroup(eventType, groupIdx)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>

                    {/* Hook entries */}
                    {group.hooks.map((entry, entryIdx) => (
                      <div
                        key={entryIdx}
                        className="flex flex-col gap-1.5 pl-4 border-l border-border/40"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-muted-foreground w-20 shrink-0">
                            Command
                          </span>
                          <Input
                            value={entry.command}
                            onChange={(e) =>
                              patchEntry(eventType, groupIdx, entryIdx, { command: e.target.value })
                            }
                            placeholder="curl -s -X POST http://127.0.0.1:8765/api/hook ..."
                            className="h-7 text-[13px] font-mono flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive shrink-0"
                            aria-label="Remove hook"
                            onClick={() => removeEntry(eventType, groupIdx, entryIdx)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-muted-foreground w-20 shrink-0">
                            Timeout (s)
                          </span>
                          <Input
                            type="number"
                            min={0}
                            value={entry.timeout ?? ''}
                            onChange={(e) =>
                              patchEntry(eventType, groupIdx, entryIdx, {
                                timeout: e.target.value ? Number(e.target.value) : undefined,
                              })
                            }
                            placeholder="5"
                            className="h-7 text-[13px] w-20"
                          />
                          <span className="text-[12px] text-muted-foreground w-24 shrink-0 ml-2">
                            Status msg
                          </span>
                          <Input
                            value={entry.statusMessage ?? ''}
                            onChange={(e) =>
                              patchEntry(eventType, groupIdx, entryIdx, {
                                statusMessage: e.target.value || undefined,
                              })
                            }
                            placeholder="Loading..."
                            className="h-7 text-[13px] flex-1"
                          />
                        </div>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-start text-[12px] h-7 pl-4 text-muted-foreground hover:text-foreground"
                      onClick={() => addEntry(eventType, groupIdx)}
                    >
                      <Plus className="size-3.5 mr-1" />
                      Add hook
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start text-[12px] h-7"
                  onClick={() => addGroup(eventType)}
                >
                  <Plus className="size-3.5 mr-1" />
                  Add group
                </Button>
              </div>
            )}
          </div>
        )
      })}

      {/* Add event type selector */}
      {availableToAdd.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Select onValueChange={addEventType}>
            <SelectTrigger className="h-8 text-[13px] w-[220px]">
              <SelectValue placeholder="Add event type..." />
            </SelectTrigger>
            <SelectContent>
              {availableToAdd.map((e) => (
                <SelectItem key={e} value={e} className="font-mono text-[13px]">
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {usedEvents.length === 0 && (
        <p className="text-[13px] text-muted-foreground">
          No hooks configured. Use the selector above to add an event type.
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/hooks-config/StructuredEditor.tsx
git commit -m "feat(frontend): add StructuredEditor component for hooks config"
```

---

## Task 7: HooksConfigPage

**Files:**
- Create: `frontend/src/features/hooks-config/HooksConfigPage.tsx`

- [ ] **Step 1: Create HooksConfigPage.tsx**

```tsx
import { useState } from 'react'
import { Code2, List, RefreshCw, Save } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { StructuredEditor } from './StructuredEditor'
import { useHooksConfig } from './hooks/useHooksConfig'
import type { AgentKey, HooksConfig, HooksConfigState } from './types'

type AgentTabContentProps = {
  agent: AgentKey
  state: HooksConfigState
}

function AgentTabContent({ agent, state }: AgentTabContentProps) {
  const [viewMode, setViewMode] = useState<'structured' | 'json'>('structured')
  const { config, draftJSON, loading, error, saveError, setDraftJSON, setConfig, reload } = state

  const jsonIsValid = (() => {
    try {
      JSON.parse(draftJSON)
      return true
    } catch {
      return false
    }
  })()

  function handleToggleView() {
    if (viewMode === 'json') {
      if (!jsonIsValid) return
      try {
        setConfig(JSON.parse(draftJSON) as HooksConfig)
      } catch {
        return
      }
    }
    setViewMode((m) => (m === 'structured' ? 'json' : 'structured'))
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 mt-4" aria-busy="true">
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-12 rounded-lg" />
      </div>
    )
  }

  if (error !== null) {
    return (
      <Card className="p-6 flex flex-col items-center gap-3 text-center mt-4">
        <p className="text-sm text-foreground">Failed to load hooks config</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={reload}>
          Retry
        </Button>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4 mt-4">
      {/* View toggle */}
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-[12px] h-8 gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={handleToggleView}
          disabled={viewMode === 'json' && !jsonIsValid}
          title={
            viewMode === 'json' && !jsonIsValid
              ? 'Fix JSON errors before switching to structured view'
              : undefined
          }
        >
          {viewMode === 'structured' ? (
            <>
              <Code2 className="size-3.5" />
              Edit as JSON
            </>
          ) : (
            <>
              <List className="size-3.5" />
              Structured view
            </>
          )}
        </Button>
      </div>

      {/* Structured view */}
      {viewMode === 'structured' && config !== null && (
        <StructuredEditor config={config} agent={agent} onChange={setConfig} />
      )}

      {/* JSON view */}
      {viewMode === 'json' && (
        <div className="flex flex-col gap-1">
          <textarea
            value={draftJSON}
            onChange={(e) => setDraftJSON(e.target.value)}
            className={cn(
              'w-full min-h-[400px] rounded-md border bg-background p-3 font-mono text-[13px] resize-y focus:outline-none focus:ring-2 focus:ring-ring',
              !jsonIsValid && 'border-destructive focus:ring-destructive'
            )}
            aria-label="Hooks config JSON"
            spellCheck={false}
          />
          {!jsonIsValid && (
            <p className="text-[12px] text-destructive mt-0.5">Invalid JSON</p>
          )}
        </div>
      )}

      {/* Save error */}
      {saveError !== null && (
        <Alert className="border-destructive bg-[rgba(255,95,86,0.08)]">
          <AlertDescription className="text-[13px] text-destructive">{saveError}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

export function HooksConfigPage() {
  const [activeAgent, setActiveAgent] = useState<AgentKey>('claudecode')

  const claudeState = useHooksConfig('claudecode')
  const codexState = useHooksConfig('codex')

  const activeState = activeAgent === 'claudecode' ? claudeState : codexState

  const jsonIsValid = (() => {
    try {
      JSON.parse(activeState.draftJSON)
      return true
    } catch {
      return false
    }
  })()

  const canSave = activeState.isDirty && jsonIsValid && !activeState.saving && !activeState.loading

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex max-w-[900px] flex-col gap-6 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
        {/* Page header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[22px] font-semibold text-foreground">Hooks Config</h1>
          <div className="flex items-center gap-2">
            {activeState.isDirty && !activeState.loading && (
              <span className="text-[12px] text-[var(--cwd)]">Unsaved changes</span>
            )}
            {!activeState.isDirty && !activeState.loading && activeState.error === null && (
              <span className="text-[12px] text-muted-foreground">Saved</span>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => void activeState.save()}
              disabled={!canSave}
              aria-label="Save hooks config"
            >
              {activeState.saving ? (
                <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <Save className="size-3.5 mr-1.5" />
              )}
              Save
            </Button>
          </div>
        </div>

        {/* Agent tabs */}
        <Tabs
          value={activeAgent}
          onValueChange={(v) => setActiveAgent(v as AgentKey)}
          className="w-full"
        >
          <TabsList>
            <TabsTrigger value="claudecode">Claude Code</TabsTrigger>
            <TabsTrigger value="codex">Codex</TabsTrigger>
          </TabsList>
          <TabsContent value="claudecode">
            <AgentTabContent agent="claudecode" state={claudeState} />
          </TabsContent>
          <TabsContent value="codex">
            <AgentTabContent agent="codex" state={codexState} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/hooks-config/HooksConfigPage.tsx
git commit -m "feat(frontend): add HooksConfigPage with agent tabs, structured/JSON toggle, and save button"
```

---

## Task 8: Wire route and sidebar

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/app/Sidebar.tsx`

- [ ] **Step 1: Add lazy route in App.tsx**

Add this lazy import near the other lazy imports at the top of `frontend/src/App.tsx`:

```tsx
const HooksConfig = lazy(() =>
  import('./features/hooks-config/HooksConfigPage').then((m) => ({ default: m.HooksConfigPage }))
)
```

Add this `<Route>` inside the `<Route path="/" element={<Layout />}>` block, after the `diagnostics` route:

```tsx
<Route
  path="hooks-config"
  element={
    <Suspense fallback={null}>
      <HooksConfig />
    </Suspense>
  }
/>
```

- [ ] **Step 2: Add nav item in Sidebar.tsx**

In `frontend/src/app/Sidebar.tsx`, add `Webhook` to the lucide import:

```tsx
import {
  FishingHook,
  GitFork,
  LayoutDashboard,
  PanelLeft,
  Stethoscope,
  TerminalSquare,
  Webhook,
  X,
  type LucideIcon,
} from 'lucide-react'
```

Add this entry to `NAV_ITEMS` (after the `Diagnostics` item):

```tsx
{
  to: '/hooks-config',
  label: 'Hooks Config',
  ariaLabel: 'Hooks Configuration',
  icon: Webhook,
  end: false,
},
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/app/Sidebar.tsx
git commit -m "feat(frontend): wire /hooks-config route and sidebar nav item"
```

---

## Task 9: HooksConfigPage tests

**Files:**
- Create: `frontend/tests/features/hooks-config/HooksConfigPage.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HooksConfigPage } from '@/features/hooks-config/HooksConfigPage'

const emptyConfig = { hooks: {} }

function renderPage() {
  return render(
    <MemoryRouter>
      <HooksConfigPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => emptyConfig })
  )
})

afterEach(() => vi.clearAllMocks())

describe('HooksConfigPage', () => {
  it('renders page heading', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Hooks Config')).toBeTruthy())
  })

  it('shows Claude Code and Codex tabs', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Claude Code' })).toBeTruthy()
      expect(screen.getByRole('tab', { name: 'Codex' })).toBeTruthy()
    })
  })

  it('Save button is disabled when config is unchanged', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /save/i })).toBeTruthy())
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('shows "Saved" status when config is unchanged and loaded', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy())
  })

  it('shows error card when load fails for active agent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 })
    )
    renderPage()
    await waitFor(() => expect(screen.getByText(/failed to load hooks config/i)).toBeTruthy())
  })

  it('shows loading skeleton initially', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise(() => {})) // never resolves
    )
    renderPage()
    // Skeletons render with aria-busy on their container
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
  })

  it('shows "Edit as JSON" toggle button after load', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /edit as json/i })).toBeTruthy()
    )
  })

  it('switches to JSON textarea when toggle clicked', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /edit as json/i })).toBeTruthy()
    )
    await user.click(screen.getByRole('button', { name: /edit as json/i }))
    expect(screen.getByRole('textbox', { name: /hooks config json/i })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run page tests**

```bash
cd frontend && npx vitest run tests/features/hooks-config/HooksConfigPage.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
cd frontend && npx vitest run
```

Expected: all tests pass, no regressions.

- [ ] **Step 4: Run type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/tests/features/hooks-config/HooksConfigPage.test.tsx
git commit -m "test(frontend): add HooksConfigPage render and interaction tests"
```

---

## Task 10: End-to-end validation

- [ ] **Step 1: Start the backend**

```bash
cd backend && go run ./cmd/server
```

Expected: server starts on `http://127.0.0.1:8765`, no errors.

- [ ] **Step 2: Verify GET returns empty hooks when file is untouched**

```bash
curl -s http://127.0.0.1:8765/api/hooks-config?agent=claudecode | python3 -m json.tool
```

Expected: `{ "hooks": { ... } }` with whatever is in `~/.claude/settings.json`, or `{ "hooks": {} }` if missing.

- [ ] **Step 3: Start the frontend dev server**

```bash
cd frontend && pnpm dev
```

Expected: Vite starts, opens on `http://localhost:5173` (or similar port).

- [ ] **Step 4: Navigate to Hooks Config page and verify**

Open `http://localhost:5173/hooks-config` in a browser.

Verify:
- Page heading "Hooks Config" visible
- "Claude Code" and "Codex" tabs present
- Save button is disabled
- "Saved" status shown
- Structured editor shows current hooks (or empty state message if no hooks)
- "Edit as JSON" toggle shows raw JSON textarea
- Switching back to structured view works when JSON is valid

- [ ] **Step 5: Make a change and save**

In the structured editor, add a hook to a new event type. Click Save. Verify:
- "Unsaved changes" badge appears after editing
- Save button enables
- After save, "Saved" status returns
- Running the curl GET again returns the saved hooks

- [ ] **Step 6: Run full backend test suite one final time**

```bash
cd backend && go test ./... && golangci-lint run ./...
```

Expected: all pass.

- [ ] **Step 7: Run full frontend test suite one final time**

```bash
cd frontend && npx tsc --noEmit && npx vitest run
```

Expected: all pass.
