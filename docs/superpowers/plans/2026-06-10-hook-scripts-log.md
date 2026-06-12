# Hook Scripts Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `~/.argus/hook-scripts.log` capture for Argus-generated scripts and show it in Diagnostics log tail.

**Architecture:** Installer-generated scripts append best-effort status lines to `~/.argus/hook-scripts.log`. Backend Diagnostics treats this as a whitelisted third log. Frontend reuses existing File System log rows and tail panel.

**Tech Stack:** Bash installer, generated Node.js script, Go HTTP handlers/services/tests, React/TypeScript/Vitest diagnostics UI.

---

## File Structure

- Modify `install.sh`: add generated script logging to `start-argus.sh` and `argus-activate.js`.
- Modify `backend/internal/service/event_service.go`: include `hook-scripts.log` in diagnostics filesystem scan.
- Modify `backend/internal/service/filesystem_test.go`: expect three logs and validate `hook-scripts.log`.
- Modify `backend/internal/handler/log_tail.go`: whitelist `file=hook-scripts`.
- Modify `backend/tests/internal/handler/log_tail_test.go`: test tailing `hook-scripts.log`.
- Modify `frontend/src/features/diagnostics/hooks/useLogTail.ts`: extend `LogFile` union.
- Modify `frontend/src/features/diagnostics/FileSystemCard.tsx`: add tail state mapping for `hook-scripts.log`.
- Modify frontend diagnostics tests under `frontend/tests/features/diagnostics/`.

---

### Task 1: Backend Diagnostics Log List

**Files:**
- Modify: `backend/internal/service/filesystem_test.go`
- Modify: `backend/internal/service/event_service.go`

- [ ] **Step 1: Write failing filesystem test**

Edit `backend/internal/service/filesystem_test.go` in `TestScanFileSystemPopulatesEntries`:

```go
	if err := os.WriteFile(filepath.Join(dir, "hook-scripts.log"), []byte("script log line\n"), 0o644); err != nil {
		t.Fatal(err)
	}
```

Replace log assertions with:

```go
	if len(fs.Logs) != 3 {
		t.Fatalf("len(logs) = %d, want 3", len(fs.Logs))
	}
	if !fs.Logs[0].Exists {
		t.Error("logs[0] (argus.log) exists = false, want true")
	}
	if fs.Logs[1].Exists {
		t.Error("logs[1] (build.log) exists = true, want false")
	}
	if !fs.Logs[2].Exists {
		t.Error("logs[2] (hook-scripts.log) exists = false, want true")
	}
	if fs.Logs[2].Name != "hook-scripts.log" {
		t.Errorf("logs[2].name = %q, want hook-scripts.log", fs.Logs[2].Name)
	}
```

- [ ] **Step 2: Run failing test**

Run:

```bash
go test ./internal/service -run TestScanFileSystemPopulatesEntries -count=1
```

Expected: fail with `len(logs) = 2, want 3`.

- [ ] **Step 3: Implement log list**

Edit `backend/internal/service/event_service.go` in `scanFileSystem`:

```go
		Logs: []domain.DiagnosticsFileEntry{
			statEntry("argus.log", filepath.Join(argusDir, "argus.log")),
			statEntry("build.log", filepath.Join(argusDir, "build.log")),
			statEntry("hook-scripts.log", filepath.Join(argusDir, "hook-scripts.log")),
		},
```

- [ ] **Step 4: Run test**

Run:

```bash
go test ./internal/service -run TestScanFileSystemPopulatesEntries -count=1
```

Expected: PASS.

---

### Task 2: Backend Log Tail Whitelist

**Files:**
- Modify: `backend/tests/internal/handler/log_tail_test.go`
- Modify: `backend/internal/handler/log_tail.go`

- [ ] **Step 1: Write failing handler test**

Append to `backend/tests/internal/handler/log_tail_test.go`:

```go
func TestLogTailHookScriptsFileParam(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "hook-scripts.log"), []byte("script output\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	h := handler.LogTail(handler.LogTailOptions{ArgusDir: dir})
	req := httptest.NewRequest(http.MethodGet, "/api/diagnostics/log-tail?file=hook-scripts", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var payload struct {
		File  string   `json:"file"`
		Lines []string `json:"lines"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if payload.File != "hook-scripts.log" {
		t.Errorf("file = %q, want hook-scripts.log", payload.File)
	}
	if len(payload.Lines) != 1 || payload.Lines[0] != "script output" {
		t.Errorf("lines = %v, want [script output]", payload.Lines)
	}
}
```

- [ ] **Step 2: Run failing test**

Run:

```bash
go test ./tests/internal/handler -run TestLogTailHookScriptsFileParam -count=1
```

Expected: fail with status `400`.

- [ ] **Step 3: Implement whitelist mapping**

Edit `backend/internal/handler/log_tail.go` switch:

```go
		case "argus":
			filename = "argus.log"
		case "build":
			filename = "build.log"
		case "hook-scripts":
			filename = "hook-scripts.log"
		default:
			http.Error(w, "invalid file param: must be 'argus', 'build', or 'hook-scripts'", http.StatusBadRequest)
			return
```

- [ ] **Step 4: Run handler tests**

Run:

```bash
go test ./tests/internal/handler -run TestLogTail -count=1
```

Expected: PASS.

---

### Task 3: Frontend Log Tail Support

**Files:**
- Modify: `frontend/src/features/diagnostics/hooks/useLogTail.ts`
- Modify: `frontend/tests/features/diagnostics/useLogTail.test.ts`

- [ ] **Step 1: Write failing hook test**

Append to `frontend/tests/features/diagnostics/useLogTail.test.ts`:

```ts
  it('fetches hook-scripts log', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ file: 'hook-scripts.log', lines: ['script line'] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const { result } = renderHook(() => useLogTail('hook-scripts', 25))

    await act(async () => {
      await result.current.fetch()
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/diagnostics/log-tail?file=hook-scripts&lines=25')
    expect(result.current.lines).toEqual(['script line'])
  })
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npm test -- --run frontend/tests/features/diagnostics/useLogTail.test.ts
```

Expected: TypeScript/Vitest fail because `'hook-scripts'` is not assignable to `LogFile`.

- [ ] **Step 3: Extend TypeScript union**

Edit `frontend/src/features/diagnostics/hooks/useLogTail.ts`:

```ts
type LogFile = 'argus' | 'build' | 'hook-scripts'
```

- [ ] **Step 4: Run test**

Run:

```bash
npm test -- --run frontend/tests/features/diagnostics/useLogTail.test.ts
```

Expected: PASS.

---

### Task 4: Frontend File System Card Tail Mapping

**Files:**
- Modify: `frontend/src/features/diagnostics/FileSystemCard.tsx`
- Modify: `frontend/tests/features/diagnostics/FileSystemCard.test.tsx`
- Modify: `frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx`
- Modify: `frontend/tests/features/diagnostics/DiagnosticsRoute.test.tsx`

- [ ] **Step 1: Update test fixtures with third log**

Add this log entry to diagnostics file system fixtures:

```ts
    {
      name: 'hook-scripts.log',
      path: '/home/user/.argus/hook-scripts.log',
      sizeBytes: 128,
      lastModified: '2026-06-10T00:00:00Z',
      exists: true,
    },
```

- [ ] **Step 2: Write failing FileSystemCard behavior test**

In `frontend/tests/features/diagnostics/FileSystemCard.test.tsx`, add:

```ts
  it('tails hook-scripts.log', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ file: 'hook-scripts.log', lines: ['script log A'] }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(<FileSystemCard fileSystem={fileSystem} />)

    const rows = screen.getAllByRole('button', { name: /Tail hook-scripts\.log/i })
    await userEvent.click(rows[0])

    expect(mockFetch).toHaveBeenCalledWith('/api/diagnostics/log-tail?file=hook-scripts&lines=50')
    expect(await screen.findByText('script log A')).toBeInTheDocument()
  })
```

- [ ] **Step 3: Run failing test**

Run:

```bash
npm test -- --run frontend/tests/features/diagnostics/FileSystemCard.test.tsx
```

Expected: fail because card maps `hook-scripts.log` to build tail or missing mapping.

- [ ] **Step 4: Implement tail mapping**

Edit `frontend/src/features/diagnostics/FileSystemCard.tsx` in `FileSystemCard`:

```tsx
  const argusTail = useLogTail('argus', 50)
  const buildTail = useLogTail('build', 50)
  const hookScriptsTail = useLogTail('hook-scripts', 50)
```

Replace `toggleLog`, `tailStateFor`, and `refreshFor` with:

```tsx
  function tailFor(name: string) {
    if (name === 'argus.log') return argusTail
    if (name === 'build.log') return buildTail
    if (name === 'hook-scripts.log') return hookScriptsTail
    return argusTail
  }

  function toggleLog(name: string) {
    const opening = openLog !== name
    setOpenLog(opening ? name : null)
    if (opening) tailFor(name).fetch()
  }

  function tailStateFor(name: string) {
    const t = tailFor(name)
    return { lines: t.lines, loading: t.loading, error: t.error }
  }

  function refreshFor(name: string) {
    return tailFor(name).fetch
  }
```

- [ ] **Step 5: Run diagnostics frontend tests**

Run:

```bash
npm test -- --run frontend/tests/features/diagnostics
```

Expected: PASS.

---

### Task 5: Installer Script Logging

**Files:**
- Modify: `install.sh`

- [ ] **Step 1: Add best-effort Bash logging to generated start script**

Inside generated `start-argus.sh`, after `LOG_PATH`, add:

```bash
SCRIPT_LOG_PATH="$DB_DIR/hook-scripts.log"

log_script() {
  mkdir -p "$DB_DIR" 2>/dev/null || true
  printf '%s start-argus.sh %s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1" "$2" >> "$SCRIPT_LOG_PATH" 2>/dev/null || true
}
```

After `mkdir -p "$DB_DIR"`, add:

```bash
log_script INFO "start"
```

Before already-running exit, add:

```bash
    log_script INFO "server already running"
```

Before killing different binary, add:

```bash
  log_script WARN "replacing pid $RUNNING_PID on port $ARGUS_PORT"
```

Before `nohup`, add:

```bash
log_script INFO "launching server"
```

- [ ] **Step 2: Add best-effort Node logging to generated activate script**

Inside generated `argus-activate.js`, after `const db = ...`, add:

```js
const scriptLog = path.join(os.homedir(), '.argus', 'hook-scripts.log');
```

After `emit`, add:

```js
function logScript(level, msg) {
  try {
    require('fs').appendFileSync(scriptLog, `${new Date().toISOString()} argus-activate.js ${level} ${msg}\n`);
  } catch (_) {}
}
```

In `main()`, add these calls:

```js
  logScript('INFO', 'start');
```

Before `spawnSync`:

```js
    logScript('WARN', 'server offline; invoking start script');
```

Inside `if (!up)` before `emit(...)`:

```js
    logScript('ERROR', 'server offline after start attempt');
```

After SQLite result succeeds:

```js
    logScript('INFO', 'sqlite counts loaded');
```

Inside SQLite catch:

```js
    logScript('WARN', 'sqlite counts unavailable');
```

Replace final `main();` with:

```js
main().catch(err => {
  logScript('ERROR', `activation failed: ${err && err.message ? err.message : String(err)}`);
});
```

- [ ] **Step 3: Verify installer templates contain log path**

Run:

```bash
rg -n "hook-scripts\\.log|log_script|logScript" install.sh
```

Expected: matches Bash and Node logging helpers.

---

### Task 6: Full Verification

**Files:**
- All modified files

- [ ] **Step 1: Run Go tests**

Run:

```bash
go test ./...
```

Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run:

```bash
npm test -- --run frontend/tests/features/diagnostics
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --stat
git diff -- install.sh backend/internal/handler/log_tail.go backend/internal/service/event_service.go frontend/src/features/diagnostics/hooks/useLogTail.ts frontend/src/features/diagnostics/FileSystemCard.tsx
```

Expected: only hook scripts log work, no unrelated refactors.

- [ ] **Step 5: Commit implementation**

Run:

```bash
git add install.sh backend/internal/handler/log_tail.go backend/internal/service/event_service.go backend/internal/service/filesystem_test.go backend/tests/internal/handler/log_tail_test.go frontend/src/features/diagnostics/hooks/useLogTail.ts frontend/src/features/diagnostics/FileSystemCard.tsx frontend/tests/features/diagnostics/useLogTail.test.ts frontend/tests/features/diagnostics/FileSystemCard.test.tsx frontend/tests/features/diagnostics/DiagnosticsPage.test.tsx frontend/tests/features/diagnostics/DiagnosticsRoute.test.tsx
git commit -m "feat(diagnostics): tail hook scripts log"
```

Expected: commit created.

---

## Self-Review

- Spec coverage: producer logging, backend whitelist, diagnostics filesystem listing, frontend tailing, privacy limits, tests, and non-goals all mapped to tasks.
- Placeholder scan: no TBD/TODO/fill-in steps.
- Type consistency: `hook-scripts` query value maps to `hook-scripts.log` display name and `LogFile` union.
