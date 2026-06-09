# Diagnostics Page Enhancement Design

**Date:** 2026-06-09  
**Status:** Approved  
**Scope:** Add server runtime stats, DB health, external agent databases, per-agent event rates to diagnostics page

---

## Goal

Make the diagnostics page a complete health-check view — system runtime, database internals, external agent files and databases, and per-agent activity rates. All data served from the existing `/api/diagnostics` endpoint.

---

## What's Being Added

### Group 1 — Server Runtime (new rows in System Facts card)

| Row | Source |
|---|---|
| Started at | `time.Time` recorded at `EventService` construction |
| Uptime | computed from start time at request time |
| Hook requests | atomic counter incremented per accepted `POST /api/hook` |
| Ingestion errors | atomic counter incremented per normalization failure in hook handler |

### Group 2 — DB Health (new rows in System Facts card)

Hooker's own SQLite database:

| Row | Source |
|---|---|
| Journal mode | `PRAGMA journal_mode` |
| Page count | `PRAGMA page_count` |
| Page size | `PRAGMA page_size` |
| WAL size | `stat(db_path + "-wal")` |
| Migration version | highest applied migration sequence number |

### Group 2 Extended — External Agent Files (FileSystemCard)

Always shown regardless of whether files exist. Badge indicates state:

| Section | Path | Empty state |
|---|---|---|
| `~/.hooker/hooks` | existing | `(0)` no badge |
| `~/.claude/hooks` | existing | `(0)` no badge |
| `~/.claude/history.jsonl` | single file entry | shows size + **line count** |
| `~/.codex/hooks` | existing | `Uninstalled` amber badge if dir missing, `(0)` if exists but empty |
| Codex databases | `~/.codex/*.sqlite` (scan all) | `Uninstalled` amber badge if dir missing, `(0)` if exists but empty |

**Directory existence distinction:**
- Backend scans each directory; if `os.IsNotExist(err)` on `ReadDir` → sets `dirExists: false`
- Frontend renders **Uninstalled** badge (amber) when `dirExists: false`
- Frontend renders `(0)` count with no badge when `dirExists: true` but zero files

**`history.jsonl` line count:** backend counts newlines with `bufio.Scanner`; result exposed as new `LineCount *int64` field on `DiagnosticsFileEntry`. Only set for this file.

### Group 4 — Per-Agent Event Rates (Agent Connectivity table)

Two new columns appended to existing agent table:

| Column | Query |
|---|---|
| Last 1h | `COUNT(*) WHERE agent=? AND received_at >= now-1h` |
| Last 24h | `COUNT(*) WHERE agent=? AND received_at >= now-24h` |

Run as a single `GROUP BY agent_id` query, not N per-agent queries.

---

## Backend Changes

### `backend/internal/domain/diagnostics.go`

```go
// New types
type DiagnosticsRuntime struct {
    StartedAt     string `json:"startedAt"`     // RFC3339
    UptimeSeconds int64  `json:"uptimeSeconds"`
    HookRequests  int64  `json:"hookRequests"`
    IngestionErrors int64 `json:"ingestionErrors"`
}

type DiagnosticsDBHealth struct {
    JournalMode      string `json:"journalMode"`
    PageCount        int64  `json:"pageCount"`
    PageSizeBytes    int64  `json:"pageSizeBytes"`
    WALSizeBytes     *int64 `json:"walSizeBytes"`      // nil if WAL file not found
    MigrationVersion int    `json:"migrationVersion"`
}

// Extended DiagnosticsFileEntry
type DiagnosticsFileEntry struct {
    Name         string  `json:"name"`
    Path         string  `json:"path"`
    SizeBytes    *int64  `json:"sizeBytes"`
    LastModified *string `json:"lastModified"`
    Exists       bool    `json:"exists"`
    LineCount    *int64  `json:"lineCount,omitempty"` // NEW: set for .jsonl files
}

// Extended DiagnosticsFileSystem
type DiagnosticsFileSystem struct {
    HookerDir    string                 `json:"hookerDir"`
    Binary       DiagnosticsFileEntry   `json:"binary"`
    Logs         []DiagnosticsFileEntry `json:"logs"`
    Hooks        []DiagnosticsFileEntry `json:"hooks"`
    ClaudeHooks  []DiagnosticsFileEntry `json:"claudeHooks"`
    ClaudeHistory DiagnosticsFileEntry  `json:"claudeHistory"` // history.jsonl with LineCount
    CodexHooks   []DiagnosticsFileEntry `json:"codexHooks"`
    CodexDBs     []DiagnosticsFileEntry `json:"codexDBs"`
    // Directory existence flags for "uninstalled" vs "empty" distinction
    ClaudeHooksDirExists bool `json:"claudeHooksDirExists"`
    CodexHooksDirExists  bool `json:"codexHooksDirExists"`
    CodexDBsDirExists    bool `json:"codexDBsDirExists"`
}

// Extended DiagnosticsAgent
type DiagnosticsAgent struct {
    // ... existing fields ...
    EventsLastHour int `json:"eventsLastHour"` // NEW
    EventsLast24h  int `json:"eventsLast24h"`  // NEW
}

// Extended top-level Diagnostics
type Diagnostics struct {
    // ... existing fields ...
    Runtime  DiagnosticsRuntime  `json:"runtime"`  // NEW
    DBHealth DiagnosticsDBHealth `json:"dbHealth"` // NEW
}
```

### `backend/internal/service/event_service.go`

- Add `startTime time.Time` (set in constructor), `hookRequests atomic.Int64`, `ingestionErrors atomic.Int64` to `EventService`
- `IncrementHookRequests()` / `IncrementIngestionErrors()` methods called from handler
- `buildRuntime()` computes uptime at call time
- Extend `scanFileSystem()`: scan `~/.codex/` for hooks + `*.sqlite`; stat + line-count `~/.claude/history.jsonl`; track dir-exists flags
- New `countJSONLLines(path string) *int64` helper using `bufio.Scanner`
- New repository method call: `AgentEventRates()` for 1h/24h counts

### `backend/internal/repository/sqlite/sqlite.go`

- `DBHealth() (DiagnosticsDBHealth, error)` — runs PRAGMA queries + WAL stat + reads migration version from `schema_migrations` table
- `AgentEventRates(agentIDs []string) (map[string][2]int, error)` — single GROUP BY query returning `[eventsLastHour, eventsLast24h]` per agent

### `backend/internal/handler/hook.go`

- Call `svc.IncrementHookRequests()` after successful parse
- Call `svc.IncrementIngestionErrors()` on normalization error

---

## Frontend Changes

### `frontend/src/features/diagnostics/types.ts`

- Add `runtime: DiagnosticsRuntime`, `dbHealth: DiagnosticsDBHealth` to `Diagnostics`
- Add `lineCount?: number | null` to `DiagnosticsFileEntry`
- Add `claudeHistory`, `codexDBs`, `claudeHooksDirExists`, `codexHooksDirExists`, `codexDBsDirExists` to `DiagnosticsFileSystem`
- Add `eventsLastHour: number`, `eventsLast24h: number` to `DiagnosticsAgent`

### `frontend/src/features/diagnostics/DiagnosticsPage.tsx`

**System Facts card additions:**

Runtime section (after existing rows):
```
Started at    <time>
Uptime        <Xh Ym>
Hook requests <N>
Ingestion errors <N>  [red badge if > 0]
```

DB Health section:
```
Journal mode  WAL
Page count    12,345
Page size     4 KB
WAL size      1.2 MB
Migration     v12
```

**Agent Connectivity table** — 2 new columns between "Last Seen" and "Hook Config":
```
| Agent | Status | Events | Last Seen | 1h | 24h | Hook Config | Warnings |
```

### `frontend/src/features/diagnostics/FileSystemCard.tsx`

**New sections (always rendered, conditional badge):**

`~/.claude/history.jsonl` — single-file row showing size + line count:
```
history.jsonl   272 KB   48,231 lines   Jun 9
```

Codex DBs section header renders **Uninstalled** amber badge if `codexDBsDirExists === false`, else lists files:
```
logs_2.sqlite     351 MB   Jun 9
memories_1.sqlite  40 KB   Jun 8
state_5.sqlite    1.4 MB   Jun 9
goals_1.sqlite     24 KB   Jun 7
```

`~/.codex/hooks` renders **Uninstalled** amber badge if `codexHooksDirExists === false`.

---

## Error Handling

- PRAGMA queries fail → `DBHealth` fields return zero values, WAL size nil
- `~/.claude/history.jsonl` unreadable → `LineCount` nil, `Exists: false`
- `~/.codex/` not found → dir-exists flags false, empty slices
- Atomic counters never fail (in-memory)

---

## Testing

**Backend:**
- Unit test `DBHealth()` against in-memory SQLite — verify PRAGMA values returned
- Unit test `AgentEventRates()` — insert events at known timestamps, assert 1h/24h counts
- Unit test `countJSONLLines()` — file with N lines returns N
- Update `handler/diagnostics_test.go` fixture to include `runtime`, `dbHealth`

**Frontend:**
- Update `healthyDiagnostics` fixture in all 3 test files with new fields
- Test that `Uninstalled` badge renders when `codexHooksDirExists: false`
- Test that line count renders in FileSystemCard when `lineCount` set

---

## Non-Goals

- Watcher process status (separate concern, no watcher running in standard install)
- Hot-reload of ignore file (runtime counters reset on restart by design)
- Codex DB content inspection (size + modified only)
